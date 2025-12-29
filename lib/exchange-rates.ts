/**
 * Rusya Merkez Bankası (CBR) ve Türkiye Cumhuriyet Merkez Bankası (TCMB)
 * döviz kurlarını çekmek için yardımcı fonksiyonlar
 */

import { XMLParser } from 'fast-xml-parser';

// ============================================
// CBR - Rusya Merkez Bankası (USD/RUB)
// ============================================

const CBR_BASE_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

// In-memory cache for CBR rates (key: date string, value: rate)
const cbrCache = new Map<string, number>();

/**
 * Cache'den CBR kurunu al veya API'den çekip cache'le
 */
export function getCachedCbrRate(date: string): number | undefined {
  return cbrCache.get(date);
}

/**
 * CBR cache'ini temizle
 */
export function clearCbrCache(): void {
  cbrCache.clear();
}

/**
 * Rusya Merkez Bankası'ndan USD/RUB kurunu çeker (cache destekli)
 * @param date - 'DD/MM/YYYY' formatında tarih (örn: '16/12/2025') veya undefined (bugün)
 * @returns USD/RUB kuru
 */
export async function getCbrUsdRub(date?: string): Promise<number> {
  // Cache'de varsa direkt döndür
  const cacheKey = date || 'today';
  const cachedRate = cbrCache.get(cacheKey);
  if (cachedRate !== undefined) {
    console.log(`[CBR] Cache hit: ${cacheKey} = ${cachedRate}`);
    return cachedRate;
  }

  const url = date
    ? `${CBR_BASE_URL}?date_req=${date}`
    : CBR_BASE_URL;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`CBR API hatası: ${response.status}`);
  }

  const xmlText = await response.text();
  const parser = new XMLParser();
  const result = parser.parse(xmlText);

  // XML yapısı: ValCurs -> Valute[] -> CharCode, Nominal, Value
  const valutes = result.ValCurs?.Valute;
  if (!valutes) {
    throw new Error("CBR XML yapısı beklenenden farklı");
  }

  const valuteArray = Array.isArray(valutes) ? valutes : [valutes];
  const usdValute = valuteArray.find((v: any) => v.CharCode === "USD");

  if (!usdValute) {
    throw new Error("USD bulunamadı");
  }

  const nominal = parseInt(usdValute.Nominal) || 1;
  const valueStr = String(usdValute.Value).replace(",", ".");
  const value = parseFloat(valueStr);
  const rate = value / nominal;

  // Cache'e kaydet
  cbrCache.set(cacheKey, rate);
  console.log(`[CBR] Fetched and cached: ${cacheKey} = ${rate}`);

  return rate;
}

// ============================================
// TCMB - Türkiye Cumhuriyet Merkez Bankası (USD/TRY)
// ============================================

const TCMB_BASE_URL = "https://www.tcmb.gov.tr/kurlar";

/**
 * TCMB'den USD/TRY kurunu çeker
 * @param date - 'DD.MM.YYYY' formatında tarih (örn: '16.12.2025') veya undefined (bugün)
 * @returns USD/TRY döviz satış kuru
 */
export async function getTcmbUsdTry(date?: string): Promise<number> {
  let url: string;

  if (date) {
    // Tarih formatı: DD.MM.YYYY -> YYYYMM/DDMMYYYY.xml
    const parts = date.split(".");
    if (parts.length !== 3) {
      throw new Error("Tarih formatı DD.MM.YYYY olmalı");
    }
    const [day, month, year] = parts;
    url = `${TCMB_BASE_URL}/${year}${month}/${day}${month}${year}.xml`;
  } else {
    url = `${TCMB_BASE_URL}/today.xml`;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TCMB API hatası: ${response.status} (tatil/hafta sonu olabilir)`);
  }

  const xmlText = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const result = parser.parse(xmlText);

  // XML yapısı: Tarih_Date -> Currency[] -> @_CurrencyCode, ForexSelling
  const currencies = result.Tarih_Date?.Currency;
  if (!currencies) {
    throw new Error("TCMB XML yapısı beklenenden farklı");
  }

  const currencyArray = Array.isArray(currencies) ? currencies : [currencies];
  const usdCurrency = currencyArray.find((c: any) => c["@_CurrencyCode"] === "USD");

  if (!usdCurrency) {
    throw new Error("USD bulunamadı (tatil/hafta sonu olabilir)");
  }

  const forexSelling = usdCurrency.ForexSelling;
  if (!forexSelling) {
    throw new Error("ForexSelling değeri bulunamadı");
  }

  return parseFloat(String(forexSelling));
}

// ============================================
// Yardımcı Fonksiyonlar
// ============================================

/**
 * Tarih formatını DD.MM.YYYY'den DD/MM/YYYY'ye çevirir (TCMB -> CBR)
 */
export function convertDateFormatTcmbToCbr(tcmbDate: string): string {
  return tcmbDate.replace(/\./g, "/");
}

/**
 * Tarih formatını DD/MM/YYYY'den DD.MM.YYYY'ye çevirir (CBR -> TCMB)
 */
export function convertDateFormatCbrToTcmb(cbrDate: string): string {
  return cbrDate.replace(/\//g, ".");
}

/**
 * JavaScript Date nesnesinden DD.MM.YYYY formatına çevirir
 */
export function formatDateForTcmb(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * JavaScript Date nesnesinden DD/MM/YYYY formatına çevirir
 */
export function formatDateForCbr(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Her iki merkez bankasından kurları çeker
 * @param date - 'DD.MM.YYYY' formatında tarih
 * @returns { usdTry, usdRub } kurları
 */
export async function getBothExchangeRates(date?: string): Promise<{
  usdTry: number;
  usdRub: number;
  date: string;
}> {
  const tcmbDate = date;
  const cbrDate = date ? convertDateFormatTcmbToCbr(date) : undefined;

  const [usdTry, usdRub] = await Promise.all([
    getTcmbUsdTry(tcmbDate),
    getCbrUsdRub(cbrDate),
  ]);

  return {
    usdTry,
    usdRub,
    date: date || formatDateForTcmb(new Date()),
  };
}
