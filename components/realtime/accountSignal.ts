"use client";
// accountSignal.ts — BROWSER-side PRIVATE account WebSocket, used as a CHANGE SIGNAL.
// For each connected exchange the browser opens the venue's private stream directly
// (auth credential signed by /api/ws-auth — the secret never reaches the browser).
// We do NOT parse each venue's bespoke account-event format; instead, ANY account
// message triggers a debounced re-fetch of /api/portfolio (the authoritative source).
// This makes trade open/close reflect in <1s, robustly, for every exchange — and
// scales, because each user's stream runs from their own IP.
import type { ExchangeKey } from "@/lib/exchanges/types";

interface AuthEntry {
	accountId: string;
	url?: string;
	auth?: Record<string, unknown> | null;
	listenKey?: string;
	ttlSec?: number;
	error?: string;
}

// Per-exchange handshake: what to send after connect, how to keep alive, and which
// inbound messages count as a real account change (vs ack/heartbeat noise).
const SUBSCRIBE: Partial<Record<ExchangeKey, Record<string, unknown>>> = {
	bybit: {
		op: "subscribe",
		args: ["position", "wallet", "execution", "order"],
	},
	okx: {
		op: "subscribe",
		args: [
			{ channel: "positions", instType: "SWAP" },
			{ channel: "account" },
			{ channel: "balance_and_position" },
		],
	},
	bitget: {
		op: "subscribe",
		args: [
			{ instType: "USDT-FUTURES", channel: "positions", coin: "default" },
			{ instType: "USDT-FUTURES", channel: "account", coin: "default" },
		],
	},
};
const PING: Partial<Record<ExchangeKey, string>> = {
	okx: "ping",
	bybit: JSON.stringify({ op: "ping" }),
	bitget: "ping",
};

function isAccountEvent(ex: ExchangeKey, msg: any): boolean {
	if (ex === "binance")
		return msg?.e === "ACCOUNT_UPDATE" || msg?.e === "ORDER_TRADE_UPDATE";
	if (ex === "bybit")
		return (
			typeof msg?.topic === "string" &&
			/^(position|wallet|execution|order)/.test(msg.topic)
		);
	if (ex === "okx")
		return (
			Array.isArray(msg?.data) &&
			["positions", "account", "balance_and_position"].includes(
				msg?.arg?.channel,
			)
		);
	if (ex === "bitget")
		return msg?.action === "snapshot" || msg?.action === "update";
	// unverified venues (bingx/bitunix/pionex): any non-ack frame is treated as a change
	return (
		msg &&
		msg.op !== "pong" &&
		msg.event !== "subscribe" &&
		msg.event !== "login"
	);
}
function isListenKeyExpired(ex: ExchangeKey, msg: any): boolean {
	return ex === "binance" && msg?.e === "listenKeyExpired";
}

class AccountStream {
	private ws: WebSocket | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private renewTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private closed = false;

	constructor(
		private exchange: ExchangeKey,
		private onSignal: () => void,
	) {}

	start() {
		void this.connect();
	}

	private async connect() {
		if (this.closed || this.ws) return;
		let entries: AuthEntry[];
		try {
			const r = await fetch(`/api/ws-auth/${this.exchange}`);
			if (!r.ok) return; // not logged in / no account on this exchange — silently skip
			entries = (await r.json()).auths ?? [];
		} catch {
			this.scheduleReconnect();
			return;
		}
		const a = entries.find((e) => e.url && !e.error);
		if (!a?.url) {
			// no usable credential (e.g. unverified venue url) — poll fallback covers it
			this.scheduleReconnect(60_000);
			return;
		}
		const ws = new WebSocket(a.url);
		this.ws = ws;
		ws.onopen = () => {
			if (a.auth) ws.send(JSON.stringify(a.auth));
			const sub = SUBSCRIBE[this.exchange];
			if (sub)
				setTimeout(
					() =>
						ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(sub)),
					300,
				);
			this.startPing();
			// listenKey-style creds (large ttl) need a periodic reconnect to stay valid
			if ((a.ttlSec ?? 0) >= 120) {
				this.renewTimer = setTimeout(
					() => this.reconnect(),
					(a.ttlSec ?? 3000) * 800,
				);
			}
		};
		ws.onmessage = (ev) => this.onMessage(ev.data);
		ws.onclose = () => this.scheduleReconnect();
		ws.onerror = () => ws.close();
	}

	private onMessage(data: unknown) {
		// binary frame (e.g. BingX gzip) — can't parse, but its arrival is itself a signal
		if (typeof data !== "string") {
			this.onSignal();
			return;
		}
		if (data === "pong" || data === "ping") return;
		let msg: any;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}
		if (isListenKeyExpired(this.exchange, msg)) {
			this.reconnect();
			return;
		}
		if (isAccountEvent(this.exchange, msg)) this.onSignal();
	}

	private startPing() {
		if (this.pingTimer) clearInterval(this.pingTimer);
		const p = PING[this.exchange];
		if (!p) return;
		this.pingTimer = setInterval(() => {
			if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(p);
		}, 18_000);
	}

	private clearTimers() {
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.renewTimer) clearTimeout(this.renewTimer);
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.pingTimer = this.renewTimer = this.reconnectTimer = null;
	}

	private reconnect() {
		this.clearTimers();
		try {
			this.ws?.close();
		} catch {
			/* ignore */
		}
		this.ws = null;
		if (!this.closed) void this.connect();
	}

	private scheduleReconnect(delay = 3000) {
		this.clearTimers();
		this.ws = null;
		if (this.closed) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, delay);
	}

	close() {
		this.closed = true;
		this.clearTimers();
		try {
			this.ws?.close();
		} catch {
			/* ignore */
		}
		this.ws = null;
	}
}

export class AccountSignalManager {
	private streams = new Map<ExchangeKey, AccountStream>();
	constructor(private onSignal: () => void) {}

	// Reconcile the set of exchanges to keep a private stream open for.
	update(exchanges: Set<ExchangeKey>) {
		for (const ex of exchanges) {
			if (!this.streams.has(ex)) {
				const s = new AccountStream(ex, this.onSignal);
				this.streams.set(ex, s);
				s.start();
			}
		}
		for (const [ex, s] of this.streams) {
			if (!exchanges.has(ex)) {
				s.close();
				this.streams.delete(ex);
			}
		}
	}

	closeAll() {
		for (const s of this.streams.values()) s.close();
		this.streams.clear();
	}
}
