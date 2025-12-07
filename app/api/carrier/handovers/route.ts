import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Carrier için salt okunur teslim geçmişini listele
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email) {
            return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
        }

        // Kullanıcının CARRIER rolünde olduğunu kontrol et
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { role: true }
        });

        if (!user || user.role !== "CARRIER") {
            return NextResponse.json({ error: "Bu sayfaya erişim yetkiniz yok" }, { status: 403 });
        }

        const handovers = await prisma.courierHandover.findMany({
            include: {
                barcodes: {
                    orderBy: { scannedAt: "asc" },
                },
            },
            orderBy: { handoverDate: "desc" },
        });

        return NextResponse.json({ handovers });
    } catch (error) {
        console.error("Get carrier handovers error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
