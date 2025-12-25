import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

// Reset OCR data for a specific month (keep PDFs)
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const body = await request.json();
        const { year, month, postingNumbers, resetAlis, resetSatis, resetEtgb } = body;

        let documents;

        // Filter by posting numbers if provided, otherwise by date range
        if (postingNumbers && Array.isArray(postingNumbers) && postingNumbers.length > 0) {
            console.log(`Resetting OCR data for ${postingNumbers.length} posting numbers`);

            documents = await prisma.orderDocument.findMany({
                where: {
                    postingNumber: { in: postingNumbers }
                }
            });
        } else if (year && month) {
            // Calculate date range for the month
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59, 999);

            console.log(`Resetting OCR data for: ${startDate.toISOString()} to ${endDate.toISOString()}`);

            documents = await prisma.orderDocument.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            });
        } else {
            return NextResponse.json({ error: "postingNumbers veya year/month parametreleri gerekli" }, { status: 400 });
        }

        console.log(`Found ${documents.length} documents to reset`);

        let resetCount = 0;

        for (const doc of documents) {
            const updateData: any = {};

            // Reset Alış Faturası fields (keep alisPdfUrl)
            if (resetAlis) {
                updateData.alisFaturaNo = null;
                updateData.alisFaturaTarihi = null;
                updateData.alisSaticiUnvani = null;
                updateData.alisSaticiVkn = null;
                updateData.alisAliciVkn = null;
                updateData.alisKdvHaricTutar = null;
                updateData.alisKdvTutari = null;
                updateData.alisUrunBilgisi = null;
                updateData.alisUrunAdedi = null;
                // alisPdfUrl is NOT reset - PDF preserved
            }

            // Reset Satış Faturası fields (keep satisPdfUrl)
            if (resetSatis) {
                updateData.satisFaturaNo = null;
                updateData.satisFaturaTarihi = null;
                updateData.satisAliciAdSoyad = null;
                // satisPdfUrl is NOT reset - PDF preserved
            }

            // Reset ETGB fields (keep etgbPdfUrl)
            if (resetEtgb) {
                updateData.etgbNo = null;
                updateData.etgbTutar = null;
                updateData.etgbDovizCinsi = null;
                // etgbPdfUrl is NOT reset - PDF preserved
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.orderDocument.update({
                    where: { id: doc.id },
                    data: updateData
                });
                resetCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `${resetCount} belge sıfırlandı (PDF'ler korundu)`,
            totalFound: documents.length,
            resetCount
        });

    } catch (error: any) {
        console.error("Reset OCR data error:", error);
        return NextResponse.json(
            { error: error.message || "Sıfırlama işlemi başarısız" },
            { status: 500 }
        );
    }
}
