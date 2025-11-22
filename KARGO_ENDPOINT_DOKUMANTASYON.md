# Kargo Sayfası Endpoint Dokümantasyonu

## Genel Bakış

Kargo sayfası, Ozon FBS (Fulfillment by Seller) siparişlerini görüntülemek için kullanılır. Sayfa, **sevkiyat bekleyen** (`awaiting_deliver`) ve **kargoda** (`delivering`) durumundaki siparişleri gösterir.

## Kullanılan Endpoint

### Backend API Endpoint
```
GET /api/ozon/fbs-postings
```

Bu endpoint, Ozon Seller API'sinden FBS siparişlerini çeker ve frontend'e döndürür.

## Endpoint Detayları

### Request Parametreleri

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `status` | string | Hayır | Sipariş durumu. Geçerli değerler: `awaiting_deliver`, `delivering`, `delivered`, `cancelled`, `awaiting_packaging` |
| `since` | string (ISO 8601) | Hayır | Başlangıç tarihi. Varsayılan: 6 ay önce |
| `to` | string (ISO 8601) | Hayır | Bitiş tarihi. Varsayılan: Bugün |

### Request Örneği

```javascript
// Frontend'den çağrı (useOzonOrders hook'u içinde)
const response = await fetch(
  `/api/ozon/fbs-postings?status=awaiting_deliver&since=${startDate.toISOString()}&to=${endDate.toISOString()}`
);
```

### Backend İşleyişi

Backend endpoint'i (`src/app/api/ozon/fbs-postings/route.ts`) şu adımları izler:

1. **Ortam Değişkenlerini Kontrol Eder:**
   - `OZON_API_KEY`: Ozon API anahtarı
   - `OZON_CLIENT_ID`: Ozon Client ID

2. **Tarih Parametrelerini İşler:**
   - `since` ve `to` parametrelerini alır
   - Eğer verilmemişse, varsayılan olarak son 6 ayı kullanır
   - `to` tarihini günün sonuna ayarlar (23:59:59.999)

3. **Ozon API'ye İstek Atar:**
   - **Endpoint:** `https://api-seller.ozon.ru/v3/posting/fbs/list`
   - **Method:** `POST`
   - **Headers:**
     ```
     Client-Id: {OZON_CLIENT_ID}
     Api-Key: {OZON_API_KEY}
     Content-Type: application/json
     ```
   - **Body:**
     ```json
     {
       "dir": "ASC",
       "filter": {
         "since": "2024-01-01T00:00:00.000Z",
         "to": "2024-07-01T23:59:59.999Z",
         "status": "awaiting_deliver"
       },
       "limit": 1000,
       "offset": 0,
       "with": {
         "analytics_data": true,
         "barcodes": true,
         "financial_data": false,
         "translit": false
       }
     }
     ```

4. **Sayfalama İşlemi:**
   - Ozon API'den gelen `has_next` değerine göre tüm sayfaları çeker
   - Her sayfada maksimum 1000 kayıt alır
   - Tüm kayıtları birleştirip döndürür

### Response Formatı

Endpoint, Ozon API'den gelen sipariş listesini olduğu gibi döndürür:

```typescript
interface OzonOrder {
  posting_number: string;           // Gönderi numarası
  order_id?: number;                // Sipariş ID
  order_number?: string;             // Sipariş numarası
  order_date?: string;               // Sipariş tarihi
  status?: string;                   // Sipariş durumu
  tracking_number?: string;          // Takip numarası
  in_process_at?: string;            // İşleme alınma tarihi
  shipment_date?: string;            // Sevkiyat tarihi
  products?: PostingProduct[];       // Ürünler listesi
  analytics_data?: {
    region: string;                  // Bölge
    city: string;                    // Şehir
    delivery_type: string;           // Teslimat tipi
    warehouse_id?: number;            // Depo ID
    warehouse?: string;              // Depo adı
  };
  barcodes?: {
    upper_barcode?: string;
    lower_barcode?: string;
    // ... diğer barkod alanları
  };
  // ... diğer alanlar
}

interface PostingProduct {
  name: string;                      // Ürün adı
  quantity: number;                  // Miktar
  price: string;                    // Fiyat
  offer_id?: string;                // Ürün kodu (offer ID)
  sku?: number;                     // SKU numarası
  currency_code?: string;            // Para birimi
}
```

### Response Örneği

```json
[
  {
    "posting_number": "12345678-0001",
    "order_id": 123456789,
    "order_number": "12345678",
    "status": "awaiting_deliver",
    "tracking_number": "TRACK123456",
    "in_process_at": "2024-06-15T10:30:00Z",
    "shipment_date": "2024-06-16T14:20:00Z",
    "products": [
      {
        "name": "Ürün Adı",
        "quantity": 1,
        "price": "1500.00",
        "offer_id": "PRODUCT-CODE-123",
        "sku": 987654321,
        "currency_code": "RUB"
      }
    ],
    "analytics_data": {
      "region": "Москва",
      "city": "Москва",
      "delivery_type": "delivery",
      "warehouse_id": 123,
      "warehouse": "Depo Adı"
    }
  }
]
```

## Frontend Kullanımı

### useOzonOrders Hook'u

Kargo sayfası, veri çekmek için `useOzonOrders` hook'unu kullanır:

```typescript
// src/hooks/useOzonOrders.ts
const { 
  newOrders,           // awaiting_deliver durumundaki siparişler
  loadingNew,         // Yükleme durumu
  errorNew,           // Hata mesajı
  fetchNewOrders,     // Veri çekme fonksiyonu
  deliveringOrders,   // delivering durumundaki siparişler
  loadingDelivering,  // Yükleme durumu
  errorDelivering,    // Hata mesajı
  fetchDeliveringOrders // Veri çekme fonksiyonu
} = useOzonOrders();
```

### Kargo Sayfası Kullanımı

```typescript
// src/app/kargo/page.tsx
export default function KargoPage() {
  const { 
    newOrders, 
    loadingNew, 
    errorNew, 
    fetchNewOrders,
    deliveringOrders, 
    loadingDelivering, 
    errorDelivering, 
    fetchDeliveringOrders 
  } = useOzonOrders();

  // Tarih aralığı: Son 6 ay
  const [endDate] = useState<Date | undefined>(new Date());
  const [startDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Verileri çek
  const fetchAll = useCallback(() => {
    if (!startDate || !endDate) return;
    fetchNewOrders(startDate, endDate);        // awaiting_deliver durumu
    fetchDeliveringOrders(startDate, endDate); // delivering durumu
  }, [startDate, endDate, fetchNewOrders, fetchDeliveringOrders]);

  // Sayfa yüklendiğinde verileri çek
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    // ... UI bileşenleri
  );
}
```

## Kendi Projenizde Kullanım

### 1. Basit Fetch Kullanımı

```javascript
// Tarih aralığını belirle
const startDate = new Date();
startDate.setMonth(startDate.getMonth() - 6);
startDate.setHours(0, 0, 0, 0);

const endDate = new Date();
endDate.setHours(23, 59, 59, 999);

// Sevkiyat bekleyen siparişleri çek
const response = await fetch(
  `/api/ozon/fbs-postings?status=awaiting_deliver&since=${startDate.toISOString()}&to=${endDate.toISOString()}`
);

if (!response.ok) {
  throw new Error('Siparişler alınamadı');
}

const orders = await response.json();
console.log('Sevkiyat bekleyen siparişler:', orders);
```

### 2. Kargoda Olan Siparişleri Çekme

```javascript
// Kargoda olan siparişleri çek
const response = await fetch(
  `/api/ozon/fbs-postings?status=delivering&since=${startDate.toISOString()}&to=${endDate.toISOString()}`
);

const deliveringOrders = await response.json();
console.log('Kargoda olan siparişler:', deliveringOrders);
```

### 3. Tüm Durumları Çekme

```javascript
const statuses = ['awaiting_deliver', 'delivering', 'delivered', 'cancelled'];

const allOrders = await Promise.all(
  statuses.map(status => 
    fetch(`/api/ozon/fbs-postings?status=${status}&since=${startDate.toISOString()}&to=${endDate.toISOString()}`)
      .then(res => res.json())
  )
);

console.log('Tüm siparişler:', allOrders);
```

### 4. Axios ile Kullanım

```javascript
import axios from 'axios';

const startDate = new Date();
startDate.setMonth(startDate.getMonth() - 6);
startDate.setHours(0, 0, 0, 0);

const endDate = new Date();
endDate.setHours(23, 59, 59, 999);

const response = await axios.get('/api/ozon/fbs-postings', {
  params: {
    status: 'awaiting_deliver',
    since: startDate.toISOString(),
    to: endDate.toISOString()
  }
});

const orders = response.data;
```

### 5. React Hook Olarak Kullanım

```typescript
import { useState, useEffect } from 'react';

function useOzonFbsOrders(status: string, startDate: Date, endDate: Date) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `/api/ozon/fbs-postings?status=${status}&since=${startDate.toISOString()}&to=${endDate.toISOString()}`
        );
        
        if (!response.ok) {
          throw new Error('Siparişler alınamadı');
        }
        
        const data = await response.json();
        setOrders(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [status, startDate, endDate]);

  return { orders, loading, error };
}

// Kullanım
function MyComponent() {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  const endDate = new Date();
  
  const { orders, loading, error } = useOzonFbsOrders(
    'awaiting_deliver',
    startDate,
    endDate
  );

  if (loading) return <div>Yükleniyor...</div>;
  if (error) return <div>Hata: {error}</div>;

  return (
    <div>
      {orders.map(order => (
        <div key={order.posting_number}>
          {order.posting_number} - {order.status}
        </div>
      ))}
    </div>
  );
}
```

## Doğrudan Ozon API Kullanımı

Eğer backend endpoint'i kullanmak yerine doğrudan Ozon API'sine istek atmak isterseniz:

### Gereksinimler

1. **Ozon API Anahtarları:**
   - `Client-Id`: Ozon Seller hesabınızdan alınır
   - `Api-Key`: Ozon Seller hesabınızdan alınır

2. **API Endpoint:**
   ```
   POST https://api-seller.ozon.ru/v3/posting/fbs/list
   ```

### Örnek İstek

```javascript
const OZON_CLIENT_ID = 'your-client-id';
const OZON_API_KEY = 'your-api-key';

const response = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
  method: 'POST',
  headers: {
    'Client-Id': OZON_CLIENT_ID,
    'Api-Key': OZON_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    dir: 'ASC',
    filter: {
      since: '2024-01-01T00:00:00.000Z',
      to: '2024-07-01T23:59:59.999Z',
      status: 'awaiting_deliver',
    },
    limit: 1000,
    offset: 0,
    with: {
      analytics_data: true,
      barcodes: true,
      financial_data: false,
      translit: false,
    },
  }),
});

const data = await response.json();
const orders = data.result?.postings || [];
```

### Sayfalama ile Tüm Verileri Çekme

```javascript
async function fetchAllOzonOrders(status, since, to) {
  const OZON_CLIENT_ID = 'your-client-id';
  const OZON_API_KEY = 'your-api-key';
  
  const allOrders = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const response = await fetch('https://api-seller.ozon.ru/v3/posting/fbs/list', {
      method: 'POST',
      headers: {
        'Client-Id': OZON_CLIENT_ID,
        'Api-Key': OZON_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dir: 'ASC',
        filter: {
          since: since,
          to: to,
          status: status,
        },
        limit: limit,
        offset: offset,
        with: {
          analytics_data: true,
          barcodes: true,
          financial_data: false,
        },
      }),
    });
    
    const data = await response.json();
    const result = data?.result || {};
    const postings = Array.isArray(result.postings) ? result.postings : [];
    
    allOrders.push(...postings);
    
    // Eğer daha fazla sayfa yoksa döngüden çık
    if (!result.has_next) break;
    
    offset += postings.length || limit;
  }
  
  return allOrders;
}

// Kullanım
const orders = await fetchAllOzonOrders(
  'awaiting_deliver',
  '2024-01-01T00:00:00.000Z',
  '2024-07-01T23:59:59.999Z'
);
```

## Durum Kodları (Status)

| Durum | Açıklama |
|-------|----------|
| `awaiting_packaging` | Paketleme bekleniyor |
| `awaiting_deliver` | Sevkiyat bekleniyor (Kargo sayfasında kullanılıyor) |
| `delivering` | Kargoda (Kargo sayfasında kullanılıyor) |
| `delivered` | Teslim edildi |
| `cancelled` | İptal edildi |

## Önemli Notlar

1. **Tarih Formatı:** Tüm tarihler ISO 8601 formatında (UTC) gönderilmelidir.

2. **Sayfalama:** Ozon API, tek seferde maksimum 1000 kayıt döndürür. Daha fazla kayıt varsa `has_next: true` döner ve `offset` parametresi ile devam edilir.

3. **Rate Limiting:** Ozon API'nin rate limit'leri olabilir. Çok fazla istek atmaktan kaçının.

4. **Güvenlik:** API anahtarlarınızı asla frontend kodunda saklamayın. Backend endpoint'i kullanarak güvenliği sağlayın.

5. **Hata Yönetimi:** API isteklerinde mutlaka hata kontrolü yapın ve kullanıcıya uygun mesajlar gösterin.

## Sorun Giderme

### Hata: "API anahtarları yapılandırılmamış"
- `.env.local` dosyasında `OZON_API_KEY` ve `OZON_CLIENT_ID` değişkenlerinin tanımlı olduğundan emin olun.

### Hata: "Failed to fetch postings"
- Ozon API anahtarlarınızın geçerli olduğunu kontrol edin.
- İnternet bağlantınızı kontrol edin.
- Ozon API'nin çalışır durumda olduğunu kontrol edin.

### Boş Sonuç Döndürüyor
- Tarih aralığını kontrol edin. Belirtilen tarihler arasında sipariş olmayabilir.
- `status` parametresinin doğru olduğundan emin olun.

## İletişim ve Destek

Sorularınız için proje sahibi ile iletişime geçebilirsiniz.

