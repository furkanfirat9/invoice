import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Her sipariş için hesaplanan kar detayı
interface ProfitDetail {
    postingNumber: string;
    productName?: string;
    ozonPaymentTry: number;
    ozonPaymentUsd: number;
    purchasePrice: number;
    netProfitTry: number;
    netProfitUsd: number;
    usdTryRate: number;
    isCancelled: boolean;
    isPendingPayment?: boolean; // Ödeme günü bekleniyor mu?
    // Tarihler
    orderDate?: string;      // Kargoya verilme tarihi (sipariş tarihi)
    deliveryDate?: string;   // Teslim tarihi
    calculationDate?: string; // Hesaplama tarihi
    paymentDate?: string;    // Tahmini ödeme tarihi
    isReturn?: boolean;      // İade mi?
    error?: string;
}


export async function POST(request: NextRequest) {
    try {
        // Oturum kontrolü
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
        }

        const { postingNumbers, year, month, liveUsdTryRate } = await request.json();

        if (!postingNumbers?.length) {
            return NextResponse.json({ error: "postingNumbers gerekli" }, { status: 400 });
        }

        if (!year || !month) {
            return NextResponse.json({ error: "year ve month gerekli" }, { status: 400 });
        }

        // Canlı kur yoksa 35 fallback
        const fallbackRate = liveUsdTryRate || 35;

        // Veritabanından mevcut sipariş verilerini al
        const existingData = await prisma.ozonOrderData.findMany({
            where: { postingNumber: { in: postingNumbers } },
        });
        const dataMap = new Map(existingData.map(d => [d.postingNumber, d]));

        const results: ProfitDetail[] = [];
        let processed = 0;
        let skippedNoPurchase = 0;
        let skippedReturn = 0;
        let cancelled = 0;
        let totalProfitTry = 0;
        let cancelledLossTry = 0;

        // Her sipariş için Finance API çağır (yan panel ile aynı)
        for (const postingNumber of postingNumbers) {
            try {
                const orderData = dataMap.get(postingNumber);

                // Alış fiyatı yoksa atla
                if (!orderData?.purchasePrice) {
                    skippedNoPurchase++;
                    results.push({
                        postingNumber,
                        ozonPaymentTry: 0,
                        ozonPaymentUsd: 0,
                        purchasePrice: 0,
                        netProfitTry: 0,
                        netProfitUsd: 0,
                        usdTryRate: 0,
                        isCancelled: false,
                        error: "Alış fiyatı girilmemiş"
                    });
                    continue;
                }

                // Finance API'yi çağır (yan panel ile aynı endpoint)
                const financeRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/ozon/finance?postingNumber=${postingNumber}`, {
                    headers: {
                        'Cookie': request.headers.get('cookie') || '',
                    },
                });

                if (!financeRes.ok) {
                    results.push({
                        postingNumber,
                        ozonPaymentTry: 0,
                        ozonPaymentUsd: 0,
                        purchasePrice: orderData.purchasePrice,
                        netProfitTry: 0,
                        netProfitUsd: 0,
                        usdTryRate: 0,
                        isCancelled: false,
                        error: "Finance API hatası"
                    });
                    continue;
                }


                const financeData = await financeRes.json();

                // İade/iptal kontrolü - ClientReturnAgentOperation varsa atla
                const hasReturn = financeData.otherOperations?.some((op: any) =>
                    op.type === 'ClientReturnAgentOperation'
                );

                if (hasReturn) {
                    skippedReturn++;

                    // Veritabanındaki eski karı sıfırla
                    await prisma.ozonOrderData.update({
                        where: { postingNumber },
                        data: {
                            cachedNetProfitTry: 0,
                            cachedNetProfitUsd: 0,
                            ozonPaymentTry: 0,
                            ozonPaymentUsd: 0,
                            profitCalculatedAt: new Date(),
                        },
                    });

                    results.push({
                        postingNumber,
                        ozonPaymentTry: financeData.payment?.amountTry || 0,
                        ozonPaymentUsd: financeData.payment?.amountUsd || 0,
                        purchasePrice: orderData.purchasePrice,
                        netProfitTry: 0,
                        netProfitUsd: 0,
                        usdTryRate: 0,
                        isCancelled: false,
                        isReturn: true,
                        error: "İade/İptal - hesaplamadan hariç"
                    });
                    continue;
                }

                // amountUsd ve amountTry değerlerini al
                const ozonPaymentUsd = financeData.payment?.amountUsd;
                const ozonPaymentTry = financeData.payment?.amountTry;
                const usdTryRate = financeData.payment?.usdTryRate;
                const isPaid = financeData.payment?.isPaid || false;

                // USD ödeme bilgisi yoksa atla (teslim edilmemiş olabilir)
                if (ozonPaymentUsd === null || ozonPaymentUsd === undefined) {
                    results.push({
                        postingNumber,
                        ozonPaymentTry: 0,
                        ozonPaymentUsd: 0,
                        purchasePrice: orderData.purchasePrice,
                        netProfitTry: 0,
                        netProfitUsd: 0,
                        usdTryRate: 0,
                        isCancelled: false,
                        isPendingPayment: false,
                        error: "Finansal veri henüz mevcut değil"
                    });
                    continue;
                }

                // Alış fiyatını USD'ye çevir (sipariş tarihindeki kurla)
                // financeData'dan sipariş tarihindeki USD/TRY kuruyla hesapla
                // Şimdilik alış fiyatı için ödeme tarihindeki veya canlı kuru kullan
                const purchasePriceForUsdCalc = orderData.purchasePrice;

                // Net kar USD hesapla (hemen - teslim sonrası)
                // USD Kar = Ozon Ödeme (USD) - (Alış TL / USD-TRY kur)
                // TCMB kuru varsa onu kullan, yoksa canlı kur (frontend'den gelen)
                const rateForPurchase = usdTryRate || fallbackRate;
                const purchasePriceUsd = purchasePriceForUsdCalc / rateForPurchase;
                const netProfitUsd = ozonPaymentUsd - purchasePriceUsd;

                // TL kar (sadece ödeme tarihi geçtiyse)
                let netProfitTry: number | null = null;
                const isPendingPayment = !isPaid;

                if (ozonPaymentTry !== null && ozonPaymentTry !== undefined) {
                    netProfitTry = ozonPaymentTry - orderData.purchasePrice;
                }

                // İptal kontrolü
                const isCancelled = orderData.isCancelled || false;

                // Veritabanına kaydet
                await prisma.ozonOrderData.update({
                    where: { postingNumber },
                    data: {
                        cachedNetProfitTry: netProfitTry,
                        cachedNetProfitUsd: netProfitUsd,
                        ozonPaymentTry: ozonPaymentTry || null,
                        ozonPaymentUsd,
                        isCancelled,
                        profitCalculatedAt: new Date(),
                    },
                });

                // Sonuç listesine ekle
                results.push({
                    postingNumber,
                    productName: financeData.productName || undefined,
                    ozonPaymentTry: ozonPaymentTry || 0,
                    ozonPaymentUsd,
                    purchasePrice: orderData.purchasePrice,
                    netProfitTry: netProfitTry || 0,
                    netProfitUsd,
                    usdTryRate: usdTryRate || 0,
                    isCancelled,
                    isPendingPayment,
                    // Tarihler (Finance API'den)
                    orderDate: financeData.orderDate || undefined,
                    deliveryDate: financeData.deliveryDate || undefined,
                    calculationDate: financeData.payment?.calculationDate || undefined,
                    paymentDate: financeData.payment?.paymentDate || undefined,
                });

                processed++;

                if (isCancelled) {
                    cancelled++;
                    cancelledLossTry += netProfitTry || 0;
                } else {
                    totalProfitTry += netProfitTry || 0;
                }

                // Rate limiting - her istektan sonra kısa bekle
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (err: any) {
                console.error(`[Calculate Profit] ${postingNumber} hata:`, err.message);
                results.push({
                    postingNumber,
                    ozonPaymentTry: 0,
                    ozonPaymentUsd: 0,
                    purchasePrice: 0,
                    netProfitTry: 0,
                    netProfitUsd: 0,
                    usdTryRate: 0,
                    isCancelled: false,
                    error: err.message
                });
            }
        }

        // Sonuçları sipariş tarihine göre sırala (eskiden yeniye)
        const sortedResults = results
            .filter(r => !r.error)
            .sort((a, b) => {
                const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
                const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
                return dateA - dateB;
            });

        // Ödeme günü beklenen sipariş sayısı
        const pendingPaymentCount = results.filter(r => r.isPendingPayment && !r.error).length;

        // USD kar toplamını doğrudan netProfitUsd'dan hesapla (iptal hariç)
        const totalProfitUsd = sortedResults
            .filter(r => !r.isCancelled)
            .reduce((sum, r) => sum + r.netProfitUsd, 0);

        const cancelledLossUsd = sortedResults
            .filter(r => r.isCancelled)
            .reduce((sum, r) => sum + r.netProfitUsd, 0);

        // Sonuçları veritabanına kaydet (upsert - varsa güncelle, yoksa oluştur)
        await prisma.profitCalculationResult.upsert({
            where: {
                year_month_userId: {
                    year,
                    month,
                    userId: session.user.id,
                },
            },
            create: {
                year,
                month,
                userId: session.user.id,
                processed,
                skippedNoPurchase,
                skippedReturn,
                cancelled,
                totalProfitTry,
                totalProfitUsd,
                cancelledLossTry,
                cancelledLossUsd,
                details: sortedResults as any,
            },
            update: {
                processed,
                skippedNoPurchase,
                skippedReturn,
                cancelled,
                totalProfitTry,
                totalProfitUsd,
                cancelledLossTry,
                cancelledLossUsd,
                details: sortedResults as any,
            },
        });

        return NextResponse.json({
            success: true,
            processed,
            skippedNoPurchase,
            skippedReturn,
            cancelled,
            pendingPaymentCount,
            totalProfitTry,
            totalProfitUsd,
            cancelledLossTry,
            cancelledLossUsd,
            // Detaylı sonuç listesi
            details: sortedResults,
            errors: results.filter(r => r.error),
        });

    } catch (error: any) {
        console.error("[Calculate Profit] Hata:", error);
        return NextResponse.json(
            { error: error.message || "Hesaplama hatası" },
            { status: 500 }
        );
    }
}
