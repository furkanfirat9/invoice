"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Kargo firmasının göreceği iptaller (sadece bildirilmiş olanlar)
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only carriers can see
        if (session.user.role !== "CARRIER") {
            return NextResponse.json({ error: "Only carriers can access this endpoint" }, { status: 403 });
        }

        // Get all cancellations that have been notified to carrier
        // (status is PENDING_WAREHOUSE or IN_WAREHOUSE)
        const cancellations = await prisma.cancellationTracking.findMany({
            where: {
                status: {
                    in: ["PENDING_WAREHOUSE", "IN_WAREHOUSE"]
                }
            },
            orderBy: {
                notifiedAt: "desc"
            }
        });

        // Get seller info for each cancellation
        const sellerIds = [...new Set(cancellations.map(c => c.sellerId))];
        const sellers = await prisma.user.findMany({
            where: { id: { in: sellerIds } },
            select: { id: true, storeName: true }
        });

        const sellerMap = new Map(sellers.map(s => [s.id, s]));

        const result = cancellations.map(c => ({
            id: c.id,
            postingNumber: c.postingNumber,
            productName: c.productName,
            productImage: c.productImage,
            sku: c.sku,
            quantity: c.quantity,
            cancelDate: c.cancelDate,
            cancelReason: c.cancelReason,
            status: c.status,
            notifiedAt: c.notifiedAt,
            confirmedAt: c.confirmedAt,
            seller: sellerMap.get(c.sellerId) || null
        }));

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("Carrier Cancellations Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
