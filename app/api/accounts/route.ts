import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { decrypt, encrypt, maskKey } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { EXCHANGE_KEYS, EXCHANGE_META, getAdapter } from "@/lib/exchanges";
import type { ExchangeKey } from "@/lib/exchanges/types";

export const runtime = "nodejs";

// List the current user's connected exchange accounts (masked, never returns secrets).
export async function GET() {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const rows = await prisma.exchangeAccount.findMany({
		where: { userId: user.id },
		orderBy: { createdAt: "asc" },
	});
	const accounts = rows.map((r) => ({
		id: r.id,
		exchange: r.exchange,
		label: r.label,
		apiKeyMasked: maskKey(decrypt(r.apiKey)),
		enabled: r.enabled,
		lastSyncAt: r.lastSyncAt,
		lastError: r.lastError,
		verified: EXCHANGE_META[r.exchange as ExchangeKey]?.verified ?? false,
	}));
	return NextResponse.json({ accounts });
}

const schema = z.object({
	exchange: z.enum(EXCHANGE_KEYS as [ExchangeKey, ...ExchangeKey[]]),
	apiKey: z.string().min(4),
	apiSecret: z.string().min(4),
	passphrase: z.string().optional(),
	label: z.string().max(40).optional(),
});

// Add an exchange API key. Encrypts secrets, runs a connectivity test (non-fatal).
export async function POST(req: Request) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const parsed = schema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "輸入錯誤" },
			{ status: 400 },
		);

	const { exchange, apiKey, apiSecret, passphrase, label } = parsed.data;
	const meta = EXCHANGE_META[exchange];
	if (meta.requiresPassphrase && !passphrase) {
		return NextResponse.json(
			{ error: `${meta.name} 需要 passphrase` },
			{ status: 400 },
		);
	}

	// Test connection before persisting (best-effort — we still save so users can retry).
	let testError: string | null = null;
	try {
		const adapter = getAdapter(exchange);
		await adapter.ping?.({ apiKey, apiSecret, passphrase });
	} catch (e: any) {
		testError = e?.message ?? String(e);
	}

	const row = await prisma.exchangeAccount
		.create({
			data: {
				userId: user.id,
				exchange,
				label: label || null,
				apiKey: encrypt(apiKey),
				apiSecret: encrypt(apiSecret),
				passphrase: passphrase ? encrypt(passphrase) : null,
				lastError: testError,
			},
		})
		.catch((e: any) => {
			if (String(e?.code) === "P2002") return null; // unique violation
			throw e;
		});

	if (!row)
		return NextResponse.json({ error: "此 API Key 已存在" }, { status: 409 });

	return NextResponse.json({
		account: {
			id: row.id,
			exchange,
			label: row.label,
			apiKeyMasked: maskKey(apiKey),
			enabled: true,
			verified: meta.verified,
			lastError: testError,
		},
		testError,
	});
}
