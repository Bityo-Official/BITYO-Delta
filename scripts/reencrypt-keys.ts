// reencrypt-keys.ts — 就地輪替 ENCRYPTION_KEY：
// 把目前資料庫（.env 的 DATABASE_URL，即 Supabase）中 ExchangeAccount 的密文
// 從 OLD_ENCRYPTION_KEY（預設 = 最初的全 0 佔位符）重新加密成現行 ENCRYPTION_KEY。
//
// 冪等：每一列先嘗試用「新鑰匙」解密 — 成功代表已轉換過，跳過；
// 失敗才用舊鑰匙解密並改寫。可安心重複執行。
//
// 用法：pnpm db:reencrypt
//（舊鑰匙非全 0 時：OLD_ENCRYPTION_KEY=<64hex> pnpm db:reencrypt）
import "../lib/loadEnv";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const OLD_KEY_HEX = process.env.OLD_ENCRYPTION_KEY ?? "0".repeat(64);
const NEW_KEY_HEX = process.env.ENCRYPTION_KEY ?? "";

function keyOf(hex: string): Buffer {
	if (hex.length !== 64) throw new Error("鑰匙必須是 64 個 hex 字元");
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

/** 已是新鑰匙 → null（跳過）；舊鑰匙 → 回傳轉換後密文；兩把都解不開 → 拋錯 */
function rotate(blob: string | null): string | null {
	if (!blob) return null;
	try {
		decryptWith(NEW_KEY_HEX, blob);
		return null; // already on the new key
	} catch {
		/* fall through to old key */
	}
	return encryptWith(NEW_KEY_HEX, decryptWith(OLD_KEY_HEX, blob));
}

async function main() {
	if (NEW_KEY_HEX.length !== 64) {
		console.error(
			".env 的 ENCRYPTION_KEY 不是 64 hex — 請先設定好新鑰匙再執行。",
		);
		process.exit(1);
	}
	const prisma = new PrismaClient();
	const rows = await prisma.exchangeAccount.findMany();
	let rotated = 0;
	let skipped = 0;
	for (const r of rows) {
		try {
			const apiKey = rotate(r.apiKey);
			const apiSecret = rotate(r.apiSecret);
			const passphrase = rotate(r.passphrase);
			if (apiKey === null && apiSecret === null && passphrase === null) {
				skipped++;
				continue;
			}
			await prisma.exchangeAccount.update({
				where: { id: r.id },
				data: {
					apiKey: apiKey ?? r.apiKey,
					apiSecret: apiSecret ?? r.apiSecret,
					passphrase: passphrase ?? r.passphrase,
				},
			});
			rotated++;
			console.log(`已轉換：${r.exchange}（${r.id}）`);
		} catch (e) {
			console.error(
				`✗ ${r.exchange}（${r.id}）兩把鑰匙都解不開 — 此帳戶需在設定頁重新輸入 API Key：`,
				e instanceof Error ? e.message : e,
			);
		}
	}
	console.log(
		`完成：轉換 ${rotated} 筆、已是新鑰匙 ${skipped} 筆、共 ${rows.length} 筆`,
	);
	await prisma.$disconnect();
}

main().catch((e) => {
	console.error("執行失敗：", e);
	process.exit(1);
});
