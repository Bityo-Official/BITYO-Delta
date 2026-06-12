import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
	email: z.string().email(),
	password: z.string().min(8, "密碼至少 8 個字元"),
	name: z.string().max(60).optional(),
});

export async function POST(req: Request) {
	const body = await req.json().catch(() => null);
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.issues[0]?.message ?? "輸入錯誤" },
			{ status: 400 },
		);
	}
	const { email, password, name } = parsed.data;
	const existing = await prisma.user.findUnique({ where: { email } });
	if (existing)
		return NextResponse.json({ error: "此 Email 已被註冊" }, { status: 409 });

	const user = await prisma.user.create({
		data: { email, password: await hashPassword(password), name: name || null },
	});
	await createSession(user, req.headers.get("user-agent") ?? undefined);
	return NextResponse.json({
		user: { id: user.id, email: user.email, name: user.name },
	});
}
