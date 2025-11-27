import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { postingNumbers } = body;

        if (!Array.isArray(postingNumbers) || postingNumbers.length === 0) {
            return NextResponse.json({ invoices: [] });
        }

        // Veritabanından toplu sorgula
        // postingNumber listesindeki herhangi biriyle eşleşen faturaları getir
        const invoices = await prisma.invoice.findMany({
            where: {
                postingNumber: {
                    in: postingNumbers,
                },
            },
        });

        return NextResponse.json({ invoices });
    } catch (error: any) {
        console.error("Bulk invoice check error:", error);
        return NextResponse.json(
            { error: "Faturalar kontrol edilemedi", details: error.message },
            { status: 500 }
        );
    }
}
