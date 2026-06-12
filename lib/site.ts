// Canonical site origin, used for metadataBase / robots / sitemap / OG.
// Set NEXT_PUBLIC_SITE_URL to your real domain in production; otherwise we fall back to
// the Vercel deployment URL, then localhost for dev.
export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(process.env.VERCEL_URL
		? `https://${process.env.VERCEL_URL}`
		: "http://localhost:3000");

export const SITE_NAME = "Bityo Delta";
export const SITE_DESCRIPTION =
	"在一個儀表板整合 Binance、Bybit、OKX 等七大交易所的合約持倉、對沖監控、資金費率與資產分佈。API Key 全程 AES-256 加密,即時掌握跨所淨曝險。";
