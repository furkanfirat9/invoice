"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Kargo firmasının ürünün depoda olduğunu onaylaması
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only carriers can confirm
        if (session.user.role !== "CARRIER") {
            return NextResponse.json({ error: "Only carriers can confirm warehouse" }, { status: 403 });
        }

        const body = await request.json();
        const { postingNumber } = body;

        if (!postingNumber) {
            return NextResponse.json({ error: "Posting number is required" }, { status: 400 });
        }

        // Find the tracking record
        const tracking = await prisma.cancellationTracking.findUnique({
            where: { postingNumber }
        });

        if (!tracking) {
            return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
        }

        if (tracking.status === "IN_WAREHOUSE") {
            return NextResponse.json({
                error: "Already confirmed",
                tracking
            }, { status: 400 });
        }

        if (tracking.status === "PENDING_NOTIFICATION") {
            return NextResponse.json({
                error: "Seller has not notified carrier yet"
            }, { status: 400 });
        }

        // Update to confirmed status
        const updated = await prisma.cancellationTracking.update({
            where: { postingNumber },
            data: {
                status: "IN_WAREHOUSE",
                confirmedAt: new Date(),
            }
        });

        return NextResponse.json({
            success: true,
            message: "Warehouse confirmed successfully",
            tracking: updated
        });

    } catch (error: any) {
        console.error("Confirm Warehouse Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
