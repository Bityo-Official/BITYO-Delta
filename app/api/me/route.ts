import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, metadataToUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ user: null }, { status: 200 });
	return NextResponse.json({ user });
}

const patchSchema = z.object({
	dark: z.boolean().optional(),
	primary: z.enum(["indigo", "teal", "violet", "amber"]).optional(),
	settleCcy: z.enum(["USDT", "USDC", "USD", "BTC", "ETH", "TWD"]).optional(),
	name: z.string().max(60).optional(),
});

export async function PATCH(req: Request) {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

	const parsed = patchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json({ error: "輸入錯誤" }, { status: 400 });

	// preferences live in user_metadata — merge so a partial update keeps the rest
	const merged = { ...user.user_metadata, ...parsed.data };
	const { data, error } = await supabase.auth.updateUser({ data: merged });
	if (error)
		return NextResponse.json({ error: error.message }, { status: 500 });

	const fresh = metadataToUser(
		data.user.id,
		data.user.email,
		data.user.user_metadata,
	);
	return NextResponse.json({ user: fresh });
}
