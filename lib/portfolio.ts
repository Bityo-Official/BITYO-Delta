import { decrypt } from "./crypto";
// portfolio.ts — load a user's connected exchanges, fetch + normalize in parallel,
// and assemble a single cross-exchange snapshot. Falls back to demo data when the
// user has no connected accounts.
import { prisma } from "./db";
import { DEMO_BALANCES, DEMO_POSITIONS, DEMO_TRADES } from "./demo";
import { getAdapter } from "./exchanges";
import type {
	Credentials,
	ExchangeKey,
	NormBalance,
	NormPosition,
	NormTrade,
} from "./exchanges/types";

export interface AccountStatus {
	id: string;
	exchange: ExchangeKey;
	label: string | null;
	connected: boolean;
	error: string | null;
	verified: boolean;
}

export interface PortfolioSnapshot {
	demo: boolean;
	generatedAt: number;
	positions: NormPosition[];
	balances: NormBalance[];
	trades: NormTrade[];
	accounts: AccountStatus[];
}

// ── closed-trade history cache ──
// History barely changes, but the snapshot loop runs every 12s — without a cache the
// (multi-window) history fan-out would hammer exchange rate limits (Pionex 429s).
// TTL 3 min; in-flight dedupe so concurrent snapshot builds share one fetch.
const HISTORY_TTL = 3 * 60_000;
const historyCache = new Map<string, { at: number; data: NormTrade[] }>();
const historyInflight = new Map<string, Promise<NormTrade[]>>();

function getHistoryCached(
	accountId: string,
	_ex: ExchangeKey,
	fetcher: () => Promise<NormTrade[]>,
): Promise<NormTrade[]> {
	const hit = historyCache.get(accountId);
	if (hit && Date.now() - hit.at < HISTORY_TTL)
		return Promise.resolve(hit.data);
	const inflight = historyInflight.get(accountId);
	if (inflight) return inflight;
	const p = fetcher()
		.then((data) => {
			// don't cache empty results caused by a transient failure for the full TTL —
			// retry sooner (30s) so recovery is quick
			historyCache.set(accountId, {
				at: data.length ? Date.now() : Date.now() - HISTORY_TTL + 30_000,
				data,
			});
			return data;
		})
		.finally(() => {
			historyInflight.delete(accountId);
		});
	historyInflight.set(accountId, p);
	return p;
}

function credsOf(acc: {
	apiKey: string;
	apiSecret: string;
	passphrase: string | null;
}): Credentials {
	return {
		apiKey: decrypt(acc.apiKey),
		apiSecret: decrypt(acc.apiSecret),
		passphrase: acc.passphrase ? decrypt(acc.passphrase) : undefined,
	};
}

// ── per-exchange rate-limit gate (server-global; the limits are per-IP) ──
// When an exchange rate-limits us, stop calling it until it recovers and serve the last
// good data for that account instead of blanking the dashboard. Several venues hand us
// an explicit unblock timestamp (BingX "...unblocked after <ms>"; Pionex x-ratelimit-lock)
// — honor it exactly; otherwise back off 60s.
const exchangeGate = new Map<ExchangeKey, { until: number; reason: string }>();
const accountLastGood = new Map<
	string,
	{
		positions: NormPosition[];
		balance: NormBalance | null;
		trades: NormTrade[];
	}
>();

function parseRateLimit(msg: string): { isRL: boolean; until: number } {
	const rl =
		/429|too many requests|rate.?limit|frequency limit|100410|disabled period/i.test(
			msg,
		);
	if (!rl) return { isRL: false, until: 0 };
	// explicit 13-digit epoch-ms unblock time, if the venue provided one
	const m = msg.match(/(\d{13})/);
	const explicit = m ? Number(m[1]) : 0;
	const until = explicit > Date.now() ? explicit + 2_000 : Date.now() + 60_000;
	return { isRL: true, until };
}

export async function buildSnapshot(
	userId: string,
): Promise<PortfolioSnapshot> {
	const accounts = await prisma.exchangeAccount.findMany({
		where: { userId, enabled: true },
	});

	if (accounts.length === 0) {
		return {
			demo: true,
			generatedAt: Date.now(),
			positions: DEMO_POSITIONS,
			balances: DEMO_BALANCES,
			trades: DEMO_TRADES,
			accounts: [],
		};
	}

	const positions: NormPosition[] = [];
	const balances: NormBalance[] = [];
	const trades: NormTrade[] = [];
	const statuses: AccountStatus[] = [];

	await Promise.all(
		accounts.map(async (acc) => {
			const ex = acc.exchange as ExchangeKey;
			const adapter = getAdapter(ex);
			let error: string | null = null;

			const applyLastGood = () => {
				const lg = accountLastGood.get(acc.id);
				if (lg) {
					positions.push(...lg.positions);
					if (lg.balance) balances.push(lg.balance);
					trades.push(...lg.trades);
				}
			};

			// gated: this exchange is rate-limited — skip the live call, serve last-good
			const gate = exchangeGate.get(ex);
			if (gate && gate.until > Date.now()) {
				applyLastGood();
				error = gate.reason;
			} else {
				const creds = credsOf(acc);
				try {
					const [pos, bal, hist] = await Promise.all([
						adapter.getPositions(creds),
						adapter.getBalance(creds),
						getHistoryCached(acc.id, ex, () =>
							adapter.getHistory(creds).catch((e) => {
								console.warn(
									`[${ex}] getHistory failed:`,
									e instanceof Error ? e.message : e,
								);
								return [] as NormTrade[];
							}),
						),
					]);
					positions.push(...pos);
					balances.push(bal);
					trades.push(...hist);
					accountLastGood.set(acc.id, {
						positions: pos,
						balance: bal,
						trades: hist,
					});
					exchangeGate.delete(ex); // recovered
				} catch (e: any) {
					error = e?.message ?? String(e);
					const { isRL, until } = parseRateLimit(error ?? "");
					if (isRL) {
						const reason = `${ex} 限流冷卻至 ${new Date(until).toLocaleTimeString("zh-TW")}`;
						exchangeGate.set(ex, { until, reason });
						console.warn(
							`[${ex}] rate-limited → 暫停呼叫至 ${new Date(until).toLocaleString("zh-TW")}`,
						);
						error = reason;
					}
					applyLastGood(); // show stale rather than blank
				}
			}

			statuses.push({
				id: acc.id,
				exchange: ex,
				label: acc.label,
				connected: !error,
				error,
				verified: adapter.meta.verified,
			});
			await prisma.exchangeAccount
				.update({
					where: { id: acc.id },
					data: { lastSyncAt: new Date(), lastError: error },
				})
				.catch(() => {});
		}),
	);

	trades.sort((a, b) => b.time - a.time);

	return {
		demo: false,
		generatedAt: Date.now(),
		positions,
		balances,
		trades,
		accounts: statuses.sort((a, b) => a.exchange.localeCompare(b.exchange)),
	};
}
