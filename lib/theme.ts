// theme.ts — number formatting + accent presets.
// All visual styling now lives in Tailwind (see tailwind.config.ts + app/globals.css);
// dark mode = `.dark` class on <html>, accent = `.accent-*` class.

export type PrimaryKey = "indigo" | "teal" | "violet" | "amber";

// Accent presets (hex kept for swatch rendering only — actual theming is CSS vars).
export const PRIMARIES: Record<
	PrimaryKey,
	{ key: PrimaryKey; label: string; hex: string }
> = {
	indigo: { key: "indigo", label: "Indigo", hex: "#5E6AD2" },
	teal: { key: "teal", label: "Teal", hex: "#0D9488" },
	violet: { key: "violet", label: "Violet", hex: "#7C6AEF" },
	amber: { key: "amber", label: "Amber", hex: "#D97706" },
};

// ── number formatting ──
export function fmtUSD(n: number, dp = 2): string {
	const sign = n < 0 ? "-" : "";
	const v = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: dp,
		maximumFractionDigits: dp,
	});
	return `${sign}$${v}`;
}
export function fmtSigned(n: number, dp = 2): string {
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	const v = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: dp,
		maximumFractionDigits: dp,
	});
	return `${sign}$${v}`;
}
export function fmtPct(n: number, dp = 2): string {
	const sign = n > 0 ? "+" : "";
	return `${sign}${n.toFixed(dp)}%`;
}
export function fmtNum(n: number): string {
	return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
export function fmtPrice(n: number): string {
	const dp = n >= 1000 ? 1 : n >= 1 ? 3 : 4;
	return n.toLocaleString("en-US", {
		minimumFractionDigits: dp,
		maximumFractionDigits: dp,
	});
}

// tiny className joiner — keeps conditional Tailwind classes readable without a dep
export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(" ");
}
