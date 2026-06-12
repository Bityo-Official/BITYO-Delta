"use client";
// DataProvider.tsx — fetches the portfolio snapshot, opens the live WebSocket, merges
// mark-price ticks into positions, and exposes everything via the useData() hook.
import React, { useEffect } from "react";
import { applyTick } from "@/lib/derive";
import type {
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
	const wsRef = React.useRef<WebSocket | null>(null);

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

	// live WebSocket — reconnecting
	// biome-ignore lint/correctness/useExhaustiveDependencies: user?.id 變更時重建 WS 連線
	useEffect(() => {
		let closed = false;
		let retry: ReturnType<typeof setTimeout>;
		const connect = () => {
			if (closed) return;
			const proto = location.protocol === "https:" ? "wss" : "ws";
			const ws = new WebSocket(`${proto}://${location.host}/ws`);
			wsRef.current = ws;
			ws.onopen = () => setWsConnected(true);
			ws.onclose = () => {
				setWsConnected(false);
				if (!closed) retry = setTimeout(connect, 3000);
			};
			ws.onerror = () => ws.close();
			ws.onmessage = (ev) => {
				let msg: any;
				try {
					msg = JSON.parse(ev.data);
				} catch {
					return;
				}
				if (msg.type === "snapshot") setSnapshot(msg.snapshot);
				else if (msg.type === "tick")
					setSnapshot((prev) =>
						prev
							? { ...prev, positions: applyTick(prev.positions, msg.tick) }
							: prev,
					);
			};
		};
		connect();
		return () => {
			closed = true;
			clearTimeout(retry);
			wsRef.current?.close();
		};
	}, [user?.id]);

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

	const refresh = React.useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN)
			wsRef.current.send(JSON.stringify({ type: "refresh" }));
		fetch("/api/portfolio")
			.then((r) => r.json())
			.then(setSnapshot)
			.catch(() => {});
	}, []);

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
