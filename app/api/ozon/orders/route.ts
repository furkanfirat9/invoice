import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchAPI } from "@/lib/api";
import { getProductName } from "@/lib/product-mapping";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

interface OzonProduct {
    name: string;
    quantity: number;
    price: string;
    offer_id?: string;
    sku?: number;
    currency_code?: string;
}

interface OzonPosting {
    posting_number: string;
    order_id?: number;
    order_number?: string;
    status?: string;
    in_process_at?: string;
    shipment_date?: string;
    delivering_date?: string;
    products?: OzonProduct[];
    analytics_data?: {
        region: string;
        city: string;
        delivery_type: string;
    };
    financial_data?: {
        products?: Array<{
            commission_amount?: number;
            commission_percent?: number;
            payout?: number;
            price?: number;
            old_price?: number;
            total_discount_value?: number;
            total_discount_percent?: number;
            actions?: string[];
            picking?: any;
            quantity?: number;
            client_price?: string;
            product_id?: number;
            item_services?: any;
        }>;
        posting_services?: any;
    };
}

// Tek bir istek aralığı için (maks 3 ay) verileri çeken fonksiyon
async function fetchChunk(
    start: Date,
    end: Date,
    clientId: string,
    apiKey: string
): Promise<OzonPosting[]> {
    const allPostings: OzonPosting[] = [];
    let offset = 0;
    const limit = 1000;
    let hasNext = true;
    let pageCount = 0;

    console.log(`[Orders API] Veri çekiliyor: ${start.toISOString()} - ${end.toISOString()}`);

    while (hasNext) {
        try {
            const data = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/list`, {
                method: "POST",
                headers: {
                    "Client-Id": clientId,
                    "Api-Key": apiKey,
                },
                body: JSON.stringify({
                    dir: "ASC", // Eskiden yeniye
                    filter: {
                        since: start.toISOString(),
                        to: end.toISOString(),
                    },
                    limit: limit,
                    offset: offset,
                    with: {
                        analytics_data: true,
                        financial_data: true, // Komisyon bilgileri için
                    },
                }),
                retries: 3,
                retryDelay: 2000,
            });

            const result = data?.result || {};
            const postings = Array.isArray(result.postings) ? result.postings : [];

            allPostings.push(...postings);

            hasNext = result.has_next === true;
            offset += postings.length || limit;
            pageCount++;

            if (pageCount > 20) {
                console.warn("[Orders API] Sayfa limiti aşıldı");
                break;
            }
        } catch (error: any) {
            console.error("[Orders API] Chunk Error:", error.message);
            throw error;
        }
    }

    return allPostings;
}

// Status'u Türkçe'ye çevir
function getStatusLabel(status?: string): string {
    const statusMap: Record<string, string> = {
        'awaiting_registration': 'Kayıt Bekliyor',
        'acceptance_in_progress': 'Kabul Ediliyor',
        'awaiting_approve': 'Onay Bekliyor',
        'awaiting_packaging': 'Paketleme Bekliyor',
        'awaiting_deliver': 'Sevk Bekliyor',
        'arbitration': 'Anlaşmazlık',
        'client_arbitration': 'Müşteri Anlaşmazlığı',
        'delivering': 'Yolda',
        'driver_pickup': 'Kurye Alımı',
        'delivered': 'Teslim Edildi',
        'cancelled': 'İptal Edildi',
        'not_accepted': 'Kabul Edilmedi',
        'cancelled_from_split_pending': 'Bölünmeden İptal',
        'awaiting_packaging_expired': 'Paketleme Süresi Doldu',
        'awaiting_deliver_expired': 'Sevk Süresi Doldu',
        'awaiting_pass': 'Geçiş Bekliyor',
        'sent_by_seller': 'Satıcı Gönderdi',
    };
    return statusMap[status || ''] || status || 'Bilinmiyor';
}

// API response format for siparisler page
interface OrderResponse {
    id: string;
    orderDate: string;
    postingNumber: string;
    productCode: string;
    productName: string;
    purchasePrice: number | null;
    saleUsd: number;
    exchangeRate: number;
    shippingCost: number | null;
    profit: number | null;
    procurementStatus: string | null;
    procurementNote: string | null;
    supplierOrderNo: string | null;
    note: string | null;
    ozonStatus: string;
    ozonStatusLabel: string;
}

export async function GET(request: NextRequest) {
    try {
        // Oturum kontrolü
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Oturum açmanız gerekiyor" },
                { status: 401 }
            );
        }

        // Query parametreleri
        const searchParams = request.nextUrl.searchParams;
        const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

        // Kullanıcı bilgilerini ve Ozon API anahtarlarını veritabanından al
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { ozonClientId: true, ozonApiKey: true }
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json(
                { error: "Ozon API anahtarları bulunamadı. Lütfen ayarlardan ekleyiniz." },
                { status: 400 }
            );
        }

        // Ay başlangıç ve bitiş tarihlerini hesapla
        // Türkiye UTC+3 olduğu için, ayın 1'i gece 00:00 Türkiye saati = önceki gün 21:00 UTC
        const TURKEY_OFFSET_HOURS = 3;

        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        startDate.setUTCHours(startDate.getUTCHours() - TURKEY_OFFSET_HOURS); // 3 saat geri al

        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // Ayın son günü
        endDate.setUTCHours(endDate.getUTCHours() - TURKEY_OFFSET_HOURS); // 3 saat geri al

        console.log(`[Orders API] ${year} ${month}. ay verileri çekiliyor...`);
        console.log(`[Orders API] Tarih aralığı: ${startDate.toISOString()} - ${endDate.toISOString()}`);

        // Verileri çek
        const postings = await fetchChunk(
            startDate,
            endDate,
            user.ozonClientId,
            user.ozonApiKey
        );

        console.log(`[Orders API] ${postings.length} sipariş bulundu.`);

        // Verileri siparişler sayfası formatına dönüştür
        const orders: OrderResponse[] = postings.map((posting, index) => {
            const product = posting.products?.[0];
            const priceUsd = product?.price ? parseFloat(product.price) : 0;

            return {
                id: posting.posting_number || `order-${index}`,
                orderDate: posting.in_process_at || '',
                postingNumber: posting.posting_number || '',
                productCode: product?.offer_id || '',
                productName: getProductName(product?.offer_id), // Ürün mapping'den
                purchasePrice: null, // Manuel girilecek (TL)
                saleUsd: priceUsd,
                exchangeRate: 35.0, // Varsayılan kur (canlı olarak güncellenecek)
                shippingCost: 0, // Varsayılan 0 USD
                profit: null, // Hesaplanacak
                procurementStatus: null,
                procurementNote: null,
                supplierOrderNo: null,
                note: null,
                ozonStatus: posting.status || '',
                ozonStatusLabel: getStatusLabel(posting.status),
                deliveryDate: posting.delivering_date || null,
            };
        });

        return NextResponse.json({
            orders,
            meta: {
                year,
                month,
                totalCount: orders.length,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            }
        });

    } catch (error: any) {
        console.error("[Orders API] Error:", error);
        return NextResponse.json(
            { error: "Sunucu hatası", details: error.message },
            { status: 500 }
        );
    }
}
