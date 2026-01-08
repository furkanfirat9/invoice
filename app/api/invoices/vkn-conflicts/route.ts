import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Standart VKN - Bu şirketin/satıcının VKN'si olmalı
// Not: Gerçek uygulamada bu kullanıcı bazlı veya ayarlardan alınabilir
const STANDART_VKN = "30073700460"; // Şirket VKN

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

        // Alış faturası olan ve VKN bilgisi bulunan tüm kayıtları getir
        const documents = await prisma.orderDocument.findMany({
            where: {
                userId: session.user.id,
                alisFaturaTarihi: {
                    gte: startDate,
                    lte: endDate
                },
                alisAliciVkn: { not: null }
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
                alisKdvHaricTutar: true,
                alisPdfUrl: true,
            },
            orderBy: {
                alisFaturaTarihi: "desc"
            }
        });

        // VKN uyumsuzluğu olanları filtrele (Alıcı VKN standart VKN değilse)
        const conflicts = documents.filter(doc => {
            if (!doc.alisAliciVkn) return false;
            // VKN'leri normalize et (boşlukları ve tire işaretlerini kaldır)
            const aliciVkn = doc.alisAliciVkn.replace(/[\s-]/g, '').trim();
            const standartVkn = STANDART_VKN.replace(/[\s-]/g, '').trim();
            return aliciVkn !== standartVkn;
        }).map(doc => ({
            postingNumber: doc.postingNumber,
            alisFaturaNo: doc.alisFaturaNo,
            alisFaturaTarihi: doc.alisFaturaTarihi?.toISOString() || null,
            alisSaticiUnvani: doc.alisSaticiUnvani,
            alisSaticiVkn: doc.alisSaticiVkn,
            alisAliciVkn: doc.alisAliciVkn,
            beklenenVkn: STANDART_VKN,
            alisUrunBilgisi: doc.alisUrunBilgisi,
            alisUrunAdedi: doc.alisUrunAdedi,
            alisKdvHaricTutar: doc.alisKdvHaricTutar,
            alisPdfUrl: doc.alisPdfUrl,
        }));

        // VKN'ye göre grupla
        const vknGroups: { [key: string]: number } = {};
        conflicts.forEach(conflict => {
            const vkn = conflict.alisAliciVkn || "Bilinmiyor";
            vknGroups[vkn] = (vknGroups[vkn] || 0) + 1;
        });

        // İstatistikler
        const stats = {
            toplamKayit: documents.length,
            uyumsuzKayit: conflicts.length,
            uyumluKayit: documents.length - conflicts.length,
            farklıVknSayisi: Object.keys(vknGroups).length,
            vknDagilimi: vknGroups
        };

        return NextResponse.json({
            conflicts,
            stats,
            standartVkn: STANDART_VKN,
            filter: { year, month }
        });
    } catch (error) {
        console.error("VKN conflicts API error:", error);
        return NextResponse.json(
            { error: "VKN uyumsuzlukları alınırken hata oluştu" },
            { status: 500 }
        );
    }
}
