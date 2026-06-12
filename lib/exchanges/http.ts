// http.ts — shared signing + fetch helpers for exchange REST calls.
import { createHmac } from "node:crypto";

export function hmacHex(secret: string, payload: string): string {
	return createHmac("sha256", secret).update(payload).digest("hex");
}
export function hmacBase64(secret: string, payload: string): string {
	return createHmac("sha256", secret).update(payload).digest("base64");
}

export function qs(
	params: Record<string, string | number | undefined>,
): string {
	return Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== "")
		.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
		.join("&");
}

export class ExchangeError extends Error {
	/** epoch-ms until which the venue says this IP is locked (from x-ratelimit-lock) */
	public lockUntilMs?: number;

	constructor(
		public exchange: string,
		message: string,
		public status?: number,
	) {
		super(`[${exchange}] ${message}`);
	}
}

export async function httpJson<T = any>(
	url: string,
	init: RequestInit & { exchange: string } = { exchange: "exchange" },
): Promise<T> {
	const { exchange, ...rest } = init;
	let res: Response;
	try {
		res = await fetch(url, { ...rest, signal: AbortSignal.timeout(15_000) });
	} catch (e: any) {
		throw new ExchangeError(exchange, `network error: ${e?.message ?? e}`);
	}
	const text = await res.text();
	let json: any;
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		throw new ExchangeError(
			exchange,
			`non-JSON response (${res.status}): ${text.slice(0, 160)}`,
			res.status,
		);
	}
	if (!res.ok) {
		const msg = json?.msg || json?.message || json?.error || text.slice(0, 160);
		const err = new ExchangeError(
			exchange,
			`HTTP ${res.status}: ${msg}`,
			res.status,
		);
		// Pionex (and some others) expose the exact unlock time on 429 — surface it so
		// adapters can honor the venue's lock instead of guessing with backoff.
		const lock = res.headers.get("x-ratelimit-lock");
		if (res.status === 429 && lock) {
			const sec = Number.parseFloat(lock);
			if (Number.isFinite(sec) && sec > 1e9) err.lockUntilMs = sec * 1000;
		}
		throw err;
	}
	return json as T;
}

export const now = () => Date.now();
