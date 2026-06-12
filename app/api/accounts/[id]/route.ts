import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
	_req: Request,
	{ params }: { params: { id: string } },
) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const result = await prisma.exchangeAccount.deleteMany({
		where: { id: params.id, userId: user.id },
	});
	if (result.count === 0)
		return NextResponse.json({ error: "找不到帳戶" }, { status: 404 });
	return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
	enabled: z.boolean().optional(),
	label: z.string().max(40).optional(),
});

export async function PATCH(
	req: Request,
	{ params }: { params: { id: string } },
) {
	const user = await getCurrentUser();
	if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });
	const parsed = patchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success)
		return NextResponse.json({ error: "輸入錯誤" }, { status: 400 });
	const result = await prisma.exchangeAccount.updateMany({
		where: { id: params.id, userId: user.id },
		data: parsed.data,
	});
	if (result.count === 0)
		return NextResponse.json({ error: "找不到帳戶" }, { status: 404 });
	return NextResponse.json({ ok: true });
}
