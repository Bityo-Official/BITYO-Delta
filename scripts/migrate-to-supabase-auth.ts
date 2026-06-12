// migrate-to-supabase-auth.ts — one-shot: move existing rows from our own `User` table
// into Supabase Auth (auth.users), then repoint ExchangeAccount.userId to the new auth id.
//
// Run ONCE, BEFORE `prisma db push` drops the old User/Session tables:
//   pnpm tsx scripts/migrate-to-supabase-auth.ts
//
// Needs in .env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
// Idempotent: re-running reuses an auth user that already has the same email.
// NOTE: Google identities are NOT migrated — re-link Google from the settings page after.

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const admin = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL as string,
	process.env.SUPABASE_SERVICE_ROLE_KEY as string,
	{ auth: { autoRefreshToken: false, persistSession: false } },
);

type OldUser = {
	id: string;
	email: string;
	password: string | null;
	name: string | null;
	settleCcy: string;
	dark: boolean;
	primary: string;
	image: string | null;
};

async function findAuthUserByEmail(email: string): Promise<string | null> {
	// auth.users lives in the `auth` schema; query it directly with the service-role DB conn
	const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
		`SELECT id::text FROM auth.users WHERE email = $1 LIMIT 1`,
		email,
	);
	return rows[0]?.id ?? null;
}

async function main() {
	const oldUsers = await prisma.$queryRawUnsafe<OldUser[]>(
		`SELECT id, email, password, name, "settleCcy", dark, "primary", image FROM "User"`,
	);
	console.log(`找到 ${oldUsers.length} 個舊使用者`);

	const idMap = new Map<string, string>(); // oldId -> newAuthId

	for (const u of oldUsers) {
		let authId = await findAuthUserByEmail(u.email);
		if (authId) {
			console.log(`• ${u.email} 已存在於 Supabase Auth，沿用 ${authId}`);
		} else {
			const { data, error } = await admin.auth.admin.createUser({
				email: u.email,
				email_confirm: true,
				user_metadata: {
					name: u.name,
					settleCcy: u.settleCcy,
					dark: u.dark,
					primary: u.primary,
					image: u.image,
				},
			});
			if (error || !data.user) {
				console.error(`✗ 建立 ${u.email} 失敗:`, error?.message);
				continue;
			}
			authId = data.user.id;
			console.log(`✓ 建立 ${u.email} → ${authId}`);
		}

		// import the existing bcrypt hash so the old password keeps working
		if (u.password) {
			await prisma.$executeRawUnsafe(
				`UPDATE auth.users SET encrypted_password = $1 WHERE id = $2::uuid`,
				u.password,
				authId,
			);
			console.log(`  ↳ 已匯入密碼雜湊`);
		}

		idMap.set(u.id, authId);
	}

	// drop the old FK so userId can point at an id that isn't in our (soon-removed) User table
	await prisma.$executeRawUnsafe(
		`ALTER TABLE "ExchangeAccount" DROP CONSTRAINT IF EXISTS "ExchangeAccount_userId_fkey"`,
	);

	let repointed = 0;
	for (const [oldId, newId] of idMap) {
		const n = await prisma.$executeRawUnsafe(
			`UPDATE "ExchangeAccount" SET "userId" = $1 WHERE "userId" = $2`,
			newId,
			oldId,
		);
		repointed += Number(n);
	}
	console.log(`重新指向 ${repointed} 筆交易所帳戶`);
	console.log(
		"\n完成。接著執行:  pnpm exec prisma db push   （移除舊 User/Session 表）",
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
