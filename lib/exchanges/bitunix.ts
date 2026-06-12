// bitunix.ts — Bitunix Futures (fapi). Uses the documented double-SHA256 signing scheme.
// UNVERIFIED against a live key (meta.verified = false) — endpoint paths/field names may
// need adjustment once tested with a real Bitunix API key.
import { createHash, randomBytes } from "node:crypto";
import { httpJson, now, qs } from "./http";
import {
	baseOf,
	type Credentials,
	EXCHANGE_META,
	type ExchangeAdapter,
	type MarkTick,
	type NormBalance,
	type NormPosition,
	type NormTrade,
} from "./types";

const BASE = "https://fapi.bitunix.com";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Bitunix: digest = sha256(nonce+timestamp+apiKey+queryParams+body); sign = sha256(digest+secret)
async function signedGet<T = any>(
	c: Credentials,
	path: string,
	params: Record<string, string | number> = {},
): Promise<T> {
	const nonce = randomBytes(16).toString("hex");
	const ts = String(now());
	const sortedKeys = Object.keys(params).sort();
	const queryParams = sortedKeys.map((k) => `${k}${params[k]}`).join("");
	const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
	const digest = sha256(`${nonce + ts + c.apiKey + queryParams}`);
	const sign = sha256(digest + c.apiSecret);
	const url = queryString ? `${BASE}${path}?${queryString}` : `${BASE}${path}`;
	const res = await httpJson<{ code: number; msg: string; data: T }>(url, {
		exchange: "bitunix",
		headers: {
			"api-key": c.apiKey,
			sign,
			nonce,
			timestamp: ts,
			language: "en-US",
			"Content-Type": "application/json",
		},
	});
	if (res.code !== 0) throw new Error(`[bitunix] ${res.code}: ${res.msg}`);
	return res.data;
}

// PUBLIC funding rate per symbol — no auth. Bitunix returns the current rate as a
// fraction (e.g. 0.0001 = 0.01%). Fetched in parallel and reduced to a symbol→rate map.
async function fundingRates(
	symbols: string[],
): Promise<Record<string, number>> {
	const map: Record<string, number> = {};
	await Promise.all(
		symbols.map(async (symbol) => {
			try {
				const res = await httpJson<{ code: number; data: any }>(
					`${BASE}/api/v1/futures/market/funding_rate?${qs({ symbol })}`,
					{ exchange: "bitunix" },
				);
				const d = Array.isArray(res?.data) ? res.data[0] : res?.data;
				const r = Number.parseFloat(
					d?.fundingRate ?? d?.lastFundingRate ?? "NaN",
				);
				if (Number.isFinite(r)) map[symbol] = r;
			} catch {
				/* skip this symbol */
			}
		}),
	);
	return map;
}

export const bitunix: ExchangeAdapter = {
	meta: EXCHANGE_META.bitunix,

	async getPositions(c) {
		const data = await signedGet<any[]>(
			c,
			"/api/v1/futures/position/get_pending_positions",
		);
		const out: NormPosition[] = [];
		for (const p of data ?? []) {
			const size = Math.abs(Number.parseFloat(p.qty ?? p.amount ?? "0"));
			if (!size) continue;
			// NOTE: Bitunix `entryValue` is the NOTIONAL (price × qty), not the entry price.
			// The per-unit entry price is `avgOpenPrice`; if that field is absent, derive it
			// from notional ÷ qty so the entry is never the notional by mistake.
			let entry = Number.parseFloat(
				p.avgOpenPrice ?? p.avgPrice ?? p.entryPrice ?? p.openPrice ?? "0",
			);
			const entryValue = Number.parseFloat(p.entryValue ?? "0");
			if (!entry && entryValue && size) entry = entryValue / size;
			const lev = Number.parseFloat(p.leverage) || 1;
			const mark =
				Number.parseFloat(p.markPrice ?? p.marketPrice ?? p.lastPrice ?? "0") ||
				entry;
			const margin =
				Number.parseFloat(p.margin ?? p.im ?? String((size * mark) / lev)) ||
				(size * mark) / lev;
			const side = String(p.side).toUpperCase().startsWith("S")
				? "short"
				: "long";
			// Prefer the venue uPnL, but fall back to a computed value if absent/zero.
			const rawUpnl = Number.parseFloat(
				p.unrealizedPNL ?? p.unrealizedPnl ?? p.upnl ?? "NaN",
			);
			const upnl = Number.isFinite(rawUpnl)
				? rawUpnl
				: (side === "long" ? 1 : -1) * (mark - entry) * size;
			out.push({
				exchange: "bitunix",
				symbol: p.symbol,
				base: baseOf(p.symbol),
				side,
				size,
				lev,
				mode: String(p.marginMode).toUpperCase().startsWith("ISO")
					? "isolated"
					: "cross",
				entry,
				mark,
				liq: Number.parseFloat(p.liqPrice ?? p.liquidationPrice ?? "0"),
				margin,
				upnl,
				roe: margin ? (upnl / margin) * 100 : 0,
				fundRate: 0,
				// per docs: `funding` = total funding fee during the position (累計資金費)
				fundPaid: Number.parseFloat(p.funding ?? "0") || 0,
			});
		}
		// Populate current funding rates (public endpoint) for the open symbols.
		const rates = await fundingRates(out.map((p) => p.symbol)).catch(
			() => ({}) as Record<string, number>,
		);
		for (const p of out) p.fundRate = rates[p.symbol] ?? p.fundRate;
		return out;
	},

	async getBalance(c) {
		const d = await signedGet<any>(c, "/api/v1/futures/account", {
			marginCoin: "USDT",
		});
		const a = Array.isArray(d)
			? (d.find((x) => x.marginCoin === "USDT") ?? d[0])
			: (d ?? {});
		const num = (x: any) => {
			const n = Number.parseFloat(x);
			return Number.isFinite(n) ? n : 0;
		};
		const available = num(a.available ?? a.availableBalance);
		const frozen = num(a.frozen);
		const margin = num(a.margin ?? a.im);
		const bonus = num(a.bonus);
		const upnl =
			num(a.crossUnrealizedPNL) +
			num(a.isolationUnrealizedPNL) +
			num(a.unrealizedPNL);
		// Bitunix may not return a single `equity` field — derive it when absent.
		const equity = num(a.equity) || available + frozen + margin + bonus + upnl;
		return {
			exchange: "bitunix",
			equity,
			available,
			marginUsed: margin || frozen,
		} satisfies NormBalance;
	},

	// Closed-position history (平倉紀錄), per official docs:
	// GET /api/v1/futures/position/get_history_positions → data.positionList[]
	// fields: positionId, symbol, maxQty, entryPrice, closePrice, side(LONG/SHORT),
	//         leverage, fee, funding, realizedPNL, ctime, mtime
	async getHistory(c) {
		try {
			const startTime = now() - 90 * 86400_000;
			// Bitunix caps `limit` at 100 — paginate with `skip` until a short page.
			// Without this, only the first 100 rows come back and the most recent
			// closes get silently truncated (e.g. 06/11 missing while 06/05 shows).
			const rows: any[] = [];
			for (let skip = 0; skip < 1000; skip += 100) {
				const data = await signedGet<any>(
					c,
					"/api/v1/futures/position/get_history_positions",
					{ startTime, skip, limit: 100 },
				);
				const page: any[] =
					data?.positionList ?? (Array.isArray(data) ? data : []);
				rows.push(...page);
				if (page.length < 100) break;
			}
			const out: NormTrade[] = [];
			for (const t of rows) {
				const qty = Math.abs(Number.parseFloat(t.maxQty ?? t.qty ?? "0"));
				out.push({
					exchange: "bitunix",
					id: String(t.positionId ?? `${t.symbol}-${t.ctime ?? t.mtime}`),
					time: Number(t.mtime ?? t.ctime ?? now()),
					symbol: t.symbol,
					base: baseOf(t.symbol),
					side: String(t.side).toUpperCase().startsWith("S") ? "short" : "long",
					size: qty,
					entry: Number.parseFloat(t.entryPrice ?? "0"),
					exit: Number.parseFloat(t.closePrice ?? "0"),
					realized: Number.parseFloat(t.realizedPNL ?? "0"),
					// fee/funding are signed deltas on Bitunix — keep fee as a cost
					fee: -Math.abs(Number.parseFloat(t.fee ?? "0")),
					funding: Number.parseFloat(t.funding ?? "0"),
				});
			}
			return out.sort((a, b) => b.time - a.time);
		} catch {
			return [] as NormTrade[];
		}
	},

	// PUBLIC mark prices — no auth. Used by the live poller so Bitunix positions tick
	// in real time. Tries the documented tickers endpoint and reads several field aliases.
	async getMarkPrices(symbols: string[]): Promise<MarkTick[]> {
		if (!symbols.length) return [];
		const url = `${BASE}/api/v1/futures/market/tickers?${qs({ symbols: symbols.join(",") })}`;
		const res = await httpJson<{ code: number; msg: string; data: any[] }>(
			url,
			{ exchange: "bitunix" },
		);
		const rows = Array.isArray(res?.data) ? res.data : [];
		const out: MarkTick[] = [];
		for (const r of rows) {
			const mark = Number.parseFloat(
				r.markPrice ?? r.markPx ?? r.lastPrice ?? r.last ?? r.lastPr ?? "0",
			);
			if (!mark || !r.symbol) continue;
			const fr = r.fundingRate ?? r.fundRate;
			out.push({
				exchange: "bitunix",
				symbol: r.symbol,
				mark,
				fundRate: fr !== undefined ? Number.parseFloat(fr) : undefined,
			});
		}
		return out;
	},

	async ping(c) {
		await signedGet(c, "/api/v1/futures/account", { marginCoin: "USDT" });
		return true;
	},
};
