// auth.ts — session identity, now backed by Supabase Auth.
//
// Supabase owns credentials (email/password, Google) and the session cookies (rotated
// by middleware). App-specific preferences (name, theme, settle currency) live in the
// user's `user_metadata`, so resolving the current user needs no query to our own DB.
//
// getCurrentUser() uses getClaims(): with the project's asymmetric JWT signing keys
// enabled it verifies the token LOCALLY (no network round-trip — same hot-path speed as
// the old hand-rolled JWT). Without them it transparently falls back to a getUser() call.
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
	id: string;
	email: string;
	name: string | null;
	settleCcy: string;
	dark: boolean;
	primary: string;
}

type Metadata = {
	name?: string | null;
	settleCcy?: string;
	dark?: boolean;
	primary?: string;
};

export function metadataToUser(
	id: string,
	email: string | undefined,
	meta: Metadata | undefined,
): SessionUser {
	return {
		id,
		email: email ?? "",
		name: meta?.name ?? null,
		settleCcy: meta?.settleCcy ?? "USDT",
		dark: !!meta?.dark,
		primary: meta?.primary ?? "indigo",
	};
}

export async function getCurrentUser(): Promise<SessionUser | null> {
	const supabase = createClient();
	const { data, error } = await supabase.auth.getClaims();
	const claims = data?.claims;
	if (error || !claims?.sub) return null;
	return metadataToUser(
		claims.sub as string,
		claims.email as string | undefined,
		claims.user_metadata as Metadata | undefined,
	);
}
