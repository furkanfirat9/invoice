import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import { del } from "@vercel/blob";

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        // Only Elif can access this endpoint
        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const { postingNumber, documentType } = await request.json();

        if (!postingNumber || !documentType) {
            return NextResponse.json({ error: "postingNumber ve documentType gerekli" }, { status: 400 });
        }

        // Find the document
        const document = await prisma.orderDocument.findUnique({
            where: { postingNumber },
        });

        if (!document) {
            return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });
        }

        if (documentType === "alis") {
            // Delete blob file if exists
            if (document.alisPdfUrl) {
                try {
                    await del(document.alisPdfUrl);
                } catch (e) {
                    console.error("Blob delete error:", e);
                    // Continue even if blob delete fails
                }
            }

            // Clear all alis fields
            await prisma.orderDocument.update({
                where: { postingNumber },
                data: {
                    alisFaturaNo: null,
                    alisFaturaTarihi: null,
                    alisSaticiUnvani: null,
                    alisSaticiVkn: null,
                    alisAliciVkn: null,
                    alisKdvHaricTutar: null,
                    alisKdvTutari: null,
                    alisUrunBilgisi: null,
                    alisUrunAdedi: null,
                    alisPdfUrl: null,
                },
            });

            return NextResponse.json({ success: true, message: "Alış faturası silindi" });
        } else if (documentType === "satis") {
            // Delete blob file if exists
            if (document.satisPdfUrl) {
                try {
                    await del(document.satisPdfUrl);
                } catch (e) {
                    console.error("Blob delete error:", e);
                }
            }

            // Clear all satis fields
            await prisma.orderDocument.update({
                where: { postingNumber },
                data: {
                    satisFaturaTarihi: null,
                    satisFaturaNo: null,
                    satisAliciAdSoyad: null,
                    satisPdfUrl: null,
                },
            });

            return NextResponse.json({ success: true, message: "Satış faturası silindi" });
        } else if (documentType === "etgb") {
            // Delete blob file if exists
            if (document.etgbPdfUrl) {
                try {
                    await del(document.etgbPdfUrl);
                } catch (e) {
                    console.error("Blob delete error:", e);
                }
            }

            // Clear all etgb fields
            await prisma.orderDocument.update({
                where: { postingNumber },
                data: {
                    etgbNo: null,
                    etgbTutar: null,
                    etgbDovizCinsi: null,
                    etgbTarihi: null,
                    etgbFaturaTarihi: null,
                    etgbPdfUrl: null,
                },
            });

            return NextResponse.json({ success: true, message: "ETGB silindi" });
        }

        return NextResponse.json({ error: "Geçersiz belge tipi" }, { status: 400 });
    } catch (error: any) {
        console.error("Document delete error:", error);
        return NextResponse.json(
            { error: error.message || "Belge silinemedi" },
            { status: 500 }
        );
    }
}
