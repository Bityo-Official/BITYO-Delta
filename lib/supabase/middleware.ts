// Session refresh for the Edge middleware. Runs on every matched request: rotates the
// Supabase auth cookies if the access token is near expiry, and gates /dashboard/* so
// an unauthenticated visitor is redirected to /login before any page renders.
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
	let response = NextResponse.next({ request });

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) {
						request.cookies.set(name, value);
					}
					response = NextResponse.next({ request });
					for (const { name, value, options } of cookiesToSet) {
						response.cookies.set(name, value, options);
					}
				},
			},
		},
	);

	// IMPORTANT: getUser() validates the token and triggers the cookie refresh above.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	// auth gate for the dashboard
	if (!user && request.nextUrl.pathname.startsWith("/dashboard")) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	return response;
}
