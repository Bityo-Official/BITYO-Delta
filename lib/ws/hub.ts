// hub.ts — manages authenticated browser WebSocket clients.
// Key property: snapshot building is deduplicated PER USER — any number of open tabs
// share ONE 12s refresh loop and one in-flight buildSnapshot, so extra tabs never
// multiply exchange API traffic (which previously triggered Pionex 429s).
// Live mark-price ticks (public WS + REST pollers) are fanned out in between.
import type { WebSocket } from "ws";
import { DEMO_BALANCES, DEMO_POSITIONS, DEMO_TRADES } from "../demo";
import type { ExchangeKey, MarkTick } from "../exchanges/types";
import { buildSnapshot, type PortfolioSnapshot } from "../portfolio";
import { MarkPollManager } from "./markPoll";
import { MarkStreamManager } from "./markStreams";

const REFRESH_MS = 12_000;

function demoSnapshot(): PortfolioSnapshot {
	return {
		demo: true,
		generatedAt: Date.now(),
		positions: DEMO_POSITIONS,
		balances: DEMO_BALANCES,
		trades: DEMO_TRADES,
		accounts: [],
	};
}

// One group per user id (or the shared anonymous/demo group). Owns the refresh
// timer, the latest snapshot, and the set of connected sockets.
interface UserGroup {
	key: string; // userId or 'anon'
	userId: string | null;
	clients: Set<WebSocket>;
	symbols: Set<string>; // `${exchange}:${symbol}` derived from latest snapshot
	timer: NodeJS.Timeout | null;
	inflight: Promise<void> | null;
	lastPayload: string | null; // latest snapshot JSON — replayed to late joiners
}

export class HedgeBookHub {
	private groups = new Map<string, UserGroup>();
	private marks: MarkStreamManager;
	private poll: MarkPollManager;

	constructor() {
		this.marks = new MarkStreamManager((tick) => this.onTick(tick));
		this.poll = new MarkPollManager((tick) => this.onTick(tick));
	}

	async addClient(ws: WebSocket, userId: string | null) {
		const key = userId ?? "anon";
		let group = this.groups.get(key);
		if (!group) {
			group = {
				key,
				userId,
				clients: new Set(),
				symbols: new Set(),
				timer: null,
				inflight: null,
				lastPayload: null,
			};
			this.groups.set(key, group);
			group.timer = setInterval(
				() => void this.refreshGroup(group as UserGroup),
				REFRESH_MS,
			);
		}
		group.clients.add(ws);

		ws.on("close", () => this.removeClient(ws, group));
		ws.on("error", () => this.removeClient(ws, group));
		ws.on("message", (buf) => {
			// client may request an immediate refresh (still deduped via `inflight`)
			try {
				if (JSON.parse(buf.toString())?.type === "refresh")
					void this.refreshGroup(group);
			} catch {
				/* ignore */
			}
		});

		await this.refreshGroup(group);
		// Late-joiner replay: if this socket attached while a refresh was already
		// mid-broadcast (multi-tab race), make sure it still gets the latest snapshot.
		if (group.lastPayload) this.sendRaw(ws, group.lastPayload);
	}

	private removeClient(ws: WebSocket, group: UserGroup) {
		group.clients.delete(ws);
		try {
			ws.close();
		} catch {
			/* ignore */
		}
		if (group.clients.size === 0) {
			if (group.timer) clearInterval(group.timer);
			this.groups.delete(group.key);
			this.reconcileStreams();
			if (this.groups.size === 0) {
				this.marks.closeAll();
				this.poll.closeAll();
			}
		}
	}

	// Build + broadcast ONE snapshot for the whole group. Concurrent calls (multiple
	// tabs connecting, manual refresh during the timer) share the same promise.
	private refreshGroup(group: UserGroup): Promise<void> {
		if (group.inflight) return group.inflight;
		group.inflight = (async () => {
			try {
				const snap = group.userId
					? await buildSnapshot(group.userId)
					: demoSnapshot();
				group.symbols = new Set(
					snap.positions.map((p) => `${p.exchange}:${p.symbol}`),
				);
				const payload = JSON.stringify({ type: "snapshot", snapshot: snap });
				group.lastPayload = payload;
				for (const ws of group.clients) this.sendRaw(ws, payload);
				this.reconcileStreams();
			} catch (e) {
				const payload = JSON.stringify({
					type: "error",
					error: e instanceof Error ? e.message : String(e),
				});
				for (const ws of group.clients) this.sendRaw(ws, payload);
			} finally {
				group.inflight = null;
			}
		})();
		return group.inflight;
	}

	private onTick(tick: MarkTick) {
		const key = `${tick.exchange}:${tick.symbol}`;
		let payload: string | null = null;
		for (const group of this.groups.values()) {
			if (!group.symbols.has(key)) continue;
			payload ??= JSON.stringify({ type: "tick", tick });
			for (const ws of group.clients) this.sendRaw(ws, payload);
		}
	}

	// Union of all groups' symbols, per exchange, drives upstream subscriptions.
	private reconcileStreams() {
		const desired = new Map<ExchangeKey, Set<string>>();
		for (const group of this.groups.values()) {
			for (const k of group.symbols) {
				const [ex, sym] = k.split(":") as [ExchangeKey, string];
				if (!desired.has(ex)) desired.set(ex, new Set());
				desired.get(ex)?.add(sym);
			}
		}
		this.marks.update(desired); // binance / bybit / okx via public WS
		this.poll.update(desired); // bingx / bitget / bitunix / pionex via throttled REST
	}

	private sendRaw(ws: WebSocket, payload: string) {
		if (ws.readyState === 1) {
			try {
				ws.send(payload);
			} catch {
				/* ignore */
			}
		}
	}
}

export type ServerMessage =
	| { type: "snapshot"; snapshot: PortfolioSnapshot }
	| { type: "tick"; tick: MarkTick }
	| { type: "error"; error: string };
