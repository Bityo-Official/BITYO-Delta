import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/cache";
import { DEMO_BALANCES, DEMO_POSITIONS, DEMO_TRADES } from "@/lib/demo";
import { buildSnapshot, type PortfolioSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-user snapshot cache. The client's safety poll uses the cache; an account-WS
// signal calls `?fresh=1` to bypass it so a just-executed trade shows immediately.
const TTL_SEC = 6;

export async function GET(req: Request) {
	const user = await getCurrentUser();
	// Not logged in → public demo snapshot so the dashboard is explorable.
	if (!user) {
		return NextResponse.json({
			demo: true,
			generatedAt: Date.now(),
			positions: DEMO_POSITIONS,
			balances: DEMO_BALANCES,
			trades: DEMO_TRADES,
			accounts: [],
		});
	}

	const fresh = new URL(req.url).searchParams.get("fresh") === "1";
	const key = `portfolio:${user.id}`;

	if (!fresh) {
		const cached = await cacheGet<PortfolioSnapshot>(key);
		if (cached) return NextResponse.json(cached);
	}

	const snapshot = await buildSnapshot(user.id);
	await cacheSet(key, snapshot, TTL_SEC);
	return NextResponse.json(snapshot);
}
