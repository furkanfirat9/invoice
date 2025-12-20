import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";

// Quick note update endpoint
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const body = await request.json();
        const { postingNumber, note } = body;

        if (!postingNumber) {
            return NextResponse.json({ error: "postingNumber gerekli" }, { status: 400 });
        }

        // Upsert document with note
        const document = await prisma.orderDocument.upsert({
            where: { postingNumber },
            update: {
                note: note || null,
                updatedAt: new Date(),
            },
            create: {
                postingNumber,
                userId: session.user.id,
                note: note || null,
            },
        });

        return NextResponse.json({ success: true, note: document.note });
    } catch (error: any) {
        console.error("Note update error:", error);
        return NextResponse.json(
            { error: error.message || "Not kaydedilemedi" },
            { status: 500 }
        );
    }
}
