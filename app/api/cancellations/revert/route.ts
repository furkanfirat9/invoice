"use server";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Bildirim/onay geri alma işlemi
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { postingNumber, action } = body;

        if (!postingNumber || !action) {
            return NextResponse.json({ error: "Posting number and action are required" }, { status: 400 });
        }

        // Find the tracking record
        const tracking = await prisma.cancellationTracking.findUnique({
            where: { postingNumber }
        });

        if (!tracking) {
            return NextResponse.json({ error: "Tracking record not found" }, { status: 404 });
        }

        // Action: "revert-notification" - Satıcı bildirimi geri alıyor
        if (action === "revert-notification") {
            // Only sellers can revert their own notifications
            if (session.user.role !== "SELLER") {
                return NextResponse.json({ error: "Only sellers can revert notifications" }, { status: 403 });
            }

            // Check if seller owns this tracking
            if (tracking.sellerId !== session.user.id) {
                return NextResponse.json({ error: "You can only revert your own notifications" }, { status: 403 });
            }

            // Can only revert if status is PENDING_WAREHOUSE (not yet confirmed by carrier)
            if (tracking.status !== "PENDING_WAREHOUSE") {
                return NextResponse.json({
                    error: tracking.status === "IN_WAREHOUSE"
                        ? "Kargo firması zaten onaylamış, geri alamazsınız"
                        : "Bu bildirim henüz gönderilmemiş"
                }, { status: 400 });
            }

            // Revert to PENDING_NOTIFICATION
            const updated = await prisma.cancellationTracking.update({
                where: { postingNumber },
                data: {
                    status: "PENDING_NOTIFICATION",
                    notifiedAt: null,
                }
            });

            return NextResponse.json({
                success: true,
                message: "Bildirim geri alındı",
                tracking: updated
            });
        }

        // Action: "revert-confirmation" - Kargo onayı geri alıyor
        if (action === "revert-confirmation") {
            // Only carriers can revert confirmations
            if (session.user.role !== "CARRIER") {
                return NextResponse.json({ error: "Only carriers can revert confirmations" }, { status: 403 });
            }

            // Can only revert if status is IN_WAREHOUSE
            if (tracking.status !== "IN_WAREHOUSE") {
                return NextResponse.json({
                    error: "Bu sipariş henüz onaylanmamış"
                }, { status: 400 });
            }

            // Revert to PENDING_WAREHOUSE
            const updated = await prisma.cancellationTracking.update({
                where: { postingNumber },
                data: {
                    status: "PENDING_WAREHOUSE",
                    confirmedAt: null,
                }
            });

            return NextResponse.json({
                success: true,
                message: "Onay geri alındı",
                tracking: updated
            });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error: any) {
        console.error("Revert Action Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
