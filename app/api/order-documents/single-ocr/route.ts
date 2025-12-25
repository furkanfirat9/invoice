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

// Parse decimal numbers
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

// OCR prompts
const PROMPTS = {
    fatura: `Bu bir alış faturası belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:

1. FATURA NUMARASI: "Belge No" veya "Fatura No" etiketinin yanındaki değer
2. FATURA TARİHİ: Faturanın düzenlendiği tarih (GG.AA.YYYY formatında)
3. SATICI ÜNVANI: Faturayı kesen firmanın tam ticari ünvanı
4. SATICI VKN: 10 veya 11 haneli vergi/TC kimlik numarası (SATICI bilgileri bölümünde)
5. ALICI VKN: 10 veya 11 haneli vergi/TC kimlik numarası (ALICI veya MÜŞTERİ bilgileri bölümünde)
6. KDV HARİÇ TUTAR: Vergiler düşülmeden önceki net tutar (sadece sayı)
7. KDV TUTARI: Katma Değer Vergisi tutarı (sadece sayı)
8. ÜRÜN BİLGİSİ: Faturadaki ürünün marka ve model bilgisi
9. ÜRÜN ADEDİ: Faturadaki toplam ürün miktarı (sadece sayı)

SADECE aşağıdaki JSON formatında cevap ver:
{"faturaNo": "...", "faturaTarihi": "...", "saticiUnvani": "...", "saticiVkn": "...", "aliciVkn": "...", "kdvHaricTutar": "...", "kdvTutari": "...", "urunBilgisi": "...", "urunAdedi": "..."}`,

    satis: `Bu bir satış faturası belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:

1. FATURA NUMARASI: "Belge No" veya "Fatura No" etiketinin yanındaki değer
2. FATURA TARİHİ: Faturanın düzenlendiği tarih (GG.AA.YYYY formatında)
3. ALICI ADI SOYADI: Faturanın kesildiği kişinin tam adı ve soyadı

SADECE aşağıdaki JSON formatında cevap ver:
{"faturaNo": "...", "faturaTarihi": "...", "aliciAdSoyad": "..."}`
};

// Generate ETGB prompt - sadece ETGB No arıyoruz
function getEtgbPrompt(): string {
    console.log(`[ETGB Prompt] Sadece etgbNo aranıyor`);
    return `ETGB belgesi.

ETGB NO: Üst kısımda "ETGB NO:" yanındaki numara (format: 25341453EX029348)

SADECE JSON döndür:
{"etgbNo": "25341453EX029348"}`;
}

// OCR a single document
async function ocrDocument(pdfUrl: string, prompt: string): Promise<any> {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString("base64");

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const result = await model.generateContent([
        { inlineData: { mimeType: "application/pdf", data: base64Content } },
        prompt,
    ]);

    const text = result.response.text();
    let cleanJson = text;
    if (text.includes("```json")) {
        cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (text.includes("```")) {
        cleanJson = text.replace(/```\n?/g, "");
    }
    const parsed = JSON.parse(cleanJson.trim());
    console.log(`[ETGB OCR Result]:`, parsed);
    return parsed;
}

// Parse date with time support
function parseDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;
    const dateOnly = dateStr.split(' ')[0];
    const parts = dateOnly.split(/[.\/-]/);
    if (parts.length >= 3) {
        const [day, month, year] = parts;
        return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
    return undefined;
}

// Process single order
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
        const { postingNumber, processAlis, processSatis, processEtgb } = body;

        if (!postingNumber) {
            return NextResponse.json({ error: "postingNumber gerekli" }, { status: 400 });
        }

        // Get document from OrderDocument table
        const doc = await prisma.orderDocument.findUnique({
            where: { postingNumber }
        });

        // Also check Invoice table (for ETGB from Sevkiyatlar page)
        const invoice = await prisma.invoice.findUnique({
            where: { postingNumber }
        });

        // If neither table has this posting number, skip
        if (!doc && !invoice) {
            return NextResponse.json({
                success: true,
                postingNumber,
                results: [],
                message: "Belge bulunamadı"
            });
        }

        const results: { type: string; status: string; error?: string }[] = [];

        // Process Alış Faturası (only from OrderDocument)
        if (processAlis && doc?.alisPdfUrl && !doc?.alisFaturaNo) {
            try {
                const ocrResult = await ocrDocument(doc.alisPdfUrl, PROMPTS.fatura);
                if (ocrResult?.faturaNo) {
                    const updateData: any = {};
                    if (ocrResult.faturaNo) updateData.alisFaturaNo = ocrResult.faturaNo;
                    if (ocrResult.faturaTarihi) updateData.alisFaturaTarihi = parseDate(ocrResult.faturaTarihi);
                    if (ocrResult.saticiUnvani) updateData.alisSaticiUnvani = ocrResult.saticiUnvani;
                    if (ocrResult.saticiVkn) updateData.alisSaticiVkn = ocrResult.saticiVkn;
                    if (ocrResult.aliciVkn) updateData.alisAliciVkn = ocrResult.aliciVkn;
                    if (ocrResult.kdvHaricTutar) updateData.alisKdvHaricTutar = parseDecimal(ocrResult.kdvHaricTutar);
                    if (ocrResult.kdvTutari) updateData.alisKdvTutari = parseDecimal(ocrResult.kdvTutari);
                    if (ocrResult.urunBilgisi) updateData.alisUrunBilgisi = ocrResult.urunBilgisi;
                    if (ocrResult.urunAdedi) updateData.alisUrunAdedi = ocrResult.urunAdedi;

                    await prisma.orderDocument.update({ where: { id: doc.id }, data: updateData });
                    results.push({ type: "Alış", status: "success" });
                } else {
                    results.push({ type: "Alış", status: "skipped", error: "OCR sonuç döndürmedi" });
                }
            } catch (error: any) {
                results.push({ type: "Alış", status: "error", error: error.message });
            }
        }

        // Process ETGB - check both OrderDocument and Invoice tables
        if (processEtgb) {
            // Check if ETGB PDF exists in either table
            const hasEtgbPdf = doc?.etgbPdfUrl || invoice?.etgbPdfUrl;

            if (!hasEtgbPdf) {
                // No ETGB PDF, skip silently (don't add to results)
            }
            // First check OrderDocument
            else if (doc?.etgbPdfUrl && !doc?.etgbNo) {
                try {
                    const ocrResult = await ocrDocument(doc.etgbPdfUrl, getEtgbPrompt());
                    if (ocrResult?.etgbNo) {
                        await prisma.orderDocument.update({
                            where: { id: doc.id },
                            data: {
                                etgbNo: ocrResult.etgbNo,
                            }
                        });
                        results.push({ type: "ETGB", status: "success" });
                    } else {
                        results.push({ type: "ETGB", status: "skipped", error: "OCR sonuç döndürmedi" });
                    }
                } catch (error: any) {
                    results.push({ type: "ETGB", status: "error", error: error.message });
                }
            }
            // If OrderDocument doesn't have ETGB PDF, check Invoice table and save to OrderDocument
            else if (invoice?.etgbPdfUrl && !doc?.etgbNo) {
                try {
                    const ocrResult = await ocrDocument(invoice.etgbPdfUrl, getEtgbPrompt());
                    if (ocrResult?.etgbNo) {
                        // Save to OrderDocument (create if not exists)
                        await prisma.orderDocument.upsert({
                            where: { postingNumber },
                            update: {
                                etgbNo: ocrResult.etgbNo,
                            },
                            create: {
                                postingNumber,
                                userId: session.user.id,
                                etgbNo: ocrResult.etgbNo,
                            }
                        });
                        results.push({ type: "ETGB", status: "success" });
                    } else {
                        results.push({ type: "ETGB", status: "skipped", error: "OCR sonuç döndürmedi" });
                    }
                } catch (error: any) {
                    results.push({ type: "ETGB", status: "error", error: error.message });
                }
            }
        }

        // Process Satış Faturası (only from OrderDocument)
        if (processSatis && doc?.satisPdfUrl && !doc?.satisFaturaNo) {
            try {
                const ocrResult = await ocrDocument(doc.satisPdfUrl, PROMPTS.satis);
                if (ocrResult?.faturaNo) {
                    const updateData: any = {};
                    if (ocrResult.faturaNo) updateData.satisFaturaNo = ocrResult.faturaNo;
                    if (ocrResult.faturaTarihi) updateData.satisFaturaTarihi = parseDate(ocrResult.faturaTarihi);
                    if (ocrResult.aliciAdSoyad) updateData.satisAliciAdSoyad = ocrResult.aliciAdSoyad;

                    await prisma.orderDocument.update({ where: { id: doc.id }, data: updateData });
                    results.push({ type: "Satış", status: "success" });
                } else {
                    results.push({ type: "Satış", status: "skipped", error: "OCR sonuç döndürmedi" });
                }
            } catch (error: any) {
                results.push({ type: "Satış", status: "error", error: error.message });
            }
        }

        return NextResponse.json({
            success: true,
            postingNumber,
            results
        });

    } catch (error: any) {
        console.error("Single OCR error:", error);
        return NextResponse.json(
            { error: error.message || "OCR işlemi başarısız" },
            { status: 500 }
        );
    }
}
