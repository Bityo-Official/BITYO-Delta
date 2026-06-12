// types.ts — normalized cross-exchange domain model + adapter interface.
// Every adapter maps a venue's raw API onto these shapes so the UI/aggregator
// never needs venue-specific knowledge.

export type ExchangeKey =
	| "binance"
	| "bybit"
	| "okx"
	| "bingx"
	| "bitget"
	| "bitunix"
	| "pionex";
export type Side = "long" | "short";

export interface ExchangeMeta {
	key: ExchangeKey;
	name: string;
	mono: string; // two-letter monogram for the UI chip
	bg: string;
	fg: string;
	requiresPassphrase: boolean;
	/** false = adapter is implemented to spec but unverified against a live key. */
	verified: boolean;
}

export const EXCHANGE_META: Record<ExchangeKey, ExchangeMeta> = {
	binance: {
		key: "binance",
		name: "Binance",
		mono: "BN",
		bg: "#F0B90B",
		fg: "#1A1606",
		requiresPassphrase: false,
		verified: true,
	},
	bybit: {
		key: "bybit",
		name: "Bybit",
		mono: "BY",
		bg: "#FF8A3C",
		fg: "#2A1605",
		requiresPassphrase: false,
		verified: true,
	},
	okx: {
		key: "okx",
		name: "OKX",
		mono: "OK",
		bg: "#2B313B",
		fg: "#FFFFFF",
		requiresPassphrase: true,
		verified: true,
	},
	bingx: {
		key: "bingx",
		name: "BingX",
		mono: "BX",
		bg: "#2F62FF",
		fg: "#FFFFFF",
		requiresPassphrase: false,
		verified: false,
	},
	bitget: {
		key: "bitget",
		name: "Bitget",
		mono: "BG",
		bg: "#10C8C2",
		fg: "#04302E",
		requiresPassphrase: true,
		verified: false,
	},
	bitunix: {
		key: "bitunix",
		name: "Bitunix",
		mono: "BU",
		bg: "#3D5AFE",
		fg: "#FFFFFF",
		requiresPassphrase: false,
		verified: false,
	},
	pionex: {
		key: "pionex",
		name: "Pionex",
		mono: "PX",
		bg: "#00B897",
		fg: "#FFFFFF",
		requiresPassphrase: false,
		verified: false,
	},
};

export interface Credentials {
	apiKey: string;
	apiSecret: string;
	passphrase?: string;
}

export interface NormPosition {
	exchange: ExchangeKey;
	symbol: string; // e.g. BTCUSDT
	base: string; // e.g. BTC
	side: Side;
	size: number; // contracts/coins (absolute)
	lev: number;
	mode: "cross" | "isolated";
	entry: number;
	mark: number;
	liq: number;
	margin: number;
	upnl: number;
	roe: number; // %
	fundRate: number; // current funding rate as a fraction (e.g. 0.0001)
	fundPaid: number; // cumulative funding for this position (USDT)
}

export interface NormBalance {
	exchange: ExchangeKey;
	equity: number;
	available: number;
	marginUsed: number;
}

export interface NormTrade {
	exchange: ExchangeKey;
	id: string;
	time: number; // epoch ms
	symbol: string;
	base: string;
	side: Side;
	size: number;
	entry: number;
	exit: number;
	realized: number;
	fee: number;
	funding: number;
}

export interface NormFunding {
	exchange: ExchangeKey;
	symbol: string;
	base: string;
	side: Side;
	fundRate: number;
	fundPaid: number;
}

// Live tick pushed over WS to the browser.
export interface MarkTick {
	exchange: ExchangeKey;
	symbol: string;
	mark: number;
	fundRate?: number;
}

// Private-WS auth credential signed on the SERVER and handed to the browser so it can
// open the exchange's private account stream directly. The API SECRET never leaves the
// server — the browser only ever receives a short-lived token (listenKey) or signature.
export interface WsAuth {
	/** private WebSocket endpoint */
	url: string;
	/** auth message to send right after connect; null when auth is baked into the URL
	 *  (e.g. Binance listenKey path) */
	auth: Record<string, unknown> | null;
	/** listenKey-style venues expose it so the client can schedule keepalive pings */
	listenKey?: string;
	/** seconds until the credential expires — client refreshes before this elapses */
	ttlSec?: number;
}

export interface AdapterResult<T> {
	ok: boolean;
	data: T;
	error?: string;
}

export interface ExchangeAdapter {
	meta: ExchangeMeta;
	/** Authenticated: open futures positions. */
	getPositions(c: Credentials): Promise<NormPosition[]>;
	/** Authenticated: futures wallet equity snapshot. */
	getBalance(c: Credentials): Promise<NormBalance>;
	/** Authenticated: recent closed trades / realized PnL ledger. */
	getHistory(c: Credentials): Promise<NormTrade[]>;
	/** Optional sanity check used by the "test connection" button. */
	ping?(c: Credentials): Promise<boolean>;
	/**
	 * Optional PUBLIC mark-price fetch (no credentials). Used by the live poller to
	 * push real-time mark/uPnL updates for exchanges that aren't on a public WS stream.
	 */
	getMarkPrices?(symbols: string[]): Promise<MarkTick[]>;
	/**
	 * Sign a PRIVATE-WS credential for the browser (secret stays server-side). Returns
	 * the endpoint + an auth message / listenKey the client uses to open the account
	 * stream directly from the user's own IP.
	 */
	getWsAuth?(c: Credentials): Promise<WsAuth>;
}

export function baseOf(symbol: string): string {
	return (
		symbol.replace(/[-_/]/g, "").replace(/(USDT|USDC|USD|PERP)+$/i, "") ||
		symbol
	);
}
