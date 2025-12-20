# Belgeler Sayfası - Teknik Referans Dokümanı

Bu doküman, **Belgeler** sayfasının hızlı ve performanslı çalışmasını sağlayan teknik yapıyı açıklamaktadır.

---

## 📋 Genel Bakış

Belgeler sayfası, Ozon platformundaki siparişlerin aylık bazda listelenmesini ve belge yönetimini sağlar. Sayfa, **istemci taraflı önbellekleme (client-side caching)** ve **akıllı veri çekme** stratejileri ile hızlı gezinme deneyimi sunar.

---

## 🏗️ Mimari Yapı

### Dosya Yapısı

```
app/dashboard/belgeler/
├── page.tsx                    # Ana sayfa wrapper
├── BelgelerContent.tsx         # Ana bileşen (~700 satır)
├── DocumentUploadModal.tsx     # Belge yükleme modal
├── BulkImportModal.tsx         # Toplu içe aktarma modal
└── BatchOcrModal.tsx           # Toplu OCR modal

app/api/ozon/monthly-orders/
└── route.ts                    # Aylık sipariş API endpoint
```

---

## 🔌 API Endpoint

### `/api/ozon/monthly-orders`

**Method:** `GET`

**Query Parametreleri:**

| Parametre | Tip     | Varsayılan           | Açıklama                                    |
|-----------|---------|----------------------|---------------------------------------------|
| `year`    | number  | Şu anki yıl          | Hangi yılın verileri çekileceği             |
| `month`   | number  | Şu anki ay           | Hangi ayın verileri çekileceği (1-12)       |
| `page`    | number  | 1                    | Sayfa numarası (client cache'de kullanılmaz)|
| `status`  | string  | null                 | Durum filtresi (delivered, cancelled, vb.)  |
| `all`     | boolean | false                | Tüm verileri tek seferde çek                |

**Örnek İstek:**
```
GET /api/ozon/monthly-orders?year=2025&month=12&all=true
```

**Response Yapısı:**
```typescript
interface ApiResponse {
    orders: OzonOrder[];           // Sayfalanmış siparişler
    allOrders?: OzonOrder[];       // Tüm siparişler (all=true ise)
    documentStatus: Record<string, {
        alis: boolean;             // Alış faturası var mı
        satis: boolean;            // Satış faturası var mı
        etgb: boolean;             // ETGB var mı
    }>;
    stats: {
        totalOrders: number;
        cancelledOrders: number;
        deliveredOrders: number;
        awaitingDeliveryOrders: number;
        deliveringOrders: number;
    };
    pagination: {
        currentPage: number;
        totalPages: number;
        pageSize: number;
        totalItems: number;
    };
    filter: {
        year: number;
        month: number;
        status: string | null;
    };
}
```

---

## ⚡ Performans Optimizasyonları

### 1. **Tek Seferlik Veri Çekme (Single Fetch Strategy)**

Ay değiştiğinde, API'ye `all=true` parametresi ile **tek bir istek** gönderilir ve tüm ay verileri çekilir:

```typescript
// BelgelerContent.tsx - fetchOrders fonksiyonu
const url = `/api/ozon/monthly-orders?year=${selectedYear}&month=${selectedMonth}&all=true`;
const response = await fetch(url);
const result = await response.json();

// Tüm siparişler istemcide cache'lenir
setAllOrders(result.allOrders);
```

### 2. **İstemci Taraflı Önbellekleme (Client-side Caching)**

Veriler çekildikten sonra `allOrders` state'inde saklanır. Filtreleme ve sayfalandırma işlemleri **sunucuya gitmeden** istemcide yapılır:

```typescript
const [allOrders, setAllOrders] = useState<OzonOrder[]>([]);

// Filtreleme istemcide yapılır
const getDisplayOrders = () => {
    if (allOrders.length === 0) return data?.orders || [];

    let filtered = allOrders;
    if (statusFilter) {
        if (statusFilter === 'delivered') {
            filtered = allOrders.filter(o => o.status === 'delivered');
        } else if (statusFilter === 'delivering') {
            filtered = allOrders.filter(o => o.status === 'delivering');
        } else if (statusFilter === 'awaiting') {
            filtered = allOrders.filter(o => 
                o.status === 'awaiting_deliver' || o.status === 'awaiting_packaging'
            );
        } else if (statusFilter === 'cancelled') {
            filtered = allOrders.filter(o => o.status === 'cancelled');
        }
    }

    // İstemci tarafında sayfalandırma
    const pageSize = 50;
    const startIndex = (currentPage - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
};
```

### 3. **İstemci Tarafında Sayfalandırma**

Sayfa değişikliklerinde API isteği gönderilmez, veriler cache'den okunur:

```typescript
const getPagination = () => {
    if (allOrders.length === 0) return data?.pagination;

    // Filtreleme uygula
    let filtered = allOrders;
    if (statusFilter) { /* ... filtreleme mantığı ... */ }

    const pageSize = 50;
    return {
        currentPage,
        totalPages: Math.ceil(filtered.length / pageSize),
        pageSize,
        totalItems: filtered.length,
    };
};
```

### 4. **Ozon API Entegrasyonu**

Backend'de Ozon API'den veri çekilirken pagination ile tüm veriler toplanır:

```typescript
// route.ts - fetchAllPostingsForMonth
async function fetchAllPostingsForMonth(
    start: Date,
    end: Date,
    clientId: string,
    apiKey: string
): Promise<OzonPosting[]> {
    const allPostings: OzonPosting[] = [];
    let offset = 0;
    const limit = 1000;  // Maksimum limit
    let hasNext = true;
    let pageCount = 0;

    // has_next false olana kadar devam et
    while (hasNext && pageCount < 50) {
        const result = await fetchPostingsPage(start, end, offset, limit, clientId, apiKey);
        allPostings.push(...result.postings);
        hasNext = result.hasNext;
        offset += limit;
        pageCount++;
    }

    return allPostings;
}
```

**Ozon API Endpoint:** `POST /v3/posting/fbs/list`

```typescript
const data = await fetchAPI(`${OZON_API_BASE}/v3/posting/fbs/list`, {
    method: "POST",
    headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
    },
    body: JSON.stringify({
        dir: "DESC",
        filter: {
            since: start.toISOString(),  // Ay başlangıcı
            to: end.toISOString(),        // Ay sonu
        },
        limit: 1000,
        offset: 0,
        with: {
            analytics_data: true,
            barcodes: false,
            financial_data: false,
            translit: false,
        },
    }),
    retries: 3,
    retryDelay: 2000,
});
```

---

## 🔄 Aylar Arası Geçiş Mekanizması

### Tetikleme

Ay veya yıl değiştiğinde `useEffect` hook'u tetiklenir:

```typescript
useEffect(() => {
    setStatusFilter(null);  // Filtreyi sıfırla
    setCurrentPage(1);       // Sayfayı başa al
    fetchOrders();           // Yeni verileri çek
}, [selectedYear, selectedMonth]);
```

### Akış Diyagramı

```
          ┌─────────────────────────────────────────────────────────┐
          │                  Kullanıcı Ay Değiştirdi                │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │   setSelectedMonth(newMonth) / setSelectedYear(newYear) │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │              useEffect Tetiklendi                       │
          │   - setStatusFilter(null)                               │
          │   - setCurrentPage(1)                                   │
          │   - fetchOrders()                                       │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │  GET /api/ozon/monthly-orders?year=X&month=Y&all=true   │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │               Backend İşlemleri:                        │
          │   1. Ozon API'den tüm ay verileri çekilir               │
          │   2. İstatistikler hesaplanır                           │
          │   3. Belge durumları DB'den sorgulanır                  │
          │   4. Response döndürülür                                │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │                İstemci İşlemleri:                       │
          │   1. allOrders state'e cache'lenir                      │
          │   2. stats ve documentStatus kaydedilir                 │
          │   3. UI güncellenir (loading kaldırılır)                │
          └─────────────────────────────────────────────────────────┘
                                      │
                                      ▼
          ┌─────────────────────────────────────────────────────────┐
          │  Artık filtreleme ve sayfalandırma ANINDA yapılabilir   │
          │         (Sunucuya istek atılmaz, cache kullanılır)      │
          └─────────────────────────────────────────────────────────┘
```

---

## 📊 Durum Filtreleme

İstatistik kartlarına tıklandığında filtreleme yapılır, **API isteği gönderilmez**:

```typescript
// Kart tıklama
onClick={() => setStatusFilter(statusFilter === 'delivered' ? null : 'delivered')}

// useEffect ile sayfa sıfırlama (API isteği yok)
useEffect(() => {
    setCurrentPage(1);
}, [statusFilter]);
```

Filtrelenen veriler `getDisplayOrders()` fonksiyonu ile anında hesaplanır.

---

## 🗄️ Veritabanı Sorguları

Belge durumları için iki tablo sorgulanır:

```typescript
// OrderDocument tablosu (Belgeler sayfası verileri)
const orderDocuments = await prisma.orderDocument.findMany({
    where: { postingNumber: { in: postingNumbers } },
    select: {
        postingNumber: true,
        alisPdfUrl: true,
        satisPdfUrl: true,
        etgbPdfUrl: true,
    },
});

// Invoice tablosu (Sevkiyatlar sayfası verileri)
const invoices = await prisma.invoice.findMany({
    where: { postingNumber: { in: postingNumbers } },
    select: {
        postingNumber: true,
        pdfUrl: true,
        etgbPdfUrl: true,
    },
});

// Birleştirilmiş durum
documentStatus[posting_number] = {
    alis: !!doc?.alisPdfUrl,
    satis: !!(doc?.satisPdfUrl || inv?.pdfUrl),
    etgb: !!(doc?.etgbPdfUrl || inv?.etgbPdfUrl),
};
```

---

## 🔁 Retry Mekanizması

`lib/api.ts` dosyasındaki `fetchAPI` fonksiyonu otomatik retry sağlar:

```typescript
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_TIMEOUT = 15000;

// Exponential backoff
await new Promise((resolve) =>
    setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1))
);
// 1000ms -> 2000ms -> 4000ms
```

**Retry Koşulları:**
- Timeout (AbortError)
- Network hataları (TypeError)
- 5xx sunucu hataları
- 429 Too Many Requests

---

## 📌 Özet: Neden Hızlı?

| Özellik | Avantaj |
|---------|---------|
| **Tek fetch stratejisi** | Ay değişiminde sadece 1 API isteği |
| **Client-side cache** | Filtreleme/sayfalama sunucuya gitmez |
| **Veri lokalizasyonu** | Tüm ay verisi RAM'de tutulur |
| **Optimize edilmiş DB sorguları** | Tek `findMany` ile tüm belge durumları |
| **Retry mekanizması** | Geçici hatalar otomatik çözülür |
| **React state optimizasyonu** | Gereksiz re-render önlenir |

---

## 🛠️ Geliştirici Notları

### Yeni Filtre Eklemek

1. `statusFilter` state'ine yeni değer ekle
2. `getDisplayOrders()` içinde filtre koşulu ekle
3. `getPagination()` içinde aynı koşulu ekle
4. UI'da buton/kart ekle

### Cache'i Yenilemek

```typescript
// Manual refresh
fetchOrders();

// Belge kayıttan sonra otomatik refresh
onSuccess={() => fetchOrders()}
```

---

*Bu doküman, 15 Aralık 2025 tarihinde oluşturulmuştur.*
