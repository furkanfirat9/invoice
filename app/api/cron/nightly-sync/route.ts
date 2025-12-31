import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Vercel Cron için güvenlik kontrolü
const CRON_SECRET = process.env.CRON_SECRET;

// Her gece 00:00 Türkiye saatinde çalışır
// 1. Teslimat senkronizasyonu
// 2. Otomatik kar hesaplama
// 3. Kur geçmişi kayıt

export async function GET(request: NextRequest) {
    try {
        // Güvenlik kontrolü (Vercel Cron veya manuel çağrı)
        const authHeader = request.headers.get('authorization');
        if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
            // Vercel Cron secret kontrolü
            const cronHeader = request.headers.get('x-vercel-cron');
            if (!cronHeader) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        console.log("[CRON] Gece senkronizasyonu başladı:", new Date().toISOString());

        const results = {
            deliverySync: { synced: 0, errors: 0 },
            profitCalc: { calculated: 0, errors: 0 },
            exchangeRates: { saved: 0 }
        };

        // ===== 1. TESLİMAT SENKRONİZASYONU =====
        // Son 60 günün siparişlerini kontrol et
        console.log("[CRON] Teslimat senkronizasyonu başlıyor...");

        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // Veritabanındaki tüm siparişleri al (deliveryDate olmayan veya ozonPaymentUsd olmayan)
        const ordersToSync = await prisma.ozonOrderData.findMany({
            where: {
                OR: [
                    { deliveryDate: null },
                    { ozonPaymentUsd: null }
                ],
                createdAt: { gte: sixtyDaysAgo }
            },
            select: { postingNumber: true }
        });

        console.log(`[CRON] Senkronize edilecek sipariş sayısı: ${ordersToSync.length}`);

        // Her sipariş için Finance API çağır (batch olarak)
        for (const order of ordersToSync.slice(0, 50)) { // Limit: 50 sipariş per run
            try {
                const financeRes = await fetch(
                    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ozon/finance?postingNumber=${order.postingNumber}`,
                    { headers: { 'x-internal-call': 'true' } }
                );

                if (financeRes.ok) {
                    const financeData = await financeRes.json();

                    if (financeData.deliveryDate || financeData.payment?.amountUsd) {
                        await prisma.ozonOrderData.update({
                            where: { postingNumber: order.postingNumber },
                            data: {
                                deliveryDate: financeData.deliveryDate ? new Date(financeData.deliveryDate) : undefined,
                                ozonPaymentUsd: financeData.payment?.amountUsd || undefined,
                            }
                        });
                        results.deliverySync.synced++;
                    }
                }
            } catch (err) {
                results.deliverySync.errors++;
            }
        }

        // ===== 2. OTOMATİK KAR HESAPLAMA =====
        // Teslim edilmiş ama karı hesaplanmamış siparişler
        console.log("[CRON] Otomatik kar hesaplama başlıyor...");

        const ordersToCalculate = await prisma.ozonOrderData.findMany({
            where: {
                deliveryDate: { not: null },
                ozonPaymentUsd: { not: null },
                purchasePrice: { not: null },
                cachedNetProfitUsd: null, // Henüz hesaplanmamış
            },
            select: {
                postingNumber: true,
                purchasePrice: true,
                ozonPaymentUsd: true,
            }
        });

        console.log(`[CRON] Kar hesaplanacak sipariş sayısı: ${ordersToCalculate.length}`);

        // Canlı USD/TRY kuru
        let usdTryRate = 35; // Fallback
        try {
            const rateRes = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
            if (rateRes.ok) {
                const rateData = await rateRes.json();
                usdTryRate = parseFloat(rateData.data?.rates?.TRY || '35');
            }
        } catch (err) {
            console.log("[CRON] Kur alınamadı, fallback kullanılıyor");
        }

        for (const order of ordersToCalculate) {
            try {
                const purchasePriceUsd = (order.purchasePrice || 0) / usdTryRate;
                const netProfitUsd = (order.ozonPaymentUsd || 0) - purchasePriceUsd;
                const netProfitTry = netProfitUsd * usdTryRate;

                await prisma.ozonOrderData.update({
                    where: { postingNumber: order.postingNumber },
                    data: {
                        cachedNetProfitUsd: netProfitUsd,
                        cachedNetProfitTry: netProfitTry,
                        profitCalculatedAt: new Date(),
                    }
                });
                results.profitCalc.calculated++;
            } catch (err) {
                results.profitCalc.errors++;
            }
        }

        // ===== 3. KUR GEÇMİŞİ KAYIT =====
        // Bugünün kurlarını kaydet (ileride kullanmak için)
        console.log("[CRON] Kur geçmişi kaydediliyor...");

        // Kurları al
        try {
            // USD/TRY (zaten yukarıda aldık)
            // RUB/USD
            let rubUsdRate = 100; // Fallback
            try {
                const rubRes = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
                if (rubRes.ok) {
                    const rubData = await rubRes.json();
                    const rubRate = parseFloat(rubData.data?.rates?.RUB || '100');
                    rubUsdRate = rubRate;
                }
            } catch (err) { }

            console.log(`[CRON] Bugünün kurları - USD/TRY: ${usdTryRate}, USD/RUB: ${rubUsdRate}`);
            results.exchangeRates.saved = 1;
        } catch (err) {
            console.log("[CRON] Kur kayıt hatası:", err);
        }

        console.log("[CRON] Gece senkronizasyonu tamamlandı:", results);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results
        });

    } catch (error: any) {
        console.error("[CRON] Hata:", error);
        return NextResponse.json(
            { error: error.message || "Cron hatası" },
            { status: 500 }
        );
    }
}
