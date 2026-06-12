// derive.ts — pure, client-safe aggregation over a portfolio snapshot.
import type {
	ExchangeKey,
	NormBalance,
	NormPosition,
	NormTrade,
} from "./exchanges/types";

export function liqDistance(p: NormPosition): number {
	if (!p.liq || !p.mark) return 999;
	return Math.abs((p.mark - p.liq) / p.mark) * 100;
}

export interface Totals {
	equity: number;
	available: number;
	marginUsed: number;
	upnl: number;
	notional: number;
	fundingToday: number;
	realizedRecent: number;
	netDelta: number;
}

export function computeTotals(
	positions: NormPosition[],
	balances: NormBalance[],
	trades: NormTrade[],
): Totals {
	const equity = balances.reduce((s, b) => s + b.equity, 0);
	const available = balances.reduce((s, b) => s + b.available, 0);
	const marginUsed =
		positions.reduce((s, p) => s + p.margin, 0) ||
		balances.reduce((s, b) => s + b.marginUsed, 0);
	const upnl = positions.reduce((s, p) => s + p.upnl, 0);
	const notional = positions.reduce((s, p) => s + p.mark * p.size, 0);
	const fundingToday = positions.reduce((s, p) => s + p.fundPaid, 0);
	const dayAgo = Date.now() - 86400_000;
	const realizedRecent = trades
		.filter((t) => t.time >= dayAgo)
		.reduce((s, t) => s + t.realized + t.fee + t.funding, 0);
	const netDelta = positions.reduce(
		(s, p) => s + (p.side === "long" ? 1 : -1) * p.mark * p.size,
		0,
	);
	return {
		equity,
		available,
		marginUsed,
		upnl,
		notional,
		fundingToday,
		realizedRecent,
		netDelta,
	};
}

export interface HedgePair {
	id: string;
	base: string;
	/** ALL long legs of this coin (any exchange) — rendered on the left */
	longs: NormPosition[];
	/** ALL short legs of this coin — rendered on the right */
	shorts: NormPosition[];
	longNotional: number;
	shortNotional: number;
	netUpnl: number;
	netFunding: number; // 累計資金費合計（含全部多空腿）
	netDelta: number; // longNotional − shortNotional
	basis: number; // size-weighted avg short entry vs avg long entry (%)
	neutral: boolean;
}

// Derive hedge baskets: per base coin, AGGREGATE every long leg vs every short leg
// (兩籃制 — all longs on one side, all shorts on the other). A coin forms a hedge
// when it has at least one long AND one short, regardless of venue count.
export function computeHedges(positions: NormPosition[]): {
	pairs: HedgePair[];
	hedgedBases: Set<string>;
} {
	const pairs: HedgePair[] = [];
	const hedgedBases = new Set<string>();
	const bases = Array.from(new Set(positions.map((p) => p.base)));
	for (const base of bases) {
		const longs = positions
			.filter((p) => p.base === base && p.side === "long")
			.sort((a, b) => b.mark * b.size - a.mark * a.size);
		const shorts = positions
			.filter((p) => p.base === base && p.side === "short")
			.sort((a, b) => b.mark * b.size - a.mark * a.size);
		if (!longs.length || !shorts.length) continue;

		const longNotional = longs.reduce((s, p) => s + p.mark * p.size, 0);
		const shortNotional = shorts.reduce((s, p) => s + p.mark * p.size, 0);
		const netDelta = longNotional - shortNotional;
		const all = [...longs, ...shorts];
		// size-weighted average entries → basis between the two baskets
		const longSize = longs.reduce((s, p) => s + p.size, 0);
		const shortSize = shorts.reduce((s, p) => s + p.size, 0);
		const avgLongEntry = longSize
			? longs.reduce((s, p) => s + p.entry * p.size, 0) / longSize
			: 0;
		const avgShortEntry = shortSize
			? shorts.reduce((s, p) => s + p.entry * p.size, 0) / shortSize
			: 0;

		pairs.push({
			id: base,
			base,
			longs,
			shorts,
			longNotional,
			shortNotional,
			netUpnl: all.reduce((s, p) => s + p.upnl, 0),
			netFunding: all.reduce((s, p) => s + p.fundPaid, 0),
			netDelta,
			basis: avgLongEntry
				? ((avgShortEntry - avgLongEntry) / avgLongEntry) * 100
				: 0,
			neutral:
				Math.abs(netDelta) < Math.max(longNotional, shortNotional) * 0.04,
		});
		hedgedBases.add(base);
	}
	pairs.sort(
		(a, b) =>
			Math.max(b.longNotional, b.shortNotional) -
			Math.max(a.longNotional, a.shortNotional),
	);
	return { pairs, hedgedBases };
}

// 單邊部位 = coins that have NO hedge basket at all (no opposing side anywhere)
export function isHedgedBase(
	p: NormPosition,
	hedgedBases: Set<string>,
): boolean {
	return hedgedBases.has(p.base);
}

export interface Exposure {
	base: string;
	net: number;
	gross: number;
}

export function exposureByCoin(positions: NormPosition[]): Exposure[] {
	const bases = Array.from(new Set(positions.map((p) => p.base)));
	return bases
		.map((base) => {
			const rows = positions.filter((p) => p.base === base);
			const net = rows.reduce(
				(s, p) => s + (p.side === "long" ? 1 : -1) * p.mark * p.size,
				0,
			);
			const gross = rows.reduce((s, p) => s + p.mark * p.size, 0);
			return { base, net, gross };
		})
		.sort((a, b) => b.gross - a.gross);
}

export interface EquitySlice {
	exchange: ExchangeKey;
	label: string;
	value: number;
	color: string;
}

// Apply a live mark tick to a position list, recomputing upnl/roe.
export function applyTick(
	positions: NormPosition[],
	tick: { exchange: string; symbol: string; mark: number; fundRate?: number },
): NormPosition[] {
	let changed = false;
	const next = positions.map((p) => {
		if (p.exchange !== tick.exchange || p.symbol !== tick.symbol || !tick.mark)
			return p;
		changed = true;
		const dir = p.side === "long" ? 1 : -1;
		const upnl = dir * (tick.mark - p.entry) * p.size;
		const roe = p.margin ? (upnl / p.margin) * 100 : p.roe;
		return {
			...p,
			mark: tick.mark,
			upnl,
			roe,
			fundRate: tick.fundRate ?? p.fundRate,
		};
	});
	return changed ? next : positions;
}
