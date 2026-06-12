import type { Metadata } from "next";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

export const metadata: Metadata = {
	title: "Bityo Delta · 跨所合約記帳",
	description:
		"跨交易所合約對沖記帳儀表板 — 持倉、對沖監控、資金費率與資產分佈",
};

// Apply theme classes BEFORE hydration to avoid a flash of the wrong scheme.
// Reads the same localStorage keys the app writes (hb_dark / hb_primary).
const themeInit = `
try {
  var d = localStorage.getItem('hb_dark') === '1';
  var p = localStorage.getItem('hb_primary');
  var el = document.documentElement;
  if (d) el.classList.add('dark');
  if (p && p !== 'indigo') el.classList.add('accent-' + p);
} catch (e) {}
`;

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="zh-TW" suppressHydrationWarning>
			<head>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossOrigin="anonymous"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&display=swap"
					rel="stylesheet"
				/>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme bootstrap must run pre-hydration to avoid FOUC */}
				<script dangerouslySetInnerHTML={{ __html: themeInit }} />
			</head>
			<body>
				{/* top route-change progress bar (App Router compatible) */}
				<NextTopLoader
					color="#17FFAC"
					height={2}
					showSpinner={false}
					easing="ease"
					speed={500}
					shadow="0 0 8px #17FFAC,0 0 4px #17FFAC"
				/>
				{children}
			</body>
		</html>
	);
}
