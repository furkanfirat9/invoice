import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
    try {
        // Oturum kontrolü
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
        }

        // Excel dosyasını oku
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        // İlk sayfayı al
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // JSON'a çevir
        const data = XLSX.utils.sheet_to_json(sheet) as Array<{
            "Gönderi No"?: string;
            "Alış"?: number | string;
            "Tedarik"?: string;
            "Sipariş No"?: string;
        }>;

        console.log(`[Import API] ${data.length} satır okundu`);

        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Her satır için güncelleme yap
        for (const row of data) {
            const postingNumber = row["Gönderi No"]?.toString().trim();

            if (!postingNumber) {
                skipped++;
                continue;
            }

            try {
                // Alış fiyatını parse et
                let purchasePrice: number | null = null;
                if (row["Alış"] !== undefined && row["Alış"] !== null && row["Alış"] !== "") {
                    const priceStr = row["Alış"].toString().replace(/[^\d.,]/g, "").replace(",", ".");
                    purchasePrice = parseFloat(priceStr);
                    if (isNaN(purchasePrice)) purchasePrice = null;
                }

                const procurementNote = row["Tedarik"]?.toString().trim() || null;
                const supplierOrderNo = row["Sipariş No"]?.toString().trim() || null;

                // Veritabanında güncelle veya oluştur
                await prisma.ozonOrderData.upsert({
                    where: { postingNumber },
                    update: {
                        ...(purchasePrice !== null && { purchasePrice }),
                        ...(procurementNote !== null && { procurementNote }),
                        ...(supplierOrderNo !== null && { supplierOrderNo }),
                    },
                    create: {
                        postingNumber,
                        purchasePrice,
                        procurementNote,
                        supplierOrderNo,
                    },
                });

                updated++;
            } catch (err: any) {
                errors.push(`${postingNumber}: ${err.message}`);
            }
        }

        console.log(`[Import API] ${updated} güncellendi, ${skipped} atlandı`);

        return NextResponse.json({
            success: true,
            total: data.length,
            updated,
            skipped,
            errors: errors.slice(0, 10), // İlk 10 hata
        });
    } catch (error: any) {
        console.error("[Import API] Hata:", error);
        return NextResponse.json(
            { error: error.message || "Import hatası" },
            { status: 500 }
        );
    }
}
