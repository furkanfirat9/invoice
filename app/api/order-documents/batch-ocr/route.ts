import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isElif } from "@/lib/auth-utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Gemini client
const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    return new GoogleGenerativeAI(apiKey);
};

// Parse decimal numbers - handles both European and American formats
function parseDecimal(value: string): number {
    if (!value) return 0;

    const hasDot = value.includes(".");
    const hasComma = value.includes(",");

    if (hasDot && hasComma) {
        const lastDot = value.lastIndexOf(".");
        const lastComma = value.lastIndexOf(",");

        if (lastComma > lastDot) {
            return parseFloat(value.replace(/\./g, "").replace(",", "."));
        } else {
            return parseFloat(value.replace(/,/g, ""));
        }
    } else if (hasComma) {
        return parseFloat(value.replace(",", "."));
    } else {
        return parseFloat(value);
    }
}

// OCR a single document using Gemini
async function ocrDocument(
    pdfUrl: string,
    type: "fatura" | "etgb" | "satis",
    siparisNo?: string
): Promise<any> {
    try {
        // Fetch PDF and convert to base64
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Content = Buffer.from(arrayBuffer).toString("base64");

        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        let prompt = "";

        if (type === "etgb") {
            console.log(`[ETGB OCR] siparisNo: ${siparisNo}`);
            // Sadece ETGB No arıyoruz - tutar Invoice.amount'tan gelecek
            prompt = `ETGB belgesi.

ETGB NO: Üst kısımda "ETGB NO:" yanındaki numara (format: 25341453EX029348)

SADECE JSON döndür:
{"etgbNo": "25341453EX029348"}`;
        } else if (type === "fatura") {
            prompt = `Bu bir alış faturası belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:

1. FATURA NUMARASI:
   - "Belge No" veya "Fatura No" etiketinin yanındaki değer
   - Genelde harfle başlar ve içinde yıl bilgisi (2024, 2025) bulunur
   - Örnek formatlar: DM02025..., ABC2025..., XYZ2024...

2. FATURA TARİHİ:
   - Faturanın düzenlendiği tarih
   - Formatı: GG.AA.YYYY veya GG/AA/YYYY (Örn: 15.08.2024)

3. SATICI ÜNVANI:
   - Faturayı kesen firmanın tam ticari ünvanı
   - Örnek: "ABC TİCARET LTD. ŞTİ.", "XYZ ELEKTRONİK A.Ş."

4. SATICI VERGİ KİMLİK NUMARASI (VKN):
   - 10 veya 11 haneli vergi/TC kimlik numarası
   - Genelde "VKN", "V.K.N", "Vergi No" etiketinin yanında bulunur

5. KDV HARİÇ TUTAR:
   - Vergiler düşülmeden önceki net tutar
   - Sadece sayı olarak yaz (Örn: "1250.50")
   - "Ara Toplam", "Matrah" veya "KDV Matrahı" etiketinin yanında bulunur

6. KDV TUTARI:
   - Katma Değer Vergisi tutarı
   - Sadece sayı olarak yaz (Örn: "225.09")

7. ÜRÜN BİLGİSİ:
   - Faturadaki ürünün marka ve model bilgisi
   - Örnek: "Tefal EY8018", "Philips EP3347"
   - Birden fazla ürün varsa virgülle ayır

8. ÜRÜN ADEDİ:
   - Faturadaki toplam ürün miktarı
   - Sadece sayı olarak yaz (örn: "1", "3", "5")

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"faturaNo": "...", "faturaTarihi": "...", "saticiUnvani": "...", "saticiVkn": "...", "kdvHaricTutar": "...", "kdvTutari": "...", "urunBilgisi": "...", "urunAdedi": "..."}`;
        } else if (type === "satis") {
            prompt = `Bu bir satış faturası belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:

1. FATURA NUMARASI:
   - "Belge No" veya "Fatura No" etiketinin yanındaki değer
   - Örnek formatlar: SF2024..., INV2024..., A001...

2. FATURA TARİHİ:
   - Faturanın düzenlendiği tarih
   - Formatı: GG.AA.YYYY veya GG/AA/YYYY (Örn: 15.08.2024)

3. ALICI ADI SOYADI:
   - Faturanın kesildiği kişinin tam adı ve soyadı
   - "Alıcı", "Müşteri", "Customer" gibi etiketlerin yanında bulunur

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"faturaNo": "...", "faturaTarihi": "...", "aliciAdSoyad": "..."}`;
        }

        // Send to Gemini
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: "application/pdf",
                    data: base64Content,
                },
            },
            prompt,
        ]);

        const text = result.response.text();

        // Parse JSON response
        let cleanJson = text;
        if (text.includes("```json")) {
            cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        } else if (text.includes("```")) {
            cleanJson = text.replace(/```\n?/g, "");
        }
        cleanJson = cleanJson.trim();

        const parsed = JSON.parse(cleanJson);
        console.log(`[ETGB OCR] Result:`, parsed);
        return parsed;
    } catch (error) {
        console.error("OCR error:", error);
        return null;
    }
}

// Process batch OCR for a specific month
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
        const { postingNumbers, processAlis, processSatis, processEtgb } = body;

        if (!postingNumbers || !Array.isArray(postingNumbers) || postingNumbers.length === 0) {
            return NextResponse.json({ error: "postingNumbers gerekli" }, { status: 400 });
        }

        // Get documents for these posting numbers
        const documents = await prisma.orderDocument.findMany({
            where: {
                postingNumber: { in: postingNumbers }
            }
        });

        // Also get invoices for ETGB processing
        const invoices = await prisma.invoice.findMany({
            where: {
                postingNumber: { in: postingNumbers }
            },
            select: {
                id: true,
                postingNumber: true,
                etgbPdfUrl: true,
                etgbNumber: true,
            }
        });

        // Create a map for quick invoice lookup
        const invoiceMap = new Map(invoices.map(inv => [inv.postingNumber, inv]));

        const results = {
            total: 0,
            processed: 0,
            skipped: 0,
            errors: 0,
            details: [] as { postingNumber: string; type: string; status: string; error?: string }[]
        };

        // Process each document
        for (const doc of documents) {
            // Process Alış Faturası - Fatura no yoksa veya tarih eksikse işle
            if (processAlis && doc.alisPdfUrl && (!doc.alisFaturaNo || !doc.alisFaturaTarihi)) {
                results.total++;
                try {
                    const ocrResult = await ocrDocument(doc.alisPdfUrl, "fatura");

                    if (ocrResult && ocrResult.faturaNo) {
                        // Parse date if present
                        let alisFaturaTarihi: Date | undefined;
                        if (ocrResult.faturaTarihi) {
                            // Önce boşluktan ayır (saat bilgisi varsa kaldır)
                            const dateOnly = ocrResult.faturaTarihi.split(' ')[0];
                            const parts = dateOnly.split(/[.\/-]/);
                            if (parts.length >= 3) {
                                const [day, month, year] = parts;
                                alisFaturaTarihi = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                            }
                        }

                        // Sadece boş alanları doldur - mevcut dolu değerleri koru
                        const updateData: any = {};

                        if (!doc.alisFaturaNo && ocrResult.faturaNo) {
                            updateData.alisFaturaNo = ocrResult.faturaNo;
                        }
                        if (!doc.alisFaturaTarihi && alisFaturaTarihi) {
                            updateData.alisFaturaTarihi = alisFaturaTarihi;
                        }
                        if (!doc.alisSaticiUnvani && ocrResult.saticiUnvani) {
                            updateData.alisSaticiUnvani = ocrResult.saticiUnvani;
                        }
                        if (!doc.alisSaticiVkn && ocrResult.saticiVkn) {
                            updateData.alisSaticiVkn = ocrResult.saticiVkn;
                        }
                        if (!doc.alisKdvHaricTutar && ocrResult.kdvHaricTutar) {
                            updateData.alisKdvHaricTutar = parseDecimal(ocrResult.kdvHaricTutar);
                        }
                        if (!doc.alisKdvTutari && ocrResult.kdvTutari) {
                            updateData.alisKdvTutari = parseDecimal(ocrResult.kdvTutari);
                        }
                        if (!doc.alisUrunBilgisi && ocrResult.urunBilgisi) {
                            updateData.alisUrunBilgisi = ocrResult.urunBilgisi;
                        }
                        if (!doc.alisUrunAdedi && ocrResult.urunAdedi) {
                            updateData.alisUrunAdedi = ocrResult.urunAdedi;
                        }

                        // Sadece güncellenecek alan varsa güncelle
                        if (Object.keys(updateData).length > 0) {
                            await prisma.orderDocument.update({
                                where: { id: doc.id },
                                data: updateData
                            });
                        }
                        results.processed++;
                        results.details.push({ postingNumber: doc.postingNumber, type: "Alış", status: "success" });
                    } else {
                        results.skipped++;
                        results.details.push({ postingNumber: doc.postingNumber, type: "Alış", status: "skipped", error: "OCR sonuç döndürmedi" });
                    }
                } catch (error: any) {
                    results.errors++;
                    results.details.push({ postingNumber: doc.postingNumber, type: "Alış", status: "error", error: error.message });
                }

                // Rate limit: wait 4 seconds between requests (15 RPM)
                await new Promise(resolve => setTimeout(resolve, 4000));
            }

            // Process ETGB - check both OrderDocument and Invoice
            if (processEtgb) {
                const invoice = invoiceMap.get(doc.postingNumber);

                // Check OrderDocument first
                if (doc.etgbPdfUrl && !doc.etgbNo) {
                    results.total++;
                    try {
                        const ocrResult = await ocrDocument(doc.etgbPdfUrl, "etgb", doc.postingNumber);

                        if (ocrResult && ocrResult.etgbNo) {
                            await prisma.orderDocument.update({
                                where: { id: doc.id },
                                data: {
                                    etgbNo: ocrResult.etgbNo || undefined,
                                    etgbTutar: ocrResult.tutar ? parseDecimal(ocrResult.tutar) : undefined,
                                }
                            });
                            results.processed++;
                            results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "success" });
                        } else {
                            results.skipped++;
                            results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "skipped", error: "OCR sonuç döndürmedi" });
                        }
                    } catch (error: any) {
                        results.errors++;
                        results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "error", error: error.message });
                    }

                    // Rate limit: wait 4 seconds between requests
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }
                // If OrderDocument doesn't have ETGB PDF, check Invoice table and save to OrderDocument
                else if (invoice?.etgbPdfUrl && !doc?.etgbNo) {
                    results.total++;
                    try {
                        const ocrResult = await ocrDocument(invoice.etgbPdfUrl, "etgb", doc.postingNumber);

                        if (ocrResult && ocrResult.etgbNo) {
                            // Save to OrderDocument (update since doc exists)
                            await prisma.orderDocument.update({
                                where: { id: doc.id },
                                data: {
                                    etgbNo: ocrResult.etgbNo || undefined,
                                    etgbTutar: ocrResult.tutar ? parseDecimal(ocrResult.tutar) : undefined,
                                }
                            });
                            results.processed++;
                            results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "success" });
                        } else {
                            results.skipped++;
                            results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "skipped", error: "OCR sonuç döndürmedi" });
                        }
                    } catch (error: any) {
                        results.errors++;
                        results.details.push({ postingNumber: doc.postingNumber, type: "ETGB", status: "error", error: error.message });
                    }

                    // Rate limit: wait 4 seconds between requests
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }
            }

            // Satış Faturası batch OCR'da işlenmeyecek - Invoice'dan alınıyor
        }

        // Process invoices that don't have OrderDocument entries (for ETGB only)
        if (processEtgb) {
            const processedPostingNumbers = new Set(documents.map(d => d.postingNumber));

            for (const invoice of invoices) {
                // Skip if already processed via OrderDocument
                if (processedPostingNumbers.has(invoice.postingNumber)) continue;

                // Process only if has PDF - check OrderDocument for etgbNo
                const existingDoc = await prisma.orderDocument.findUnique({
                    where: { postingNumber: invoice.postingNumber },
                    select: { etgbNo: true }
                });

                if (invoice.etgbPdfUrl && !existingDoc?.etgbNo) {
                    results.total++;
                    try {
                        const ocrResult = await ocrDocument(invoice.etgbPdfUrl, "etgb", invoice.postingNumber);

                        if (ocrResult && ocrResult.etgbNo) {
                            // Save to OrderDocument (create if not exists)
                            await prisma.orderDocument.upsert({
                                where: { postingNumber: invoice.postingNumber },
                                update: {
                                    etgbNo: ocrResult.etgbNo || undefined,
                                    etgbTutar: ocrResult.tutar ? parseDecimal(ocrResult.tutar) : undefined,
                                },
                                create: {
                                    postingNumber: invoice.postingNumber,
                                    userId: session.user.id,
                                    etgbNo: ocrResult.etgbNo || undefined,
                                    etgbTutar: ocrResult.tutar ? parseDecimal(ocrResult.tutar) : undefined,
                                }
                            });
                            results.processed++;
                            results.details.push({ postingNumber: invoice.postingNumber, type: "ETGB", status: "success" });
                        } else {
                            results.skipped++;
                            results.details.push({ postingNumber: invoice.postingNumber, type: "ETGB", status: "skipped", error: "OCR sonuç döndürmedi" });
                        }
                    } catch (error: any) {
                        results.errors++;
                        results.details.push({ postingNumber: invoice.postingNumber, type: "ETGB", status: "error", error: error.message });
                    }

                    // Rate limit: wait 4 seconds between requests
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }
            }
        }

        return NextResponse.json({
            success: true,
            results
        });

    } catch (error: any) {
        console.error("Batch OCR error:", error);
        return NextResponse.json(
            { error: error.message || "Toplu OCR işlemi başarısız" },
            { status: 500 }
        );
    }
}
