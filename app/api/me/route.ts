import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ user: null }, { status: 200 });
	return NextResponse.json({ user });
}

const patchSchema = z.object({
	dark: z.boolean().optional(),
	primary: z.enum(["indigo", "teal", "violet", "amber"]).optional(),
	settleCcy: z.string().max(8).optional(),
	name: z.string().max(60).optional(),
});

export async function PATCH(req: Request) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const parsed = patchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json({ error: "輸入錯誤" }, { status: 400 });
	const updated = await prisma.user.update({
		where: { id: user.id },
		data: parsed.data,
	});
	return NextResponse.json({
		user: {
			id: updated.id,
			email: updated.email,
			name: updated.name,
			dark: updated.dark,
			primary: updated.primary,
			settleCcy: updated.settleCcy,
		},
	});
}
