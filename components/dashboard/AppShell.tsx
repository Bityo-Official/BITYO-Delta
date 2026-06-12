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

// Tooltip shown to the right of a collapsed-sidebar item on hover (Supabase/Claude style).
// Theme-inverted (bg-ink/text-app) so it reads in both light and dark.
function SideTip({ label }: { label: string }) {
	return (
		<span className="pointer-events-none absolute left-full top-1/2 z-[60] ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 font-sans text-[11px] font-medium text-app opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
			{label}
		</span>
	);
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { snapshot, user, dark, setDark } = useData();
	const [selected, setSelected] = React.useState<NormPosition | null>(null);
	const [drawer, setDrawer] = React.useState(false);
	// `drawerClosing` keeps the drawer mounted while its slide-out animation plays
	const [drawerClosing, setDrawerClosing] = React.useState(false);
	const narrow = useNarrow();

	const closeDrawer = React.useCallback(() => {
		setDrawerClosing(true);
		window.setTimeout(() => {
			setDrawer(false);
			setDrawerClosing(false);
		}, 200); // matches slideOutLeft duration
	}, []);

	// desktop collapse-to-icons (persisted). Mobile uses the drawer and ignores this.
	const [collapsed, setCollapsed] = React.useState(false);
	React.useEffect(() => {
		setCollapsed(localStorage.getItem("hb_sidebar_collapsed") === "1");
	}, []);
	const toggleCollapsed = () =>
		setCollapsed((v) => {
			const nv = !v;
			localStorage.setItem("hb_sidebar_collapsed", nv ? "1" : "0");
			return nv;
		});

	// animate the mobile drawer shut on route change (pathname is the trigger)
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the intended trigger
	React.useEffect(() => {
		closeDrawer();
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

	const renderSidebar = (col: boolean, isDrawer: boolean) => (
		<div
			className={cn(
				"flex h-full shrink-0 flex-col border-r border-line bg-app pb-3.5 pt-[18px] transition-[width] duration-200 ease-in-out",
				col ? "w-[60px] px-2" : "w-52 px-3",
			)}
		>
			{/* wordmark */}
			<Link
				href="/dashboard"
				className={cn(
					"flex items-center gap-2 pb-[18px] pt-0.5 no-underline",
					col ? "justify-center px-0" : "px-2",
				)}
			>
				{/* real site icon (app/icon.png — served by Next at /icon.png) */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src="/icon.png"
					alt="Bityo Delta"
					width={24}
					height={24}
					className="h-6 w-6 shrink-0 rounded-md object-contain"
				/>
				{!col && (
					<div className="animate-fadeIn whitespace-nowrap font-sans text-[13.5px] font-semibold tracking-tight text-ink">
						Bityo Delta
					</div>
				)}
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
								"group relative flex items-center rounded-[7px] py-[7px] font-sans text-[13px] no-underline transition-colors",
								col ? "justify-center px-0" : "gap-2.5 px-2",
								active
									? "bg-ink/5 font-semibold text-ink dark:bg-white/[.06]"
									: "font-medium text-sec hover:text-ink",
							)}
						>
							<TabIcon
								name={n.icon}
								size={16}
								className={cn("shrink-0", active ? "text-ink" : "text-ter")}
							/>
							{!col && <span className="animate-fadeIn">{n.label}</span>}
							{col && <SideTip label={n.label} />}
						</Link>
					);
				})}
			</nav>

			<div className="flex-1" />

			{/* collapse toggle — desktop only (the mobile drawer is always expanded) */}
			{!isDrawer && (
				<button
					type="button"
					onClick={toggleCollapsed}
					aria-label={col ? "展開側邊欄" : "收合側邊欄"}
					className={cn(
						"group relative mb-2 flex items-center rounded-[7px] py-[7px] font-sans text-xs font-medium text-ter transition-colors hover:text-ink",
						col ? "justify-center px-0" : "gap-2.5 px-2",
					)}
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
						className={cn(
							"shrink-0 transition-transform duration-200",
							col && "rotate-180",
						)}
					>
						<path
							d="M15 6l-6 6 6 6"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					{!col && <span className="animate-fadeIn">收合側邊欄</span>}
					{col && <SideTip label="展開" />}
				</button>
			)}

			{/* session footer */}
			<div
				className={cn("border-t border-line-soft pt-3", col ? "px-0" : "px-1")}
			>
				{!col && (
					<div className="mb-2 animate-fadeIn break-all px-1 font-sans text-[10.5px] text-ter">
						{user ? user.email : "訪客 · 展示資料"}
					</div>
				)}
				{user ? (
					<button
						type="button"
						onClick={logout}
						className="group relative flex w-full cursor-pointer items-center justify-center gap-2 rounded-[7px] border border-line bg-transparent py-[7px] font-sans text-xs font-medium text-sec transition-colors hover:text-ink"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							className="shrink-0"
						>
							<path
								d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						{!col && <span className="animate-fadeIn">登出</span>}
						{col && <SideTip label="登出" />}
					</button>
				) : (
					<button
						type="button"
						onClick={() => router.push("/login")}
						className="group relative flex w-full cursor-pointer items-center justify-center gap-2 rounded-[7px] border-0 bg-primary py-[7px] font-sans text-xs font-semibold text-white"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							className="shrink-0"
						>
							<path
								d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						{!col && <span className="animate-fadeIn">登入 / 註冊</span>}
						{col && <SideTip label="登入 / 註冊" />}
					</button>
				)}
			</div>
		</div>
	);

	return (
		<div className="flex h-screen overflow-hidden bg-app font-sans">
			{!narrow && renderSidebar(collapsed, false)}

			{/* mobile drawer — always full-width (collapse is a desktop-only affordance) */}
			{narrow && drawer && (
				<div className="fixed inset-0 z-[200] flex">
					<button
						type="button"
						aria-label="close menu"
						onClick={closeDrawer}
						className={cn(
							"absolute inset-0 cursor-default border-0 bg-black/45",
							drawerClosing ? "animate-fadeOut" : "animate-fadeIn",
						)}
					/>
					<div
						className={cn(
							"relative h-full bg-app",
							drawerClosing ? "animate-slideOutLeft" : "animate-slideInLeft",
						)}
					>
						{renderSidebar(false, true)}
					</div>
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
