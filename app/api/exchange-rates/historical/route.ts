import { NextRequest, NextResponse } from "next/server";
import {
    getCbrUsdRub,
    getTcmbUsdTry,
    getBothExchangeRates,
    formatDateForTcmb,
    formatDateForCbr
} from "@/lib/exchange-rates";

/**
 * GET /api/exchange-rates/historical
 * 
 * Query Parameters:
 * - date: DD.MM.YYYY formatında tarih (opsiyonel, yoksa bugün)
 * - source: "cbr" | "tcmb" | "both" (varsayılan: "both")
 * 
 * Örnek:
 * /api/exchange-rates/historical?date=16.12.2025&source=both
 */
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const date = searchParams.get("date") || undefined;
        const source = searchParams.get("source") || "both";

        let result: {
            success: boolean;
            date: string;
            usdTry?: number;
            usdRub?: number;
            source: string;
        };

        switch (source) {
            case "cbr": {
                // CBR formatı DD/MM/YYYY
                const cbrDate = date ? date.replace(/\./g, "/") : undefined;
                const usdRub = await getCbrUsdRub(cbrDate);
                result = {
                    success: true,
                    date: date || formatDateForTcmb(new Date()),
                    usdRub,
                    source: "CBR (Rusya Merkez Bankası)",
                };
                break;
            }

            case "tcmb": {
                const usdTry = await getTcmbUsdTry(date);
                result = {
                    success: true,
                    date: date || formatDateForTcmb(new Date()),
                    usdTry,
                    source: "TCMB (Türkiye Cumhuriyet Merkez Bankası)",
                };
                break;
            }

            case "both":
            default: {
                const rates = await getBothExchangeRates(date);
                result = {
                    success: true,
                    date: rates.date,
                    usdTry: rates.usdTry,
                    usdRub: rates.usdRub,
                    source: "CBR + TCMB",
                };
                break;
            }
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error("Exchange rate API hatası:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Bilinmeyen hata",
            },
            { status: 500 }
        );
    }
}
