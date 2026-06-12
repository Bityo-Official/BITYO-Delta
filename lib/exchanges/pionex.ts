import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExchangeError, hmacHex, httpJson, now } from "./http";
// pionex.ts — Pionex Perpetual Futures, implemented per official docs
// (https://www.pionex.com/docs/api-docs/futures-api/*):
//   GET /uapi/v1/account/positions         → open positions
//   GET /uapi/v1/account/balances          → futures wallet (free/frozen per coin)
//   GET /uapi/v1/account/historyPositions  → closed positions (positionFlag=CLOSED)
//   GET /api/v1/market/indexes             → public markPrice + nextFundingRate (all PERP)
// Signing: HMAC-SHA256 hex of `METHOD + path?sortedQuery` (timestamp included in the
// sorted query, ms). Headers: PIONEX-KEY / PIONEX-SIGNATURE.
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type MarkTick,
	type NormBalance,
	type NormPosition,
	type NormTrade,
	type WsAuth,
} from "./types";

const BASE = "https://api.pionex.com";

function sortedQuery(params: Record<string, string | number>): string {
	return Object.keys(params)
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join("&");
}

// ── process-wide shared state ──
// The custom server (tsx module graph) and Next's route-handler bundle are SEPARATE
// module instances in the SAME process. Without a shared home, each would run its own
// throttle queue / circuit breaker / caches and double the Pionex traffic — so all
// mutable state lives on globalThis.
type IndexMapG = Map<string, { mark: number; fundRate: number }>;
interface PionexState {
	throttleChain: Promise<unknown>;
	lastCallAt: number;
	cooldownUntil: number;
	strike: number; // consecutive cooldown WINDOWS (not individual failures)
	indexesCache: { at: number; data: IndexMapG } | null;
	indexesInflight: Promise<IndexMapG> | null;
	positionsCache: Map<string, { at: number; data: any }>;
	positionsInflight: Map<string, Promise<any>>;
	balancesCache: Map<string, { at: number; data: any }>;
	historyLastGood: Map<string, NormTrade[]>;
}
// biome-ignore lint/suspicious/noAssignInExpressions: 跨模組單例 — 必須在 globalThis 上原子初始化一次
const G: PionexState = ((globalThis as any).__pionexState ??= {
	throttleChain: Promise.resolve(),
	lastCallAt: 0,
	cooldownUntil: 0,
	strike: 0,
	indexesCache: null,
	indexesInflight: null,
	positionsCache: new Map(),
	positionsInflight: new Map(),
	balancesCache: new Map(),
	historyLastGood: new Map(),
});

// ── cooldown persistence ──
// Pionex's lock appears to SLIDE: every request during a lock re-extends it (~5h).
// Dev-server restarts must therefore NOT probe again — the unlock timestamp is
// persisted to a tmp file and reloaded on boot.
const GATE_FILE = join(tmpdir(), "bityo-pionex-gate.json");
function loadGate() {
	try {
		const j = JSON.parse(readFileSync(GATE_FILE, "utf8"));
		if (typeof j?.cooldownUntil === "number" && j.cooldownUntil > Date.now()) {
			G.cooldownUntil = j.cooldownUntil;
			G.strike = typeof j?.strike === "number" ? j.strike : G.strike;
			console.warn(
				`[pionex] 載入既有封鎖狀態 — 解鎖時間 ${new Date(G.cooldownUntil).toLocaleString("zh-TW")}，期間不發出任何請求`,
			);
		}
	} catch {
		/* no gate file yet */
	}
}
function saveGate() {
	try {
		writeFileSync(
			GATE_FILE,
			JSON.stringify({ cooldownUntil: G.cooldownUntil, strike: G.strike }),
		);
	} catch {
		/* best-effort */
	}
}
loadGate();

// ── global FIFO throttle ──
// Pionex 429s on BURSTS (snapshot builds fire several calls in the same second), so
// every real HTTP call — public or signed — is spaced ≥ MIN_SPACING apart on one queue.
const MIN_SPACING = 1_100;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
	const run = async (): Promise<T> => {
		const wait = G.lastCallAt + MIN_SPACING - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		G.lastCallAt = Date.now();
		return fn();
	};
	const p = G.throttleChain.then(run, run);
	G.throttleChain = p.catch(() => {});
	return p;
}

async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	// sign inside the throttle slot — the timestamp must be fresh AFTER queue wait
	return throttled(async () => {
		const query = sortedQuery({ ...params, timestamp: now() });
		const pathUrl = `${path}?${query}`;
		const sig = hmacHex(c.apiSecret, `GET${pathUrl}`);
		const res = await httpJson<{
			result: boolean;
			message?: string;
			code?: string;
			data: T;
		}>(`${BASE}${pathUrl}`, {
			exchange: "pionex",
			headers: { "PIONEX-KEY": c.apiKey, "PIONEX-SIGNATURE": sig },
		});
		if (res.result === false)
			throw new Error(
				`[pionex] ${res.code ?? ""} ${res.message ?? "request failed"}`,
			);
		return res.data;
	});
}

// Pionex symbols: account = BTC_USDT(_PERP), market PERP = BTC_USDT_PERP.
// Normalize to our cross-exchange form (BTCUSDT).
function normSymbol(s: string): string {
	return String(s || "")
		.replace(/_PERP$/i, "")
		.replace(/_/g, "");
}

// ── micro-cache + in-flight dedupe ──
// Pionex rate-limits aggressively (429). The mark poller, snapshot builder and
// getBalance all hit the same endpoints, so coalesce them: short-TTL caches and a
// single shared in-flight promise per resource.
type IndexMap = IndexMapG;
const INDEXES_TTL = 12_000;
const POSITIONS_TTL = 15_000;

// ── 429 circuit breaker（指數升級）──
// Pionex 的封鎖是 IP 級且可能持續很久；每次重試都可能刷新封鎖計時，所以連續 429
// 時冷卻時間指數拉長（1m → 2m → 4m → … → 15m cap），讓封鎖有機會自然過期。
// 冷卻期間一律改吃 stale cache，不對外拋英文錯誤。
const COOLDOWN_BASE = 60_000;
const COOLDOWN_CAP = 15 * 60_000;

function guardCooldown() {
	if (Date.now() < G.cooldownUntil) {
		throw new Error("[pionex] 交易所限流中（429），冷卻退避中，稍後自動恢復");
	}
}
function noteRateLimit(e: unknown) {
	const msg = e instanceof Error ? e.message : String(e);
	if (!msg.includes("429")) return;
	// Venue told us the exact unlock time (x-ratelimit-lock) — honor it precisely.
	const lockUntil = e instanceof ExchangeError ? e.lockUntilMs : undefined;
	if (lockUntil && lockUntil > Date.now()) {
		const extended = lockUntil + 5_000 > G.cooldownUntil;
		G.cooldownUntil = Math.max(G.cooldownUntil, lockUntil + 5_000);
		if (extended) {
			console.warn(
				`[pionex] 429 — IP 遭交易所鎖定，解鎖時間 ${new Date(G.cooldownUntil).toLocaleString("zh-TW")}（期間完全停止請求，重啟也不會重試）`,
			);
			saveGate();
		}
		return;
	}
	// already cooling — the rest of this burst shares the same window, don't escalate
	if (Date.now() < G.cooldownUntil) return;
	G.strike += 1;
	const wait = Math.min(COOLDOWN_CAP, COOLDOWN_BASE * 2 ** (G.strike - 1));
	G.cooldownUntil = Date.now() + wait;
	console.warn(
		`[pionex] 429 — 退避 ${Math.round(wait / 1000)}s（連續第 ${G.strike} 個冷卻窗）`,
	);
	saveGate();
}
function noteSuccess() {
	G.strike = 0;
}

// Public mark price + funding rate for ALL perpetuals in one call (cached).
async function fetchIndexes(): Promise<IndexMap> {
	if (G.indexesCache && Date.now() - G.indexesCache.at < INDEXES_TTL)
		return G.indexesCache.data;
	if (Date.now() < G.cooldownUntil) {
		// cooling down — serve stale data if we have any rather than hitting the API
		if (G.indexesCache) return G.indexesCache.data;
		guardCooldown();
	}
	if (G.indexesInflight) return G.indexesInflight;
	G.indexesInflight = (async () => {
		const res = await throttled(() =>
			httpJson<{ result: boolean; data: { indexes: any[] } }>(
				`${BASE}/api/v1/market/indexes`,
				{ exchange: "pionex" },
			),
		);
		const map: IndexMap = new Map();
		for (const ix of res?.data?.indexes ?? []) {
			const mark = Number.parseFloat(ix.markPrice ?? "0");
			if (!mark) continue;
			map.set(normSymbol(ix.symbol), {
				mark,
				fundRate: Number.parseFloat(ix.nextFundingRate ?? "0") || 0,
			});
		}
		G.indexesCache = { at: Date.now(), data: map };
		noteSuccess();
		return map;
	})()
		.catch((e) => {
			noteRateLimit(e);
			throw e;
		})
		.finally(() => {
			G.indexesInflight = null;
		});
	return G.indexesInflight;
}

// Signed balances, cached per API key (15s TTL, stale during cooldown).
const BALANCES_TTL = 15_000;
async function fetchBalances(c: Credentials): Promise<{ balances: any[] }> {
	const key = c.apiKey;
	const hit = G.balancesCache.get(key);
	if (hit && Date.now() - hit.at < BALANCES_TTL) return hit.data;
	if (Date.now() < G.cooldownUntil) {
		if (hit) return hit.data; // stale-while-cooldown
		guardCooldown();
	}
	try {
		const data = await signedGet<{ balances: any[] }>(
			c,
			"/uapi/v1/account/balances",
		);
		G.balancesCache.set(key, { at: Date.now(), data });
		noteSuccess();
		return data;
	} catch (e) {
		noteRateLimit(e);
		if (hit) return hit.data; // serve stale on transient failure
		throw e;
	}
}

// Signed positions, cached per API key (getPositions + getBalance share one call).
async function fetchPositions(c: Credentials): Promise<{ positions: any[] }> {
	const key = c.apiKey;
	const hit = G.positionsCache.get(key);
	if (hit && Date.now() - hit.at < POSITIONS_TTL) return hit.data;
	if (Date.now() < G.cooldownUntil) {
		if (hit) return hit.data; // stale-while-cooldown
		guardCooldown();
	}
	const inflight = G.positionsInflight.get(key);
	if (inflight) return inflight;
	const p = signedGet<{ positions: any[] }>(c, "/uapi/v1/account/positions")
		.then((data) => {
			G.positionsCache.set(key, { at: Date.now(), data });
			noteSuccess();
			return data;
		})
		.catch((e) => {
			noteRateLimit(e);
			throw e;
		})
		.finally(() => {
			G.positionsInflight.delete(key);
		});
	G.positionsInflight.set(key, p);
	return p;
}

export const pionex: ExchangeAdapter = {
	meta: EXCHANGE_META.pionex,

	async getPositions(c) {
		const [data, indexes] = await Promise.all([
			fetchPositions(c),
			fetchIndexes().catch((): IndexMap => new Map()),
		]);
		const out: NormPosition[] = [];
		for (const p of data?.positions ?? []) {
			const size = Math.abs(Number.parseFloat(p.netSize ?? "0"));
			if (!size) continue;
			const symbol = normSymbol(p.symbol);
			const entry = Number.parseFloat(p.avgPrice ?? "0");
			const idx = indexes.get(symbol);
			const mark = Number.parseFloat(p.markPrice ?? "0") || idx?.mark || entry;
			const lev = Number.parseFloat(p.leverage) || 1;
			const margin =
				Number.parseFloat(p.initialMargin ?? "0") || (size * mark) / lev;
			const upnl = Number.parseFloat(p.unrealizedPnL ?? "0");
			out.push({
				exchange: "pionex",
				symbol,
				base: baseOf(symbol),
				side:
					String(p.positionSide).toUpperCase() === "SHORT" ? "short" : "long",
				size,
				lev,
				mode: String(p.isolatedMode).toUpperCase().includes("ISOLATED")
					? "isolated"
					: "cross",
				entry,
				mark,
				liq: Number.parseFloat(p.liquidationPrice ?? "0"),
				margin,
				upnl,
				roe: margin ? (upnl / margin) * 100 : 0,
				fundRate: idx?.fundRate ?? 0,
				fundPaid: 0, // Pionex futures API does not expose per-position funding totals
			});
		}
		return out;
	},

	async getBalance(c) {
		// equity = settled wallet (free + frozen) + open uPnL, to match other venues'
		// "margin balance" semantics. Both fetchers serve stale data during cooldown.
		const [data, positions] = await Promise.all([
			fetchBalances(c),
			fetchPositions(c).catch(() => ({ positions: [] as any[] })),
		]);
		const usdt = (data?.balances ?? []).find((b) => b.coin === "USDT");
		const free = Number.parseFloat(usdt?.free ?? "0");
		const frozen = Number.parseFloat(usdt?.frozen ?? "0");
		const upnl = (positions?.positions ?? []).reduce(
			(s, p) => s + (Number.parseFloat(p.unrealizedPnL ?? "0") || 0),
			0,
		);
		const marginUsed = (positions?.positions ?? []).reduce(
			(s, p) => s + (Number.parseFloat(p.initialMargin ?? "0") || 0),
			0,
		);
		return {
			exchange: "pionex",
			equity: free + frozen + upnl,
			available: free,
			marginUsed: marginUsed || frozen,
		} satisfies NormBalance;
	},

	// Closed positions. The history payload exposes settled amounts rather than
	// entry/exit prices, so prices are derived from amount ÷ size (best-effort).
	// Last-good results are kept so a rate-limit cooldown never blanks the ledger.
	async getHistory(c) {
		const lastGood = G.historyLastGood.get(c.apiKey);
		if (Date.now() < G.cooldownUntil) return lastGood ?? [];
		try {
			const startTime = now() - 30 * 86400_000;
			let data = await signedGet<{ positions: any[] }>(
				c,
				"/uapi/v1/account/historyPositions",
				{ positionFlag: "CLOSED", startTime, limit: 100 },
			).catch(() => ({ positions: [] as any[] }));
			// some deployments reject/ignore positionFlag — retry without it
			if (!data?.positions?.length) {
				data = await signedGet<{ positions: any[] }>(
					c,
					"/uapi/v1/account/historyPositions",
					{ startTime, limit: 100 },
				);
			}
			const out: NormTrade[] = [];
			for (const t of data?.positions ?? []) {
				const sizeLong = Math.abs(Number.parseFloat(t.sizeLong ?? "0"));
				const sizeShort = Math.abs(Number.parseFloat(t.sizeShort ?? "0"));
				const size = Math.max(sizeLong, sizeShort);
				if (!size) continue;
				const side =
					String(t.positionSide).toUpperCase() === "SHORT" ? "short" : "long";
				const amountLong = Math.abs(Number.parseFloat(t.amountLong ?? "0"));
				const amountShort = Math.abs(Number.parseFloat(t.amountShort ?? "0"));
				// long opens via buys (amountLong), short opens via sells (amountShort)
				const entry = side === "long" ? amountLong / size : amountShort / size;
				const realized = Number.parseFloat(t.amountSettled ?? "0");
				const symbol = normSymbol(t.symbol);
				out.push({
					exchange: "pionex",
					id: String(t.positionId ?? `${symbol}-${t.updateTime}`),
					time: Number(t.updateTime ?? t.createTime ?? now()),
					symbol,
					base: baseOf(symbol),
					side,
					size,
					entry: Number.isFinite(entry) ? entry : 0,
					exit: 0, // not exposed; realized PnL carries the result
					realized,
					fee: 0,
					funding: 0,
				});
			}
			out.sort((a, b) => b.time - a.time);
			G.historyLastGood.set(c.apiKey, out);
			return out;
		} catch (e) {
			noteRateLimit(e);
			return lastGood ?? ([] as NormTrade[]);
		}
	},

	// PUBLIC mark prices — one indexes call covers every PERP symbol.
	async getMarkPrices(symbols: string[]): Promise<MarkTick[]> {
		if (!symbols.length) return [];
		const want = new Set(symbols);
		try {
			const indexes = await fetchIndexes();
			const out: MarkTick[] = [];
			for (const [symbol, v] of indexes) {
				if (!want.has(symbol)) continue;
				out.push({
					exchange: "pionex",
					symbol,
					mark: v.mark,
					fundRate: v.fundRate,
				});
			}
			return out;
		} catch {
			return [];
		}
	},

	// Private WS auth per docs: sign `${timestamp}websocket_auth` (HMAC-SHA256 → hex).
	// secret stays server-side. URL per Pionex futures-websocket docs — confirm with a
	// live key if the stream fails to connect.
	async getWsAuth(c) {
		const ts = String(now());
		const sign = hmacHex(c.apiSecret, `${ts}websocket_auth`);
		return {
			url: "wss://ws.pionex.com/wsPriv",
			auth: { op: "auth", args: [c.apiKey, ts, sign] },
			ttlSec: 30,
		} satisfies WsAuth;
	},

	async ping(c) {
		await signedGet(c, "/uapi/v1/account/balances");
		return true;
	},
};
