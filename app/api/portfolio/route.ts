import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_BALANCES, DEMO_POSITIONS, DEMO_TRADES } from "@/lib/demo";
import { buildSnapshot } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
	const snapshot = await buildSnapshot(user.id);
	return NextResponse.json(snapshot);
}
