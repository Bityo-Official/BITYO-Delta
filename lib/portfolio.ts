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
			const creds = credsOf(acc);
			let error: string | null = null;
			try {
				const [pos, bal, hist] = await Promise.all([
					adapter.getPositions(creds),
					adapter.getBalance(creds),
					getHistoryCached(acc.id, ex, () =>
						adapter.getHistory(creds).catch((e) => {
							// history is non-fatal, but DON'T fail silently — log so missing
							// 平倉紀錄 can be diagnosed from the server console
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
			} catch (e: any) {
				error = e?.message ?? String(e);
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
