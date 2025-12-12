"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Tüm tracking kayıtlarını getir (batch sync için)
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const postingNumbers = searchParams.get("postingNumbers");

        if (!postingNumbers) {
            return NextResponse.json({ error: "Posting numbers required" }, { status: 400 });
        }

        const numbers = postingNumbers.split(",").map(n => n.trim()).filter(n => n);

        const trackings = await prisma.cancellationTracking.findMany({
            where: {
                postingNumber: { in: numbers }
            }
        });

        // Map by posting number for easy lookup
        const statusMap: Record<string, any> = {};
        trackings.forEach(t => {
            statusMap[t.postingNumber] = {
                status: t.status,
                notifiedAt: t.notifiedAt,
                confirmedAt: t.confirmedAt
            };
        });

        return NextResponse.json(statusMap);

    } catch (error: any) {
        console.error("Tracking Status Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
