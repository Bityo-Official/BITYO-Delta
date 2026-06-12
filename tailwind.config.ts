import type { Config } from "tailwindcss";

// Tailwind config — semantic color tokens backed by CSS variables (RGB triplets in
// globals.css). Light/dark switch via the `.dark` class on <html>; accent switch via
// `.accent-*` classes. RGB triplets let every token take Tailwind opacity modifiers
// (e.g. `bg-up/10` for the soft tint).
const config: Config = {
	darkMode: "class",
	content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				app: "rgb(var(--bg) / <alpha-value>)", // page background
				sunken: "rgb(var(--sunken) / <alpha-value>)",
				card: "rgb(var(--card) / <alpha-value>)",
				card2: "rgb(var(--card2) / <alpha-value>)",
				ink: "rgb(var(--ink) / <alpha-value>)", // primary text
				sec: "rgb(var(--sec) / <alpha-value>)", // secondary text
				ter: "rgb(var(--ter) / <alpha-value>)", // tertiary text
				line: {
					DEFAULT: "rgb(var(--line) / <alpha-value>)", // hairline border
					soft: "rgb(var(--line-soft) / <alpha-value>)",
					strong: "rgb(var(--line-strong) / <alpha-value>)",
				},
				up: "rgb(var(--up) / <alpha-value>)", // gains / long
				down: "rgb(var(--down) / <alpha-value>)", // losses / short
				warn: "rgb(var(--warn) / <alpha-value>)",
				primary: "rgb(var(--primary) / <alpha-value>)", // accent
			},
			borderColor: {
				DEFAULT: "rgb(var(--line) / 1)", // bare `border` = hairline
			},
			fontFamily: {
				sans: [
					"Geist",
					"Noto Sans TC",
					"-apple-system",
					"system-ui",
					"sans-serif",
				],
				mono: [
					"Geist Mono",
					"IBM Plex Mono",
					"Noto Sans TC",
					"ui-monospace",
					"monospace",
				],
			},
			keyframes: {
				fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
				sheetUp: {
					from: { transform: "translateY(24px)", opacity: "0" },
					to: { transform: "translateY(0)", opacity: "1" },
				},
			},
			animation: {
				fadeIn: "fadeIn .18s ease",
				sheetUp: "sheetUp .24s cubic-bezier(.2,.8,.2,1)",
			},
		},
	},
	plugins: [],
};

export default config;
