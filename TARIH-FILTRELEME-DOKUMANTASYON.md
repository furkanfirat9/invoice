# Tarih Filtreleme İşlemi Dokümantasyonu

Bu dokümantasyon, tabloda filtreler bölümünden tarih aralığına göre veri filtreleme işleminin nasıl çalıştığını açıklar.

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Akış Diyagramı](#akış-diyagramı)
3. [Detaylı Açıklama](#detaylı-açıklama)
4. [Kod Örnekleri](#kod-örnekleri)
5. [Önemli Noktalar](#önemli-noktalar)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Genel Bakış

Tarih filtreleme sistemi, kullanıcının seçtiği tarih aralığına göre siparişleri filtrelemek için çok katmanlı bir yaklaşım kullanır:

- **Frontend**: Kullanıcı tarih seçer
- **State Management**: Filtreler state'te tutulur
- **API Servisi**: Tarihler API formatına çevrilir
- **Backend**: Ozon API'ye istek atılır
- **Client-Side Filtreleme**: Ek güvenlik için tekrar filtreleme yapılır

---

## 🔄 Akış Diyagramı

```
Kullanıcı Tarih Seçer
        ↓
OrderFilters.tsx (DatePicker)
        ↓
Tarih YYYY-MM-DD formatına çevrilir
        ↓
DashboardPage.tsx (State güncellenir)
        ↓
useOrders Hook tetiklenir
        ↓
api.ts - getOrders() çağrılır
        ↓
Tarihler ISO 8601 formatına çevrilir
        ↓
/api/ozon/orders endpoint'ine istek atılır
        ↓
Ozon API'ye since/to parametreleri gönderilir
        ↓
Gelen veriler client-side'da tekrar filtrelenir
        ↓
Filtrelenmiş siparişler tabloda gösterilir
```

---

## 📝 Detaylı Açıklama

### 1. Frontend - Kullanıcı Arayüzü (OrderFilters.tsx)

**Dosya**: `src/components/orders/OrderFilters.tsx`

Kullanıcı tarih seçtiğinde:

```typescript
const handleStartDateChange = (date: Date | null) => {
  setStartDate(date);
  onFiltersChange({
    ...filters,
    startDate: date ? formatDateToYYYYMMDD(date) : undefined,
  });
};

const handleEndDateChange = (date: Date | null) => {
  setEndDate(date);
  onFiltersChange({
    ...filters,
    endDate: date ? formatDateToYYYYMMDD(date) : undefined,
  });
};
```

**Özellikler**:
- `react-datepicker` kütüphanesi kullanılır
- Tarih `Date` nesnesinden `YYYY-MM-DD` string formatına çevrilir
- `formatDateToYYYYMMDD` fonksiyonu timezone dönüşümü yapmadan sadece tarih kısmını alır

**Tarih Formatı Fonksiyonu**:
```typescript
const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

---

### 2. State Yönetimi (DashboardPage.tsx)

**Dosya**: `src/pages/DashboardPage.tsx`

Filtreler React state'inde tutulur:

```typescript
const [filters, setFilters] = useState<OrderFiltersType>({});
const { orders, loading, refetch, updateOrderInvoice } = useOrders(filters);
```

**Özellikler**:
- Filtreler obje olarak state'te saklanır
- `useOrders` hook'una parametre olarak geçilir
- Filtreler değiştiğinde hook otomatik olarak yeniden çalışır

---

### 3. Hook - Veri Çekme (useOrders.ts)

**Dosya**: `src/hooks/useOrders.ts`

Hook, filtreler değiştiğinde otomatik olarak veri çeker:

```typescript
const fetchOrders = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const data = await apiService.getOrders(filters);
    setOrders(data);
  } catch (err) {
    setError('Siparişler yüklenirken bir hata oluştu');
  } finally {
    setLoading(false);
  }
}, [filters]);

useEffect(() => {
  fetchOrders();
}, [fetchOrders]);
```

**Özellikler**:
- `useCallback` ile `fetchOrders` fonksiyonu memoize edilir
- `filters` değiştiğinde `useEffect` tetiklenir
- Loading ve error state'leri yönetilir

---

### 4. API Servisi - Tarih Dönüşümü (api.ts)

**Dosya**: `src/services/api.ts`

Tarihler Ozon API formatına çevrilir:

```typescript
// Varsayılan tarih aralığı: Son 60 gün
const defaultFromDate = new Date();
defaultFromDate.setDate(defaultFromDate.getDate() - 60);
defaultFromDate.setHours(0, 0, 0, 0);

const defaultToDate = new Date();
defaultToDate.setHours(23, 59, 59, 999);

// Tarih filtrelerini Ozon formatına çevir
let sinceDate: string;
let toDate: string;

if (filters?.startDate) {
  const startDate = new Date(filters.startDate);
  startDate.setHours(0, 0, 0, 0);
  sinceDate = startDate.toISOString();
} else {
  sinceDate = defaultFromDate.toISOString();
}

if (filters?.endDate) {
  const endDate = new Date(filters.endDate);
  endDate.setHours(23, 59, 59, 999);
  toDate = endDate.toISOString();
} else {
  toDate = defaultToDate.toISOString();
}
```

**Özellikler**:
- `YYYY-MM-DD` formatındaki tarih → ISO 8601 formatına çevrilir
- Başlangıç tarihi: `00:00:00` olarak ayarlanır
- Bitiş tarihi: `23:59:59.999` olarak ayarlanır (günün sonuna kadar)
- Filtre yoksa varsayılan olarak son 60 gün kullanılır

**Ozon API Filtreleri**:
```typescript
const awaitingDeliverFilters = {
  dir: 'DESC' as const,
  filter: {
    since: sinceDate,  // ISO 8601 formatında
    to: toDate,        // ISO 8601 formatında
    status: 'awaiting_deliver',
  },
  limit: 500,
  offset: 0,
};
```

---

### 5. Backend API Route (api/ozon/orders.ts)

**Dosya**: `api/ozon/orders.ts`

Backend'de Ozon API'ye istek atılır:

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { startDate, endDate, status } = req.query;

  // Varsayılan tarih aralığı: Son 60 gün
  const defaultFromDate = new Date();
  defaultFromDate.setDate(defaultFromDate.getDate() - 60);
  defaultFromDate.setHours(0, 0, 0, 0);

  const defaultToDate = new Date();
  defaultToDate.setHours(23, 59, 59, 999);

  const sinceDate = startDate 
    ? new Date(startDate as string).toISOString() 
    : defaultFromDate.toISOString();
    
  const toDate = endDate 
    ? new Date(endDate as string).toISOString() 
    : defaultToDate.toISOString();

  const requestBody = {
    dir: 'DESC' as const,
    filter: {
      since: sinceDate,
      to: toDate,
      ...(status && { status: status as string }),
    },
    limit: 500,
    offset: 0,
  };

  // Ozon API'ye istek atılır
  const response = await axios.post(
    `${OZON_API_BASE}/v3/posting/fbs/list`,
    requestBody,
    { headers: { ... } }
  );
}
```

**Özellikler**:
- Query parametrelerinden `startDate` ve `endDate` alınır
- ISO formatına çevrilir
- Ozon API'ye `since` ve `to` parametreleri gönderilir
- Sayfalama (pagination) otomatik olarak yapılır

---

### 6. Client-Side Ek Filtreleme (api.ts)

**Dosya**: `src/services/api.ts`

API'den gelen veriler üzerinde ek filtreleme yapılır:

```typescript
// Client-side filtreleme (Ozon API'de olmayan filtreler için)
if (filters.startDate || filters.endDate) {
  const normalizeDate = (dateStr: string): string => {
    // Eğer zaten YYYY-MM-DD formatındaysa direkt döndür
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    // Değilse Date nesnesine çevirip normalize et
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const startDateNormalized = filters.startDate 
    ? normalizeDate(filters.startDate) 
    : null;
    
  const endDateNormalized = filters.endDate 
    ? normalizeDate(filters.endDate) 
    : null;

  orders = orders.filter((order) => {
    if (!order.orderDate) return false;

    const orderDateNormalized = normalizeDate(order.orderDate);

    // Başlangıç tarihi kontrolü
    if (startDateNormalized && orderDateNormalized < startDateNormalized) {
      return false;
    }

    // Bitiş tarihi kontrolü
    if (endDateNormalized && orderDateNormalized > endDateNormalized) {
      return false;
    }

    return true;
  });
}
```

**Özellikler**:
- Tarihler `YYYY-MM-DD` formatına normalize edilir
- `orderDate` alanına göre filtreleme yapılır
- String karşılaştırması kullanılır (YYYY-MM-DD formatı sayesinde doğru çalışır)
- Başlangıç ve bitiş tarihi kontrolü yapılır

**Neden Çift Filtreleme?**
- Ozon API'nin `since/to` parametreleri farklı bir tarih alanına göre çalışabilir
- Ek güvenlik ve doğruluk için client-side'da da kontrol yapılır
- Kullanıcı deneyimini iyileştirir

---

## 💻 Kod Örnekleri

### Tam Akış Örneği

**1. Kullanıcı tarih seçer:**
```typescript
// OrderFilters.tsx
<DatePicker
  selected={startDate}
  onChange={handleStartDateChange}
  dateFormat="dd/MM/yyyy"
/>
```

**2. Tarih formatlanır:**
```typescript
// Input: Date object (2024-01-15T00:00:00.000Z)
// Output: "2024-01-15"
formatDateToYYYYMMDD(date)
```

**3. State güncellenir:**
```typescript
// DashboardPage.tsx
setFilters({
  startDate: "2024-01-15",
  endDate: "2024-01-20"
});
```

**4. Hook tetiklenir:**
```typescript
// useOrders.ts
useEffect(() => {
  fetchOrders(); // filters değişti, yeniden çek
}, [fetchOrders]);
```

**5. API servisi çağrılır:**
```typescript
// api.ts
const sinceDate = "2024-01-15T00:00:00.000Z";
const toDate = "2024-01-20T23:59:59.999Z";
ozonApiService.getOrders({ filter: { since: sinceDate, to: toDate } });
```

**6. Backend'e istek atılır:**
```typescript
// api/ozon/orders.ts
GET /api/ozon/orders?startDate=2024-01-15&endDate=2024-01-20
```

**7. Ozon API'ye istek:**
```typescript
POST https://api-seller.ozon.ru/v3/posting/fbs/list
{
  "filter": {
    "since": "2024-01-15T00:00:00.000Z",
    "to": "2024-01-20T23:59:59.999Z"
  }
}
```

**8. Client-side filtreleme:**
```typescript
// api.ts
orders.filter(order => {
  const orderDate = normalizeDate(order.orderDate); // "2024-01-15"
  return orderDate >= "2024-01-15" && orderDate <= "2024-01-20";
});
```

---

## ⚠️ Önemli Noktalar

### 1. Tarih Formatları

| Konum | Format | Örnek |
|-------|--------|-------|
| Frontend (State) | `YYYY-MM-DD` | `"2024-01-15"` |
| API Request | ISO 8601 | `"2024-01-15T00:00:00.000Z"` |
| Ozon API | ISO 8601 | `"2024-01-15T00:00:00.000Z"` |
| Client-Side Filter | `YYYY-MM-DD` | `"2024-01-15"` |

### 2. Timezone Yönetimi

- **Frontend**: Local timezone kullanılır, UTC'ye çevrilmez
- **API**: ISO formatına çevrilirken timezone bilgisi korunur
- **Ozon API**: UTC timezone bekler

### 3. Varsayılan Değerler

- **Filtre yoksa**: Son 60 gün otomatik olarak kullanılır
- **Başlangıç tarihi**: `00:00:00` (günün başı)
- **Bitiş tarihi**: `23:59:59.999` (günün sonu)

### 4. Performans

- **Sayfalama**: Her sayfada maksimum 500 kayıt
- **Paralel İstekler**: Farklı durumlar için paralel API çağrıları
- **Memoization**: `useCallback` ile gereksiz render'lar önlenir

### 5. Hata Yönetimi

- API hatalarında boş liste döndürülür
- Loading state'i kullanıcıya gösterilir
- Error state'i yönetilir

---

## 🔧 Troubleshooting

### Sorun 1: Tarih filtresi çalışmıyor

**Olası Nedenler:**
- Tarih formatı yanlış
- Timezone sorunu
- API'den gelen tarih formatı farklı

**Çözüm:**
```typescript
// normalizeDate fonksiyonunu kontrol et
console.log('Filter dates:', filters.startDate, filters.endDate);
console.log('Order dates:', orders.map(o => o.orderDate));
```

### Sorun 2: Yanlış tarih aralığı gösteriliyor

**Olası Nedenler:**
- Timezone dönüşümü hatası
- Saat bilgisi yanlış ayarlanmış

**Çözüm:**
```typescript
// Başlangıç tarihi kontrolü
const startDate = new Date(filters.startDate);
startDate.setHours(0, 0, 0, 0); // Önemli!

// Bitiş tarihi kontrolü
const endDate = new Date(filters.endDate);
endDate.setHours(23, 59, 59, 999); // Önemli!
```

### Sorun 3: API'den veri gelmiyor

**Olası Nedenler:**
- Ozon API credentials yanlış
- Tarih aralığı çok geniş
- API rate limit aşıldı

**Çözüm:**
```typescript
// Backend'de log ekle
console.log('API Request:', {
  since: sinceDate,
  to: toDate,
  status: status
});

// Response'u kontrol et
console.log('API Response:', response.data);
```

### Sorun 4: Client-side filtreleme çalışmıyor

**Olası Nedenler:**
- `orderDate` alanı boş
- Tarih formatı uyumsuz

**Çözüm:**
```typescript
// normalizeDate fonksiyonunu test et
const testDate = normalizeDate("2024-01-15");
console.log('Normalized:', testDate); // "2024-01-15" olmalı

// Filtreleme mantığını kontrol et
orders.forEach(order => {
  if (!order.orderDate) {
    console.warn('Order without date:', order.id);
  }
});
```

---

## 📚 İlgili Dosyalar

- `src/components/orders/OrderFilters.tsx` - Filtre bileşeni
- `src/pages/DashboardPage.tsx` - Ana sayfa, state yönetimi
- `src/hooks/useOrders.ts` - Veri çekme hook'u
- `src/services/api.ts` - API servisi, tarih dönüşümü
- `src/services/ozonApi.ts` - Ozon API servisi
- `api/ozon/orders.ts` - Backend API route
- `src/types/order.ts` - TypeScript tipleri

---

## 🎓 Öğrenme Notları

### Kendi Projenize Uygulama

1. **DatePicker Kurulumu:**
```bash
npm install react-datepicker
npm install --save-dev @types/react-datepicker
```

2. **Temel Filtre Bileşeni:**
```typescript
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const [startDate, setStartDate] = useState<Date | null>(null);
const [endDate, setEndDate] = useState<Date | null>(null);

<DatePicker
  selected={startDate}
  onChange={(date) => setStartDate(date)}
  dateFormat="dd/MM/yyyy"
/>
```

3. **Tarih Formatı Dönüşümü:**
```typescript
const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
```

4. **ISO Formatına Çevirme:**
```typescript
const toISOString = (dateStr: string): string => {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0); // Başlangıç için
  // veya
  date.setHours(23, 59, 59, 999); // Bitiş için
  return date.toISOString();
};
```

---

## ✅ Checklist

Kendi projenizde tarih filtreleme eklerken kontrol edin:

- [ ] DatePicker bileşeni kuruldu mu?
- [ ] Tarih formatı doğru mu? (`YYYY-MM-DD`)
- [ ] State yönetimi doğru mu?
- [ ] Hook doğru tetikleniyor mu?
- [ ] API servisi tarihleri doğru formatlıyor mu?
- [ ] Backend API route doğru çalışıyor mu?
- [ ] Client-side filtreleme eklenmiş mi?
- [ ] Varsayılan değerler ayarlandı mı?
- [ ] Hata yönetimi yapıldı mı?
- [ ] Loading state'i gösteriliyor mu?

---

**Son Güncelleme**: 2024
**Versiyon**: 1.0

