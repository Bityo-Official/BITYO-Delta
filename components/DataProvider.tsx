"use client";
// DataProvider.tsx — owns the portfolio snapshot and the CLIENT-side realtime engine:
//   • initial + safety-poll fetch of /api/portfolio (authoritative structure)
//   • public mark-price WS straight from the browser → live price / uPnL ticks
//   • private account WS (signed by /api/ws-auth) → instant re-fetch on trades
// No custom server / no /ws — runs on plain Next (Vercel-compatible) and scales because
// every exchange connection is made from each user's own IP.
import React, { useEffect } from "react";
import { AccountSignalManager } from "@/components/realtime/accountSignal";
import { PublicMarkManager } from "@/components/realtime/publicMarks";
import { applyTick } from "@/lib/derive";
import type {
	ExchangeKey,
	NormBalance,
	NormPosition,
	NormTrade,
} from "@/lib/exchanges/types";
import type { PrimaryKey } from "@/lib/theme";

export interface AccountStatus {
	id: string;
	exchange: string;
	label: string | null;
	connected: boolean;
	error: string | null;
	verified: boolean;
}
export interface Snapshot {
	demo: boolean;
	generatedAt: number;
	positions: NormPosition[];
	balances: NormBalance[];
	trades: NormTrade[];
	accounts: AccountStatus[];
}
export interface SessionUser {
	id: string;
	email: string;
	name: string | null;
	dark: boolean;
	primary: string;
	settleCcy: string;
}

interface DataCtx {
	snapshot: Snapshot | null;
	loading: boolean;
	wsConnected: boolean;
	user: SessionUser | null;
	dark: boolean;
	primary: PrimaryKey;
	setDark: (v: boolean) => void;
	setPrimary: (v: PrimaryKey) => void;
	refresh: () => void;
	reloadUser: () => Promise<void>;
}

const Ctx = React.createContext<DataCtx | null>(null);
export const useData = () => {
	const c = React.useContext(Ctx);
	if (!c) throw new Error("useData must be used inside <DataProvider>");
	return c;
};

export function DataProvider({
	children,
	initialUser = null,
}: {
	children: React.ReactNode;
	/** SSR-provided session user — seeds state so there's no login-state flash on refresh */
	initialUser?: SessionUser | null;
}) {
	const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [wsConnected, setWsConnected] = React.useState(false);
	const [user, setUser] = React.useState<SessionUser | null>(initialUser);
	// seed theme from the server user too (corrected by localStorage on mount for
	// logged-out visitors); server + client first render use the same prop → no mismatch
	const [dark, setDarkState] = React.useState(!!initialUser?.dark);
	const [primary, setPrimaryState] = React.useState<PrimaryKey>(
		(initialUser?.primary as PrimaryKey) || "indigo",
	);
	const marksRef = React.useRef<PublicMarkManager | null>(null);
	const accountRef = React.useRef<AccountSignalManager | null>(null);
	const refreshRef = React.useRef<(fresh?: boolean) => void>(() => {});

	const reloadUser = React.useCallback(async () => {
		try {
			const r = await fetch("/api/me");
			const j = await r.json();
			if (j.user) {
				setUser(j.user);
				setDarkState(!!j.user.dark);
				setPrimaryState((j.user.primary as PrimaryKey) || "indigo");
			} else {
				setUser(null);
			}
		} catch {
			/* ignore */
		}
	}, []);

	// restore local theme prefs (user identity already came from SSR initialUser,
	// so no /api/me fetch is needed here on first load)
	useEffect(() => {
		const ld = localStorage.getItem("hb_dark");
		const lp = localStorage.getItem("hb_primary") as PrimaryKey | null;
		if (ld) setDarkState(ld === "1");
		if (lp) setPrimaryState(lp);
	}, []);

	// initial REST snapshot
	// biome-ignore lint/correctness/useExhaustiveDependencies: user?.id 是刻意的重新抓取觸發器
	useEffect(() => {
		fetch("/api/portfolio")
			.then((r) => r.json())
			.then((s: Snapshot) => setSnapshot(s))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [user?.id]);

	// authoritative re-fetch (kept in a ref so realtime managers always call the latest).
	// `fresh` bypasses the server-side per-user cache — used when an account event means
	// a just-executed trade must appear now; the safety poll uses the cache.
	const doFetch = React.useCallback((fresh = false) => {
		fetch(`/api/portfolio${fresh ? "?fresh=1" : ""}`)
			.then((r) => r.json())
			.then(setSnapshot)
			.catch(() => {});
	}, []);
	refreshRef.current = doFetch;
	// context-exposed refresh is user-initiated (e.g. after adding a key) → always fresh
	const refresh = React.useCallback(() => refreshRef.current(true), []);

	// debounce account-change signals — a burst of fills collapses into one fresh re-fetch
	const debouncedRefresh = React.useMemo(() => {
		let t: ReturnType<typeof setTimeout> | null = null;
		return () => {
			if (t) clearTimeout(t);
			t = setTimeout(() => refreshRef.current(true), 700);
		};
	}, []);

	// realtime engine — created once; lives for the provider's lifetime
	useEffect(() => {
		const marks = new PublicMarkManager((tick) =>
			setSnapshot((prev) =>
				prev ? { ...prev, positions: applyTick(prev.positions, tick) } : prev,
			),
		);
		const account = new AccountSignalManager(() => debouncedRefresh());
		marksRef.current = marks;
		accountRef.current = account;
		setWsConnected(true);
		// safety poll (cached): refreshes structure + venues without a public mark WS
		const poll = setInterval(() => refreshRef.current(false), 8000);
		return () => {
			clearInterval(poll);
			marks.closeAll();
			account.closeAll();
			marksRef.current = null;
			accountRef.current = null;
			setWsConnected(false);
		};
	}, [debouncedRefresh]);

	// stable signature of what to subscribe to (changes only when positions' symbols or
	// connected exchanges change — mark-price ticks don't churn it)
	const subSig = React.useMemo(() => {
		const markVenues = new Set<ExchangeKey>(["binance", "bybit", "okx"]);
		const marks = (snapshot?.positions ?? [])
			.filter((p) => markVenues.has(p.exchange))
			.map((p) => `${p.exchange}:${p.symbol}`);
		const accounts = (snapshot?.accounts ?? []).map((a) => a.exchange);
		return JSON.stringify({
			m: [...new Set(marks)].sort(),
			a: [...new Set(accounts)].sort(),
		});
	}, [snapshot]);

	// reconcile the realtime managers to the current subscription signature
	useEffect(() => {
		const { m, a } = JSON.parse(subSig) as { m: string[]; a: string[] };
		const markDesired = new Map<ExchangeKey, Set<string>>();
		for (const key of m) {
			const [ex, sym] = key.split(":") as [ExchangeKey, string];
			if (!markDesired.has(ex)) markDesired.set(ex, new Set());
			markDesired.get(ex)?.add(sym);
		}
		marksRef.current?.update(markDesired);
		accountRef.current?.update(new Set(a as ExchangeKey[]));
	}, [subSig]);

	// Sync theme classes on <html> — Tailwind's `dark:` variant + `.accent-*` presets
	// read these. The root layout's inline script sets the initial state pre-hydration.
	useEffect(() => {
		const el = document.documentElement;
		el.classList.toggle("dark", dark);
		for (const k of ["indigo", "teal", "violet", "amber"])
			el.classList.remove(`accent-${k}`);
		if (primary !== "indigo") el.classList.add(`accent-${primary}`);
	}, [dark, primary]);

	const setDark = React.useCallback(
		(v: boolean) => {
			setDarkState(v);
			localStorage.setItem("hb_dark", v ? "1" : "0");
			if (user)
				fetch("/api/me", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dark: v }),
				}).catch(() => {});
		},
		[user],
	);
	const setPrimary = React.useCallback(
		(v: PrimaryKey) => {
			setPrimaryState(v);
			localStorage.setItem("hb_primary", v);
			if (user)
				fetch("/api/me", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ primary: v }),
				}).catch(() => {});
		},
		[user],
	);

	return (
		<Ctx.Provider
			value={{
				snapshot,
				loading,
				wsConnected,
				user,
				dark,
				primary,
				setDark,
				setPrimary,
				refresh,
				reloadUser,
			}}
		>
			{children}
		</Ctx.Provider>
	);
}
