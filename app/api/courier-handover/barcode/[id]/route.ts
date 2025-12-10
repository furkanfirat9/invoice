import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

// DELETE - Tek barkod sil
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

        // Barkodu bul
        const barcode = await prisma.handoverBarcode.findUnique({
            where: { id },
            include: {
                handover: {
                    include: {
                        barcodes: true,
                    },
                },
            },
        });

        if (!barcode) {
            return NextResponse.json({ error: "Barkod bulunamadı" }, { status: 404 });
        }

        // Barkodu sil
        await prisma.handoverBarcode.delete({
            where: { id },
        });

        // Eğer bu son barkod idi ve handover boş kaldıysa, handover'ı da sil
        const remainingBarcodes = barcode.handover.barcodes.length - 1;
        let handoverDeleted = false;

        if (remainingBarcodes === 0) {
            await prisma.courierHandover.delete({
                where: { id: barcode.handoverId },
            });
            handoverDeleted = true;
        }

        return NextResponse.json({
            success: true,
            message: "Barkod silindi",
            handoverDeleted,
            remainingBarcodes,
        });
    } catch (error) {
        console.error("Delete barcode error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
