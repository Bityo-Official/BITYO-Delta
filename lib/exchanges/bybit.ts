import { hmacHex, httpJson, now, qs } from "./http";
// bybit.ts — Bybit V5 (linear USDT perp, unified account). Verified against V5 docs.
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type NormBalance,
	type NormPosition,
	type WsAuth,
} from "./types";

const BASE = "https://api.bybit.com";
const RECV = "10000";

async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	const ts = String(now());
	const query = qs(params);
	const sign = hmacHex(c.apiSecret, ts + c.apiKey + RECV + query);
	const url = query ? `${BASE}${path}?${query}` : `${BASE}${path}`;
	const res = await httpJson<{ retCode: number; retMsg: string; result: T }>(
		url,
		{
			exchange: "bybit",
			headers: {
				"X-BAPI-API-KEY": c.apiKey,
				"X-BAPI-TIMESTAMP": ts,
				"X-BAPI-RECV-WINDOW": RECV,
				"X-BAPI-SIGN": sign,
			},
		},
	);
	if (res.retCode !== 0)
		throw new Error(`[bybit] ${res.retCode}: ${res.retMsg}`);
	return res.result;
}

async function publicGet<T = any>(
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	const res = await httpJson<{ retCode: number; retMsg: string; result: T }>(
		`${BASE}${path}?${qs(params)}`,
		{ exchange: "bybit" },
	);
	if (res.retCode !== 0)
		throw new Error(`[bybit] ${res.retCode}: ${res.retMsg}`);
	return res.result;
}

async function tickerFunding(): Promise<Record<string, number>> {
	const r = await publicGet<{ list: any[] }>("/v5/market/tickers", {
		category: "linear",
	});
	const map: Record<string, number> = {};
	for (const t of r.list) map[t.symbol] = Number.parseFloat(t.fundingRate);
	return map;
}

async function settlementBySymbol(
	c: Credentials,
): Promise<Record<string, number>> {
	const startTime = now() - 7 * 86400_000;
	const r = await signedGet<{ list: any[] }>(c, "/v5/account/transaction-log", {
		accountType: "UNIFIED",
		category: "linear",
		type: "SETTLEMENT",
		startTime,
		limit: 50,
	});
	const map: Record<string, number> = {};
	for (const row of r.list ?? [])
		map[row.symbol] =
			(map[row.symbol] ?? 0) +
			Number.parseFloat(row.funding || row.change || "0");
	return map;
}

export const bybit: ExchangeAdapter = {
	meta: EXCHANGE_META.bybit,

	async getPositions(c) {
		const [pos, rates, paid] = await Promise.all([
			signedGet<{ list: any[] }>(c, "/v5/position/list", {
				category: "linear",
				settleCoin: "USDT",
			}),
			tickerFunding().catch(() => ({}) as Record<string, number>),
			settlementBySymbol(c).catch(() => ({}) as Record<string, number>),
		]);
		const out: NormPosition[] = [];
		for (const p of pos.list ?? []) {
			const size = Number.parseFloat(p.size);
			if (!size) continue;
			const mark = Number.parseFloat(p.markPrice);
			const lev = Number.parseFloat(p.leverage) || 1;
			const upnl = Number.parseFloat(p.unrealisedPnl);
			const margin = Number.parseFloat(p.positionIM) || (size * mark) / lev;
			out.push({
				exchange: "bybit",
				symbol: p.symbol,
				base: baseOf(p.symbol),
				side: p.side === "Buy" ? "long" : "short",
				size,
				lev,
				mode: p.tradeMode === 1 ? "isolated" : "cross",
				entry: Number.parseFloat(p.avgPrice),
				mark,
				liq: Number.parseFloat(p.liqPrice) || 0,
				margin,
				upnl,
				roe: margin ? (upnl / margin) * 100 : 0,
				fundRate: rates[p.symbol] ?? 0,
				fundPaid: paid[p.symbol] ?? 0,
			});
		}
		return out;
	},

	async getBalance(c) {
		const r = await signedGet<{ list: any[] }>(
			c,
			"/v5/account/wallet-balance",
			{ accountType: "UNIFIED" },
		);
		const a = r.list?.[0] ?? {};
		return {
			exchange: "bybit",
			equity: Number.parseFloat(a.totalEquity || "0"),
			available: Number.parseFloat(a.totalAvailableBalance || "0"),
			marginUsed: Number.parseFloat(a.totalInitialMargin || "0"),
		} satisfies NormBalance;
	},

	async getHistory(c) {
		// Bybit V5 closed-pnl caps each request at `endTime - startTime <= 7 days`,
		// so cover 180 days with ~26 windows of (7d − 1min), fired in chunks of 6 to
		// respect the per-endpoint rate limit. Called through the portfolio-level
		// history cache (3 min TTL), so the fan-out cost is amortized.
		const SPAN = 7 * 86400_000 - 60_000;
		const LOOKBACK_DAYS = 180;
		const end = now();
		const windowCount = Math.ceil((LOOKBACK_DAYS * 86400_000) / SPAN);
		const windows = Array.from({ length: windowCount }, (_, i) => ({
			startTime: end - (i + 1) * SPAN,
			endTime: end - i * SPAN,
		}));
		// baseline no-param call (server-default last 7 days) as belt-and-braces
		const results: { list: any[] }[] = [
			await signedGet<{ list: any[] }>(c, "/v5/position/closed-pnl", {
				category: "linear",
				limit: 100,
			}).catch(() => ({ list: [] as any[] })),
		];
		const CHUNK = 6;
		for (let i = 0; i < windows.length; i += CHUNK) {
			const batch = await Promise.all(
				windows.slice(i, i + CHUNK).map((w) =>
					signedGet<{ list: any[] }>(c, "/v5/position/closed-pnl", {
						category: "linear",
						startTime: w.startTime,
						endTime: w.endTime,
						limit: 100,
					}).catch(() => ({ list: [] as any[] })),
				),
			);
			results.push(...batch);
		}
		const seen = new Set<string>();
		const list = results
			.flatMap((r) => r.list ?? [])
			.filter((t) => {
				const id = String(t.orderId ?? `${t.symbol}-${t.updatedTime}`);
				if (seen.has(id)) return false;
				seen.add(id);
				return true;
			});
		return list.map((t) => ({
			exchange: "bybit" as const,
			id: String(t.orderId ?? `${t.symbol}-${t.updatedTime}`),
			time: Number(t.createdTime ?? t.updatedTime),
			symbol: t.symbol,
			base: baseOf(t.symbol),
			side: t.side === "Buy" ? ("short" as const) : ("long" as const), // closing side is opposite of position side
			size: Number.parseFloat(t.qty),
			entry: Number.parseFloat(t.avgEntryPrice),
			exit: Number.parseFloat(t.avgExitPrice),
			realized: Number.parseFloat(t.closedPnl),
			fee: -(
				Number.parseFloat(t.openFee || "0") +
				Number.parseFloat(t.closeFee || "0")
			),
			funding: 0,
		}));
	},

	// Private WS auth — sign `GET/realtime${expires}`; secret stays server-side, only
	// the {apiKey, expires, signature} triple goes to the browser. Client sends it as
	// {op:"auth"} then subscribes to position / wallet / execution channels.
	async getWsAuth(c) {
		const expires = now() + 10_000;
		const sign = hmacHex(c.apiSecret, `GET/realtime${expires}`);
		return {
			url: "wss://stream.bybit.com/v5/private",
			auth: { op: "auth", args: [c.apiKey, expires, sign] },
			ttlSec: 10, // signature expiry; client re-fetches on reconnect
		} satisfies WsAuth;
	},

	async ping(c) {
		await signedGet(c, "/v5/account/wallet-balance", {
			accountType: "UNIFIED",
		});
		return true;
	},
};
