import { hmacBase64, httpJson, now, qs } from "./http";
// bitget.ts — Bitget V2 Mix (USDT-FUTURES). Requires passphrase.
// Implemented to documented spec but UNVERIFIED against a live key (meta.verified = false).
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type MarkTick,
	type NormBalance,
	type NormPosition,
	type WsAuth,
} from "./types";

const BASE = "https://api.bitget.com";

async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	const query = qs(params);
	const requestPath = query ? `${path}?${query}` : path;
	const ts = String(now());
	const sign = hmacBase64(c.apiSecret, `${ts}GET${requestPath}`);
	const res = await httpJson<{ code: string; msg: string; data: T }>(
		`${BASE}${requestPath}`,
		{
			exchange: "bitget",
			headers: {
				"ACCESS-KEY": c.apiKey,
				"ACCESS-SIGN": sign,
				"ACCESS-TIMESTAMP": ts,
				"ACCESS-PASSPHRASE": c.passphrase ?? "",
				"Content-Type": "application/json",
				locale: "en-US",
			},
		},
	);
	if (res.code !== "00000") throw new Error(`[bitget] ${res.code}: ${res.msg}`);
	return res.data;
}

export const bitget: ExchangeAdapter = {
	meta: EXCHANGE_META.bitget,

	async getPositions(c) {
		const data = await signedGet<any[]>(
			c,
			"/api/v2/mix/position/all-position",
			{ productType: "USDT-FUTURES", marginCoin: "USDT" },
		);
		const out: NormPosition[] = [];
		for (const p of data ?? []) {
			const size = Math.abs(Number.parseFloat(p.total ?? p.available ?? "0"));
			if (!size) continue;
			const mark = Number.parseFloat(p.markPrice ?? "0");
			const lev = Number.parseFloat(p.leverage) || 1;
			const upnl = Number.parseFloat(p.unrealizedPL ?? "0");
			const margin = Number.parseFloat(
				p.marginSize ?? p.im ?? String((size * mark) / lev),
			);
			out.push({
				exchange: "bitget",
				symbol: p.symbol,
				base: baseOf(p.symbol),
				side: p.holdSide === "short" ? "short" : "long",
				size,
				lev,
				mode: p.marginMode === "isolated" ? "isolated" : "cross",
				entry: Number.parseFloat(p.openPriceAvg ?? "0"),
				mark,
				liq: Number.parseFloat(p.liquidationPrice ?? "0"),
				margin,
				upnl,
				roe:
					Number.parseFloat(p.achievedProfits ?? "0") ||
					(margin ? (upnl / margin) * 100 : 0),
				fundRate: 0,
				fundPaid: 0,
			});
		}
		return out;
	},

	async getBalance(c) {
		const data = await signedGet<any[]>(c, "/api/v2/mix/account/accounts", {
			productType: "USDT-FUTURES",
		});
		const a =
			(data ?? []).find((x) => x.marginCoin === "USDT") ?? data?.[0] ?? {};
		return {
			exchange: "bitget",
			equity: Number.parseFloat(a.accountEquity ?? a.usdtEquity ?? "0"),
			available: Number.parseFloat(a.available ?? a.crossedMaxAvailable ?? "0"),
			marginUsed: Number.parseFloat(a.locked ?? a.im ?? "0"),
		} satisfies NormBalance;
	},

	async getHistory(c) {
		const startTime = now() - 14 * 86400_000;
		const d = await signedGet<any>(c, "/api/v2/mix/order/history-pos", {
			productType: "USDT-FUTURES",
			startTime,
			limit: 100,
		}).catch(() => ({ list: [] }));
		const list: any[] = d?.list ?? [];
		return list.map((t) => ({
			exchange: "bitget" as const,
			id: String(t.positionId ?? t.orderId),
			time: Number(t.utime ?? t.ctime ?? now()),
			symbol: t.symbol,
			base: baseOf(t.symbol),
			side: (t.holdSide === "short" ? "short" : "long") as "long" | "short",
			size: Number.parseFloat(t.openTotalPos ?? "0"),
			entry: Number.parseFloat(t.openAvgPrice ?? "0"),
			exit: Number.parseFloat(t.closeAvgPrice ?? "0"),
			realized: Number.parseFloat(t.pnl ?? t.netProfit ?? "0"),
			fee: -Math.abs(
				Number.parseFloat(t.openFee ?? "0") +
					Number.parseFloat(t.closeFee ?? "0"),
			),
			funding: Number.parseFloat(t.totalFunding ?? "0"),
		}));
	},

	// PUBLIC mark prices — no auth. One call returns all USDT-FUTURES tickers.
	async getMarkPrices(symbols: string[]): Promise<MarkTick[]> {
		if (!symbols.length) return [];
		const want = new Set(symbols);
		const res = await httpJson<{ code: string; data: any[] }>(
			`${BASE}/api/v2/mix/market/tickers?productType=USDT-FUTURES`,
			{ exchange: "bitget" },
		);
		const out: MarkTick[] = [];
		for (const t of res?.data ?? []) {
			if (!want.has(t.symbol)) continue;
			const mark = Number.parseFloat(t.markPrice ?? t.lastPr ?? "0");
			if (mark)
				out.push({
					exchange: "bitget",
					symbol: t.symbol,
					mark,
					fundRate:
						t.fundingRate !== undefined
							? Number.parseFloat(t.fundingRate)
							: undefined,
				});
		}
		return out;
	},

	// Private WS login — sign `${ts}GET/user/verify` (HMAC-SHA256 → base64), ts in seconds.
	// secret stays server-side. Unverified against a live key.
	async getWsAuth(c) {
		const ts = Math.floor(Date.now() / 1000).toString();
		const sign = hmacBase64(c.apiSecret, `${ts}GET/user/verify`);
		return {
			url: "wss://ws.bitget.com/v2/ws/private",
			auth: {
				op: "login",
				args: [
					{
						apiKey: c.apiKey,
						passphrase: c.passphrase ?? "",
						timestamp: ts,
						sign,
					},
				],
			},
			ttlSec: 30,
		} satisfies WsAuth;
	},

	async ping(c) {
		await signedGet(c, "/api/v2/mix/account/accounts", {
			productType: "USDT-FUTURES",
		});
		return true;
	},
};
