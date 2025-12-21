import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Gemini client
const getGeminiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    return new GoogleGenerativeAI(apiKey);
};

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const type = formData.get("type") as string;
        const siparisNo = formData.get("siparisNo") as string;

        if (!file) {
            return NextResponse.json({ success: false, error: "Dosya bulunamadı" }, { status: 400 });
        }

        // Dosyayı base64'e çevir
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Content = buffer.toString("base64");

        // Mime type belirle
        const mimeType = file.type || "image/png";

        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        let prompt = "";

        if (type === "etgb") {
            // Sadece ETGB No arıyoruz - tutar Invoice.amount'tan gelecek
            prompt = `ETGB belgesi.

ETGB NO: Üst kısımda "ETGB NO:" yanındaki numara (format: 25341453EX029348)

SADECE JSON döndür:
{"etgbNo": "25341453EX029348"}`;
        } else if (type === "etgb-legacy") {
            // Eski format ETGB - sipariş numarası yok, tarihler var
            prompt = `Bu bir ETGB (Elektronik Ticaret Gümrük Beyannamesi) belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:

1. ETGB NO:
   - "ETGB NO" etiketinin yanındaki değer
   - Format: ...EX... içeren numara (Örn: 25343200EX013299)

2. ETGB TARİHİ:
   - "ETGB TARİH" veya "TARİH" etiketinin yanındaki tarih
   - Formatı: GG.AA.YYYY (Örn: 01.12.2025)

3. FATURA TARİHİ:
   - Tablodaki "FATURA TARİHİ" sütunundaki değer
   - Formatı: GG.AA.YYYY (Örn: 05.11.2025)

4. FATURA TUTARI:
   - "Fatura Toplamı" veya "Fatura Tutarı" bölümündeki USD veya EUR değeri
   - Sağ taraftaki özet bölümünde "Fatura Toplamı" satırı
   - Sadece sayı olarak yaz (Örn: "160.00")

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"etgbNo": "...", "etgbTarihi": "...", "faturaTarihi": "...", "tutar": "..."}`;
        } else if (type === "alis-test") {
            // Test için özelleştirilmiş alış faturası promptu
            prompt = `Tedarik faturası. Aşağıdaki bilgileri belge görselinden çıkar.

ÖNEMLİ: Bu faturada 2 taraf var:
- SATICI: Faturayı kesen, ÜST kısımda (logo yanı) bilgileri yazan taraf
- ALICI: Faturanın kesildiği "Sayın", "Müşteri" altındaki taraf
Biz SATICI bilgilerini istiyoruz!

1. faturaNo: "Fatura No" veya "Belge No" yanındaki değer.

2. faturaTarihi: Belgede geçen ilk tarih. Format: GG.AA.YYYY

3. saticiUnvani: Faturanın ÜST kısmındaki firma/kişi adı (logo yanı).
   - "Sayın" altındaki değil, onun KARŞISINDA yazan!

4. saticiVkn: saticiUnvani ile AYNI BÖLGEDE yazan vergi numarası.
   - LTD, ŞTİ, A.Ş. içeren firma ise → 10 haneli VKN
   - Kişi adı (şahıs) ise → 11 haneli TCKN
   - "Sayın" bölümündeki numarayı ALMA!
   - 16 haneli MERSİS numarasını ALMA!

5. kdvHaricTutar: "Ara Toplam", "Matrah" yanındaki değer. Sadece sayı.

6. kdvTutari: KDV toplam tutarı. Sadece sayı.

7. urunBilgisi: Ürün satırlarındaki ürün adları. Marka+model öncelikli.

8. urunAdedi: Ürün miktarı veya satır sayısı.

Kurallar:
- Bilgi yoksa boş string "" yaz
- Belgeden aynen al

SADECE JSON döndür:
{"faturaNo": "", "faturaTarihi": "", "saticiUnvani": "", "saticiVkn": "", "kdvHaricTutar": "", "kdvTutari": "", "urunBilgisi": "", "urunAdedi": ""}`;
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
        } else {
            return NextResponse.json({ success: false, error: "Geçersiz belge tipi" }, { status: 400 });
        }

        // Gemini'ye gönder
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Content,
                },
            },
            prompt,
        ]);

        const response = result.response;
        const text = response.text();

        // JSON'u parse et
        try {
            // JSON'u temizle (bazen markdown code block içinde geliyor)
            let cleanJson = text;
            if (text.includes("```json")) {
                cleanJson = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
            } else if (text.includes("```")) {
                cleanJson = text.replace(/```\n?/g, "");
            }
            cleanJson = cleanJson.trim();

            const parsed = JSON.parse(cleanJson);

            if (type === "etgb") {
                return NextResponse.json({
                    success: true,
                    etgbNo: parsed.etgbNo || "",
                    etgbTarihi: parsed.etgbTarihi || "",
                    faturaTarihi: parsed.faturaTarihi || "",
                    tutar: parsed.tutar || "",
                    rawResponse: text,
                });
            } else if (type === "etgb-legacy") {
                return NextResponse.json({
                    success: true,
                    etgbNo: parsed.etgbNo || "",
                    etgbTarihi: parsed.etgbTarihi || "",
                    faturaTarihi: parsed.faturaTarihi || "",
                    tutar: parsed.tutar || "",
                    rawResponse: text,
                });
            } else if (type === "fatura") {
                return NextResponse.json({
                    success: true,
                    faturaNo: parsed.faturaNo || "",
                    faturaTarihi: parsed.faturaTarihi || "",
                    saticiUnvani: parsed.saticiUnvani || "",
                    saticiVkn: parsed.saticiVkn || "",
                    kdvHaricTutar: parsed.kdvHaricTutar || "",
                    kdvTutari: parsed.kdvTutari || "",
                    urunBilgisi: parsed.urunBilgisi || "",
                    urunAdedi: parsed.urunAdedi || "",
                    rawResponse: text,
                });
            } else if (type === "alis-test") {
                return NextResponse.json({
                    success: true,
                    faturaNo: parsed.faturaNo || "",
                    faturaTarihi: parsed.faturaTarihi || "",
                    saticiUnvani: parsed.saticiUnvani || "",
                    saticiVkn: parsed.saticiVkn || "",
                    kdvHaricTutar: parsed.kdvHaricTutar || "",
                    kdvTutari: parsed.kdvTutari || "",
                    urunBilgisi: parsed.urunBilgisi || "",
                    urunAdedi: parsed.urunAdedi || "",
                    rawResponse: text,
                });
            } else if (type === "satis") {
                return NextResponse.json({
                    success: true,
                    faturaNo: parsed.faturaNo || "",
                    faturaTarihi: parsed.faturaTarihi || "",
                    aliciAdSoyad: parsed.aliciAdSoyad || "",
                    rawResponse: text,
                });
            }
        } catch {
            // JSON parse hatası - raw response döndür
            return NextResponse.json({
                success: false,
                error: "AI yanıtı parse edilemedi",
                rawResponse: text,
            });
        }

        return NextResponse.json({ success: false, error: "Bilinmeyen hata" }, { status: 500 });
    } catch (error) {
        console.error("Gemini OCR Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "AI OCR işlemi başarısız" },
            { status: 500 }
        );
    }
}
