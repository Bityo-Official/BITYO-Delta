// /api/ws-auth/[exchange] — sign a PRIVATE-WS credential for the browser.
// The browser opens the exchange's private account stream itself (from the user's own
// IP — this is what lets the realtime layer scale to many concurrent users without the
// server's single IP hitting per-IP rate limits). The API SECRET never leaves here;
// only a short-lived listenKey / signature is returned.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { EXCHANGE_KEYS, getAdapter } from "@/lib/exchanges";
import type { ExchangeKey } from "@/lib/exchanges/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
	_req: Request,
	{ params }: { params: { exchange: string } },
) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

	const ex = params.exchange as ExchangeKey;
	if (!EXCHANGE_KEYS.includes(ex)) {
		return NextResponse.json({ error: "未知交易所" }, { status: 400 });
	}
	const adapter = getAdapter(ex);
	if (!adapter.getWsAuth) {
		return NextResponse.json(
			{ error: `${ex} 尚未支援私有 WebSocket` },
			{ status: 400 },
		);
	}

	// One private stream per connected account on this exchange (a user may have more
	// than one key per venue).
	const accounts = await prisma.exchangeAccount.findMany({
		where: { userId: user.id, exchange: ex, enabled: true },
	});
	if (!accounts.length) {
		return NextResponse.json({ error: "無此交易所帳戶" }, { status: 404 });
	}

	const auths = await Promise.all(
		accounts.map(async (acc) => {
			try {
				const creds = {
					apiKey: decrypt(acc.apiKey),
					apiSecret: decrypt(acc.apiSecret),
					passphrase: acc.passphrase ? decrypt(acc.passphrase) : undefined,
				};
				// biome-ignore lint/style/noNonNullAssertion: guarded by getWsAuth check above
				const wsAuth = await adapter.getWsAuth!(creds);
				return { accountId: acc.id, label: acc.label, ...wsAuth };
			} catch (e) {
				return {
					accountId: acc.id,
					label: acc.label,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}),
	);

	return NextResponse.json({ exchange: ex, auths });
}
