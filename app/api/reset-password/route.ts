import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const email = searchParams.get("email");

        if (!email) {
            return NextResponse.json({ error: "Email parameter required" }, { status: 400 });
        }

        const newPassword = await bcrypt.hash("123456", 10);

        const user = await prisma.user.update({
            where: { email },
            data: { password: newPassword }
        });

        return NextResponse.json({
            success: true,
            message: `Password for ${email} reset to 123456`,
            user: { id: user.id, email: user.email }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
