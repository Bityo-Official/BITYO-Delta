// server.ts — custom Node server: Next.js HTTP + a WebSocket endpoint at /ws.
// Run with tsx (see package.json scripts). Loads env first so Prisma sees DATABASE_URL.
import "./lib/loadEnv";

import { createServer } from "node:http";
import { parse } from "node:url";
import { jwtVerify } from "jose";
import next from "next";
import { WebSocketServer } from "ws";
import { prisma } from "./lib/db";
import { HedgeBookHub } from "./lib/ws/hub";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

function readCookie(header: string | undefined, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return decodeURIComponent(v.join("="));
	}
	return null;
}

// Resolve the user id from the session cookie on the WS upgrade request.
// Returns null for anonymous visitors (they get the live demo snapshot).
async function authUpgrade(
	cookieHeader: string | undefined,
): Promise<string | null> {
	const jwt = readCookie(cookieHeader, "hb_session");
	if (!jwt) return null;
	try {
		const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
		const { payload } = await jwtVerify(jwt, secret);
		const session = await prisma.session.findUnique({
			where: { token: payload.sid as string },
		});
		if (!session || session.expiresAt < new Date()) return null;
		return payload.uid as string;
	} catch {
		return null;
	}
}

app.prepare().then(() => {
	const server = createServer((req, res) =>
		handle(req, res, parse(req.url || "", true)),
	);

	const wss = new WebSocketServer({ noServer: true });
	const hub = new HedgeBookHub();

	server.on("upgrade", async (req, socket, head) => {
		const { pathname } = parse(req.url || "");
		if (pathname !== "/ws") {
			socket.destroy();
			return;
		}
		let userId: string | null = null;
		try {
			userId = await authUpgrade(req.headers.cookie);
		} catch {
			userId = null;
		}
		wss.handleUpgrade(req, socket, head, (ws) => {
			void hub.addClient(ws, userId);
		});
	});

	server.listen(port, () => {
		console.log(
			`> HedgeBook ready on http://localhost:${port}  (ws: /ws, ${dev ? "dev" : "prod"})`,
		);
	});
});
