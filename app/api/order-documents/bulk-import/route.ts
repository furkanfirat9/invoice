import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import * as XLSX from "xlsx";

interface ExcelRow {
    siparisNo: string;
    alisUrl?: string;
    satisUrl?: string;
    etgbUrl?: string;
}

// Bulk import documents from Excel
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email || !session?.user?.id) {
            return NextResponse.json({ error: "Oturum açmanız gerekiyor" }, { status: 401 });
        }

        // Only Elif can access this endpoint
        if (!isElif(session.user.email)) {
            return NextResponse.json({ error: "Erişim reddedildi" }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "Excel dosyası gerekli" }, { status: 400 });
        }

        // Read Excel file
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON with headers (first row as keys)
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

        if (rawData.length < 2) {
            return NextResponse.json({ error: "Excel dosyasında veri bulunamadı" }, { status: 400 });
        }

        // First row is headers
        const headers = rawData[0] as string[];
        console.log("Excel Headers:", headers);

        // Find column indices - flexible header matching
        const findColumnIndex = (possibleNames: string[]) => {
            return headers.findIndex(h =>
                possibleNames.some(name =>
                    String(h).toLowerCase().trim().includes(name.toLowerCase())
                )
            );
        };

        const siparisNoIdx = findColumnIndex(["sipariş no", "siparis no", "siparisno", "posting", "order"]);
        const alisIdx = findColumnIndex(["alış", "alis", "alışfatura", "alisfatura"]);
        const satisIdx = findColumnIndex(["satış", "satis", "satışfatura", "satisf"]);
        const etgbIdx = findColumnIndex(["etgb"]);

        console.log("Column indices:", { siparisNoIdx, alisIdx, satisIdx, etgbIdx });

        if (siparisNoIdx === -1) {
            return NextResponse.json({
                error: "Excel dosyasında 'Sipariş No' kolonu bulunamadı. İlk sütunun sipariş numarasını içerdiğinden emin olun."
            }, { status: 400 });
        }

        // Parse all rows
        const rows: ExcelRow[] = [];
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i] as any[];
            if (!row || !row[siparisNoIdx]) continue;

            const siparisNo = String(row[siparisNoIdx]).trim();
            if (!siparisNo) continue;

            rows.push({
                siparisNo,
                alisUrl: alisIdx !== -1 && row[alisIdx] ? String(row[alisIdx]).trim() : undefined,
                satisUrl: satisIdx !== -1 && row[satisIdx] ? String(row[satisIdx]).trim() : undefined,
                etgbUrl: etgbIdx !== -1 && row[etgbIdx] ? String(row[etgbIdx]).trim() : undefined,
            });
        }

        console.log(`Found ${rows.length} rows to process`);

        // Validate URLs (must be valid URLs starting with http/https)
        const isValidUrl = (url: string | undefined): boolean => {
            if (!url) return false;
            try {
                new URL(url);
                return url.startsWith("http://") || url.startsWith("https://");
            } catch {
                return false;
            }
        };

        // Process each row
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const row of rows) {
            try {
                const updateData: any = {};
                let hasUpdate = false;

                // Only include valid URLs
                if (isValidUrl(row.alisUrl)) {
                    updateData.alisPdfUrl = row.alisUrl;
                    hasUpdate = true;
                }
                if (isValidUrl(row.satisUrl)) {
                    updateData.satisPdfUrl = row.satisUrl;
                    hasUpdate = true;
                }
                if (isValidUrl(row.etgbUrl)) {
                    updateData.etgbPdfUrl = row.etgbUrl;
                    hasUpdate = true;
                }

                if (!hasUpdate) {
                    skipCount++;
                    continue;
                }

                // Upsert document
                await prisma.orderDocument.upsert({
                    where: { postingNumber: row.siparisNo },
                    update: {
                        ...updateData,
                        updatedAt: new Date(),
                    },
                    create: {
                        postingNumber: row.siparisNo,
                        userId: session.user.id,
                        ...updateData,
                    },
                });

                successCount++;
            } catch (err: any) {
                errorCount++;
                errors.push(`${row.siparisNo}: ${err.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            message: `${successCount} sipariş güncellendi, ${skipCount} atlandı, ${errorCount} hata`,
            stats: {
                total: rows.length,
                success: successCount,
                skipped: skipCount,
                errors: errorCount,
            },
            errorDetails: errors.slice(0, 10), // Only first 10 errors
        });
    } catch (error: any) {
        console.error("Bulk import error:", error);
        return NextResponse.json(
            { error: error.message || "İçe aktarma başarısız" },
            { status: 500 }
        );
    }
}
