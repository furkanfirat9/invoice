import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

interface InvoiceGroup {
    faturaNo: string;
    faturaTarihi: string | null;
    saticiUnvani: string | null;
    saticiVkn: string | null;
    aliciVkn: string | null;
    urunBilgisi: string | null;
    urunAdedi: number; // Faturadaki toplam adet
    kullanimSayisi: number; // Kaç siparişte kullanılmış
    pdfUrl: string | null;
    siparisler: string[]; // Kullanıldığı sipariş numaraları
    durum: "normal" | "kullanilabilir" | "fazla_kullanilmis";
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        // Only Elif can access this endpoint
        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        // URL parametrelerini al
        const searchParams = request.nextUrl.searchParams;
        const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

        // Ay için tarih aralığını hesapla
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        // Alış faturası olan tüm OrderDocument kayıtlarını çek
        const documents = await prisma.orderDocument.findMany({
            where: {
                alisFaturaNo: { not: null },
                alisFaturaTarihi: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                postingNumber: true,
                alisFaturaNo: true,
                alisFaturaTarihi: true,
                alisSaticiUnvani: true,
                alisSaticiVkn: true,
                alisAliciVkn: true,
                alisUrunBilgisi: true,
                alisUrunAdedi: true,
                alisPdfUrl: true,
            },
            orderBy: {
                alisFaturaTarihi: "desc",
            },
        });

        // Fatura numarasına göre grupla
        const invoiceMap = new Map<string, {
            faturaNo: string;
            faturaTarihi: Date | null;
            saticiUnvani: string | null;
            saticiVkn: string | null;
            aliciVkn: string | null;
            urunBilgisi: string | null;
            urunAdedi: string | null;
            pdfUrl: string | null;
            siparisler: string[];
        }>();

        for (const doc of documents) {
            if (!doc.alisFaturaNo) continue;

            const existing = invoiceMap.get(doc.alisFaturaNo);
            if (existing) {
                // Aynı fatura numarası başka siparişte de kullanılmış
                existing.siparisler.push(doc.postingNumber);
                // PDF yoksa ve bu dokümanda varsa ekle
                if (!existing.pdfUrl && doc.alisPdfUrl) {
                    existing.pdfUrl = doc.alisPdfUrl;
                }
            } else {
                // Yeni fatura
                invoiceMap.set(doc.alisFaturaNo, {
                    faturaNo: doc.alisFaturaNo,
                    faturaTarihi: doc.alisFaturaTarihi,
                    saticiUnvani: doc.alisSaticiUnvani,
                    saticiVkn: doc.alisSaticiVkn,
                    aliciVkn: doc.alisAliciVkn,
                    urunBilgisi: doc.alisUrunBilgisi,
                    urunAdedi: doc.alisUrunAdedi,
                    pdfUrl: doc.alisPdfUrl,
                    siparisler: [doc.postingNumber],
                });
            }
        }

        // InvoiceGroup dizisine dönüştür
        const invoices: InvoiceGroup[] = [];

        for (const [, data] of invoiceMap) {
            // Ürün adedini parse et (string olarak geliyor)
            let urunAdedi = 1; // Varsayılan
            if (data.urunAdedi) {
                const parsed = parseInt(data.urunAdedi);
                if (!isNaN(parsed) && parsed > 0) {
                    urunAdedi = parsed;
                }
            }

            const kullanimSayisi = data.siparisler.length;

            // Durumu belirle
            let durum: "normal" | "kullanilabilir" | "fazla_kullanilmis" = "normal";
            if (kullanimSayisi < urunAdedi) {
                durum = "kullanilabilir"; // Hala kullanılabilir kapasite var
            } else if (kullanimSayisi > urunAdedi) {
                durum = "fazla_kullanilmis"; // Hata! Fazla kullanılmış
            }

            invoices.push({
                faturaNo: data.faturaNo,
                faturaTarihi: data.faturaTarihi?.toISOString() || null,
                saticiUnvani: data.saticiUnvani,
                saticiVkn: data.saticiVkn,
                aliciVkn: data.aliciVkn,
                urunBilgisi: data.urunBilgisi,
                urunAdedi,
                kullanimSayisi,
                pdfUrl: data.pdfUrl,
                siparisler: data.siparisler,
                durum,
            });
        }

        // İstatistikler
        const stats = {
            toplamFatura: invoices.length,
            normalKullanim: invoices.filter(i => i.durum === "normal").length,
            kullanilabilir: invoices.filter(i => i.durum === "kullanilabilir").length,
            fazlaKullanilmis: invoices.filter(i => i.durum === "fazla_kullanilmis").length,
        };

        return NextResponse.json({
            success: true,
            invoices,
            stats,
            filter: { year, month },
        });
    } catch (error: any) {
        console.error("Invoice analysis error:", error);
        return NextResponse.json(
            { error: error.message || "Fatura analizi başarısız" },
            { status: 500 }
        );
    }
}
