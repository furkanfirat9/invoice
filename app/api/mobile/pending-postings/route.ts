import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

interface PendingPosting {
    posting_number: string;
    status: string;
}

// Sevkiyat bekleyen siparişleri çek (awaiting_deliver status)
async function fetchPendingPostings(
    clientId: string,
    apiKey: string
): Promise<string[]> {
    const allBarcodes: string[] = [];
    let offset = 0;
    const limit = 1000;
    let hasNext = true;
    let pageCount = 0;

    // Son 30 günü kontrol et
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const to = new Date();
    to.setHours(23, 59, 59, 999);

    while (hasNext) {
        try {
            const response = await fetch(`${OZON_API_BASE}/v3/posting/fbs/list`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Client-Id": clientId,
                    "Api-Key": apiKey,
                },
                body: JSON.stringify({
                    dir: "ASC",
                    filter: {
                        since: since.toISOString(),
                        to: to.toISOString(),
                        status: "awaiting_deliver", // Kargoya verilmeyi bekleyenler
                    },
                    limit: limit,
                    offset: offset,
                    with: {
                        analytics_data: false,
                        barcodes: false,
                        financial_data: false,
                        translit: false,
                    },
                }),
            });

            if (!response.ok) {
                console.error("Ozon API Error:", response.status, response.statusText);
                break;
            }

            const data = await response.json();
            const result = data?.result || {};
            const postings = Array.isArray(result.postings) ? result.postings : [];

            // Sadece posting_number (barkod) değerlerini al
            for (const posting of postings) {
                if (posting.posting_number) {
                    allBarcodes.push(posting.posting_number);
                }
            }

            hasNext = result.has_next === true;
            offset += postings.length || limit;
            pageCount++;

            // Sonsuz döngü koruması
            if (pageCount > 20) {
                console.warn("Sayfa limiti aşıldı");
                break;
            }
        } catch (error: any) {
            console.error("Ozon API Error:", error.message);
            break;
        }
    }

    return allBarcodes;
}

export async function GET(request: NextRequest) {
    try {
        // Kullanıcı ID'sini al (token'dan veya query'den)
        const searchParams = request.nextUrl.searchParams;
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json(
                { error: "userId gerekli" },
                { status: 400 }
            );
        }

        // Kullanıcının Ozon API bilgilerini al
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { ozonClientId: true, ozonApiKey: true, role: true },
        });

        // CARRIER kullanıcılar için tüm satıcıların bekleyen siparişlerini çek
        if (user?.role === "CARRIER") {
            // Tüm satıcıları bul
            const sellers = await prisma.user.findMany({
                where: {
                    role: "SELLER",
                    ozonClientId: { not: null },
                    ozonApiKey: { not: null },
                },
                select: { ozonClientId: true, ozonApiKey: true },
            });

            const allBarcodes: string[] = [];

            for (const seller of sellers) {
                if (seller.ozonClientId && seller.ozonApiKey) {
                    const barcodes = await fetchPendingPostings(
                        seller.ozonClientId,
                        seller.ozonApiKey
                    );
                    allBarcodes.push(...barcodes);
                }
            }

            // Tekrar edenleri kaldır
            const uniqueBarcodes = [...new Set(allBarcodes)];

            return NextResponse.json({
                success: true,
                barcodes: uniqueBarcodes,
                count: uniqueBarcodes.length,
            });
        }

        // SELLER için kendi siparişlerini çek
        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json(
                { error: "Ozon API anahtarları bulunamadı" },
                { status: 400 }
            );
        }

        const barcodes = await fetchPendingPostings(
            user.ozonClientId,
            user.ozonApiKey
        );

        return NextResponse.json({
            success: true,
            barcodes,
            count: barcodes.length,
        });
    } catch (error: any) {
        console.error("Pending Postings API Error:", error);
        return NextResponse.json(
            { error: "Sunucu hatası", details: error.message },
            { status: 500 }
        );
    }
}
