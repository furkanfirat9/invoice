import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchAPI } from "@/lib/api";
import { getCbrUsdRub, getTcmbUsdTry, formatDateForCbr, formatDateForTcmb } from "@/lib/exchange-rates";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

// İşlem tipi çevirileri
const OPERATION_LABELS: Record<string, string> = {
    'OperationAgentDeliveredToCustomer': 'Müşteriye Teslimat',
    'OperationMarketplaceAgencyFeeAggregator3PLGlobal': 'Ozon Acentelik Ücreti',
    'MarketplaceRedistributionOfDeliveryServicesOperation': 'Uluslararası Nakliyat Hizmetleri',
    'MarketplaceRedistributionOfAcquiringOperation': 'Sanal POS Ücreti',
    'OperationMarketplaceServiceItemDelivToCustomer': 'Teslimat Hizmeti',
    'OperationMarketplaceServiceItemDirectFlowTrans': 'Doğrudan Akış Transferi',
    'OperationMarketplaceServiceItemDropoffPVZ': 'PVZ Teslimat',
    'OperationMarketplaceServiceItemFulfillment': 'Karşılama Hizmeti',
    'OperationMarketplaceServiceItemPickup': 'Teslim Alma',
    'OperationMarketplaceServicePremiumCashback': 'Premium Cashback',
    'OperationMarketplaceWithHoldingForUndeliverableGoods': 'Teslim Edilemeyen Ürün Kesintisi',
    'OperationMarketplaceServicePartialCompensationToClient': 'Kısmi Tazminat',
};

interface FinanceOperation {
    operation_id: number;
    operation_type: string;
    operation_type_name: string;
    operation_date: string;
    accruals_for_sale: number;
    sale_commission: number;
    amount: number;
    delivery_charge: number;
    return_delivery_charge: number;
    type: string;
    posting: {
        posting_number: string;
        order_date: string;
        delivery_schema: string;
        warehouse_id: number;
    };
    items: Array<{
        name: string;
        sku: number;
    }>;
}

interface FinanceResponse {
    postingNumber: string;
    orderDate: string;
    productName: string;
    deliveryDate: string | null; // Teslim tarihi (OperationAgentDeliveredToCustomer'dan)
    // Ana kalemler (sıralı)
    saleRevenue: number;           // accruals_for_sale - Satış Geliri
    saleCommission: number;        // sale_commission - Komisyon
    deliveryServices: number;      // MarketplaceRedistributionOfDeliveryServicesOperation
    agencyFee: number;             // OperationMarketplaceAgencyFeeAggregator3PLGlobal
    posFee: number;                // MarketplaceRedistributionOfAcquiringOperation - Sanal POS Ücreti
    // Diğer kalemler
    otherOperations: Array<{
        type: string;
        label: string;
        amount: number;
    }>;
    // Toplam
    totalAmount: number;
    currency: string;
    // Ödeme bilgileri
    payment: {
        calculationDate: string;    // RUB → USD çevrim tarihi (1 veya 16)
        paymentDate: string;        // Tahmini ödeme tarihi (~10 veya ~20)
        isPaid: boolean;            // Ödeme yapıldı mı?
        rubUsdRate: number | null;  // Hesaplama tarihindeki USD/RUB kuru
        usdTryRate: number | null;  // Ödeme tarihindeki USD/TRY kuru
        amountUsd: number | null;   // Net ödeme (USD)
        amountTry: number | null;   // Net ödeme (TL)
    };
}

// Finance API'den veri çekme fonksiyonu
async function fetchFinanceData(
    postingNumber: string,
    clientId: string,
    apiKey: string
): Promise<FinanceOperation[]> {
    try {
        const data = await fetchAPI(`${OZON_API_BASE}/v3/finance/transaction/list`, {
            method: "POST",
            headers: {
                "Client-Id": clientId,
                "Api-Key": apiKey,
            },
            body: JSON.stringify({
                filter: {
                    posting_number: postingNumber,
                    date: {
                        from: "2024-01-01T00:00:00.000Z",
                        to: "2026-12-31T23:59:59.999Z"
                    }
                },
                page: 1,
                page_size: 100
            }),
            retries: 2,
            retryDelay: 1000,
        });
        return data?.result?.operations || [];
    } catch (error) {
        console.error(`[Finance API] Error fetching ${postingNumber}:`, error);
        return [];
    }
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

        // Query parametresi
        const searchParams = request.nextUrl.searchParams;
        const postingNumber = searchParams.get("postingNumber");

        if (!postingNumber) {
            return NextResponse.json(
                { error: "postingNumber parametresi gerekli" },
                { status: 400 }
            );
        }

        // Kullanıcı bilgilerini ve Ozon API anahtarlarını veritabanından al
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { ozonClientId: true, ozonApiKey: true }
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json(
                { error: "Ozon API anahtarları bulunamadı" },
                { status: 400 }
            );
        }

        // -1 olmadan order_number'ı bul (POS ücreti için)
        // Örn: "55650822-0048-1" -> "55650822-0048"
        const orderNumber = postingNumber.replace(/-\d+$/, '');

        // Her iki sorguyu paralel olarak çalıştır
        const [mainOperations, posOperations] = await Promise.all([
            fetchFinanceData(postingNumber, user.ozonClientId, user.ozonApiKey),
            orderNumber !== postingNumber
                ? fetchFinanceData(orderNumber, user.ozonClientId, user.ozonApiKey)
                : Promise.resolve([])
        ]);

        // İşlemleri birleştir ve tekil yap (operation_id'ye göre)
        const allOperationsMap = new Map<number, FinanceOperation>();
        [...mainOperations, ...posOperations].forEach(op => {
            allOperationsMap.set(op.operation_id, op);
        });
        const operations = Array.from(allOperationsMap.values());

        if (operations.length === 0) {
            return NextResponse.json(
                { error: "Bu sipariş için finansal veri bulunamadı" },
                { status: 404 }
            );
        }

        // Verileri işle
        let saleRevenue = 0;
        let saleCommission = 0;
        let deliveryServices = 0;
        let agencyFee = 0;
        let posFee = 0;
        let totalAmount = 0;
        const otherOperations: FinanceResponse['otherOperations'] = [];
        let productName = '';
        let orderDate = '';
        let deliveryDate: string | null = null;

        for (const op of operations) {
            totalAmount += op.amount;

            // Ana satış işlemi
            if (op.operation_type === 'OperationAgentDeliveredToCustomer') {
                saleRevenue = op.accruals_for_sale;
                saleCommission = op.sale_commission;
                productName = op.items?.[0]?.name || '';
                orderDate = op.posting?.order_date || '';
                deliveryDate = op.operation_date || null; // Teslim tarihi
            }
            // Uluslararası Nakliyat Hizmetleri
            else if (op.operation_type === 'MarketplaceRedistributionOfDeliveryServicesOperation') {
                deliveryServices = op.amount;
            }
            // Ozon Acentelik Ücreti
            else if (op.operation_type === 'OperationMarketplaceAgencyFeeAggregator3PLGlobal') {
                agencyFee = op.amount;
            }
            // Sanal POS Ücreti
            else if (op.operation_type === 'MarketplaceRedistributionOfAcquiringOperation') {
                posFee = op.amount;
            }
            // Diğer işlemler
            else {
                otherOperations.push({
                    type: op.operation_type,
                    label: OPERATION_LABELS[op.operation_type] || op.operation_type_name,
                    amount: op.amount
                });
            }
        }

        // Ödeme bilgilerini hesapla
        let calculationDate = '';
        let paymentDate = '';
        let isPaid = false;
        let rubUsdRate: number | null = null;
        let usdTryRate: number | null = null;
        let amountUsd: number | null = null;
        let amountTry: number | null = null;

        if (deliveryDate) {
            const delivery = new Date(deliveryDate);
            const day = delivery.getDate();
            const month = delivery.getMonth();
            const year = delivery.getFullYear();

            // Tarih formatı için yardımcı fonksiyon (YYYY-MM-DD)
            const formatDate = (y: number, m: number, d: number) => {
                const mm = String(m + 1).padStart(2, '0');
                const dd = String(d).padStart(2, '0');
                return `${y}-${mm}-${dd}`;
            };

            if (day <= 15) {
                // 1-15 arası teslim → 16'sı hesaplama, ~20'si ödeme
                calculationDate = formatDate(year, month, 16);
                paymentDate = formatDate(year, month, 20);
            } else {
                // 16-ay sonu teslim → Sonraki ayın 1'i hesaplama, ~10'u ödeme
                const nextMonth = month + 1;
                const nextYear = nextMonth > 11 ? year + 1 : year;
                const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
                calculationDate = formatDate(nextYear, adjustedMonth, 1);
                paymentDate = formatDate(nextYear, adjustedMonth, 10);
            }

            // Ödeme yapıldı mı kontrol et (ödeme tarihi geçmiş mi?)
            const today = new Date();
            const paymentDateObj = new Date(paymentDate);
            isPaid = paymentDateObj < today;

            // Hesaplama tarihi geçmişse kurları çek
            const calculationDateObj = new Date(calculationDate);
            if (calculationDateObj < today && totalAmount !== 0) {
                // RUB/USD kurunu çek (CBR - hesaplama tarihindeki kur)
                try {
                    const cbrDate = formatDateForCbr(calculationDateObj);
                    rubUsdRate = await getCbrUsdRub(cbrDate);
                } catch (e) {
                    console.error("[Finance API] CBR rate fetch error:", e);
                    // CBR hata verirse önceki günleri dene
                    for (let i = 1; i <= 5; i++) {
                        try {
                            const prevDate = new Date(calculationDateObj);
                            prevDate.setDate(prevDate.getDate() - i);
                            const cbrDateRetry = formatDateForCbr(prevDate);
                            rubUsdRate = await getCbrUsdRub(cbrDateRetry);
                            break;
                        } catch (retryErr) {
                            // devam et
                        }
                    }
                }

                // USD/TRY kurunu çek (TCMB - ödeme tarihindeki kur)
                try {
                    const tcmbDate = formatDateForTcmb(paymentDateObj);
                    usdTryRate = await getTcmbUsdTry(tcmbDate);
                } catch (e) {
                    console.error("[Finance API] TCMB rate fetch error:", e);
                    // TCMB hata verirse önceki günleri dene (hafta sonu/tatil)
                    for (let i = 1; i <= 5; i++) {
                        try {
                            const prevDate = new Date(paymentDateObj);
                            prevDate.setDate(prevDate.getDate() - i);
                            const tcmbDateRetry = formatDateForTcmb(prevDate);
                            usdTryRate = await getTcmbUsdTry(tcmbDateRetry);
                            break;
                        } catch (retryErr) {
                            // devam et
                        }
                    }
                }

                // Tutarları hesapla
                if (rubUsdRate && rubUsdRate > 0) {
                    amountUsd = totalAmount / rubUsdRate;
                }
                if (usdTryRate && usdTryRate > 0 && amountUsd !== null) {
                    amountTry = amountUsd * usdTryRate;
                }
            }
        }

        const response: FinanceResponse = {
            postingNumber,
            orderDate,
            productName,
            deliveryDate,
            saleRevenue,
            saleCommission,
            deliveryServices,
            agencyFee,
            posFee,
            otherOperations,
            totalAmount,
            currency: 'RUB',
            payment: {
                calculationDate,
                paymentDate,
                isPaid,
                rubUsdRate,
                usdTryRate,
                amountUsd,
                amountTry
            }
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error("[Finance API] Error:", error);
        return NextResponse.json(
            { error: "Sunucu hatası", details: error.message },
            { status: 500 }
        );
    }
}
