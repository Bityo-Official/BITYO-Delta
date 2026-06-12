import { hmacHex, httpJson, now, qs } from "./http";
// bingx.ts — BingX USDT-M Perpetual Swap V2.
// Implemented to documented spec but UNVERIFIED against a live key (meta.verified = false).
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

const BASE = "https://open-api.bingx.com";

async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	const query = qs({ ...params, timestamp: now(), recvWindow: 10_000 });
	const sig = hmacHex(c.apiSecret, query);
	const res = await httpJson<{ code: number; msg: string; data: T }>(
		`${BASE}${path}?${query}&signature=${sig}`,
		{
			exchange: "bingx",
			headers: { "X-BX-APIKEY": c.apiKey },
		},
	);
	if (res.code !== 0) throw new Error(`[bingx] ${res.code}: ${res.msg}`);
	return res.data;
}

export const bingx: ExchangeAdapter = {
	meta: EXCHANGE_META.bingx,

	async getPositions(c) {
		const data = await signedGet<any[]>(c, "/openApi/swap/v2/user/positions");
		const out: NormPosition[] = [];
		for (const p of data ?? []) {
			const size = Math.abs(
				Number.parseFloat(p.positionAmt ?? p.availableAmt ?? "0"),
			);
			if (!size) continue;
			const mark = Number.parseFloat(p.markPrice ?? p.avgPrice ?? "0");
			const lev = Number.parseFloat(p.leverage) || 1;
			const upnl = Number.parseFloat(p.unrealizedProfit ?? "0");
			const margin = Number.parseFloat(
				p.initialMargin ?? p.margin ?? String((size * mark) / lev),
			);
			out.push({
				exchange: "bingx",
				symbol: String(p.symbol).replace("-", ""),
				base: baseOf(p.symbol),
				side:
					String(p.positionSide).toLowerCase() === "short" ? "short" : "long",
				size,
				lev,
				mode:
					String(p.marginType).toLowerCase() === "isolated"
						? "isolated"
						: "cross",
				entry: Number.parseFloat(p.avgPrice ?? "0"),
				mark,
				liq: Number.parseFloat(p.liquidationPrice ?? "0"),
				margin,
				upnl,
				roe: margin ? (upnl / margin) * 100 : 0,
				fundRate: 0,
				fundPaid: 0,
			});
		}
		return out;
	},

	async getBalance(c) {
		const d = await signedGet<any>(c, "/openApi/swap/v2/user/balance");
		const b = d?.balance ?? d ?? {};
		return {
			exchange: "bingx",
			equity: Number.parseFloat(b.equity ?? b.balance ?? "0"),
			available: Number.parseFloat(
				b.availableMargin ?? b.availableBalance ?? "0",
			),
			marginUsed: Number.parseFloat(b.usedMargin ?? "0"),
		} satisfies NormBalance;
	},

	// Realized-PnL ledger via the income endpoint (V2; the old allOrders route was
	// unreliable for closed trades). Same pattern as Binance's /fapi income API.
	async getHistory(c) {
		const startTime = now() - 90 * 86400_000;
		const rows = await signedGet<any[]>(c, "/openApi/swap/v2/user/income", {
			incomeType: "REALIZED_PNL",
			startTime,
			limit: 1000,
		}).catch(() => [] as any[]);
		const out: NormTrade[] = [];
		for (const r of rows ?? []) {
			const realized = Number.parseFloat(r.income ?? "0");
			if (!realized) continue;
			const symbol = String(r.symbol ?? "").replace("-", "");
			out.push({
				exchange: "bingx",
				id: String(r.tranId ?? r.tradeId ?? `${symbol}-${r.time}`),
				time: Number(r.time ?? now()),
				symbol,
				base: baseOf(symbol),
				// direction is not part of income rows — best-effort by PnL sign
				side: realized >= 0 ? "long" : "short",
				size: 0,
				entry: 0,
				exit: 0,
				realized,
				fee: 0,
				funding: 0,
			});
		}
		return out.sort((a, b) => b.time - a.time);
	},

	// PUBLIC mark prices — no auth. position.symbol is e.g. BTCUSDT; BingX uses BTC-USDT.
	async getMarkPrices(symbols: string[]): Promise<MarkTick[]> {
		const out: MarkTick[] = [];
		await Promise.all(
			symbols.map(async (sym) => {
				const bx = `${baseOf(sym)}-USDT`;
				try {
					const res = await httpJson<{ code: number; data: any }>(
						`${BASE}/openApi/swap/v2/quote/premiumIndex?${qs({ symbol: bx })}`,
						{ exchange: "bingx" },
					);
					const d = Array.isArray(res.data) ? res.data[0] : res.data;
					const mark = Number.parseFloat(d?.markPrice ?? "0");
					if (mark)
						out.push({
							exchange: "bingx",
							symbol: sym,
							mark,
							fundRate:
								d?.lastFundingRate !== undefined
									? Number.parseFloat(d.lastFundingRate)
									: undefined,
						});
				} catch {
					/* skip */
				}
			}),
		);
		return out;
	},

	// Private user-data stream via listenKey (no signature needed; API key header only).
	// NOTE: BingX WS frames are GZIP-compressed — the browser client must inflate them
	// (DecompressionStream). Unverified against a live key.
	async getWsAuth(c) {
		const r = await httpJson<{ listenKey: string }>(
			`${BASE}/openApi/user/auth/userDataStream`,
			{
				exchange: "bingx",
				method: "POST",
				headers: { "X-BX-APIKEY": c.apiKey },
			},
		);
		return {
			url: `wss://open-api-swap.bingx.com/swap-market?listenKey=${r.listenKey}`,
			auth: null,
			listenKey: r.listenKey,
			ttlSec: 3000,
		} satisfies WsAuth;
	},

	async ping(c) {
		await signedGet(c, "/openApi/swap/v2/user/balance");
		return true;
	},
};
