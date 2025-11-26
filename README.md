# Invoice Panel - Ozon Fatura Yönetim Sistemi

Ozon API'den alınan siparişler için fatura yükleme ve yönetim paneli.

## Teknolojiler

- **Next.js** 15.3.2
- **React** 18.2.0
- **TypeScript** 5
- **Tailwind CSS** 4.0
- **Prisma** 5.22.0
- **Vercel Blob** 0.25.0

## Kurulum

1. Paketleri yükleyin:
```bash
npm install
```

2. Prisma Client'ı oluşturun:
```bash
npx prisma generate
```

3. Geliştirici sunucusunu başlatın:
```bash
npm run dev
```

Sunucu `http://localhost:3000` adresinde çalışacaktır.

## Ortam Değişkenleri

`.env` dosyasında aşağıdaki değişkenler tanımlanmalıdır:

- `OZON_CLIENT_ID` - Ozon API Client ID
- `OZON_API_KEY` - Ozon API Key
- `OZON_API_BASE` - Ozon API Base URL
- `DATABASE_URL` - PostgreSQL veritabanı bağlantı URL'si
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob token (ileride yapılandırılacak)

## Proje Yapısı

```
invoice/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Ana layout
│   ├── page.tsx           # Ana sayfa
│   └── globals.css        # Global CSS
├── prisma/                # Prisma şema dosyaları
│   └── schema.prisma      # Veritabanı şeması
└── public/                # Statik dosyalar
```

## Özellikler

- **Seller (Satıcı)**: Siparişlere fatura yükleme ve gümrük bilgileri girme
- **Carrier (Kargo)**: Fatura görüntüleme, bilgi kontrolü ve ETGB belgesi yükleme

## Geliştirme Durumu

Proje sıfırdan başlatılmıştır. İlerleyen adımlarda:
- Login sayfası (Seller/Carrier seçimi)
- Dashboard tasarımı
- Ozon API entegrasyonu
- Fatura yükleme sistemi
- ETGB belgesi yönetimi

geliştirilecektir.




