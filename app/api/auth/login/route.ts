import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/cache";
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

	// Brute-force guard: 5/min per IP and 10 per 15min per target email (the email
	// limit also covers attackers rotating IPs against one account).
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
	const [byIp, byEmail] = await Promise.all([
		rateLimit(`login:ip:${ip}`, 5, 60),
		rateLimit(`login:email:${email.toLowerCase()}`, 10, 900),
	]);
	if (!byIp.ok || !byEmail.ok) {
		const retry = Math.max(byIp.retryAfterSec, byEmail.retryAfterSec);
		return NextResponse.json(
			{ error: `嘗試次數過多，請 ${retry} 秒後再試` },
			{ status: 429, headers: { "Retry-After": String(retry) } },
		);
	}
	const user = await prisma.user.findUnique({ where: { email } });
	// user.password is null for Google-only accounts — they must use Google sign-in
	if (!user?.password || !(await verifyPassword(password, user.password))) {
		return NextResponse.json({ error: "Email 或密碼錯誤" }, { status: 401 });
	}
	await createSession(user, req.headers.get("user-agent") ?? undefined);
	return NextResponse.json({
		user: { id: user.id, email: user.email, name: user.name },
	});
}
