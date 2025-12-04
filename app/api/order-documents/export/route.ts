import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import { fetchAPI } from "@/lib/api";
import * as XLSX from "xlsx";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";

interface OzonPosting {
    posting_number: string;
    status?: string;
    customer?: {
        name?: string;
    };
}

// Fetch all Ozon postings for a month
async function fetchAllPostingsForMonth(
    year: number,
    month: number,
    clientId: string,
    apiKey: string
): Promise<OzonPosting[]> {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const allPostings: OzonPosting[] = [];
    let offset = 0;
    const limit = 1000;
    let hasNext = true;
    let pageCount = 0;

    while (hasNext && pageCount < 50) {
        const data = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/list`, {
            method: "POST",
            headers: {
                "Client-Id": clientId,
                "Api-Key": apiKey,
            },
            body: JSON.stringify({
                dir: "ASC",
                filter: {
                    since: start.toISOString(),
                    to: end.toISOString(),
                },
                limit,
                offset,
                with: {
                    analytics_data: false,
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
        allPostings.push(...postings);
        hasNext = result.has_next === true;
        offset += limit;
        pageCount++;
    }

    return allPostings;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        // Get user's Ozon API keys
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { ozonClientId: true, ozonApiKey: true },
        });

        if (!user?.ozonClientId || !user?.ozonApiKey) {
            return NextResponse.json({ error: "Ozon API keys not found" }, { status: 400 });
        }

        const searchParams = request.nextUrl.searchParams;
        const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
        const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

        // Fetch ALL Ozon orders for the month
        const allOrders = await fetchAllPostingsForMonth(year, month, user.ozonClientId, user.ozonApiKey);

        // Get all posting numbers
        const postingNumbers = allOrders.map(o => o.posting_number);

        // Fetch all OrderDocument records for these postings
        const documents = await prisma.orderDocument.findMany({
            where: {
                postingNumber: { in: postingNumbers },
            },
        });

        // Fetch all Invoice records for these postings
        const invoices = await prisma.invoice.findMany({
            where: {
                postingNumber: { in: postingNumbers },
            },
        });

        // Create maps for quick lookup
        const docMap = new Map(documents.map(d => [d.postingNumber, d]));
        const invMap = new Map(invoices.map(i => [i.postingNumber, i]));

        // Prepare data for sheets
        const alisData: any[] = [["Sipariş No", "Fatura No", "PDF URL"]];
        const satisData: any[] = [["Sipariş No", "Fatura Tarihi", "Fatura No", "Alıcı Ad Soyad", "PDF URL"]];
        const etgbData: any[] = [["Sipariş No", "ETGB No", "Tutar", "Döviz Cinsi", "PDF URL"]];

        // Process all orders
        for (const order of allOrders) {
            const doc = docMap.get(order.posting_number);
            const inv = invMap.get(order.posting_number);

            // Alış
            alisData.push([
                order.posting_number,
                doc?.alisFaturaNo || "",
                doc?.alisPdfUrl || "",
            ]);

            // Satış - combine document and invoice data
            const satisFaturaNo = doc?.satisFaturaNo || inv?.invoiceNumber || "";
            const satisFaturaTarihi = doc?.satisFaturaTarihi || inv?.invoiceDate;
            const satisPdfUrl = doc?.satisPdfUrl || inv?.pdfUrl || "";
            const aliciAdSoyad = doc?.satisAliciAdSoyad || order.customer?.name || "";

            satisData.push([
                order.posting_number,
                satisFaturaTarihi ? new Date(satisFaturaTarihi).toLocaleDateString('tr-TR') : "",
                satisFaturaNo,
                aliciAdSoyad,
                satisPdfUrl,
            ]);

            // ETGB
            etgbData.push([
                order.posting_number,
                doc?.etgbNo || "",
                doc?.etgbTutar?.toString() || "",
                doc?.etgbDovizCinsi || "",
                doc?.etgbPdfUrl || "",
            ]);
        }

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Create sheets
        const alisWs = XLSX.utils.aoa_to_sheet(alisData);
        const satisWs = XLSX.utils.aoa_to_sheet(satisData);
        const etgbWs = XLSX.utils.aoa_to_sheet(etgbData);

        // Set column widths
        const colWidths = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 60 }];
        alisWs["!cols"] = colWidths;
        satisWs["!cols"] = colWidths;
        etgbWs["!cols"] = colWidths;

        // Append sheets to workbook
        XLSX.utils.book_append_sheet(wb, alisWs, "Alış");
        XLSX.utils.book_append_sheet(wb, satisWs, "Satış");
        XLSX.utils.book_append_sheet(wb, etgbWs, "ETGB");

        // Generate buffer
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        // Return as file download
        const fileName = `Belgeler_${year}_${month.toString().padStart(2, '0')}.xlsx`;

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            },
        });
    } catch (error: any) {
        console.error("Excel export error:", error);
        return NextResponse.json(
            { error: "Excel dosyası oluşturulamadı" },
            { status: 500 }
        );
    }
}
