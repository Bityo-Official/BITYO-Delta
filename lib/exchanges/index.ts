import { binance } from "./binance";
import { bingx } from "./bingx";
import { bitget } from "./bitget";
import { bitunix } from "./bitunix";
import { bybit } from "./bybit";
import { okx } from "./okx";
import { pionex } from "./pionex";
// index.ts — exchange adapter registry.
import { EXCHANGE_META, type ExchangeAdapter, type ExchangeKey } from "./types";

export const ADAPTERS: Record<ExchangeKey, ExchangeAdapter> = {
	binance,
	bybit,
	okx,
	bingx,
	bitget,
	bitunix,
	pionex,
};

export function getAdapter(key: ExchangeKey): ExchangeAdapter {
	const a = ADAPTERS[key];
	if (!a) throw new Error(`Unknown exchange: ${key}`);
	return a;
}

export const EXCHANGE_KEYS = Object.keys(ADAPTERS) as ExchangeKey[];
export * from "./types";
export { EXCHANGE_META };
