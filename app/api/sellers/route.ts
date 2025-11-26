import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        // Sadece CARRIER rolü görebilir
        if (!session || session.user.role !== "CARRIER") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Sadece SELLER rolündeki kullanıcıları getir
        const sellers = await prisma.user.findMany({
            where: {
                role: "SELLER"
            },
            select: {
                id: true,
                storeName: true,
                email: true // Yedek olarak, storeName yoksa email gösteririz
            }
        });

        return NextResponse.json(sellers);
    } catch (error) {
        console.error("Sellers fetch error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
