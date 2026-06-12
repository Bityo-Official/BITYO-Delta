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
	return bcrypt.hash(pw, 11);
}
export async function verifyPassword(
	pw: string,
	hash: string,
): Promise<boolean> {
	return bcrypt.compare(pw, hash);
}

// Create a DB session row + signed JWT, set as httpOnly cookie.
export async function createSession(
	userId: string,
	userAgent?: string,
): Promise<string> {
	const token = randomBytes(24).toString("hex");
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	await prisma.session.create({
		data: { userId, token, userAgent, expiresAt },
	});

	const jwt = await new SignJWT({ sid: token, uid: userId })
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
	return token;
}

export interface SessionUser {
	id: string;
	email: string;
	name: string | null;
	settleCcy: string;
	dark: boolean;
	primary: string;
}

// Resolve the current user from the cookie, validating the DB session.
export async function getCurrentUser(): Promise<SessionUser | null> {
	const jwt = cookies().get(COOKIE)?.value;
	if (!jwt) return null;
	try {
		const { payload } = await jwtVerify(jwt, secret());
		const sid = payload.sid as string;
		const session = await prisma.session.findUnique({
			where: { token: sid },
			include: { user: true },
		});
		if (!session || session.expiresAt < new Date()) return null;
		const u = session.user;
		return {
			id: u.id,
			email: u.email,
			name: u.name,
			settleCcy: u.settleCcy,
			dark: u.dark,
			primary: u.primary,
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

// Verify a raw JWT string (used by the WebSocket server, which has no Next cookies()).
export async function verifyJwt(
	jwt: string,
): Promise<{ uid: string; sid: string } | null> {
	try {
		const { payload } = await jwtVerify(jwt, secret());
		return { uid: payload.uid as string, sid: payload.sid as string };
	} catch {
		return null;
	}
}

export { COOKIE as SESSION_COOKIE };
