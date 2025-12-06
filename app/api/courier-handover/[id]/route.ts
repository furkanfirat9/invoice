import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

// GET - Tek teslim detayı
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || !isElif(session.user.email)) {
            return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
        }

        const { id } = await params;

        const handover = await prisma.courierHandover.findUnique({
            where: { id },
            include: {
                barcodes: {
                    orderBy: { scannedAt: "asc" },
                },
            },
        });

        if (!handover) {
            return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
        }

        return NextResponse.json({ handover });
    } catch (error) {
        console.error("Get handover error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}

// DELETE - Teslim kaydını sil
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || !isElif(session.user.email)) {
            return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
        }

        const { id } = await params;

        await prisma.courierHandover.delete({
            where: { id },
        });

        return NextResponse.json({ success: true, message: "Kayıt silindi" });
    } catch (error) {
        console.error("Delete handover error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
