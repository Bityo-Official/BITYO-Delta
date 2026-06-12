"use client";
// primitives.tsx — shared UI atoms, styled with Tailwind semantic tokens.
// Only data-driven values (brand hex, chart geometry) remain as attributes/inline.
import React from "react";
import { liqDistance } from "@/lib/derive";
import {
	EXCHANGE_META as EXCHANGES,
	type ExchangeKey,
	type NormPosition as Position,
	type Side,
} from "@/lib/exchanges/types";
import { cn, fmtPct, fmtSigned, fmtUSD } from "@/lib/theme";

// ── Exchange logo chip ──
// Real brand logo via Google's favicon proxy; falls back to the two-letter monogram.
const EXCHANGE_DOMAIN: Record<ExchangeKey, string> = {
	binance: "binance.com",
	bybit: "bybit.com",
	okx: "okx.com",
	bingx: "bingx.com",
	bitget: "bitget.com",
	bitunix: "bitunix.com",
	pionex: "pionex.com",
};

export function ExChip({
	ex,
	size = 26,
	radius = 8,
}: {
	ex: ExchangeKey;
	size?: number;
	radius?: number;
}) {
	const e = EXCHANGES[ex];
	const [failed, setFailed] = React.useState(false);
	// size/radius are data-driven layout values → kept as width/height attributes + style
	const dim = {
		width: size,
		height: size,
		borderRadius: Math.min(radius, size / 3),
	};
	if (!failed) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={`https://www.google.com/s2/favicons?domain=${EXCHANGE_DOMAIN[ex]}&sz=64`}
				alt={e.name}
				width={size}
				height={size}
				loading="lazy"
				onError={() => setFailed(true)}
				className="block shrink-0 object-contain"
				style={dim}
			/>
		);
	}
	// fallback monogram — brand colors are data, not theme
	return (
		<div
			className="flex shrink-0 items-center justify-center font-sans font-bold"
			style={{ ...dim, background: e.bg, color: e.fg, fontSize: size * 0.38 }}
		>
			{e.mono}
		</div>
	);
}

// ── Coin icon ──
// Source chain: cryptocurrency-icons (npm CDN) → CoinCap assets → lettered bubble.
export function CoinDot({ base, size = 34 }: { base: string; size?: number }) {
	const sym = (base || "").toLowerCase();
	const sources = React.useMemo(
		() => [
			`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${sym}.png`,
			`https://assets.coincap.io/assets/icons/${sym}@2x.png`,
		],
		[sym],
	);
	const [idx, setIdx] = React.useState(0);
	const dim = { width: size, height: size };
	if (!sym || idx >= sources.length) {
		return (
			<div
				className="flex shrink-0 items-center justify-center rounded-full bg-sunken font-sans font-semibold text-sec dark:bg-card2"
				style={{ ...dim, fontSize: Math.max(9, size * 0.28) }}
			>
				{base?.slice(0, 4)}
			</div>
		);
	}
	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={sources[idx]}
			alt={base}
			width={size}
			height={size}
			loading="lazy"
			onError={() => setIdx((i) => i + 1)}
			className="block shrink-0 rounded-full object-contain"
			style={dim}
		/>
	);
}

// ── colored P&L number (tabular mono) ──
export function Money({
	value,
	signed = true,
	dp = 2,
	className = "",
}: {
	value: number;
	signed?: boolean;
	dp?: number;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"whitespace-nowrap font-mono",
				value > 0 ? "text-up" : value < 0 ? "text-down" : "text-sec",
				className,
			)}
		>
			{signed ? fmtSigned(value, dp) : fmtUSD(value, dp)}
		</span>
	);
}

export function Pct({
	value,
	className = "",
}: {
	value: number;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"whitespace-nowrap font-mono",
				value > 0 ? "text-up" : value < 0 ? "text-down" : "text-sec",
				className,
			)}
		>
			{fmtPct(value)}
		</span>
	);
}

// ── long/short tag — quiet tinted pill with a dot ──
export function SideTag({
	side,
	small = false,
}: {
	side: Side;
	small?: boolean;
}) {
	const up = side === "long";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap rounded font-sans font-semibold",
				small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-[3px] text-xs",
				up ? "bg-up/10 text-up" : "bg-down/10 text-down",
			)}
		>
			<span
				className={cn(
					"h-[5px] w-[5px] shrink-0 rounded-full",
					up ? "bg-up" : "bg-down",
				)}
			/>
			{up ? "做多" : "做空"}
		</span>
	);
}

// ── micro chip (leverage / margin mode) — hairline outline ──
export function MiniTag({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: "neutral" | "primary" | "warn";
}) {
	return (
		<span
			className={cn(
				"whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10.5px] font-medium tracking-wide",
				tone === "neutral" && "border-line text-sec",
				tone === "primary" && "border-primary/35 text-primary",
				tone === "warn" && "border-warn/35 text-warn",
			)}
		>
			{children}
		</span>
	);
}

// ── sparkline (SVG geometry is data-driven) ──
export function Spark({
	data,
	color,
	w = 60,
	h = 22,
	strokeW = 1.5,
	fill = false,
}: {
	data: number[];
	color: string;
	w?: number;
	h?: number;
	strokeW?: number;
	fill?: boolean;
}) {
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const pts = data.map((v, i) => {
		const x = (i / (data.length - 1)) * w;
		const y = h - ((v - min) / range) * (h - 2) - 1;
		return [x, y] as const;
	});
	const d = pts
		.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
		.join(" ");
	const area = `${d} L${w} ${h} L0 ${h} Z`;
	const gid = React.useId().replace(/:/g, "");
	return (
		<svg
			width={w}
			height={h}
			className="block overflow-visible"
			aria-hidden="true"
		>
			{fill && (
				<>
					<defs>
						<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor={color} stopOpacity="0.18" />
							<stop offset="1" stopColor={color} stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={area} fill={`url(#${gid})`} />
				</>
			)}
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={strokeW}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

// ── liquidation proximity bar ──
export function LiqBar({ p }: { p: Position }) {
	const dist = liqDistance(p);
	const danger = dist < 8;
	const caution = dist < 15;
	const pct = Math.max(6, Math.min(100, 100 - dist * 2.6));
	const colorCls = danger ? "bg-down" : caution ? "bg-warn" : "bg-up";
	const textCls = danger ? "text-down" : caution ? "text-warn" : "text-up";
	return (
		<div>
			<div className="mb-1.5 flex justify-between">
				<span className="font-sans text-[11px] text-ter">距爆倉</span>
				<span className={cn("font-mono text-[11px] font-medium", textCls)}>
					{dist >= 999 ? "—" : `${dist.toFixed(1)}%`}
				</span>
			</div>
			<div className="h-[3px] overflow-hidden rounded-sm bg-sunken dark:bg-card2">
				{/* width is computed from live data */}
				<div
					className={cn(
						"h-full rounded-sm transition-[width] duration-300",
						colorCls,
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

// ── donut chart (slice colors are data) ──
export interface DonutSlice {
	label?: string;
	value: number;
	color: string;
	ex?: ExchangeKey;
}
export function Donut({
	slices,
	size = 132,
	thickness = 12,
}: {
	slices: DonutSlice[];
	size?: number;
	thickness?: number;
}) {
	const total = slices.reduce((s, x) => s + x.value, 0);
	const r = (size - thickness) / 2;
	const cx = size / 2;
	const cy = size / 2;
	const C = 2 * Math.PI * r;
	let acc = 0;
	return (
		<svg width={size} height={size} className="-rotate-90" aria-hidden="true">
			<circle
				cx={cx}
				cy={cy}
				r={r}
				fill="none"
				stroke="rgb(var(--line-soft))"
				strokeWidth={thickness}
			/>
			{slices.map((s) => {
				const frac = s.value / total;
				const len = frac * C;
				const el = (
					<circle
						key={s.label ?? `${s.color}-${s.value}`}
						cx={cx}
						cy={cy}
						r={r}
						fill="none"
						stroke={s.color}
						strokeWidth={thickness}
						strokeDasharray={`${Math.max(0, len - 1.5)} ${C - len + 1.5}`}
						strokeDashoffset={-acc}
						strokeLinecap="butt"
					/>
				);
				acc += len;
				return el;
			})}
		</svg>
	);
}

// ── segmented control — hairline track, raised active segment ──
export interface SegOption<V> {
	value: V;
	label: string;
}
export function Segmented<V extends string>({
	options,
	value,
	onChange,
}: {
	options: SegOption<V>[];
	value: V;
	onChange: (v: V) => void;
}) {
	return (
		<div className="flex gap-0.5 rounded-lg border border-line-soft bg-sunken p-0.5 dark:bg-card2">
			{options.map((o) => {
				const active = o.value === value;
				return (
					<button
						key={o.value}
						type="button"
						onClick={() => onChange(o.value)}
						className={cn(
							"flex-1 cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-[5px] font-sans text-xs transition-all",
							active
								? "border-line bg-card font-semibold text-ink"
								: "border-transparent font-medium text-sec hover:text-ink",
						)}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

// ── nav icons — 1.6px line glyphs ──
export type TabIconName = "overview" | "hedge" | "ledger" | "assets" | "me";
export function TabIcon({
	name,
	className = "",
	size = 17,
}: {
	name: TabIconName;
	className?: string;
	size?: number;
}) {
	const common = {
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.6,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
	};
	const paths: Record<TabIconName, React.ReactNode> = {
		overview: (
			<>
				<rect x="3" y="3" width="8" height="8" rx="2" {...common} />
				<rect x="13" y="3" width="8" height="5" rx="2" {...common} />
				<rect x="13" y="10" width="8" height="11" rx="2" {...common} />
				<rect x="3" y="13" width="8" height="8" rx="2" {...common} />
			</>
		),
		hedge: (
			<>
				<path d="M5 7h6l3 5 3-5h2" {...common} />
				<path d="M5 17h6l3-5" {...common} />
				<circle cx="4" cy="7" r="1.6" {...common} />
				<circle cx="4" cy="17" r="1.6" {...common} />
				<circle cx="20" cy="7" r="1.6" {...common} />
			</>
		),
		ledger: (
			<>
				<path
					d="M5 4h11l3 3v13a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"
					{...common}
				/>
				<path d="M8 10h8M8 14h8M8 18h5" {...common} />
			</>
		),
		assets: (
			<>
				<path d="M12 3a9 9 0 109 9h-9V3z" {...common} />
				<path d="M12 3v9h9" {...common} />
			</>
		),
		me: (
			<>
				<circle cx="12" cy="8" r="3.6" {...common} />
				<path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" {...common} />
			</>
		),
	};
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			className={className}
			aria-hidden="true"
		>
			{paths[name]}
		</svg>
	);
}

// ── theme toggle — ghost square, sun/moon ──
export function ThemeToggle({
	dark,
	onToggle,
}: {
	dark: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			title={dark ? "切換淺色" : "切換深色"}
			className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-transparent text-sec transition-colors hover:text-ink"
		>
			{dark ? (
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<circle
						cx="12"
						cy="12"
						r="4"
						stroke="currentColor"
						strokeWidth="1.6"
					/>
					<g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
						<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
					</g>
				</svg>
			) : (
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M20 14.5A8 8 0 019.5 4a0.5 0.5 0 00-.7-.6 9 9 0 1011.8 11.8 0.5 0.5 0 00-.6-.7z"
						fill="currentColor"
					/>
				</svg>
			)}
		</button>
	);
}
