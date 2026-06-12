// /api/auth/google/callback — Google OAuth redirect target.
// Verifies the CSRF state, exchanges the code for tokens server-to-server, reads the
// id_token claims, finds-or-creates the user, then issues our normal JWT session.
import { decodeJwt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const url = new URL(req.url);
	const origin = url.origin;
	const fail = (m: string) =>
		NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(m)}`);

	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const cookieState = cookies().get("g_state")?.value;
	const isLink = cookies().get("g_link")?.value === "1";
	cookies().delete("g_state");
	cookies().delete("g_link");
	// a failed *link* should bounce back to settings, not the login page
	const back = isLink
		? (m: string) =>
				NextResponse.redirect(
					`${origin}/dashboard/settings?error=${encodeURIComponent(m)}`,
				)
		: fail;
	if (!code || !state || state !== cookieState) return back("Google 驗證失敗");

	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) return back("Google 登入尚未設定");

	// exchange the authorization code for tokens (server-to-server, over TLS)
	let tokens: { id_token?: string };
	try {
		const r = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: `${origin}/api/auth/google/callback`,
				grant_type: "authorization_code",
			}),
		});
		if (!r.ok) return back("Google 權杖交換失敗");
		tokens = await r.json();
	} catch {
		return back("無法連線 Google");
	}
	if (!tokens.id_token) return back("Google 未回傳身分權杖");

	// id_token came directly from Google's token endpoint over TLS — trusted; decode it
	const claims = decodeJwt(tokens.id_token);
	const email = claims.email as string | undefined;
	const googleId = claims.sub as string | undefined;
	if (!email || !googleId) return back("Google 帳號缺少 email");

	// LINK MODE: attach this Google identity to the already-logged-in account,
	// regardless of whether the Google email matches the account email.
	if (isLink) {
		const session = await getCurrentUser();
		if (!session) return back("綁定需要先登入，請重新登入後再試");
		// guard: this Google account must not already belong to someone else
		const owner = await prisma.user.findUnique({ where: { googleId } });
		if (owner && owner.id !== session.id)
			return back("此 Google 帳號已綁定其他帳號");
		await prisma.user.update({
			where: { id: session.id },
			data: {
				googleId,
				image: (claims.picture as string) ?? undefined,
			},
		});
		return NextResponse.redirect(`${origin}/dashboard/settings?linked=google`);
	}

	// find-or-create, and link googleId to a pre-existing email/password account
	let user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		user = await prisma.user.create({
			data: {
				email,
				name: (claims.name as string) ?? null,
				googleId,
				image: (claims.picture as string) ?? null,
			},
		});
	} else if (!user.googleId) {
		user = await prisma.user.update({
			where: { id: user.id },
			data: {
				googleId,
				image: user.image ?? (claims.picture as string) ?? null,
			},
		});
	}

	await createSession({
		id: user.id,
		email: user.email,
		name: user.name,
		settleCcy: user.settleCcy,
		dark: user.dark,
		primary: user.primary,
	});
	return NextResponse.redirect(`${origin}/dashboard`);
}
