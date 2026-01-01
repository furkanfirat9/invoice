import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ödeme tahminleri için API
// Teslim tarihine göre siparişleri gruplar ve toplam ödeme tutarlarını hesaplar

export async function GET(request: NextRequest) {
    try {
        // Oturum kontrolü
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
        }

        // Bugünün tarihini al
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Ödeme dönemleri hesapla - MEVCUT AY içinde yapılacak ödemeler
        // Kart 1: 1'i ödemesi (ÖNCEKI ayın 16-ay sonu teslimleri)
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        const payment1stStart = new Date(prevYear, prevMonth, 16, 0, 0, 0);
        const payment1stEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59); // Önceki ayın son günü
        const payment1stDate = new Date(currentYear, currentMonth, 1);

        // Kart 2: 16'sı ödemesi (MEVCUT ayın 1-15 arası teslimleri)
        const payment16thStart = new Date(currentYear, currentMonth, 1, 0, 0, 0);
        const payment16thEnd = new Date(currentYear, currentMonth, 15, 23, 59, 59);
        const payment16thDate = new Date(currentYear, currentMonth, 16);

        // Veritabanından teslim tarihine göre siparişleri çek
        // Payment 16th: 1-15 arası teslimleri
        const orders16th = await prisma.ozonOrderData.findMany({
            where: {
                deliveryDate: {
                    gte: payment16thStart,
                    lte: payment16thEnd,
                },
                isCancelled: false,
                ozonPaymentUsd: { not: null },
            },
            select: {
                postingNumber: true,
                ozonPaymentRub: true,
                ozonPaymentUsd: true,
                deliveryDate: true,
            },
        });

        // Payment 1st: 16-ay sonu teslimleri
        const orders1st = await prisma.ozonOrderData.findMany({
            where: {
                deliveryDate: {
                    gte: payment1stStart,
                    lte: payment1stEnd,
                },
                isCancelled: false,
                ozonPaymentUsd: { not: null },
            },
            select: {
                postingNumber: true,
                ozonPaymentRub: true,
                ozonPaymentUsd: true,
                deliveryDate: true,
            },
        });

        // Toplam ödemeleri hesapla
        const payment16thTotalUsd = orders16th.reduce((sum, o) => sum + (o.ozonPaymentUsd || 0), 0);
        const payment16thTotalRub = orders16th.reduce((sum, o) => sum + (o.ozonPaymentRub || 0), 0);
        const payment1stTotalUsd = orders1st.reduce((sum, o) => sum + (o.ozonPaymentUsd || 0), 0);
        const payment1stTotalRub = orders1st.reduce((sum, o) => sum + (o.ozonPaymentRub || 0), 0);

        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

        return NextResponse.json({
            success: true,
            today: today.toISOString(),
            // Kart 1: Bu ayın 1'i ödemesi (geçen ayın 16-31 teslimleri)
            payment1st: {
                label: `1 ${monthNames[currentMonth]}`,
                periodLabel: `16-${payment1stEnd.getDate()} ${monthNames[prevMonth]} teslimleri`,
                start: payment1stStart.toISOString(),
                end: payment1stEnd.toISOString(),
                paymentDate: payment1stDate.toISOString(),
                isPast: currentDay >= 1, // 1'i geçtiyse ödeme yapılmış
                orderCount: orders1st.length,
                totalUsd: payment1stTotalUsd,
                totalRub: payment1stTotalRub,
            },
            // Kart 2: Bu ayın 16'sı ödemesi (bu ayın 1-15 teslimleri)
            payment16th: {
                label: `16 ${monthNames[currentMonth]}`,
                periodLabel: `1-15 ${monthNames[currentMonth]} teslimleri`,
                start: payment16thStart.toISOString(),
                end: payment16thEnd.toISOString(),
                paymentDate: payment16thDate.toISOString(),
                isPast: currentDay > 15,
                orderCount: orders16th.length,
                totalUsd: payment16thTotalUsd,
                totalRub: payment16thTotalRub,
            },
        });

    } catch (error: any) {
        console.error("[Payment Forecast API] Hata:", error);
        return NextResponse.json(
            { error: error.message || "Hesaplama hatası" },
            { status: 500 }
        );
    }
}
