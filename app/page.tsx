// app/page.tsx — public marketing landing (no auth, no live data). Always dark for a
// premium "front door" look, independent of the user's dashboard theme.
import Link from "next/link";
import { HeroBackground } from "@/components/landing/HeroBackground";
import { ExChip } from "@/components/primitives";
import { getCurrentUser } from "@/lib/auth";
import { EXCHANGE_META, type ExchangeKey } from "@/lib/exchanges/types";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Structured data — helps Google render a richer result for the brand/app.
const JSON_LD = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": `${SITE_URL}/#org`,
			name: SITE_NAME,
			url: SITE_URL,
			logo: `${SITE_URL}/icon.png`,
		},
		{
			"@type": "WebSite",
			"@id": `${SITE_URL}/#website`,
			url: SITE_URL,
			name: SITE_NAME,
			description: SITE_DESCRIPTION,
			publisher: { "@id": `${SITE_URL}/#org` },
			inLanguage: "zh-TW",
		},
		{
			"@type": "SoftwareApplication",
			name: SITE_NAME,
			applicationCategory: "FinanceApplication",
			operatingSystem: "Web",
			description: SITE_DESCRIPTION,
			url: SITE_URL,
			offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		},
	],
};

const FEATURES = [
	{
		title: "跨所對沖偵測",
		body: "同幣種多空自動配對成對沖籃，即時計算淨 Delta、基差與資金費套利，一眼看懂整體曝險。",
		accent: "#5E6AD2",
		icon: (
			<>
				<path d="M5 7h6l3 5 3-5h2M5 17h6l3-5" />
				<circle cx="4" cy="7" r="1.6" />
				<circle cx="4" cy="17" r="1.6" />
				<circle cx="20" cy="7" r="1.6" />
			</>
		),
	},
	{
		title: "毫秒級即時",
		body: "瀏覽器直連交易所 WebSocket，標記價與未實現損益秒級跳動；成交即時反映,不必手動刷新。",
		accent: "#2EBD85",
		icon: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
	},
	{
		title: "唯讀加密金鑰",
		body: "API Key 以 AES-256-GCM 加密儲存於伺服器，永不回傳前端；建議僅授予讀取權限,無下單與提領。",
		accent: "#F0B90B",
		icon: (
			<>
				<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
				<path d="M9 12l2 2 4-4" />
			</>
		),
	},
	{
		title: "七家交易所",
		body: "Binance、Bybit、OKX、BingX、Bitget、Bitunix、Pionex 永續合約持倉與資產，聚合於單一儀表板。",
		accent: "#7C6AEF",
		icon: (
			<>
				<rect x="3" y="3" width="8" height="8" rx="2" />
				<rect x="13" y="3" width="8" height="5" rx="2" />
				<rect x="13" y="10" width="8" height="11" rx="2" />
				<rect x="3" y="13" width="8" height="8" rx="2" />
			</>
		),
	},
];

export default async function Landing() {
	const user = await getCurrentUser();
	const exchanges = Object.keys(EXCHANGE_META) as ExchangeKey[];

	return (
		<main className="min-h-screen overflow-x-hidden bg-[#0A0A0B] font-sans text-white antialiased">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD is static, server-rendered structured data
				dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
			/>
			{/* nav */}
			<header className="fixed inset-x-0 top-0 z-50 border-b border-white/[.06] bg-[#0A0A0B]/70 backdrop-blur-xl">
				<div className="mx-auto flex h-16 max-w-6xl items-center px-6">
					<div className="flex items-center gap-2.5">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/icon.png"
							alt="Bityo Delta"
							width={26}
							height={26}
							className="h-[26px] w-[26px] rounded-lg"
						/>
						<span className="text-[15px] font-semibold tracking-tight">
							Bityo Delta
						</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						{user ? (
							<Link
								href="/dashboard"
								className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-black no-underline transition-opacity hover:opacity-90"
							>
								前往儀表板 →
							</Link>
						) : (
							<>
								<Link
									href="/login"
									className="rounded-lg px-4 py-2 text-[13px] font-medium text-white/70 no-underline transition-colors hover:text-white"
								>
									登入
								</Link>
								<Link
									href="/register"
									className="rounded-lg bg-white px-4 py-2 text-[13px] font-semibold text-black no-underline transition-opacity hover:opacity-90"
								>
									免費開始
								</Link>
							</>
						)}
					</div>
				</div>
			</header>

			{/* hero */}
			<section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
				<HeroBackground />
				{/* radial vignette to seat the 3D in the page */}
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#0A0A0B_78%)]" />
				<div className="relative z-10 mx-auto max-w-3xl text-center">
					{/* <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-3.5 py-1.5 text-[12.5px] text-white/70">
						<span className="h-1.5 w-1.5 rounded-full bg-[#2EBD85]" />
						跨所合約對沖記帳 · 即時
					</div> */}
					<h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
						永續期貨合約
						<br />
						<span className="bg-gradient-to-r from-[#9aa2f5] via-white to-[#5fe3c0] bg-clip-text text-transparent">
							跨所總覽之量化交易平台
						</span>
					</h1>
					<p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/55 sm:text-[17px]">
						即時聚合跨所永續合約持倉，自動配對多空對沖、計算淨 Delta
						與資金費套利。 唯讀加密金鑰，價格與損益秒級跳動。
					</p>
					<div className="mt-9 flex items-center justify-center gap-3">
						<Link
							href={user ? "/dashboard" : "/register"}
							className="rounded-xl bg-white px-6 py-3 text-[14px] font-semibold text-black no-underline transition-transform hover:scale-[1.03]"
						>
							{user ? "前往儀表板" : "免費開始使用"}
						</Link>
						<Link
							href={user ? "/dashboard" : "/login"}
							className="rounded-xl border border-white/15 px-6 py-3 text-[14px] font-semibold text-white no-underline transition-colors hover:bg-white/5"
						>
							{user ? "查看持倉" : "登入"}
						</Link>
					</div>
				</div>
				<div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/30">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M12 5v14M6 13l6 6 6-6"
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</section>

			{/* features */}
			<section className="relative mx-auto max-w-6xl px-6 py-24">
				<div className="mb-14 text-center">
					<div className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-white/40">
						為什麼用 Bityo Delta
					</div>
					<h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
						為跨所對沖記帳而生
					</h2>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{FEATURES.map((f) => (
						<div
							key={f.title}
							className="group rounded-2xl border border-white/[.07] bg-white/[.02] p-7 transition-colors hover:border-white/15 hover:bg-white/[.04]"
						>
							<div
								className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10"
								style={{ background: `${f.accent}1a` }}
							>
								<svg
									width="22"
									height="22"
									viewBox="0 0 24 24"
									fill="none"
									stroke={f.accent}
									strokeWidth="1.7"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									{f.icon}
								</svg>
							</div>
							<h3 className="mt-5 text-[17px] font-semibold">{f.title}</h3>
							<p className="mt-2.5 text-[14px] leading-relaxed text-white/50">
								{f.body}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* supported exchanges */}
			<section className="mx-auto max-w-6xl px-6 pb-24">
				<div className="rounded-2xl border border-white/[.07] bg-white/[.02] px-6 py-12 text-center">
					<div className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-white/40">
						支援交易所
					</div>
					<div className="mt-7 flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
						{exchanges.map((ex) => (
							<div
								key={ex}
								className="flex items-center gap-2.5 opacity-80 transition-opacity hover:opacity-100"
							>
								<ExChip ex={ex} size={26} radius={7} />
								<span className="text-[14px] font-medium text-white/80">
									{EXCHANGE_META[ex].name}
								</span>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* cta strip */}
			<section className="mx-auto max-w-6xl px-6 pb-28">
				<div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1c3a] to-[#0d0e1a] px-8 py-16 text-center">
					<div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#5E6AD2]/20 blur-3xl" />
					<h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
						準備好掌握跨所曝險及高級記帳了嗎？
					</h2>
					<p className="relative mx-auto mt-4 max-w-md text-[15px] text-white/55">
						連接你的唯讀 API Key，幾秒內看見所有交易所的持倉與對沖。
					</p>
					<div className="relative mt-8">
						<Link
							href={user ? "/dashboard" : "/register"}
							className="inline-block rounded-xl bg-white px-7 py-3.5 text-[14px] font-semibold text-black no-underline transition-transform hover:scale-[1.03]"
						>
							{user ? "前往儀表板 →" : "免費開始使用 →"}
						</Link>
					</div>
				</div>
			</section>

			{/* footer */}
			<footer className="border-t border-white/[.06]">
				<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-[13px] text-white/40 sm:flex-row">
					<div className="flex items-center gap-2">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/icon.png"
							alt=""
							width={20}
							height={20}
							className="h-5 w-5 rounded-md"
						/>
						<span>Bityo Delta · 跨所合約對沖記帳</span>
					</div>
					<span>僅供記帳與分析，非投資建議。</span>
				</div>
			</footer>
		</main>
	);
}
