import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export async function POST(req: Request) {
	const parsed = schema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json({ error: "輸入錯誤" }, { status: 400 });

	const { email, password } = parsed.data;
	const user = await prisma.user.findUnique({ where: { email } });
	// user.password is null for Google-only accounts — they must use Google sign-in
	if (
		!user ||
		!user.password ||
		!(await verifyPassword(password, user.password))
	) {
		return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
	}
	await createSession(user, req.headers.get("user-agent") ?? undefined);
	return NextResponse.json({
		user: { id: user.id, email: user.email, name: user.name },
	});
}
