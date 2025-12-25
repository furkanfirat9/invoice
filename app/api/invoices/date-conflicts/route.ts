import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

        // Ay başlangıç ve bitiş tarihleri
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);

        // Hem alış hem satış faturası olan ve tarih uyumsuzluğu bulunan kayıtları getir
        const documents = await prisma.orderDocument.findMany({
            where: {
                userId: session.user.id,
                alisFaturaTarihi: { not: null },
                satisFaturaTarihi: { not: null },
                // En az birinin bu ay içinde olması gerekiyor
                OR: [
                    {
                        alisFaturaTarihi: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    {
                        satisFaturaTarihi: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                ]
            },
            select: {
                postingNumber: true,
                alisFaturaNo: true,
                alisFaturaTarihi: true,
                alisSaticiUnvani: true,
                alisSaticiVkn: true,
                alisAliciVkn: true,
                alisPdfUrl: true,
                satisFaturaNo: true,
                satisFaturaTarihi: true,
                satisAliciAdSoyad: true,
                satisPdfUrl: true,
            },
            orderBy: {
                alisFaturaTarihi: "desc"
            }
        });

        // Posting number'ları al - Invoice tablosundan PDF URL'lerini çekmek için
        const postingNumbers = documents.map(d => d.postingNumber);

        // Invoice tablosundan satış faturası PDF'lerini çek (Sevkiyatlar sayfasından yüklenenler)
        // Not: Bazı eski Invoice kayıtlarında userId null olabilir, bu yüzden userId filtresini gevşetiyoruz
        const invoices = await prisma.invoice.findMany({
            where: {
                postingNumber: { in: postingNumbers },
                OR: [
                    { userId: session.user.id },
                    { userId: null }
                ]
            },
            select: {
                postingNumber: true,
                pdfUrl: true,
            }
        });

        // Invoice PDF'lerini postingNumber'a göre map'le
        const invoicePdfMap = new Map<string, string | null>();
        invoices.forEach(inv => {
            if (inv.pdfUrl) {
                invoicePdfMap.set(inv.postingNumber, inv.pdfUrl);
            }
        });


        // Tarih uyumsuzluğu olanları filtrele (alış tarihi > satış tarihi)
        const conflicts = documents.filter(doc => {
            if (!doc.alisFaturaTarihi || !doc.satisFaturaTarihi) return false;
            return new Date(doc.alisFaturaTarihi) > new Date(doc.satisFaturaTarihi);
        }).map(doc => ({
            postingNumber: doc.postingNumber,
            alisFaturaNo: doc.alisFaturaNo,
            alisFaturaTarihi: doc.alisFaturaTarihi?.toISOString() || null,
            alisSaticiUnvani: doc.alisSaticiUnvani,
            alisSaticiVkn: doc.alisSaticiVkn,
            alisAliciVkn: doc.alisAliciVkn,
            alisPdfUrl: doc.alisPdfUrl,
            satisFaturaNo: doc.satisFaturaNo,
            satisFaturaTarihi: doc.satisFaturaTarihi?.toISOString() || null,
            satisAliciAdSoyad: doc.satisAliciAdSoyad,
            // Önce OrderDocument'taki satisPdfUrl'e bak, yoksa Invoice'dan al
            satisPdfUrl: doc.satisPdfUrl || invoicePdfMap.get(doc.postingNumber) || null,
            // Gün farkını hesapla
            farkGun: Math.ceil(
                (new Date(doc.alisFaturaTarihi!).getTime() - new Date(doc.satisFaturaTarihi!).getTime())
                / (1000 * 60 * 60 * 24)
            )
        }));

        // İstatistikler
        const stats = {
            toplamKayit: documents.length,
            uyumsuzKayit: conflicts.length,
            uyumluKayit: documents.length - conflicts.length
        };

        return NextResponse.json({
            conflicts,
            stats,
            filter: { year, month }
        });
    } catch (error) {
        console.error("Date conflicts API error:", error);
        return NextResponse.json(
            { error: "Tarih uyumsuzlukları alınırken hata oluştu" },
            { status: 500 }
        );
    }
}
