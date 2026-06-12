// /api/auth/google — start the Google OAuth 2.0 authorization-code flow.
// Sets a short-lived CSRF `state` cookie, then redirects to Google's consent screen.
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const origin = new URL(req.url).origin;
	if (!clientId) {
		return NextResponse.redirect(
			`${origin}/login?error=${encodeURIComponent("Google 登入尚未設定")}`,
		);
	}

	const state = randomBytes(16).toString("hex");
	const cookieOpts = {
		httpOnly: true,
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 600,
	};
	cookies().set("g_state", state, cookieOpts);

	// `?link=1` → link Google to the CURRENTLY logged-in account (settings page),
	// instead of the normal sign-in / sign-up flow. The callback reads this cookie.
	if (new URL(req.url).searchParams.get("link") === "1") {
		cookies().set("g_link", "1", cookieOpts);
	} else {
		cookies().delete("g_link");
	}

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: `${origin}/api/auth/google/callback`,
		response_type: "code",
		scope: "openid email profile",
		state,
		access_type: "online",
		prompt: "select_account",
	});
	return NextResponse.redirect(
		`https://accounts.google.com/o/oauth2/v2/auth?${params}`,
	);
}
