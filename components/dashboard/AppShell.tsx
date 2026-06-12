"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
// AppShell.tsx — chrome shared by every dashboard route (URL-driven via App Router).
// Sidebar follows the Linear pattern: same surface as the page, hairline divider,
// quiet nav items. Provides useDashboard() context so route pages read PageProps.
import React from "react";
import { useData } from "@/components/DataProvider";
import { TabIcon, type TabIconName } from "@/components/primitives";
import { computeHedges, computeTotals, exposureByCoin } from "@/lib/derive";
import type { NormPosition } from "@/lib/exchanges/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/theme";
import { PositionDetailSheet } from "./PositionDetailSheet";
import type { PageProps } from "./pages";

// ── route table: each section is a real URL ──
const NAV: { href: string; label: string; icon: TabIconName }[] = [
	{ href: "/dashboard", label: "總覽", icon: "overview" },
	{ href: "/dashboard/hedge", label: "對沖監控", icon: "hedge" },
	{ href: "/dashboard/ledger", label: "記帳", icon: "ledger" },
	{ href: "/dashboard/assets", label: "資產", icon: "assets" },
	{ href: "/dashboard/settings", label: "設定", icon: "me" },
];

// ── dashboard context: computed PageProps for the current snapshot ──
const DashCtx = React.createContext<PageProps | null>(null);
export const useDashboard = (): PageProps => {
	const c = React.useContext(DashCtx);
	if (!c) throw new Error("useDashboard must be used inside <AppShell>");
	return c;
};

function useNarrow() {
	const [narrow, setNarrow] = React.useState(false);
	React.useEffect(() => {
		const mq = window.matchMedia("(max-width: 880px)");
		const on = () => setNarrow(mq.matches);
		on();
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	return narrow;
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { snapshot, user, dark, setDark } = useData();
	const [selected, setSelected] = React.useState<NormPosition | null>(null);
	const [drawer, setDrawer] = React.useState(false);
	const narrow = useNarrow();

	// close the mobile drawer on route change (pathname is the trigger)
	React.useEffect(() => {
		void pathname;
		setDrawer(false);
	}, [pathname]);

	// view-model (totals / hedges / exposure / account labels) computed once per snapshot
	const vm = React.useMemo(() => {
		const positions = snapshot?.positions ?? [];
		const balances = snapshot?.balances ?? [];
		const trades = snapshot?.trades ?? [];
		// exchange → user note (備註); multiple accounts on one venue join with ·
		const labels: Record<string, string> = {};
		for (const a of snapshot?.accounts ?? []) {
			if (a.label)
				labels[a.exchange] = labels[a.exchange]
					? `${labels[a.exchange]} · ${a.label}`
					: a.label;
		}
		return {
			positions,
			balances,
			trades,
			labels,
			totals: computeTotals(positions, balances, trades),
			...computeHedges(positions),
			exposure: exposureByCoin(positions),
		};
	}, [snapshot]);

	const pageProps: PageProps = {
		positions: vm.positions,
		balances: vm.balances,
		trades: vm.trades,
		totals: vm.totals,
		hedges: vm.pairs,
		hedgedBases: vm.hedgedBases,
		labels: vm.labels,
		exposure: vm.exposure,
		demo: snapshot?.demo ?? true,
		onOpen: setSelected,
		dark,
		onToggleTheme: () => setDark(!dark),
	};

	async function logout() {
		await createClient().auth.signOut();
		router.push("/");
		router.refresh();
	}

	const isActive = (href: string) =>
		href === "/dashboard"
			? pathname === "/dashboard"
			: pathname.startsWith(href);

	const sidebar = (
		<div className="flex h-full w-52 shrink-0 flex-col border-r border-line bg-app px-3 pb-3.5 pt-[18px]">
			{/* wordmark */}
			<Link
				href="/dashboard"
				className="flex items-center gap-2 px-2 pb-[18px] pt-0.5 no-underline"
			>
				{/* real site icon (app/icon.png — served by Next at /icon.png) */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src="/icon.png"
					alt="Bityo Delta"
					width={24}
					height={24}
					className="h-6 w-6 rounded-md object-contain"
				/>
				<div className="font-sans text-[13.5px] font-semibold tracking-tight text-ink">
					Bityo Delta
				</div>
			</Link>

			{/* nav */}
			<nav className="flex flex-col gap-px">
				{NAV.map((n) => {
					const active = isActive(n.href);
					return (
						<Link
							key={n.href}
							href={n.href}
							className={cn(
								"flex items-center gap-2.5 rounded-[7px] px-2 py-[7px] font-sans text-[13px] no-underline transition-colors",
								active
									? "bg-ink/5 font-semibold text-ink dark:bg-white/[.06]"
									: "font-medium text-sec hover:text-ink",
							)}
						>
							<TabIcon
								name={n.icon}
								size={16}
								className={active ? "text-ink" : "text-ter"}
							/>
							{n.label}
						</Link>
					);
				})}
			</nav>

			<div className="flex-1" />

			{/* session footer */}
			<div className="border-t border-line-soft px-1 pt-3">
				<div className="mb-2 break-all px-1 font-sans text-[10.5px] text-ter">
					{user ? user.email : "訪客 · 展示資料"}
				</div>
				{user ? (
					<button
						type="button"
						onClick={logout}
						className="w-full cursor-pointer rounded-[7px] border border-line bg-transparent py-[7px] font-sans text-xs font-medium text-sec transition-colors hover:text-ink"
					>
						登出
					</button>
				) : (
					<button
						type="button"
						onClick={() => router.push("/login")}
						className="w-full cursor-pointer rounded-[7px] border-0 bg-primary py-[7px] font-sans text-xs font-semibold text-white"
					>
						登入 / 註冊
					</button>
				)}
			</div>
		</div>
	);

	return (
		<div className="flex h-screen overflow-hidden bg-app font-sans">
			{!narrow && sidebar}

			{/* mobile drawer */}
			{narrow && drawer && (
				<div className="fixed inset-0 z-[200] flex">
					<button
						type="button"
						aria-label="close menu"
						onClick={() => setDrawer(false)}
						className="absolute inset-0 cursor-default border-0 bg-black/45"
					/>
					<div className="relative h-full animate-fadeIn bg-app">{sidebar}</div>
				</div>
			)}

			<div className="flex flex-1 flex-col overflow-auto">
				{/* narrow-only slim bar: hamburger + wordmark */}
				{narrow && (
					<div className="sticky top-0 z-[5] flex items-center gap-2.5 border-b border-line bg-white/90 px-3.5 py-2.5 backdrop-blur-md dark:bg-black/80">
						<button
							type="button"
							onClick={() => setDrawer(true)}
							aria-label="menu"
							className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-lg border border-line bg-transparent"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									d="M4 6h16M4 12h16M4 18h16"
									stroke="rgb(var(--sec))"
									strokeWidth="1.8"
									strokeLinecap="round"
								/>
							</svg>
						</button>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src="/icon.png"
							alt="Bityo Delta"
							width={22}
							height={22}
							className="h-[22px] w-[22px] rounded-md object-contain"
						/>
						<span className="font-sans text-[13px] font-semibold text-ink">
							Bityo Delta
						</span>
					</div>
				)}

				{/* demo-mode notice — quiet single line */}
				{snapshot?.demo && (
					<div className="flex items-center gap-2 border-b border-line bg-card2 px-[22px] py-2 font-sans text-xs text-sec">
						<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
						展示資料模式 —{" "}
						{user
							? "前往「設定」連接交易所 API Key 顯示真實持倉"
							: "登入並連接交易所 API Key 後顯示真實跨所持倉"}
					</div>
				)}

				<div
					className={cn(
						"mx-auto w-full max-w-[1440px] flex-1",
						narrow ? "px-3.5 pb-10 pt-4" : "px-[26px] pb-11 pt-[22px]",
					)}
				>
					{snapshot ? (
						<DashCtx.Provider value={pageProps}>{children}</DashCtx.Provider>
					) : (
						/* 資料尚未同步完成 — 顯示 spinner，避免閃出全 0 的版面 */
						<div className="flex h-[60vh] flex-col items-center justify-center gap-3">
							<div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-primary" />
							<span className="font-sans text-xs text-ter">
								正在同步交易所資料…
							</span>
						</div>
					)}
				</div>
			</div>

			{selected && (
				<PositionDetailSheet p={selected} onClose={() => setSelected(null)} />
			)}
		</div>
	);
}
