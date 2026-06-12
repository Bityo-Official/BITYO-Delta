"use client";
// parts.tsx — dashboard composition primitives (Tailwind).
// StatBar: hairline-divided stat cells (CMC-style). DPanel: flat section card.
// DTableRow: dense data row with mono numerals + hover state.
import type React from "react";
import { CoinDot, ExChip, SideTag } from "@/components/primitives";
import { liqDistance } from "@/lib/derive";
import { EXCHANGE_META, type NormPosition } from "@/lib/exchanges/types";
import { cn, fmtNum, fmtPct, fmtPrice, fmtSigned, fmtUSD } from "@/lib/theme";

export const SLICE_PALETTE = [
	"#F0B90B",
	"#F7A600",
	"#5E6AD2",
	"#2F62FF",
	"#0D9488",
	"#E5484D",
	"#7C6AEF",
];

// ── micro label: uppercase tracked — the signature of the data-terminal look ──
export function MicroLabel({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-sans text-[10.5px] font-medium uppercase tracking-[0.07em] text-ter",
				className,
			)}
		>
			{children}
		</span>
	);
}

export interface Stat {
	label: string;
	value: string;
	/** Tailwind text color class for the value (semantic up/down), e.g. 'text-up' */
	valueCls?: string;
	sub?: string;
	subCls?: string;
}

// ── StatBar — single bordered strip, cells separated by hairlines, wraps on narrow ──
export function StatBar({ stats }: { stats: Stat[] }) {
	return (
		<div className="mb-4 flex flex-wrap overflow-hidden rounded-xl border border-line bg-card">
			{stats.map((s, i) => (
				<div
					key={s.label}
					className={cn(
						"min-w-[140px] flex-[1_1_150px] px-[18px] py-3.5",
						i > 0 && "border-l border-line-soft",
					)}
				>
					<MicroLabel>{s.label}</MicroLabel>
					<div
						className={cn(
							"mt-[7px] whitespace-nowrap font-mono text-[19px] font-medium tracking-tight",
							s.valueCls ?? "text-ink",
						)}
					>
						{s.value}
					</div>
					{s.sub && (
						<div
							className={cn(
								"mt-1 font-mono text-[11.5px]",
								s.subCls ?? "text-ter",
							)}
						>
							{s.sub}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

// ── DPanel — flat section card; header row with title / hint / right slot ──
export function DPanel({
	title,
	hint,
	right,
	children,
	className = "",
}: {
	title?: string;
	hint?: string;
	right?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border border-line bg-card p-[18px]",
				className,
			)}
		>
			{(title || right) && (
				<div className="mb-3.5 flex flex-wrap items-center gap-2">
					<span className="font-sans text-[13.5px] font-semibold tracking-tight text-ink">
						{title}
					</span>
					{hint && (
						<span className="font-sans text-[11.5px] text-ter">{hint}</span>
					)}
					<div className="flex-1" />
					{right}
				</div>
			)}
			{children}
		</div>
	);
}

// ── DPageHead — page title row; `right` hosts the theme toggle inline ──
export function DPageHead({
	title,
	sub,
	right,
}: {
	title: string;
	sub: string;
	right?: React.ReactNode;
}) {
	return (
		<div className="mb-[18px] flex items-start gap-3">
			<div className="min-w-0 flex-1">
				<div className="font-sans text-[19px] font-bold tracking-tight text-ink">
					{title}
				</div>
				<div className="mt-[3px] font-sans text-xs text-sec">{sub}</div>
			</div>
			{right && <div className="shrink-0 pt-px">{right}</div>}
		</div>
	);
}

// shared table header / numeric cell classes
export const TH_CLS =
	"pb-2 px-2.5 whitespace-nowrap text-right font-sans text-[10.5px] font-medium uppercase tracking-[0.06em] text-ter";
export const TH_LEFT_CLS = TH_CLS.replace("text-right", "text-left");
export const TD_NUM_CLS =
	"px-2.5 whitespace-nowrap text-right font-mono text-[12.5px] text-ink";

// ── ExName — exchange logo + name + 備註 chip (the note saved with the API key).
// Reused everywhere an exchange is named so the user's label travels with it.
export function ExName({
	ex,
	label,
	chip = 16,
}: {
	ex: NormPosition["exchange"];
	label?: string;
	chip?: number;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<ExChip ex={ex} size={chip} radius={4} />
			<span className="font-sans text-[11.5px] font-medium text-sec">
				{EXCHANGE_META[ex].name}
			</span>
			{label && (
				<span className="rounded bg-sunken px-1 py-px font-sans text-[10px] font-medium text-ter dark:bg-card2">
					{label}
				</span>
			)}
		</span>
	);
}

// ── DTableRow — one open position (with 倉位價值 = mark × size) ──
export function DTableRow({
	p,
	label,
	onClick,
}: {
	p: NormPosition;
	label?: string;
	onClick: () => void;
}) {
	const d = liqDistance(p);
	const dCls = d < 8 ? "text-down" : d < 15 ? "text-warn" : "text-sec";
	const notional = p.mark * p.size;
	return (
		<tr
			onClick={onClick}
			onKeyDown={(ev) => ev.key === "Enter" && onClick()}
			className="cursor-pointer border-b border-line-soft transition-colors hover:bg-app dark:hover:bg-card2"
		>
			<td className="py-3 pl-1.5 pr-2.5">
				<div className="flex items-center gap-2.5">
					<CoinDot base={p.base} size={28} />
					<div>
						<div className="font-sans text-[13px] font-semibold text-ink">
							{p.base}
							<span className="text-[11px] font-normal text-ter"> USDT</span>
						</div>
						<div className="mt-[3px]">
							<ExName ex={p.exchange} label={label} />
						</div>
					</div>
				</div>
			</td>
			<td className="px-2.5">
				<SideTag side={p.side} small />
			</td>
			<td className={TD_NUM_CLS}>{p.lev}x</td>
			<td className={TD_NUM_CLS}>{fmtNum(p.size)}</td>
			<td className={cn(TD_NUM_CLS, "font-medium")}>{fmtUSD(notional, 0)}</td>
			<td className={TD_NUM_CLS}>{fmtPrice(p.entry)}</td>
			<td className={TD_NUM_CLS}>{fmtPrice(p.mark)}</td>
			<td className={cn(TD_NUM_CLS, "text-sec")}>
				{p.liq ? fmtPrice(p.liq) : "—"}
			</td>
			<td className={TD_NUM_CLS}>{fmtUSD(p.margin)}</td>
			<td
				className={cn(
					TD_NUM_CLS,
					"font-semibold",
					p.upnl >= 0 ? "text-up" : "text-down",
				)}
			>
				{fmtSigned(p.upnl)}
			</td>
			<td className={cn(TD_NUM_CLS, p.roe >= 0 ? "text-up" : "text-down")}>
				{fmtPct(p.roe)}
			</td>
			<td className={cn(TD_NUM_CLS, "font-medium", dCls)}>
				{d >= 999 ? "—" : `${d.toFixed(1)}%`}
			</td>
		</tr>
	);
}
