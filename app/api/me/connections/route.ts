// /api/me/connections — third-party (OAuth) account links for the logged-in user.
//   GET    → which providers are linked (Google) + whether a password is set
//   DELETE → unlink Google (blocked if it would leave the account with no way to sign in)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	const session = await getCurrentUser();
	if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

	const user = await prisma.user.findUnique({
		where: { id: session.id },
		select: { googleId: true, image: true, email: true, password: true },
	});
	if (!user) return NextResponse.json({ error: "帳號不存在" }, { status: 404 });

	return NextResponse.json({
		hasPassword: !!user.password,
		google: {
			linked: !!user.googleId,
			// the account email is what Google is matched on
			email: user.googleId ? user.email : null,
			image: user.googleId ? user.image : null,
		},
	});
}

export async function DELETE() {
	const session = await getCurrentUser();
	if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

	const user = await prisma.user.findUnique({
		where: { id: session.id },
		select: { googleId: true, password: true },
	});
	if (!user) return NextResponse.json({ error: "帳號不存在" }, { status: 404 });
	if (!user.googleId)
		return NextResponse.json({ error: "尚未綁定 Google" }, { status: 400 });
	// don't let the user strand themselves with no credential
	if (!user.password)
		return NextResponse.json(
			{ error: "請先設定密碼，才能解除 Google 綁定" },
			{ status: 400 },
		);

	await prisma.user.update({
		where: { id: session.id },
		data: { googleId: null },
	});
	return NextResponse.json({ ok: true });
}
