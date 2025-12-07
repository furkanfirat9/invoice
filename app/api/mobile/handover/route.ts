import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Mobil uygulama için teslim kaydı oluştur
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { barcodes, note, userId } = body;

        // userId kontrolü (mobil uygulamadan gelen user.id)
        if (!userId) {
            return NextResponse.json(
                { success: false, error: "Kullanıcı kimliği gerekli" },
                { status: 401 }
            );
        }

        // Kullanıcıyı kontrol et
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Kullanıcı bulunamadı" },
                { status: 404 }
            );
        }

        // Barkod kontrolü - tek barkod veya dizi kabul et
        let barcodeList: string[] = [];
        if (Array.isArray(barcodes)) {
            barcodeList = barcodes;
        } else if (typeof barcodes === 'string') {
            barcodeList = [barcodes];
        } else if (body.barcode) {
            barcodeList = [body.barcode];
        }

        if (barcodeList.length === 0) {
            return NextResponse.json(
                { success: false, error: "En az bir barkod gerekli" },
                { status: 400 }
            );
        }

        // Daha önce teslim edilmiş barkodları kontrol et
        const existingBarcodes = await prisma.handoverBarcode.findMany({
            where: {
                barcode: { in: barcodeList },
            },
            include: {
                handover: true,
            },
        });

        if (existingBarcodes.length > 0) {
            const duplicates = existingBarcodes.map((b: { barcode: string; handover: { handoverDate: Date } }) => ({
                barcode: b.barcode,
                date: b.handover.handoverDate,
            }));
            return NextResponse.json(
                { success: false, error: "Bazı barkodlar daha önce teslim edilmiş", duplicates },
                { status: 409 }
            );
        }

        // Teslim kaydı oluştur
        const handover = await prisma.courierHandover.create({
            data: {
                userId: user.id,
                note: note || null,
                barcodes: {
                    create: barcodeList.map((barcode: string) => ({
                        barcode,
                    })),
                },
            },
            include: {
                barcodes: true,
            },
        });

        return NextResponse.json({
            success: true,
            handover,
            message: `${barcodeList.length} barkod başarıyla kaydedildi`,
        });
    } catch (error) {
        console.error("Mobile handover error:", error);
        return NextResponse.json(
            { success: false, error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
