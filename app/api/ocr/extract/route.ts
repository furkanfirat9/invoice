import { NextRequest, NextResponse } from "next/server";
import vision from "@google-cloud/vision";

// Google Cloud Vision client
const getVisionClient = () => {
    const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
    if (!credentials) {
        throw new Error("GOOGLE_CLOUD_CREDENTIALS environment variable is not set");
    }

    const parsedCredentials = JSON.parse(credentials);
    return new vision.ImageAnnotatorClient({
        credentials: parsedCredentials,
    });
};

// ETGB'den bilgi çıkarma - sipariş numarasına göre tutar bulma
function extractEtgbInfo(fullText: string, siparisNo?: string) {
    const result = {
        etgbNo: "",
        tutar: "",
        debug: "", // Debug bilgisi
    };

    // ETGB NO pattern - "ETGB NO :" veya "ETGB NO:" sonrası
    const etgbNoMatch = fullText.match(/ETGB\s*NO\s*:?\s*([A-Z0-9]+)/i);
    if (etgbNoMatch) {
        result.etgbNo = etgbNoMatch[1].trim();
    }

    // Sipariş numarası verilmişse, sıralı eşleştirme yap
    if (siparisNo && siparisNo.trim()) {
        // Tüm sipariş numaralarını bul (format: 8-10 haneli numara-4 hane-1-2 hane)
        const orderPattern = /\d{8,10}-\d{4}-\d{1,2}/g;
        const allOrders = fullText.match(orderPattern) || [];

        // Hedef siparişin indeksini bul
        const targetIndex = allOrders.findIndex(order => order === siparisNo);

        if (targetIndex !== -1) {
            // USD Fatura değerlerini bul - birden fazla pattern dene
            const faturaValues: string[] = [];

            // Pattern 1: "USD" + opsiyonel boşluk/newline + sayı
            const usdPattern = /USD\s*(\d{2,4})(?!\d)/g;
            let usdMatches = [...fullText.matchAll(usdPattern)];

            // Pattern 2: Eğer Pattern 1 yeterli değilse, "1\nUSD\n" + sayı formatı
            if (usdMatches.length === 0) {
                const altPattern = /1\s*USD\s*(\d{2,4})(?!\d)/g;
                usdMatches = [...fullText.matchAll(altPattern)];
            }

            // Pattern 3: Son çare - "AD\n1\nUSD\n" sonrası sayılar
            if (usdMatches.length === 0) {
                const adPattern = /AD\s*1\s*USD\s*(\d{2,4})(?!\d)/g;
                usdMatches = [...fullText.matchAll(adPattern)];
            }

            if (usdMatches.length > 0) {
                for (const match of usdMatches) {
                    const value = match[1];
                    const numValue = parseFloat(value);
                    // Fatura değerleri: 40-999 arası veya 1001-2000 arası
                    // 1000 ve 1040 Rejim sütunu değerleri, Fatura değil
                    const isRejimValue = numValue === 1000 || numValue === 1040;
                    if (numValue >= 40 && numValue <= 2000 && !isRejimValue) {
                        faturaValues.push(value);
                    }
                }
            }

            // Fallback: Ondalıklı format (555,00)
            if (faturaValues.length === 0) {
                const decimalPattern = /(\d{2,4})[.,]00(?!\d)/g;
                const decimalMatches = [...fullText.matchAll(decimalPattern)];
                for (const match of decimalMatches) {
                    const value = match[1];
                    const numValue = parseFloat(value);
                    if (numValue >= 40 && numValue <= 2000) {
                        faturaValues.push(value);
                    }
                }
            }

            result.debug = `Sipariş indeksi: ${targetIndex}, Bulunan siparişler: ${allOrders.length}, Bulunan tutarlar: ${faturaValues.length}, Tutarlar: ${faturaValues.slice(0, 5).join(', ')}...`;

            // İndekse göre tutarı al
            if (targetIndex < faturaValues.length) {
                result.tutar = faturaValues[targetIndex];
            }
        } else {
            result.debug = `Sipariş bulunamadı: ${siparisNo}`;
        }
    }

    return result;
}

// Faturadan bilgi çıkarma
function extractFaturaInfo(fullText: string) {
    const result = {
        faturaNo: "",
    };

    // Fatura No pattern - çeşitli formatlar
    const patterns = [
        /Fatura\s*No\s*:?\s*([A-Z0-9]+)/i,
        /FATURA\s*NO\s*:?\s*([A-Z0-9]+)/i,
        /Belge\s*No\s*:?\s*([A-Z0-9]+)/i,
        /Invoice\s*No\s*:?\s*([A-Z0-9]+)/i,
        /Fiş\s*No\s*:?\s*([A-Z0-9]+)/i,
    ];

    for (const pattern of patterns) {
        const match = fullText.match(pattern);
        if (match) {
            result.faturaNo = match[1].trim();
            break;
        }
    }

    return result;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const type = formData.get("type") as string;
        const siparisNo = formData.get("siparisNo") as string;

        if (!file) {
            return NextResponse.json({ success: false, error: "Dosya bulunamadı" }, { status: 400 });
        }

        // Dosyayı buffer'a çevir
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Content = buffer.toString("base64");

        const client = getVisionClient();

        // Document text detection kullan (daha iyi yapı algılama)
        const [result] = await client.documentTextDetection({
            image: { content: base64Content },
        });

        const fullText = result.fullTextAnnotation?.text || "";

        if (!fullText.trim()) {
            return NextResponse.json({ success: false, error: "Metin bulunamadı" }, { status: 400 });
        }

        // Belge tipine göre bilgi çıkar
        if (type === "etgb") {
            const etgbInfo = extractEtgbInfo(fullText, siparisNo);
            return NextResponse.json({
                success: true,
                ...etgbInfo,
                rawText: fullText.substring(0, 5000),
            });
        } else if (type === "fatura") {
            const faturaInfo = extractFaturaInfo(fullText);
            return NextResponse.json({
                success: true,
                ...faturaInfo,
                rawText: fullText.substring(0, 5000),
            });
        }

        return NextResponse.json({ success: false, error: "Geçersiz belge tipi" }, { status: 400 });
    } catch (error) {
        console.error("OCR Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "OCR işlemi başarısız" },
            { status: 500 }
        );
    }
}
