import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const OG_TITLE = "Bityo Delta · 跨所合約對沖記帳儀表板";
const OG_DESC =
	"整合七大交易所的合約持倉、對沖監控與資金費率,一眼掌握跨所淨曝險。";

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: OG_TITLE,
		template: `%s · ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	keywords: [
		"合約對沖",
		"跨交易所",
		"資金費率",
		"永續合約",
		"持倉管理",
		"Delta 中性",
		"Binance",
		"Bybit",
		"OKX",
		"加密貨幣記帳",
	],
	authors: [{ name: SITE_NAME }],
	creator: SITE_NAME,
	alternates: { canonical: "/" },
	openGraph: {
		type: "website",
		locale: "zh_TW",
		url: SITE_URL,
		siteName: SITE_NAME,
		title: OG_TITLE,
		description: OG_DESC,
	},
	twitter: {
		card: "summary_large_image",
		title: OG_TITLE,
		description: OG_DESC,
	},
	robots: {
		index: true,
		follow: true,
		googleBot: { index: true, follow: true, "max-image-preview": "large" },
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0A0A0B" },
	],
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
