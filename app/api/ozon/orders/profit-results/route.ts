import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET - Belirli ay için kayıtlı kar hesaplama sonuçlarını getir
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const year = parseInt(searchParams.get("year") || "0");
        const month = parseInt(searchParams.get("month") || "0");

        if (!year || !month) {
            return NextResponse.json({ error: "year ve month parametreleri gerekli" }, { status: 400 });
        }

        const result = await prisma.profitCalculationResult.findUnique({
            where: {
                year_month_userId: {
                    year,
                    month,
                    userId: session.user.id,
                },
            },
        });

        if (!result) {
            return NextResponse.json({ exists: false });
        }

        return NextResponse.json({
            exists: true,
            success: true,
            processed: result.processed,
            skippedNoPurchase: result.skippedNoPurchase,
            skippedReturn: result.skippedReturn,
            cancelled: result.cancelled,
            totalProfitTry: result.totalProfitTry,
            totalProfitUsd: result.totalProfitUsd,
            cancelledLossTry: result.cancelledLossTry,
            cancelledLossUsd: result.cancelledLossUsd,
            details: result.details,
            calculatedAt: result.updatedAt,
        });
    } catch (error: any) {
        console.error("[Profit Results] Hata:", error);
        return NextResponse.json(
            { error: error.message || "Veri çekme hatası" },
            { status: 500 }
        );
    }
}
