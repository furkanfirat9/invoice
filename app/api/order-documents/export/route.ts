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
    in_process_at?: string;
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

        // Status mapping
        const getStatusText = (status?: string) => {
            const statusMap: Record<string, string> = {
                "awaiting_packaging": "Paketlenmesi bekleniyor",
                "awaiting_deliver": "Teslim bekleniyor",
                "delivering": "Kargoda",
                "delivered": "Teslim Edildi",
                "cancelled": "İptal",
                "not_accepted": "Kabul Edilmedi",
            };
            return statusMap[status || ""] || status || "";
        };

        // Prepare data for sheets - Sipariş No > Tarih > Durum > Modal verileri
        const alisData: any[] = [[
            "Sipariş No",
            "Sipariş Tarihi",
            "Durum",
            "Fatura No",
            "Fatura Tarihi",
            "Satıcı Ünvanı",
            "Satıcı VKN",
            "KDV Hariç Tutar",
            "KDV Tutarı",
            "Ürün Bilgisi",
            "Ürün Adedi",
            "PDF URL",
            "Uyarı 1",
            "Uyarı 2"
        ]];
        const satisData: any[] = [[
            "Sipariş No",
            "Sipariş Tarihi",
            "Durum",
            "Fatura No",
            "Fatura Tarihi",
            "Alıcı Ad Soyad",
            "PDF URL"
        ]];
        const etgbData: any[] = [[
            "Sipariş No",
            "Sipariş Tarihi",
            "Durum",
            "ETGB No",
            "ETGB Tarihi",
            "Fatura Tarihi",
            "Tutar",
            "Döviz Cinsi",
            "PDF URL"
        ]];

        // Process all orders
        for (const order of allOrders) {
            const doc = docMap.get(order.posting_number);
            const inv = invMap.get(order.posting_number);
            const orderDate = order.in_process_at ? new Date(order.in_process_at).toLocaleDateString('tr-TR') : "";
            const statusText = getStatusText(order.status);

            // Alış - Sipariş No > Tarih > Durum > Modal verileri
            // Uyarıları hesapla
            const warnings: string[] = [];

            // VKN Kontrolü - Alış faturası varsa ve VKN uyuşmuyorsa
            if (doc?.alisPdfUrl || doc?.alisFaturaNo) {
                if (doc?.alisAliciVkn && doc?.alisAliciVkn !== "30073700460") {
                    warnings.push(`VKN Uyuşmuyor (${doc.alisAliciVkn})`);
                } else if (!doc?.alisAliciVkn) {
                    warnings.push("VKN Eksik");
                }
            }

            // Tarih Kontrolü - Her iki fatura da varsa ve alış > satış ise
            const satisFaturaTarihi = doc?.satisFaturaTarihi || inv?.invoiceDate;
            if (doc?.alisFaturaTarihi && satisFaturaTarihi) {
                const alisDate = new Date(doc.alisFaturaTarihi);
                const satisDate = new Date(satisFaturaTarihi);
                if (alisDate > satisDate) {
                    const farkGun = Math.ceil((alisDate.getTime() - satisDate.getTime()) / (1000 * 60 * 60 * 24));
                    warnings.push(`Tarih Tutarsızlığı (+${farkGun} gün)`);
                }
            }

            alisData.push([
                order.posting_number,
                orderDate,
                statusText,
                doc?.alisFaturaNo || "",
                doc?.alisFaturaTarihi ? new Date(doc.alisFaturaTarihi).toLocaleDateString('tr-TR') : "",
                doc?.alisSaticiUnvani || "",
                doc?.alisSaticiVkn || "",
                doc?.alisKdvHaricTutar?.toString() || "",
                doc?.alisKdvTutari?.toString() || "",
                doc?.alisUrunBilgisi || "",
                doc?.alisUrunAdedi || "",
                doc?.alisPdfUrl || "",
                warnings[0] || "",
                warnings[1] || "",
            ]);

            // Satış - combine document and invoice data
            const satisFaturaNo = doc?.satisFaturaNo || inv?.invoiceNumber || "";
            const satisFaturaTarihiVal = doc?.satisFaturaTarihi || inv?.invoiceDate;
            const satisPdfUrl = doc?.satisPdfUrl || inv?.pdfUrl || "";
            const aliciAdSoyad = doc?.satisAliciAdSoyad || order.customer?.name || "";

            satisData.push([
                order.posting_number,
                orderDate,
                statusText,
                satisFaturaNo,
                satisFaturaTarihiVal ? new Date(satisFaturaTarihiVal).toLocaleDateString('tr-TR') : "",
                aliciAdSoyad,
                satisPdfUrl,
            ]);

            // ETGB - all fields including new date fields
            etgbData.push([
                order.posting_number,
                orderDate,
                statusText,
                doc?.etgbNo || "",
                doc?.etgbTarihi ? new Date(doc.etgbTarihi).toLocaleDateString('tr-TR') : "",
                doc?.etgbFaturaTarihi ? new Date(doc.etgbFaturaTarihi).toLocaleDateString('tr-TR') : "",
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

        // Set column widths for each sheet
        // Alış: Sipariş No, Sipariş Tarihi, Durum, Fatura No, Fatura Tarihi, Satıcı Ünvanı, VKN, KDV Hariç, KDV Tutarı, Ürün Bilgisi, Adet, PDF URL, Uyarı 1, Uyarı 2
        alisWs["!cols"] = [
            { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 35 },
            { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 50 },
            { wch: 25 }, { wch: 25 }
        ];
        // Satış: Sipariş No, Sipariş Tarihi, Durum, Fatura No, Fatura Tarihi, Alıcı Ad Soyad, PDF URL
        satisWs["!cols"] = [
            { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 50 }
        ];
        // ETGB: Sipariş No, Sipariş Tarihi, Durum, ETGB No, ETGB Tarihi, Fatura Tarihi, Tutar, Döviz, PDF URL
        etgbWs["!cols"] = [
            { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 50 }
        ];

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
