// cache.ts — tiny KV cache with TTL. Uses Upstash Redis (REST) when its env vars are
// present, otherwise an in-process Map (fine for single-instance dev). On Vercel the
// in-memory map is per-lambda and not shared, so set UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN in production to share the /api/portfolio cache across the
// serverless fleet (this is what bounds per-user exchange fetches at ~100 concurrent
// users — concurrent polls/tabs collapse onto one cached snapshot).
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const enabled = !!(URL && TOKEN);

const mem = new Map<string, { exp: number; v: string }>();

async function cmd(args: (string | number)[]): Promise<unknown> {
	const r = await fetch(URL as string, {
		method: "POST",
		headers: { Authorization: `Bearer ${TOKEN}` },
		body: JSON.stringify(args),
		cache: "no-store",
	});
	if (!r.ok) throw new Error(`upstash ${r.status}`);
	return (await r.json()).result;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
	try {
		if (enabled) {
			const res = (await cmd(["GET", key])) as string | null;
			return res ? (JSON.parse(res) as T) : null;
		}
		const hit = mem.get(key);
		if (hit && hit.exp > Date.now()) return JSON.parse(hit.v) as T;
		if (hit) mem.delete(key);
		return null;
	} catch {
		return null; // cache is best-effort — never block the request on it
	}
}

export async function cacheSet(
	key: string,
	value: unknown,
	ttlSec: number,
): Promise<void> {
	const s = JSON.stringify(value);
	try {
		if (enabled) {
			await cmd(["SET", key, s, "EX", ttlSec]);
			return;
		}
		mem.set(key, { exp: Date.now() + ttlSec * 1000, v: s });
	} catch {
		/* best-effort */
	}
}

export const cacheBackend = enabled ? "upstash" : "memory";

// Fixed-window rate limiter. Atomic INCR+EXPIRE on Upstash so the count is shared
// across the serverless fleet; per-process Map fallback in dev. FAILS OPEN (allows
// the request) if the backend errors — availability over strictness for login.
export async function rateLimit(
	key: string,
	max: number,
	windowSec: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
	const k = `rl:${key}`;
	try {
		if (enabled) {
			const n = (await cmd(["INCR", k])) as number;
			if (n === 1) await cmd(["EXPIRE", k, windowSec]);
			if (n <= max) return { ok: true, retryAfterSec: 0 };
			const ttl = (await cmd(["TTL", k])) as number;
			return { ok: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
		}
		const now = Date.now();
		const hit = mem.get(k);
		if (!hit || hit.exp <= now) {
			mem.set(k, { exp: now + windowSec * 1000, v: "1" });
			return { ok: true, retryAfterSec: 0 };
		}
		const n = Number(hit.v) + 1;
		hit.v = String(n);
		if (n <= max) return { ok: true, retryAfterSec: 0 };
		return { ok: false, retryAfterSec: Math.ceil((hit.exp - now) / 1000) };
	} catch {
		return { ok: true, retryAfterSec: 0 };
	}
}
