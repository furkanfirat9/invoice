"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Satıcının kargo firmasına iptal bildirmesi
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only sellers can notify
        if (session.user.role !== "SELLER") {
            return NextResponse.json({ error: "Only sellers can notify carrier" }, { status: 403 });
        }

        const body = await request.json();
        const { postingNumber, productName, productImage, sku, quantity, cancelDate, cancelReason } = body;

        if (!postingNumber) {
            return NextResponse.json({ error: "Posting number is required" }, { status: 400 });
        }

        // Check if already exists
        const existing = await prisma.cancellationTracking.findUnique({
            where: { postingNumber }
        });

        if (existing) {
            // Already notified, check status
            if (existing.status !== "PENDING_NOTIFICATION") {
                return NextResponse.json({
                    error: "Already notified",
                    tracking: existing
                }, { status: 400 });
            }

            // Update to notified status
            const updated = await prisma.cancellationTracking.update({
                where: { postingNumber },
                data: {
                    status: "PENDING_WAREHOUSE",
                    notifiedAt: new Date(),
                    productName,
                    productImage,
                    sku,
                    quantity,
                    cancelReason,
                }
            });

            return NextResponse.json({
                success: true,
                message: "Carrier notified successfully",
                tracking: updated
            });
        }

        // Create new tracking record with notified status
        const tracking = await prisma.cancellationTracking.create({
            data: {
                postingNumber,
                sellerId: session.user.id,
                productName,
                productImage,
                sku,
                quantity: quantity || 1,
                cancelDate: cancelDate ? new Date(cancelDate) : null,
                cancelReason,
                status: "PENDING_WAREHOUSE",
                notifiedAt: new Date(),
            }
        });

        return NextResponse.json({
            success: true,
            message: "Carrier notified successfully",
            tracking
        });

    } catch (error: any) {
        console.error("Notify Carrier Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
