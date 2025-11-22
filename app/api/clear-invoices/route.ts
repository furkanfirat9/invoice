import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
    try {
        // Sadece fatura (Invoice) tablosundaki verileri siler.
        // Tablo yapısı, kullanıcılar veya diğer ayarlar KORUNUR.
        const deleteResult = await prisma.invoice.deleteMany({});

        return NextResponse.json({
            success: true,
            message: `Successfully deleted ${deleteResult.count} invoices.`,
            count: deleteResult.count
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
