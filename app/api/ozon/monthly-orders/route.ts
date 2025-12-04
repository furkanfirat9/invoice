import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isElif } from "@/lib/auth-utils";
import { fetchAPI } from "@/lib/api";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

interface OzonPosting {
    posting_number: string;
    order_id?: number;
    order_number?: string;
    status?: string;
    in_process_at?: string;
    shipment_date?: string;
    products?: Array<{
        name: string;
        quantity: number;
        price: string;
        offer_id?: string;
        sku?: number;
        currency_code?: string;
    }>;
    analytics_data?: {
        region: string;
        city: string;
        delivery_type: string;
    };
    customer?: {
        name?: string;
        phone?: string;
        email?: string;
    };
}

// Helper function to get month date range
function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
}

// Fetch postings for a single page
async function fetchPostingsPage(
    start: Date,
    end: Date,
    offset: number,
    limit: number,
    clientId: string,
    apiKey: string
): Promise<{ postings: OzonPosting[]; hasNext: boolean }> {
    const data = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/list`, {
        method: "POST",
        headers: {
            "Client-Id": clientId,
            "Api-Key": apiKey,
        },
        body: JSON.stringify({
            dir: "DESC",
            filter: {
                since: start.toISOString(),
                to: end.toISOString(),
            },
            limit,
            offset,
            with: {
                analytics_data: true,
                barcodes: false,
                financial_data: false,
                translit: false,
            },
        }),
        retries: 3,
        retryDelay: 2000,
    });

    const result = data?.result || {};
    const postings = Array.isArray(result.postings) ? result.postings : [];
    const hasNext = result.has_next === true;

    return { postings, hasNext };
}

// Fetch all postings for a month (for stats calculation)
async function fetchAllPostingsForMonth(
    start: Date,
    end: Date,
    clientId: string,
    apiKey: string
): Promise<OzonPosting[]> {
    const allPostings: OzonPosting[] = [];
    let offset = 0;
    const limit = 1000;
    let hasNext = true;
    let pageCount = 0;

    while (hasNext && pageCount < 50) {
        const result = await fetchPostingsPage(start, end, offset, limit, clientId, apiKey);
        allPostings.push(...result.postings);
        hasNext = result.hasNext;
        offset += limit;
        pageCount++;
    }

    return allPostings;
}

export async function GET(request: NextRequest) {
    try {
        // Session check
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only Elif can access this endpoint
        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Get user's Ozon API keys
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { ozonClientId: true, ozonApiKey: true },
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json(
                { error: "Ozon API keys not found" },
                { status: 400 }
            );
        }

        // Parse query parameters
        const searchParams = request.nextUrl.searchParams;
        const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());
        const page = parseInt(searchParams.get("page") || "1");
        const statusFilter = searchParams.get("status") || null;
        const pageSize = 50;

        // Get month date range
        const { start, end } = getMonthDateRange(year, month);

        // Fetch all postings for stats
        const allPostings = await fetchAllPostingsForMonth(
            start,
            end,
            user.ozonClientId,
            user.ozonApiKey
        );

        // Calculate stats (always from all postings)
        const totalOrders = allPostings.length;
        const cancelledOrders = allPostings.filter(
            (p) => p.status === "cancelled"
        ).length;
        const deliveredOrders = allPostings.filter(
            (p) => p.status === "delivered"
        ).length;
        const awaitingDeliveryOrders = allPostings.filter(
            (p) => p.status === "awaiting_deliver" || p.status === "awaiting_packaging"
        ).length;
        const deliveringOrders = allPostings.filter(
            (p) => p.status === "delivering"
        ).length;

        // Apply status filter if provided
        let filteredPostings = allPostings;
        if (statusFilter) {
            if (statusFilter === 'delivered') {
                filteredPostings = allPostings.filter(p => p.status === 'delivered');
            } else if (statusFilter === 'delivering') {
                filteredPostings = allPostings.filter(p => p.status === 'delivering');
            } else if (statusFilter === 'awaiting') {
                filteredPostings = allPostings.filter(p => p.status === 'awaiting_deliver' || p.status === 'awaiting_packaging');
            } else if (statusFilter === 'cancelled') {
                filteredPostings = allPostings.filter(p => p.status === 'cancelled');
            }
        }

        // Check if client wants all orders (for caching)
        const returnAll = searchParams.get("all") === "true";

        // Paginate filtered results (or return all)
        const filteredTotal = filteredPostings.length;
        let paginatedPostings;
        let totalPages;

        if (returnAll) {
            paginatedPostings = filteredPostings;
            totalPages = 1;
        } else {
            totalPages = Math.ceil(filteredTotal / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            paginatedPostings = filteredPostings.slice(startIndex, endIndex);
        }

        return NextResponse.json({
            orders: paginatedPostings,
            allOrders: returnAll ? allPostings : undefined, // Include all unfiltered orders for caching
            stats: {
                totalOrders,
                cancelledOrders,
                deliveredOrders,
                awaitingDeliveryOrders,
                deliveringOrders,
            },
            pagination: {
                currentPage: returnAll ? 1 : page,
                totalPages,
                pageSize: returnAll ? filteredTotal : pageSize,
                totalItems: filteredTotal,
            },
            filter: {
                year,
                month,
                status: statusFilter,
            },
        });
    } catch (error: any) {
        console.error("Monthly Orders API Error:", error);
        return NextResponse.json(
            { error: "Server error", details: error.message },
            { status: 500 }
        );
    }
}
