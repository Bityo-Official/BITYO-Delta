// crypto.ts — AES-256-GCM encryption for exchange API secrets at rest.
// Master key comes from ENCRYPTION_KEY (64 hex chars = 32 bytes). NEVER returned to client.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
	const hex = process.env.ENCRYPTION_KEY;
	if (hex?.length !== 64) {
		throw new Error(
			"ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32",
		);
	}
	return Buffer.from(hex, "hex");
}

// Format: base64(iv).base64(authTag).base64(ciphertext)
export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
	const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		iv.toString("base64"),
		tag.toString("base64"),
		ct.toString("base64"),
	].join(".");
}

export function decrypt(blob: string): string {
	const [ivB64, tagB64, ctB64] = blob.split(".");
	if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed ciphertext");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		masterKey(),
		Buffer.from(ivB64, "base64"),
	);
	decipher.setAuthTag(Buffer.from(tagB64, "base64"));
	const pt = Buffer.concat([
		decipher.update(Buffer.from(ctB64, "base64")),
		decipher.final(),
	]);
	return pt.toString("utf8");
}

// Show only the head + tail of a key so the UI can render a masked preview.
export function maskKey(key: string): string {
	if (key.length <= 8) return "••••";
	return `${key.slice(0, 4)}••••••••••••${key.slice(-4)}`;
}
