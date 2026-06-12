"use client";
// PositionDetailSheet.tsx — centered modal showing a single position's full detail.
import React from "react";
import {
	ExChip,
	LiqBar,
	MiniTag,
	Money,
	Pct,
	SideTag,
	Spark,
} from "@/components/primitives";
import { EXCHANGE_META, type NormPosition } from "@/lib/exchanges/types";
import { cn, fmtNum, fmtPrice, fmtUSD } from "@/lib/theme";

// deterministic decorative trail (seeded by symbol so it's stable across renders)
function makeTrail(seed: string, endUp: boolean): number[] {
	let s = 0;
	for (let i = 0; i < seed.length; i++)
		s = (s * 31 + seed.charCodeAt(i)) % 9973;
	const out: number[] = [];
	let v = 50;
	for (let i = 0; i < 24; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		out.push(
			v + ((s % 1000) / 1000 - 0.5) * 14 + (endUp ? 1 : -1) * (i / 24) * 18,
		);
		v += endUp ? 0.6 : -0.4;
	}
	return out;
}

function Row({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
	return (
		<div className="flex items-center justify-between border-b border-line-soft py-[11px]">
			<span className="font-sans text-[13px] text-sec">{k}</span>
			<span
				className={cn("font-mono text-[13px] font-medium", cls ?? "text-ink")}
			>
				{v}
			</span>
		</div>
	);
}

export function PositionDetailSheet({
	p,
	onClose,
}: {
	p: NormPosition;
	onClose: () => void;
}) {
	const e = EXCHANGE_META[p.exchange];
	const trail = makeTrail(p.exchange + p.symbol, p.upnl >= 0);
	const notional = p.mark * p.size;
	React.useEffect(() => {
		const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="close"
				onClick={onClose}
				className="absolute inset-0 animate-fadeIn cursor-default border-0 bg-black/50 backdrop-blur-[3px]"
			/>
			<div className="relative max-h-[90vh] w-[min(480px,100%)] animate-sheetUp overflow-auto rounded-[14px] border border-line bg-app p-5 shadow-2xl">
				<div className="mb-4 flex items-center gap-2.5">
					<span className="flex-1 font-sans text-lg font-bold tracking-tight text-ink">
						{p.base}USDT 永續
					</span>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[7px] border border-line bg-transparent text-[13px] text-sec hover:text-ink"
					>
						✕
					</button>
				</div>

				<div className="mb-4 flex flex-wrap items-center gap-2.5">
					<ExChip ex={p.exchange} size={26} radius={8} />
					<span className="flex-1 font-sans text-[13px] font-medium text-sec">
						{e.name}
					</span>
					<SideTag side={p.side} />
					<MiniTag>{p.lev}x</MiniTag>
					<MiniTag>{p.mode === "cross" ? "全倉" : "逐倉"}</MiniTag>
				</div>

				<div className="mb-3 rounded-[10px] border border-line bg-card p-4">
					<div className="font-sans text-xs text-ter">未實現損益 · USDT</div>
					<div className="mt-1.5 flex items-end justify-between gap-3">
						<div>
							<Money value={p.upnl} className="text-3xl font-bold" />
							<div className="mt-1">
								<Pct value={p.roe} className="text-sm" />
							</div>
						</div>
						<Spark
							data={trail}
							color={p.upnl >= 0 ? "rgb(var(--up))" : "rgb(var(--down))"}
							w={130}
							h={48}
							fill
							strokeW={2}
						/>
					</div>
				</div>

				<div className="mb-3 rounded-[10px] border border-line bg-card px-4 py-1">
					<Row k="部位數量" v={`${fmtNum(p.size)} ${p.base}`} />
					<Row k="名目價值" v={fmtUSD(notional)} />
					<Row k="進場均價" v={fmtPrice(p.entry)} />
					<Row k="標記價格" v={fmtPrice(p.mark)} />
					<Row k="強平價格" v={p.liq ? fmtPrice(p.liq) : "—"} cls="text-down" />
					<Row k="保證金" v={fmtUSD(p.margin)} />
					<Row
						k="資金費率"
						v={`${(p.fundRate * 100).toFixed(4)}%`}
						cls={p.fundRate >= 0 ? "text-up" : "text-down"}
					/>
					<div className="flex items-center justify-between py-[11px]">
						<span className="font-sans text-[13px] text-sec">累計資金費</span>
						<Money value={p.fundPaid} className="text-[13px]" />
					</div>
				</div>

				<div className="rounded-[10px] border border-line bg-card p-4">
					<LiqBar p={p} />
				</div>
			</div>
		</div>
	);
}
