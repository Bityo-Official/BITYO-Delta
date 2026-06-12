import { randomBytes } from "node:crypto";
// auth.ts — bcrypt password hashing + JWT cookie sessions (self-built, multi-user).
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "hb_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
	const s = process.env.SESSION_SECRET;
	if (!s || s.length < 32)
		throw new Error("SESSION_SECRET must be set (>=32 chars)");
	return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string): Promise<string> {
	return bcrypt.hash(pw, 10);
}
export async function verifyPassword(
	pw: string,
	hash: string,
): Promise<boolean> {
	return bcrypt.compare(pw, hash);
}

export interface SessionUser {
	id: string;
	email: string;
	name: string | null;
	settleCcy: string;
	dark: boolean;
	primary: string;
}

// Create a signed JWT cookie carrying the user's identity, so getCurrentUser() needs
// NO database round-trip on the hot path (every SSR page + API call calls it). The DB
// session row is written fire-and-forget for audit / future revocation only — the login
// response doesn't wait on it (the remote Supabase round-trip was a big chunk of the
// observed login latency).
export async function createSession(
	user: SessionUser,
	userAgent?: string,
): Promise<void> {
	const token = randomBytes(24).toString("hex");
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	void prisma.session
		.create({ data: { userId: user.id, token, userAgent, expiresAt } })
		.catch(() => {});

	const jwt = await new SignJWT({
		sid: token,
		uid: user.id,
		email: user.email,
		name: user.name,
		dark: user.dark,
		primary: user.primary,
		settleCcy: user.settleCcy,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_DAYS}d`)
		.sign(secret());

	cookies().set(COOKIE, jwt, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		expires: expiresAt,
	});
}

// Resolve the current user straight from the cryptographically-verified JWT — no DB.
// jwtVerify throws on a tampered/expired token, so expiry is enforced without a query.
export async function getCurrentUser(): Promise<SessionUser | null> {
	const jwt = cookies().get(COOKIE)?.value;
	if (!jwt) return null;
	try {
		const { payload } = await jwtVerify(jwt, secret());
		if (!payload.uid) return null;
		return {
			id: payload.uid as string,
			email: (payload.email as string) ?? "",
			name: (payload.name as string | null) ?? null,
			settleCcy: (payload.settleCcy as string) ?? "USDT",
			dark: !!payload.dark,
			primary: (payload.primary as string) ?? "indigo",
		};
	} catch {
		return null;
	}
}

export async function destroySession(): Promise<void> {
	const jwt = cookies().get(COOKIE)?.value;
	if (jwt) {
		try {
			const { payload } = await jwtVerify(jwt, secret());
			await prisma.session.deleteMany({
				where: { token: payload.sid as string },
			});
		} catch {
			/* ignore */
		}
	}
	cookies().delete(COOKIE);
}
