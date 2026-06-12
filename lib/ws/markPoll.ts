import { getAdapter } from "../exchanges";
// markPoll.ts — for exchanges NOT on a public WebSocket stream (BingX / Bitget /
// Bitunix / Pionex), poll their PUBLIC mark-price REST endpoint and emit normalized
// ticks. Rate-limit aware: per-exchange minimum spacing + exponential cooldown after
// failures (e.g. Pionex 429 Too Many Requests).
import type { ExchangeKey, MarkTick } from "../exchanges/types";

type Listener = (tick: MarkTick) => void;

// Exchanges handled here (those without an upstream public WS in markStreams).
export const POLL_EXCHANGES: ExchangeKey[] = [
	"bingx",
	"bitget",
	"bitunix",
	"pionex",
];

// per-exchange minimum spacing between polls (ms) — Pionex throttles hard, go slower
const MIN_INTERVAL: Record<string, number> = {
	bingx: 3_000,
	bitget: 3_000,
	bitunix: 3_000,
	pionex: 15_000,
};
const TICK_MS = 1_000; // scheduler granularity
const COOLDOWN_BASE = 15_000; // first failure backoff
const COOLDOWN_MAX = 120_000;

export class MarkPollManager {
	private desired = new Map<ExchangeKey, Set<string>>();
	private timer: NodeJS.Timeout | null = null;
	private lastPollAt = new Map<ExchangeKey, number>();
	private cooldownUntil = new Map<ExchangeKey, number>();
	private failCount = new Map<ExchangeKey, number>();
	private polling = new Set<ExchangeKey>();

	constructor(private emit: Listener) {}

	update(desired: Map<ExchangeKey, Set<string>>) {
		this.desired = new Map();
		for (const ex of POLL_EXCHANGES) {
			const s = desired.get(ex);
			if (s?.size) this.desired.set(ex, new Set(s));
		}
		if (this.desired.size && !this.timer) {
			this.timer = setInterval(() => this.tick(), TICK_MS);
			this.tick();
		} else if (!this.desired.size && this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	// fires every second; each exchange polls only when its own spacing/cooldown allows
	private tick() {
		const t = Date.now();
		for (const [ex, symbols] of this.desired) {
			if (this.polling.has(ex)) continue;
			if (t < (this.cooldownUntil.get(ex) ?? 0)) continue;
			if (t - (this.lastPollAt.get(ex) ?? 0) < (MIN_INTERVAL[ex] ?? 3_000))
				continue;
			void this.pollOne(ex, symbols);
		}
	}

	private async pollOne(ex: ExchangeKey, symbols: Set<string>) {
		this.polling.add(ex);
		this.lastPollAt.set(ex, Date.now());
		try {
			const adapter = getAdapter(ex);
			if (!adapter.getMarkPrices) return;
			const ticks = await adapter.getMarkPrices([...symbols]);
			for (const tk of ticks) if (symbols.has(tk.symbol)) this.emit(tk);
			this.failCount.set(ex, 0);
		} catch {
			// back off exponentially — a 429 means we must stop hammering for a while
			const fails = (this.failCount.get(ex) ?? 0) + 1;
			this.failCount.set(ex, fails);
			const wait = Math.min(COOLDOWN_MAX, COOLDOWN_BASE * 2 ** (fails - 1));
			this.cooldownUntil.set(ex, Date.now() + wait);
		} finally {
			this.polling.delete(ex);
		}
	}

	closeAll() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.desired.clear();
		this.polling.clear();
	}
}
