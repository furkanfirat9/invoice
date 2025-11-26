import { NextRequest, NextResponse } from "next/server";

const OZON_API_BASE = process.env.OZON_API_BASE || "https://api-seller.ozon.ru";
const OZON_CLIENT_ID = process.env.OZON_CLIENT_ID;
const OZON_API_KEY = process.env.OZON_API_KEY;

interface OzonPosting {
  posting_number: string;
  order_id?: number;
  order_number?: string;
  order_date?: string;
  status?: string;
  tracking_number?: string;
  in_process_at?: string;
  shipment_date?: string;
  products?: Array<{
    name: string;
    quantity: number;
    price: string;
    offer_id?: string;
    sku?: number;
    currency_code?: string;
  }>;
  analytics_data?: {
    region: string;
    city: string;
    delivery_type: string;
    warehouse_id?: number;
    warehouse?: string;
  };
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

// Tek bir istek aralığı için (maks 3 ay) verileri çeken fonksiyon
async function fetchChunk(
  start: Date,
  end: Date,
  status: string | undefined,
  clientId: string,
  apiKey: string
): Promise<OzonPosting[]> {
  const allPostings: OzonPosting[] = [];
  let offset = 0;
  const limit = 1000;
  let hasNext = true;
  let pageCount = 0;

  console.log(`Veri çekiliyor: ${start.toISOString()} - ${end.toISOString()} (Status: ${status || 'ALL'})`);

  while (hasNext) {
    const response = await fetch(`${OZON_API_BASE}/v3/posting/fbs/list`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dir: "ASC",
        filter: {
          since: start.toISOString(),
          to: end.toISOString(),
          ...(status ? { status } : {}),
        },
        limit: limit,
        offset: offset,
        with: {
          analytics_data: true,
          barcodes: true,
          financial_data: false,
          translit: false,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ozon API Chunk Error:", errorText);
      throw new Error(`API Hatası: ${errorText}`);
    }

    const data = await response.json();
    const result = data?.result || {};
    const postings = Array.isArray(result.postings) ? result.postings : [];

    allPostings.push(...postings);

    hasNext = result.has_next === true;
    offset += postings.length || limit;
    pageCount++;

    // Sonsuz döngü koruması (tek bir chunk için 20 sayfa = 20.000 kayıt yeterli olmalı)
    if (pageCount > 20) {
      console.warn("Sayfa limiti aşıldı (chunk)");
      break;
    }
  }

  return allPostings;
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Oturum kontrolü
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Oturum açmanız gerekiyor" },
        { status: 401 }
      );
    }

    // Kullanıcı bilgilerini ve Ozon API anahtarlarını veritabanından al
    let targetUserId = session.user.id;

    // Eğer kullanıcı CARRIER ise ve sellerId parametresi varsa, o satıcının bilgilerini kullan
    const searchParams = request.nextUrl.searchParams;
    const sellerId = searchParams.get("sellerId");

    if (session.user.role === "CARRIER") {
      if (sellerId) {
        targetUserId = sellerId;
      } else {
        // Carrier için varsayılan davranış: sellerId yoksa boş dön veya hata ver
        // Şimdilik boş dizi dönelim, arayüzde "Lütfen mağaza seçiniz" denir.
        return NextResponse.json([]);
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { ozonClientId: true, ozonApiKey: true }
    });

    const clientId = user?.ozonClientId;
    const apiKey = user?.ozonApiKey;

    // API anahtarlarını kontrol et
    if (!clientId || !apiKey) {
      return NextResponse.json(
        { error: "Seçilen mağazanın Ozon API anahtarları bulunamadı." },
        { status: 400 }
      );
    }

    // Query parametrelerini al (yukarıda zaten alınmıştı ama tekrar kullanıyoruz)
    // const searchParams = request.nextUrl.searchParams; // Zaten tanımlı
    const statusParam = searchParams.get("status");
    const status = (statusParam === "all" || !statusParam) ? undefined : statusParam;
    const since = searchParams.get("since");
    const to = searchParams.get("to");

    // Tarih aralığını belirle
    const globalStartDate = since
      ? new Date(since)
      : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        return d;
      })();

    const globalEndDate = to
      ? new Date(to)
      : (() => {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d;
      })();

    // Tarihleri parçalara böl (90 günlük dilimler)
    // Ozon API genellikle 3 aydan uzun periyotlarda hata verir (PERIOD_IS_TOO_LONG)
    const CHUNK_SIZE_MS = 90 * 24 * 60 * 60 * 1000; // 90 gün
    const chunks: { start: Date; end: Date }[] = [];

    let currentStart = new Date(globalStartDate);

    while (currentStart < globalEndDate) {
      let currentEnd = new Date(currentStart.getTime() + CHUNK_SIZE_MS);
      if (currentEnd > globalEndDate) {
        currentEnd = new Date(globalEndDate);
      }

      chunks.push({
        start: new Date(currentStart),
        end: new Date(currentEnd)
      });

      // Bir sonraki başlangıç, şimdiki bitişten 1 milisaniye sonrası
      currentStart = new Date(currentEnd.getTime() + 1);
    }

    console.log(`Toplam ${chunks.length} parça sorgulanacak.`);

    // Tüm parçaları paralel olarak çek
    const promises = chunks.map(chunk =>
      fetchChunk(chunk.start, chunk.end, status, clientId as string, apiKey as string)
        .catch(err => {
          console.error(`Chunk hatası (${chunk.start.toISOString()} - ${chunk.end.toISOString()}):`, err);
          return [] as OzonPosting[]; // Hata durumunda boş dön, diğerleri etkilenmesin
        })
    );

    const results = await Promise.all(promises);

    // Sonuçları tek bir dizide birleştir
    const allPostings = results.flat();

    // Tekrar eden kayıtları temizle (posting_number'a göre)
    // Tarih sınırlarında çakışma veya API kaynaklı dublikasyon olabilir
    const uniquePostingsMap = new Map<string, OzonPosting>();
    allPostings.forEach(p => {
      if (p.posting_number) {
        uniquePostingsMap.set(p.posting_number, p);
      }
    });

    const uniquePostings = Array.from(uniquePostingsMap.values());

    // Tarihe göre yeniden sırala (in_process_at veya shipment_date)
    uniquePostings.sort((a, b) => {
      const dateA = a.in_process_at || a.shipment_date || "";
      const dateB = b.in_process_at || b.shipment_date || "";
      return dateB.localeCompare(dateA); // Yeniden eskiye
    });

    console.log(`Toplam ${uniquePostings.length} benzersiz kayıt bulundu.`);

    return NextResponse.json(uniquePostings);
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası", details: error.message },
      { status: 500 }
    );
  }
}
