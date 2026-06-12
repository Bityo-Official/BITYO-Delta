import { hmacBase64, httpJson, qs } from "./http";
// okx.ts — OKX V5 (SWAP perpetuals). Verified against V5 docs. Requires passphrase.
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type NormBalance,
	type NormPosition,
	type WsAuth,
} from "./types";

const BASE = "https://www.okx.com";

function okxBase(instId: string): string {
	return instId.split("-")[0] || baseOf(instId);
}

async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T[]> {
	const query = qs(params);
	const requestPath = query ? `${path}?${query}` : path;
	const ts = new Date().toISOString();
	const sign = hmacBase64(c.apiSecret, `${ts}GET${requestPath}`);
	const res = await httpJson<{ code: string; msg: string; data: T[] }>(
		`${BASE}${requestPath}`,
		{
			exchange: "okx",
			headers: {
				"OK-ACCESS-KEY": c.apiKey,
				"OK-ACCESS-SIGN": sign,
				"OK-ACCESS-TIMESTAMP": ts,
				"OK-ACCESS-PASSPHRASE": c.passphrase ?? "",
				"Content-Type": "application/json",
			},
		},
	);
	if (res.code !== "0") throw new Error(`[okx] ${res.code}: ${res.msg}`);
	return res.data;
}

async function publicGet<T = any>(
	path: string,
	params: Record<string, string | number> = {},
): Promise<T[]> {
	const res = await httpJson<{ code: string; msg: string; data: T[] }>(
		`${BASE}${path}?${qs(params)}`,
		{ exchange: "okx" },
	);
	if (res.code !== "0") throw new Error(`[okx] ${res.code}: ${res.msg}`);
	return res.data;
}

async function fundingBills(c: Credentials): Promise<Record<string, number>> {
	// bill type 8 = funding fee
	const rows = await signedGet<any>(c, "/api/v5/account/bills", {
		instType: "SWAP",
		type: "8",
		limit: "100",
	}).catch(() => []);
	const map: Record<string, number> = {};
	for (const b of rows)
		map[b.instId] =
			(map[b.instId] ?? 0) + Number.parseFloat(b.balChg || b.pnl || "0");
	return map;
}

export const okx: ExchangeAdapter = {
	meta: EXCHANGE_META.okx,

	async getPositions(c) {
		const [positions, paid] = await Promise.all([
			signedGet<any>(c, "/api/v5/account/positions", { instType: "SWAP" }),
			fundingBills(c).catch(() => ({}) as Record<string, number>),
		]);
		const active = positions.filter((p) => Number.parseFloat(p.pos) !== 0);
		// funding rates per instId (public, parallel)
		const rateEntries = await Promise.all(
			active.map(async (p) => {
				try {
					const fr = await publicGet<any>("/api/v5/public/funding-rate", {
						instId: p.instId,
					});
					return [
						p.instId,
						Number.parseFloat(fr[0]?.fundingRate ?? "0"),
					] as const;
				} catch {
					return [p.instId, 0] as const;
				}
			}),
		);
		const rates = Object.fromEntries(rateEntries);

		const out: NormPosition[] = [];
		for (const p of active) {
			const pos = Number.parseFloat(p.pos);
			const mark = Number.parseFloat(p.markPx || p.last || "0");
			const upnl = Number.parseFloat(p.upl || "0");
			const margin = Number.parseFloat(p.margin || p.imr || "0");
			const lev = Number.parseFloat(p.lever) || 1;
			const side =
				p.posSide === "long" || p.posSide === "short"
					? p.posSide
					: pos > 0
						? "long"
						: "short";
			out.push({
				exchange: "okx",
				symbol: p.instId,
				base: okxBase(p.instId),
				side,
				size: Math.abs(pos),
				lev,
				mode: p.mgnMode === "isolated" ? "isolated" : "cross",
				entry: Number.parseFloat(p.avgPx || "0"),
				mark,
				liq: Number.parseFloat(p.liqPx || "0"),
				margin,
				upnl,
				roe: p.uplRatio
					? Number.parseFloat(p.uplRatio) * 100
					: margin
						? (upnl / margin) * 100
						: 0,
				fundRate: rates[p.instId] ?? 0,
				fundPaid: paid[p.instId] ?? 0,
			});
		}
		return out;
	},

	async getBalance(c) {
		const data = await signedGet<any>(c, "/api/v5/account/balance");
		const a = data[0] ?? {};
		const usdt = (a.details ?? []).find((d: any) => d.ccy === "USDT");
		return {
			exchange: "okx",
			equity: Number.parseFloat(a.totalEq || "0"),
			available: Number.parseFloat(
				usdt?.availEq || usdt?.availBal || a.availEq || "0",
			),
			marginUsed: Number.parseFloat(a.imr || usdt?.imr || "0"),
		} satisfies NormBalance;
	},

	async getHistory(c) {
		const rows = await signedGet<any>(c, "/api/v5/account/positions-history", {
			instType: "SWAP",
			limit: "100",
		}).catch(() => []);
		return rows
			.filter((t: any) => Number.parseFloat(t.realizedPnl || "0") !== 0)
			.map((t: any) => ({
				exchange: "okx" as const,
				id: String(t.posId ?? `${t.instId}-${t.uTime}`),
				time: Number(t.uTime ?? t.cTime),
				symbol: t.instId,
				base: okxBase(t.instId),
				side: (t.direction === "long" ? "long" : "short") as "long" | "short",
				size: Math.abs(
					Number.parseFloat(t.closeTotalPos || t.openMaxPos || "0"),
				),
				entry: Number.parseFloat(t.openAvgPx || "0"),
				exit: Number.parseFloat(t.closeAvgPx || "0"),
				realized: Number.parseFloat(t.realizedPnl || "0"),
				fee: Number.parseFloat(t.fee || "0"),
				funding: Number.parseFloat(t.fundingFee || "0"),
			}));
	},

	// Private WS login — sign `${ts}GET/users/self/verify` (HMAC-SHA256 → base64).
	// secret stays server-side; browser receives {apiKey, passphrase, timestamp, sign}
	// and sends {op:"login"} then subscribes to positions / account / balance_and_position.
	async getWsAuth(c) {
		const ts = Math.floor(Date.now() / 1000).toString();
		const sign = hmacBase64(c.apiSecret, `${ts}GET/users/self/verify`);
		return {
			url: "wss://ws.okx.com:8443/ws/v5/private",
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
		await signedGet(c, "/api/v5/account/balance");
		return true;
	},
};
