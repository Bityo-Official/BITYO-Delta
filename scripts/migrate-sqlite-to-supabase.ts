// migrate-sqlite-to-supabase.ts — one-shot data migration: prisma/dev.db (舊 SQLite)
// → Supabase PostgreSQL（目前 .env 指向的資料庫）。
//
// 搬移範圍：User、ExchangeAccount（Session 不搬 — 重新登入即可）。
// 讀取端用 macOS 內建 sqlite3 CLI（.mode json），不需額外依賴；
// 寫入端用目前的 Prisma client（已指向 Supabase）。id 原樣保留，外鍵關係不變。
// 可重複執行：已存在的 id 會跳過（upsert-by-id 概念，用 skipDuplicates）。
//
// 用法：先完成 `pnpm db:push`，再執行 `pnpm db:migrate-from-sqlite`
import "../lib/loadEnv";
import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = join(process.cwd(), "prisma", "dev.db");

// ── ENCRYPTION_KEY 輪替支援 ──
// 舊資料以 OLD_ENCRYPTION_KEY（預設 = 最初的全 0 佔位符）加密；
// 遷移時解密後改用 .env 目前的 ENCRYPTION_KEY 重新加密寫入 Supabase。
// 兩把鑰匙相同時則原樣搬移。
const OLD_KEY_HEX = process.env.OLD_ENCRYPTION_KEY ?? "0".repeat(64);
const NEW_KEY_HEX = process.env.ENCRYPTION_KEY ?? "";

function keyOf(hex: string): Buffer {
	if (hex.length !== 64)
		throw new Error("ENCRYPTION_KEY 必須是 64 個 hex 字元");
	return Buffer.from(hex, "hex");
}
function decryptWith(keyHex: string, blob: string): string {
	const [ivB64, tagB64, ctB64] = blob.split(".");
	const d = createDecipheriv(
		"aes-256-gcm",
		keyOf(keyHex),
		Buffer.from(ivB64, "base64"),
	);
	d.setAuthTag(Buffer.from(tagB64, "base64"));
	return Buffer.concat([
		d.update(Buffer.from(ctB64, "base64")),
		d.final(),
	]).toString("utf8");
}
function encryptWith(keyHex: string, plain: string): string {
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", keyOf(keyHex), iv);
	const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
	return [
		iv.toString("base64"),
		c.getAuthTag().toString("base64"),
		ct.toString("base64"),
	].join(".");
}
/** 解密失敗時拋錯（鑰匙不對），同鑰匙時直接原樣回傳 */
function reEncrypt(blob: string | null): string | null {
	if (!blob) return null;
	if (OLD_KEY_HEX === NEW_KEY_HEX) return blob;
	return encryptWith(NEW_KEY_HEX, decryptWith(OLD_KEY_HEX, blob));
}

function readTable<T = Record<string, unknown>>(table: string): T[] {
	const out = execFileSync(
		"sqlite3",
		["-json", SQLITE_PATH, `SELECT * FROM "${table}";`],
		{
			encoding: "utf8",
		},
	).trim();
	return out ? (JSON.parse(out) as T[]) : [];
}

// Prisma 在 SQLite 中以「epoch 毫秒整數」儲存 DateTime；防禦性兼容 ISO 字串。
function toDate(v: unknown): Date {
	if (typeof v === "number") return new Date(v);
	if (typeof v === "string" && /^\d+$/.test(v)) return new Date(Number(v));
	return new Date(String(v));
}

async function main() {
	if (!existsSync(SQLITE_PATH)) {
		console.error(`找不到舊資料庫：${SQLITE_PATH} — 沒有東西可搬。`);
		process.exit(1);
	}
	if (!process.env.DATABASE_URL?.startsWith("postgresql")) {
		console.error(
			"DATABASE_URL 不是 PostgreSQL — 請先在 .env 填入 Supabase 連線字串。",
		);
		process.exit(1);
	}

	const prisma = new PrismaClient();
	const users = readTable<any>("User");
	const accounts = readTable<any>("ExchangeAccount");
	console.log(
		`SQLite 來源：${users.length} 個使用者、${accounts.length} 個交易所帳戶`,
	);

	const u = await prisma.user.createMany({
		data: users.map((x) => ({
			id: x.id,
			email: x.email,
			password: x.password, // bcrypt hash 原樣搬移
			name: x.name ?? null,
			createdAt: toDate(x.createdAt),
			settleCcy: x.settleCcy ?? "USDT",
			dark: !!x.dark, // SQLite 布林為 0/1
			primary: x.primary ?? "indigo",
		})),
		skipDuplicates: true,
	});

	const a = await prisma.exchangeAccount.createMany({
		data: accounts.map((x) => ({
			id: x.id,
			userId: x.userId,
			exchange: x.exchange,
			label: x.label ?? null,
			// 用舊鑰匙解密、新鑰匙重新加密（鑰匙未變時原樣搬移）
			apiKey: reEncrypt(x.apiKey) as string,
			apiSecret: reEncrypt(x.apiSecret) as string,
			passphrase: reEncrypt(x.passphrase ?? null),
			enabled: !!x.enabled,
			lastSyncAt: x.lastSyncAt ? toDate(x.lastSyncAt) : null,
			lastError: x.lastError ?? null,
			createdAt: toDate(x.createdAt),
		})),
		skipDuplicates: true,
	});

	console.log(
		`完成：寫入 ${u.count} 個使用者、${a.count} 個交易所帳戶（已存在者自動跳過）`,
	);
	console.log("Session 不搬移 — 請重新登入。");
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error("遷移失敗：", e);
	process.exit(1);
});
