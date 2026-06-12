import { hmacHex, httpJson, now, qs } from "./http";
// binance.ts — Binance USDⓈ-M Futures (fapi). Verified against documented v1/v2 endpoints.
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type NormBalance,
	type NormPosition,
	type NormTrade,
	type WsAuth,
} from "./types";

const BASE = "https://fapi.binance.com";

function signed(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): string {
	const query = qs({ ...params, timestamp: now(), recvWindow: 10_000 });
	const sig = hmacHex(c.apiSecret, query);
	return `${BASE}${path}?${query}&signature=${sig}`;
}
function headers(c: Credentials) {
	return { "X-MBX-APIKEY": c.apiKey };
}

async function fundingRates(): Promise<Record<string, number>> {
	const arr = await httpJson<any[]>(`${BASE}/fapi/v1/premiumIndex`, {
		exchange: "binance",
	});
	const map: Record<string, number> = {};
	for (const r of arr) map[r.symbol] = Number.parseFloat(r.lastFundingRate);
	return map;
}

async function fundingPaid(c: Credentials): Promise<Record<string, number>> {
	const startTime = now() - 7 * 86400_000;
	const rows = await httpJson<any[]>(
		signed(c, "/fapi/v1/income", {
			incomeType: "FUNDING",
			startTime,
			limit: 1000,
		}),
		{
			exchange: "binance",
			headers: headers(c),
		},
	);
	const map: Record<string, number> = {};
	for (const r of rows)
		map[r.symbol] = (map[r.symbol] ?? 0) + Number.parseFloat(r.income);
	return map;
}

export const binance: ExchangeAdapter = {
	meta: EXCHANGE_META.binance,

	async getPositions(c) {
		const [risk, rates, paid] = await Promise.all([
			httpJson<any[]>(signed(c, "/fapi/v2/positionRisk"), {
				exchange: "binance",
				headers: headers(c),
			}),
			fundingRates().catch(() => ({}) as Record<string, number>),
			fundingPaid(c).catch(() => ({}) as Record<string, number>),
		]);
		const out: NormPosition[] = [];
		for (const p of risk) {
			const amt = Number.parseFloat(p.positionAmt);
			if (!amt) continue;
			const mark = Number.parseFloat(p.markPrice);
			const entry = Number.parseFloat(p.entryPrice);
			const lev = Number.parseFloat(p.leverage) || 1;
			const upnl = Number.parseFloat(p.unRealizedProfit);
			const size = Math.abs(amt);
			const notional = size * mark;
			const isolated = p.marginType === "isolated";
			const margin = isolated
				? Number.parseFloat(p.isolatedMargin) || notional / lev
				: notional / lev;
			out.push({
				exchange: "binance",
				symbol: p.symbol,
				base: baseOf(p.symbol),
				side: amt > 0 ? "long" : "short",
				size,
				lev,
				mode: isolated ? "isolated" : "cross",
				entry,
				mark,
				liq: Number.parseFloat(p.liquidationPrice) || 0,
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
		const a = await httpJson<any>(signed(c, "/fapi/v2/account"), {
			exchange: "binance",
			headers: headers(c),
		});
		const equity = Number.parseFloat(
			a.totalMarginBalance ?? a.totalWalletBalance,
		);
		return {
			exchange: "binance",
			equity,
			available: Number.parseFloat(a.availableBalance),
			marginUsed: Number.parseFloat(
				a.totalInitialMargin ?? a.totalPositionInitialMargin ?? "0",
			),
		} satisfies NormBalance;
	},

	async getHistory(c) {
		const startTime = now() - 14 * 86400_000;
		const rows = await httpJson<any[]>(
			signed(c, "/fapi/v1/income", {
				incomeType: "REALIZED_PNL",
				startTime,
				limit: 1000,
			}),
			{ exchange: "binance", headers: headers(c) },
		);
		const out: NormTrade[] = [];
		for (const r of rows) {
			const realized = Number.parseFloat(r.income);
			if (!realized) continue;
			out.push({
				exchange: "binance",
				id: String(r.tranId ?? `${r.symbol}-${r.time}`),
				time: r.time,
				symbol: r.symbol,
				base: baseOf(r.symbol),
				side: realized >= 0 ? "long" : "short", // direction unknown from income; best-effort
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

	async ping(c) {
		await httpJson(signed(c, "/fapi/v2/balance"), {
			exchange: "binance",
			headers: headers(c),
		});
		return true;
	},

	// Private user-data stream. listenKey creation only needs the API key header (no
	// signature); the listenKey itself — NOT the secret — is what the browser puts in
	// the WS URL. Kept alive with PUT /fapi/v1/listenKey < every 60min (by the route).
	async getWsAuth(c) {
		const r = await httpJson<{ listenKey: string }>(
			`${BASE}/fapi/v1/listenKey`,
			{ exchange: "binance", method: "POST", headers: headers(c) },
		);
		return {
			url: `wss://fstream.binance.com/ws/${r.listenKey}`,
			auth: null, // listenKey is in the URL; no auth message needed
			listenKey: r.listenKey,
			ttlSec: 3000, // 60min cap → refresh ~50min
		} satisfies WsAuth;
	},
};
