"use client";
// publicMarks.ts — BROWSER-side public mark-price WebSocket multiplexer.
// Each user's browser connects directly to the exchange public streams from their own
// IP (this is what lets the realtime layer scale to many concurrent users without a
// shared server IP hitting per-IP rate limits). No auth, no secret. Binance / Bybit /
// OKX have clean public WS; the other venues are covered by the structural REST poll.
import type { ExchangeKey, MarkTick } from "@/lib/exchanges/types";

type Listener = (tick: MarkTick) => void;

const URLS: Partial<Record<ExchangeKey, string>> = {
	binance: "wss://fstream.binance.com/ws",
	bybit: "wss://stream.bybit.com/v5/public/linear",
	okx: "wss://ws.okx.com:8443/ws/v5/public",
};

// OKX instId is already BTC-USDT-SWAP in our position.symbol; others are BTCUSDT.
function okxInst(symbol: string): string {
	return symbol.includes("-") ? symbol : symbol.replace(/USDT$/, "-USDT-SWAP");
}

class VenueStream {
	private ws: WebSocket | null = null;
	private symbols = new Set<string>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private closed = false;

	constructor(
		private exchange: ExchangeKey,
		private url: string,
		private emit: Listener,
	) {}

	setSymbols(next: Set<string>) {
		const added = [...next].filter((s) => !this.symbols.has(s));
		const removed = [...this.symbols].filter((s) => !next.has(s));
		this.symbols = next;
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.connect();
			return;
		}
		if (added.length) this.send("subscribe", added);
		if (removed.length) this.send("unsubscribe", removed);
	}

	private connect() {
		if (this.ws || this.closed) return;
		const ws = new WebSocket(this.url);
		this.ws = ws;
		ws.onopen = () => {
			if (this.symbols.size) this.send("subscribe", [...this.symbols]);
			this.startPing();
		};
		ws.onmessage = (ev) =>
			this.onMessage(typeof ev.data === "string" ? ev.data : "");
		ws.onclose = () => this.scheduleReconnect();
		ws.onerror = () => ws.close();
	}

	private scheduleReconnect() {
		this.ws = null;
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.reconnectTimer || this.closed) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.symbols.size) this.connect();
		}, 2500);
	}

	// Browser WebSocket has no ping() frame API: Binance auto-pongs the server's pings,
	// Bybit needs an app-level {op:"ping"}, OKX needs the literal string "ping".
	private startPing() {
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.exchange === "binance") return;
		this.pingTimer = setInterval(() => {
			if (this.ws?.readyState !== WebSocket.OPEN) return;
			if (this.exchange === "okx") this.ws.send("ping");
			else if (this.exchange === "bybit")
				this.ws.send(JSON.stringify({ op: "ping" }));
		}, 18_000);
	}

	private send(op: "subscribe" | "unsubscribe", symbols: string[]) {
		if (this.ws?.readyState !== WebSocket.OPEN) return;
		if (this.exchange === "binance") {
			this.ws.send(
				JSON.stringify({
					method: op.toUpperCase(),
					params: symbols.map((s) => `${s.toLowerCase()}@markPrice@1s`),
					id: Date.now(),
				}),
			);
		} else if (this.exchange === "bybit") {
			this.ws.send(
				JSON.stringify({ op, args: symbols.map((s) => `tickers.${s}`) }),
			);
		} else if (this.exchange === "okx") {
			this.ws.send(
				JSON.stringify({
					op,
					args: symbols.map((s) => ({
						channel: "mark-price",
						instId: okxInst(s),
					})),
				}),
			);
		}
	}

	private onMessage(raw: string) {
		if (!raw || raw === "pong") return;
		let msg: any;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		if (this.exchange === "binance") {
			if (msg.e === "markPriceUpdate" && msg.s) {
				this.emit({
					exchange: "binance",
					symbol: msg.s,
					mark: Number.parseFloat(msg.p),
					fundRate: msg.r !== undefined ? Number.parseFloat(msg.r) : undefined,
				});
			}
		} else if (this.exchange === "bybit") {
			if (
				typeof msg.topic === "string" &&
				msg.topic.startsWith("tickers.") &&
				msg.data?.markPrice
			) {
				this.emit({
					exchange: "bybit",
					symbol: msg.data.symbol,
					mark: Number.parseFloat(msg.data.markPrice),
					fundRate: msg.data.fundingRate
						? Number.parseFloat(msg.data.fundingRate)
						: undefined,
				});
			}
		} else if (this.exchange === "okx") {
			if (msg.arg?.channel === "mark-price" && Array.isArray(msg.data)) {
				for (const d of msg.data)
					this.emit({
						exchange: "okx",
						symbol: d.instId,
						mark: Number.parseFloat(d.markPx),
					});
			}
		}
	}

	close() {
		this.closed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.ws?.close();
		this.ws = null;
	}
}

export class PublicMarkManager {
	private venues = new Map<ExchangeKey, VenueStream>();
	constructor(private emit: Listener) {}

	// Reconcile desired subscriptions: { exchange -> set(symbols) }.
	update(desired: Map<ExchangeKey, Set<string>>) {
		for (const [ex, url] of Object.entries(URLS) as [ExchangeKey, string][]) {
			const symbols = desired.get(ex) ?? new Set<string>();
			let v = this.venues.get(ex);
			if (!v && symbols.size) {
				v = new VenueStream(ex, url, this.emit);
				this.venues.set(ex, v);
			}
			if (v) v.setSymbols(symbols);
		}
	}

	closeAll() {
		for (const v of this.venues.values()) v.close();
		this.venues.clear();
	}
}
