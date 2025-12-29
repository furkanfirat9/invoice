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
    productImage: string | null;
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
    deliveryDate?: string | null;
    // Cache alanları
    cachedNetProfitUsd?: number | null;
    cachedNetProfitTry?: number | null;
    isCancelled?: boolean;
    profitCalculatedAt?: string | null;
}

// Ürün görsellerini çekmek için fonksiyon
// offer_id ile /v3/product/info/list'ten görselleri al
async function fetchProductImages(
    offerIds: string[],
    clientId: string,
    apiKey: string
): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();

    if (offerIds.length === 0) return imageMap;

    // Benzersiz offer_id'leri al
    const uniqueOfferIds = [...new Set(offerIds.filter(Boolean))];

    try {
        // offer_id ile ürün bilgilerini çek
        const infoData = await fetchAPI(`${OZON_API_BASE}/v3/product/info/list`, {
            method: "POST",
            headers: {
                "Client-Id": clientId,
                "Api-Key": apiKey,
            },
            body: JSON.stringify({
                offer_id: uniqueOfferIds,
            }),
            retries: 2,
            retryDelay: 1000,
        });

        console.log("[Orders API] Info API raw:", JSON.stringify(infoData).substring(0, 400));

        // API yanıtı genelde data.result.items olarak geliyor
        const items = infoData?.result?.items || infoData?.items || [];
        console.log("[Orders API] Info API yanıtı:", items.length, "ürün bulundu");

        // İlk ürünü debug için logla
        if (items.length > 0) {
            const first = items[0];
            console.log("[Orders API] İlk ürün debug:", {
                offer_id: first.offer_id,
                sku: first.sku,
                primary_image: first.primary_image,
                images_type: typeof first.images,
                images_length: Array.isArray(first.images) ? first.images.length : 'not array',
                images_0: Array.isArray(first.images) ? first.images[0] : 'N/A'
            });
        }

        for (const item of items) {
            // primary_image array veya string olabilir, images de array
            let imageUrl = '';

            if (Array.isArray(item.primary_image) && item.primary_image.length > 0) {
                imageUrl = item.primary_image[0];
            } else if (typeof item.primary_image === 'string') {
                imageUrl = item.primary_image;
            } else if (Array.isArray(item.images) && item.images.length > 0) {
                imageUrl = item.images[0];
            }

            // String olduğundan emin ol
            if (typeof imageUrl === 'string' && imageUrl) {
                // URL normalizasyonu
                if (imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                } else if (!imageUrl.startsWith('http')) {
                    imageUrl = 'https://' + imageUrl;
                }

                // Hem offer_id hem sku ile mapping yap (farklı key'ler ile eşleşme şansını artır)
                if (item.offer_id) {
                    imageMap.set(item.offer_id, imageUrl);
                }
                if (item.sku) {
                    imageMap.set(String(item.sku), imageUrl);
                }
            }
        }

        console.log("[Orders API] Toplam", imageMap.size, "görsel mapping oluşturuldu");
    } catch (error) {
        console.error("[Orders API] Ürün görselleri çekilemedi:", error);
    }

    return imageMap;
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

        // Veritabanındaki kayıtlı sipariş verilerini al
        const postingNumbers = postings.map(p => p.posting_number).filter(Boolean);
        const savedOrderData = await prisma.ozonOrderData.findMany({
            where: {
                postingNumber: { in: postingNumbers as string[] }
            }
        });

        // Hızlı erişim için map oluştur
        const savedDataMap = new Map(
            savedOrderData.map(data => [data.postingNumber, data])
        );

        // Ürün görsellerini çek (offer_id ile)
        const offerIds = postings.map(p => p.products?.[0]?.offer_id).filter(Boolean) as string[];

        console.log(`[Orders API] ${offerIds.length} ürün için görsel çekiliyor...`, offerIds.slice(0, 5));
        const productImages = await fetchProductImages(offerIds, user.ozonClientId, user.ozonApiKey);
        console.log(`[Orders API] ${productImages.size} görsel alındı`);

        // Verileri siparişler sayfası formatına dönüştür
        const orders: OrderResponse[] = postings.map((posting, index) => {
            const product = posting.products?.[0];
            const priceUsd = product?.price ? parseFloat(product.price) : 0;
            const savedData = savedDataMap.get(posting.posting_number);

            // Görsel için hem offer_id hem sku ile dene
            const productImage =
                productImages.get(product?.offer_id || '') ||
                productImages.get(String(product?.sku || '')) ||
                null;

            return {
                id: posting.posting_number || `order-${index}`,
                orderDate: posting.in_process_at || '',
                postingNumber: posting.posting_number || '',
                productCode: product?.offer_id || '',
                productName: getProductName(product?.offer_id), // Ürün mapping'den
                productImage, // Ozon'dan gelen görsel
                purchasePrice: savedData?.purchasePrice ?? null, // Veritabanından
                saleUsd: priceUsd,
                exchangeRate: 35.0, // Varsayılan kur (canlı olarak güncellenecek)
                shippingCost: 0, // Varsayılan 0 USD
                profit: null, // Hesaplanacak
                procurementStatus: null,
                procurementNote: savedData?.procurementNote ?? null, // Veritabanından
                supplierOrderNo: savedData?.supplierOrderNo ?? null, // Veritabanından
                note: savedData?.note ?? null, // Veritabanından
                ozonStatus: posting.status || '',
                ozonStatusLabel: getStatusLabel(posting.status),
                deliveryDate: posting.delivering_date || null,
                // Cache alanları
                cachedNetProfitUsd: savedData?.cachedNetProfitUsd ?? null,
                cachedNetProfitTry: savedData?.cachedNetProfitTry ?? null,
                isCancelled: savedData?.isCancelled ?? false,
                profitCalculatedAt: savedData?.profitCalculatedAt?.toISOString() ?? null,
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

// Manuel sipariş verilerini kaydetmek için POST metodu
export async function POST(request: NextRequest) {
    try {
        // Oturum kontrolü
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Oturum açmanız gerekiyor" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { postingNumber, purchasePrice, procurementNote, supplierOrderNo, note } = body;

        if (!postingNumber) {
            return NextResponse.json(
                { error: "Gönderi numarası gerekli" },
                { status: 400 }
            );
        }

        // Veritabanına kaydet (varsa güncelle, yoksa oluştur)
        const savedData = await prisma.ozonOrderData.upsert({
            where: { postingNumber },
            create: {
                postingNumber,
                purchasePrice: purchasePrice ?? null,
                procurementNote: procurementNote ?? null,
                supplierOrderNo: supplierOrderNo ?? null,
                note: note ?? null,
            },
            update: {
                ...(purchasePrice !== undefined && { purchasePrice }),
                ...(procurementNote !== undefined && { procurementNote }),
                ...(supplierOrderNo !== undefined && { supplierOrderNo }),
                ...(note !== undefined && { note }),
            },
        });

        return NextResponse.json({
            success: true,
            data: savedData,
        });

    } catch (error: any) {
        console.error("[Orders API] POST Error:", error);
        return NextResponse.json(
            { error: "Kaydetme hatası", details: error.message },
            { status: 500 }
        );
    }
}
