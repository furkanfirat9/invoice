import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import { fetchAPI } from "@/lib/api";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const postingNumber = searchParams.get("postingNumber");

        if (!postingNumber || postingNumber.length < 3) {
            return NextResponse.json({ error: "En az 3 karakter girin" }, { status: 400 });
        }

        // Get user's Ozon API keys
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { ozonClientId: true, ozonApiKey: true },
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json({ error: "Ozon API keys not found" }, { status: 400 });
        }

        // Search by posting number using Ozon API
        const data = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/get`, {
            method: "POST",
            headers: {
                "Client-Id": user.ozonClientId,
                "Api-Key": user.ozonApiKey,
            },
            body: JSON.stringify({
                posting_number: postingNumber,
                with: {
                    analytics_data: true,
                    barcodes: false,
                    financial_data: false,
                    translit: false,
                },
            }),
            retries: 2,
            retryDelay: 1000,
        });

        if (data?.result) {
            return NextResponse.json({
                found: true,
                order: data.result
            });
        }

        return NextResponse.json({ found: false });
    } catch (error: any) {
        console.error("Search error:", error);
        // If exact match failed, return not found
        return NextResponse.json({ found: false });
    }
}
