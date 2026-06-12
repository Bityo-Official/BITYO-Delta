// /auth/callback — OAuth (Google) & email-link redirect target for Supabase Auth.
// Supabase sends the browser here with a `?code=…`; we exchange it for a session
// (sets the auth cookies) and then forward the user on.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	// where to go after a successful exchange (defaults to the dashboard)
	const next = url.searchParams.get("next") ?? "/dashboard";

	if (code) {
		const supabase = createClient();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) return NextResponse.redirect(`${url.origin}${next}`);
		return NextResponse.redirect(
			`${url.origin}/login?error=${encodeURIComponent(error.message)}`,
		);
	}

	// surfaced when Google denies / the link is stale
	const errDesc = url.searchParams.get("error_description");
	return NextResponse.redirect(
		`${url.origin}/login?error=${encodeURIComponent(errDesc ?? "登入失敗")}`,
	);
}
