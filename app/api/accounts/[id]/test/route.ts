import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { getAdapter } from "@/lib/exchanges";
import type { ExchangeKey } from "@/lib/exchanges/types";

export const runtime = "nodejs";
// Bybit/Binance/OKX block US IPs — run these in Singapore (exchange-friendly), not Vercel's default US region.
export const preferredRegion = "sin1";

// Re-test connectivity for a saved account.
export async function POST(
	_req: Request,
	{ params }: { params: { id: string } },
) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const acc = await prisma.exchangeAccount.findFirst({
		where: { id: params.id, userId: user.id },
	});
	if (!acc) return NextResponse.json({ error: "找不到帳戶" }, { status: 404 });

	const adapter = getAdapter(acc.exchange as ExchangeKey);
	let error: string | null = null;
	try {
		await adapter.ping?.({
			apiKey: decrypt(acc.apiKey),
			apiSecret: decrypt(acc.apiSecret),
			passphrase: acc.passphrase ? decrypt(acc.passphrase) : undefined,
		});
	} catch (e: any) {
		error = e?.message ?? String(e);
	}
	await prisma.exchangeAccount.update({
		where: { id: acc.id },
		data: { lastError: error, lastSyncAt: new Date() },
	});
	return NextResponse.json({ ok: !error, error });
}
