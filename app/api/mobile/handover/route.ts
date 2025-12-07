import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

// POST - Mobil uygulama için teslim kaydı oluştur
export async function POST(request: NextRequest) {
    try {
        const contentType = request.headers.get("content-type") || "";

        let barcodes: string[] = [];
        let note: string | null = null;
        let userId: string | null = null;
        let imageUrl: string | null = null;

        // FormData veya JSON kontrolü
        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();

            const barcodesStr = formData.get("barcodes") as string;
            barcodes = barcodesStr ? JSON.parse(barcodesStr) : [];
            note = formData.get("note") as string | null;
            userId = formData.get("userId") as string | null;

            // Görsel varsa yükle
            const image = formData.get("image") as File | null;
            if (image && image.size > 0) {
                const filename = `courier-handover/${Date.now()}-${image.name}`;
                const blob = await put(filename, image, {
                    access: "public",
                    contentType: image.type,
                });
                imageUrl = blob.url;
            }
        } else {
            // JSON formatı (eski uyumluluk için)
            const body = await request.json();
            userId = body.userId;
            note = body.note;

            if (Array.isArray(body.barcodes)) {
                barcodes = body.barcodes;
            } else if (typeof body.barcodes === 'string') {
                barcodes = [body.barcodes];
            } else if (body.barcode) {
                barcodes = [body.barcode];
            }
        }

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

        // Barkod listesi zaten yukarıda oluşturuldu
        if (barcodes.length === 0) {
            return NextResponse.json(
                { success: false, error: "En az bir barkod gerekli" },
                { status: 400 }
            );
        }

        // Daha önce teslim edilmiş barkodları kontrol et
        const existingBarcodes = await prisma.handoverBarcode.findMany({
            where: {
                barcode: { in: barcodes },
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
                imageUrl: imageUrl,
                barcodes: {
                    create: barcodes.map((barcode: string) => ({
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
            message: `${barcodes.length} barkod başarıyla kaydedildi`,
        });
    } catch (error) {
        console.error("Mobile handover error:", error);
        return NextResponse.json(
            { success: false, error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
