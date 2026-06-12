// Supabase server client — for Server Components, Route Handlers and Server Actions.
// Reads/writes the auth cookies via next/headers. In a Server Component the cookie
// store is read-only, so setAll is wrapped in try/catch — the middleware is what
// actually refreshes the session cookie on each request.
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function createClient() {
	const cookieStore = cookies();
	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll();
				},
				setAll(cookiesToSet) {
					try {
						for (const { name, value, options } of cookiesToSet) {
							cookieStore.set(name, value, options);
						}
					} catch {
						// called from a Server Component — ignore; middleware refreshes cookies
					}
				},
			},
		},
	);
}

// Service-role client (server-only, bypasses RLS). Used for admin tasks like the
// one-off user import. NEVER expose the service-role key to the browser.
export function createAdminClient() {
	return createSupabaseClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL as string,
		process.env.SUPABASE_SERVICE_ROLE_KEY as string,
		{ auth: { autoRefreshToken: false, persistSession: false } },
	);
}
