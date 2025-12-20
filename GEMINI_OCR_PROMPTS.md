# Gemini OCR Promptları

Bu dosya, belge okuma (OCR) işlemi için Gemini AI'a gönderilen promptları içerir.

---

## 1. Alış Faturası Prompt

```
Bu bir alış faturası belgesidir.

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
{"faturaNo": "...", "faturaTarihi": "...", "saticiUnvani": "...", "saticiVkn": "...", "kdvHaricTutar": "...", "kdvTutari": "...", "urunBilgisi": "...", "urunAdedi": "..."}
```

---

## 2. Satış Faturası Prompt

```
Bu bir satış faturası belgesidir.

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
{"faturaNo": "...", "faturaTarihi": "...", "aliciAdSoyad": "..."}
```

---

## 3. ETGB (Elektronik Ticaret Gümrük Beyannamesi) Prompt

### Sipariş numarası varsa:

```
Bu bir ETGB (Elektronik Ticaret Gümrük Beyannamesi) belgesidir. 

Lütfen şu bilgileri bul ve JSON formatında döndür:
1. ETGB NO değerini bul (25341453EX... formatında)
2. ETGB TARİHİ: "ETGB TARİH" veya "TARİH" etiketinin yanındaki tarih (GG.AA.YYYY formatında)
3. FATURA TARİHİ: Tablodaki "FATURA TARİHİ" sütunundaki değer (GG.AA.YYYY formatında)
4. Tabloda "{siparisNo}" sipariş numarasını içeren satırı bul
5. O satırdaki "Fatura" sütunundaki USD tutarını bul (genelde 2-4 haneli sayı)

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"etgbNo": "...", "etgbTarihi": "...", "faturaTarihi": "...", "tutar": "..."}

Eğer sipariş numarası bulunamazsa tutar için boş string döndür.
```

### Sipariş numarası yoksa:

```
Bu bir ETGB (Elektronik Ticaret Gümrük Beyannamesi) belgesidir.

Lütfen şu bilgileri bul ve JSON formatında döndür:
1. ETGB NO değerini bul (25341453EX... formatında)
2. ETGB TARİHİ: "ETGB TARİH" veya "TARİH" etiketinin yanındaki tarih (GG.AA.YYYY formatında)
3. FATURA TARİHİ: Tablodaki "FATURA TARİHİ" sütunundaki değer (GG.AA.YYYY formatında)

SADECE aşağıdaki JSON formatında cevap ver:
{"etgbNo": "...", "etgbTarihi": "...", "faturaTarihi": "..."}
```

### Legacy Format (Eski ETGB - Sipariş numarası olmadan, tarihlerle):

```
Bu bir ETGB (Elektronik Ticaret Gümrük Beyannamesi) belgesidir.

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
{"etgbNo": "...", "etgbTarihi": "...", "faturaTarihi": "...", "tutar": "..."}
```

---

## Kullanım Yerleri

| Prompt | Dosya | Fonksiyon |
|--------|-------|-----------|
| Alış Faturası | `app/api/ocr/gemini/route.ts` | Modal'da PDF yüklendiğinde |
| Satış Faturası | `app/api/ocr/gemini/route.ts` | Modal'da PDF yüklendiğinde |
| ETGB (Yeni) | `app/api/ocr/gemini/route.ts` | Modal'da PDF yüklendiğinde - sipariş numaralı |
| ETGB Legacy | `app/api/ocr/gemini/route.ts` | Eski format ETGB belgeleri için (etgb-legacy type) |
| Alış Faturası | `app/api/order-documents/batch-ocr/route.ts` | Toplu OCR işleminde |
| Satış Faturası | `app/api/order-documents/batch-ocr/route.ts` | Toplu OCR işleminde |
| ETGB (Yeni) | `app/api/order-documents/batch-ocr/route.ts` | Toplu OCR - postingNumber ile tutar bulma |

---

## Tarih Parse Formatları

Gemini'den dönen tarihler aşağıdaki formatlarda olabilir:
- `15.08.2024` (noktalı)
- `15/08/2024` (slash'lı)
- `15-08-2024` (tireli)

Tüm formatlar `/[.\/-]/` regex'i ile parse ediliyor.

---

Son Güncelleme: 2025-12-17
