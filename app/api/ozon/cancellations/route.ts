import { NextRequest, NextResponse } from "next/server";
import { fetchAPI } from "@/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

// Allowed providers
const ALLOWED_PROVIDERS = ["SPEGAT Express TR", "Spegat Economy TR"];
// Start date filter
const FILTER_START_DATE = new Date("2025-11-18T00:00:00Z");

// Turkish translations for cancel reasons (by ID)
const CANCEL_REASON_TR: Record<number, string> = {
    667: "Sipariş teslimat sırasında kayboldu",
    504: "Müşteri siparişi iptal etti",
    79: "Müşteri teslimatta reddetti: ürün uymadı",
    686: "Siparişi zamanında göndermediniz",
    505: "Müşteri iptal: teslimat süresi uygun değil",
    506: "Müşteri iptal: daha ucuz buldu",
    672: "Teslimat hizmetine kayıt yapılamadı",
    678: "Taşıyıcı gereksinimlerini karşılamıyor",
    984: "Müşteri reddetti: ürün kalitesinden memnun değil",
    512: "Sipariş teslim edilemedi",
    501: "Müşteri iptal: teslimat tarihi ertelendi",
    685: "Müşteri sizin isteğinizle iptal etti",
    402: "Satıcı siparişi iptal etti",
    808: "Müşteri iptal talebinde bulundu",
    537: "Müşteri siparişi almadı",
    586: "Müşteri reddetti: yanlış ürün gönderildi",
    680: "Siparişte taşınması yasak ürünler var",
};

// Turkish translations for cancellation initiators
const CANCEL_INITIATOR_TR: Record<string, string> = {
    "Клиент": "Müşteri",
    "Сторонняя служба доставки": "Kargo Firması",
    "Продавец": "Satıcı",
    "Ozon": "Ozon",
};

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get credentials
        let targetUserId = session.user.id;
        const searchParams = request.nextUrl.searchParams;
        const sellerId = searchParams.get("sellerId");

        if (session.user.role === "CARRIER") {
            if (sellerId) targetUserId = sellerId;
            else return NextResponse.json([]);
        }

        const user = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { ozonClientId: true, ozonApiKey: true }
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json(
                { error: "Ozon API credentials not found" },
                { status: 400 }
            );
        }

        // Fetch cancellations
        // We fetch ALL cancelled orders since the start date
        // Then filter by provider in memory
        const toDate = new Date();

        // Check if we need to chunk requests (Ozon limit is 3 months usually, Nov 18 to Dec 12 is < 1 month)
        // So single request is fine generally, but strict implementation like fbs-postings uses chunks.
        // I'll implement a simple single fetch first as the period is short.

        // Ozon typically paginates.
        const allPostings = [];
        let offset = 0;
        const limit = 1000; // Max limit
        let hasNext = true;

        while (hasNext) {
            const response: any = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/list`, {
                method: "POST",
                headers: {
                    "Client-Id": user.ozonClientId,
                    "Api-Key": user.ozonApiKey,
                },
                body: JSON.stringify({
                    dir: "DESC",
                    filter: {
                        since: FILTER_START_DATE.toISOString(),
                        to: toDate.toISOString(),
                        status: "cancelled"
                    },
                    limit: limit,
                    offset: offset,
                    with: {
                        analytics_data: true,
                        barcodes: false,
                        financial_data: false,
                        translit: false
                    }
                })
            });

            const result = response?.result;
            if (!result) break;

            const postings = result.postings || [];
            allPostings.push(...postings);

            hasNext = result.has_next;
            offset += postings.length;

            // Safety break
            if (allPostings.length > 5000) break;
        }

        // Filter by provider AND delivering_date (only orders that were actually shipped and in delivery)
        // delivering_date indicates the order was physically shipped and reached delivery stage
        const filteredPostings = allPostings.filter((posting: any) => {
            const provider = posting.analytics_data?.tpl_provider;
            const hasDeliveringDate = posting.delivering_date !== null && posting.delivering_date !== undefined;
            return ALLOWED_PROVIDERS.includes(provider) && hasDeliveringDate;
        });

        // Fetch cancellation dates from rfbs returns endpoint
        // This endpoint has the actual cancel date (created_at field)
        const cancelDateMap: Record<string, string> = {};

        for (const posting of filteredPostings) {
            try {
                const rfbsResponse: any = await fetchAPI(`${OZON_API_BASE}/v2/returns/rfbs/list`, {
                    method: "POST",
                    headers: {
                        "Client-Id": user.ozonClientId,
                        "Api-Key": user.ozonApiKey,
                    },
                    body: JSON.stringify({
                        filter: {
                            posting_number: posting.posting_number
                        },
                        limit: 1,
                        offset: 0
                    }),
                    retries: 1,
                    retryDelay: 500
                });

                if (rfbsResponse?.returns?.[0]?.created_at) {
                    cancelDateMap[posting.posting_number] = rfbsResponse.returns[0].created_at;
                }
            } catch (err) {
                // If rfbs lookup fails, we'll use fallback date
                console.warn(`Failed to get cancel date for ${posting.posting_number}`);
            }
        }

        // Fetch product images for each posting
        const productImageMap: Record<string, string> = {};
        const offerIds = filteredPostings
            .map((p: any) => p.products?.[0]?.offer_id)
            .filter((id: string) => id);

        if (offerIds.length > 0) {
            try {
                const productResponse: any = await fetchAPI(`${OZON_API_BASE}/v3/product/info/list`, {
                    method: "POST",
                    headers: {
                        "Client-Id": user.ozonClientId,
                        "Api-Key": user.ozonApiKey,
                    },
                    body: JSON.stringify({
                        offer_id: offerIds
                    }),
                    retries: 1,
                    retryDelay: 500
                });

                if (productResponse?.items) {
                    productResponse.items.forEach((item: any) => {
                        const image = item.primary_image?.[0] || item.images?.[0];
                        if (image && item.offer_id) {
                            productImageMap[item.offer_id] = image;
                        }
                    });
                }
            } catch (err) {
                console.warn("Failed to fetch product images");
            }
        }

        // Transform postings to include Turkish translations, cancellation date, and product image
        const transformedPostings = filteredPostings.map((posting: any) => {
            const cancelReasonId = posting.cancellation?.cancel_reason_id;
            const cancelInitiator = posting.cancellation?.cancellation_initiator;
            const offerId = posting.products?.[0]?.offer_id;

            return {
                ...posting,
                cancel_date: cancelDateMap[posting.posting_number] || posting.delivering_date || posting.in_process_at,
                product_image: productImageMap[offerId] || null,
                cancellation: {
                    ...posting.cancellation,
                    cancel_reason_tr: CANCEL_REASON_TR[cancelReasonId] || posting.cancellation?.cancel_reason || "Bilinmeyen neden",
                    cancellation_initiator_tr: CANCEL_INITIATOR_TR[cancelInitiator] || cancelInitiator || "Bilinmiyor",
                }
            };
        });

        return NextResponse.json(transformedPostings);

    } catch (error: any) {
        console.error("Cancellations API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
