import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

// POST - Yeni teslim kaydı oluştur
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || !isElif(session.user.email)) {
            return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
        }

        const body = await request.json();
        const { barcodes, note } = body;

        if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
            return NextResponse.json(
                { error: "En az bir barkod gerekli" },
                { status: 400 }
            );
        }

        // Kullanıcı ID'sini bul
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 404 });
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
                { error: "Bazı barkodlar daha önce teslim edilmiş", duplicates },
                { status: 409 }
            );
        }

        // Teslim kaydı oluştur
        const handover = await prisma.courierHandover.create({
            data: {
                userId: user.id,
                note: note || null,
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
        console.error("Courier handover error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}

// GET - Teslim geçmişini listele
export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email || !isElif(session.user.email)) {
            return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
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
        console.error("Get handovers error:", error);
        return NextResponse.json(
            { error: "Bir hata oluştu" },
            { status: 500 }
        );
    }
}
