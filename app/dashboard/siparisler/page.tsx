"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isElif } from "@/lib/auth-utils";
import { useExchangeRates } from "@/contexts/ExchangeRateContext";

// Sipariş tipi
interface Order {
  id: string;
  orderDate: string;
  postingNumber: string;
  productCode: string;
  productName: string;
  productImage: string | null; // Ozon'dan gelen ürün görseli
  purchasePrice: number | null; // Manuel (TL)
  saleUsd: number; // Ozon'dan gelen satış fiyatı (USD)
  exchangeRate: number; // Ödeme hesaplama tarihindeki USD/TRY kuru
  shippingCost: number | null; // Manuel (USD)
  profit: number | null; // Hesaplanan (USD)
  procurementStatus: "pending" | "ordered" | "received" | "shipped" | "cancelled" | null;
  procurementNote: string | null; // Manuel - Tedarik notu
  supplierOrderNo: string | null; // Manuel
  note: string | null; // Manuel - Genel not
  ozonStatus?: string; // Ozon'dan gelen durum
  ozonStatusLabel?: string; // Ozon durumunun Türkçe karşılığı
  deliveryDate?: string; // Teslimat tarihi (Ozon'dan)
  // Cache alanları
  cachedNetProfitUsd?: number | null; // Cache'lenmiş net kar USD
  cachedNetProfitTry?: number | null; // Cache'lenmiş net kar TL
  isCancelled?: boolean; // İptal durumu
  profitCalculatedAt?: string | null; // Son hesaplama zamanı
}

// Kar hesaplama fonksiyonu (USD bazlı)
// Formül: Satış(USD) - (Alış(TL) / Kur) - Komisyon(USD) - Kargo(USD)
const calculateProfit = (order: Order, liveRate?: number): number | null => {
  if (order.purchasePrice === null || order.shippingCost === null) return null;
  // Canlı kur varsa onu kullan, yoksa siparisteki kaydedilmiş kuru kullan
  const exchangeRate = liveRate || order.exchangeRate;
  const purchaseUsd = order.purchasePrice / exchangeRate; // Alış TL -> USD
  const commissionUsd = order.saleUsd * 0.05; // %5 komisyon (USD üzerinden)
  return order.saleUsd - purchaseUsd - commissionUsd - order.shippingCost;
};

// Tedarik durumu badge'i
const getProcurementBadge = (status: Order["procurementStatus"]) => {
  switch (status) {
    case "pending":
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Bekliyor</span>;
    case "ordered":
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Sipariş Verildi</span>;
    case "received":
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Teslim Alındı</span>;
    case "shipped":
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">Gönderildi</span>;
    case "cancelled":
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">İptal</span>;
    default:
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-400">-</span>;
  }
};

// Tedarik durumu seçenekleri
const PROCUREMENT_OPTIONS = [
  { value: "pending", label: "Bekliyor" },
  { value: "ordered", label: "Sipariş Verildi" },
  { value: "received", label: "Teslim Alındı" },
  { value: "shipped", label: "Gönderildi" },
  { value: "cancelled", label: "İptal" },
];

// Düzenlenebilir Tedarik Dropdown
interface EditableProcurementCellProps {
  value: Order["procurementStatus"];
  onSave: (value: Order["procurementStatus"]) => void;
}

function EditableProcurementCell({ value, onSave }: EditableProcurementCellProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSave(e.target.value as Order["procurementStatus"]);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <select
        value={value || "pending"}
        onChange={handleChange}
        onBlur={() => setIsEditing(false)}
        autoFocus
        className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 animate-[fadeIn_0.15s_ease-out]"
      >
        {PROCUREMENT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
    >
      {getProcurementBadge(value)}
    </button>
  );
}

// Düzenlenebilir hücre bileşeni (Sayısal)
interface EditableCellProps {
  value: number | null;
  onSave: (value: number | null) => void;
  suffix?: string;
  placeholder?: string;
}

function EditableCell({ value, onSave, suffix = "₺", placeholder = "-" }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value?.toString() || "");

  const handleSave = () => {
    const numValue = inputValue.trim() === "" ? null : parseFloat(inputValue.replace(",", "."));
    onSave(numValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setInputValue(value?.toString() || "");
      setIsEditing(false);
    }
  };

  return (
    <div className="relative min-w-[80px] h-8 flex items-center justify-center">
      {isEditing ? (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="absolute inset-0 w-full h-full px-2 text-center text-sm border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 animate-[fadeIn_0.15s_ease-out]"
          placeholder="0"
        />
      ) : (
        <button
          onClick={() => {
            setInputValue(value?.toString() || "");
            setIsEditing(true);
          }}
          className="w-full h-full flex items-center justify-center px-2 hover:bg-blue-50 rounded transition-colors group"
        >
          {value !== null ? (
            <span className="text-gray-800 text-sm">{value.toLocaleString("tr-TR")} {suffix}</span>
          ) : (
            <span className="text-gray-400 group-hover:text-blue-500 text-sm">{placeholder}</span>
          )}
        </button>
      )}
    </div>
  );
}

// Düzenlenebilir hücre bileşeni (Metin)
interface EditableTextCellProps {
  value: string | null;
  onSave: (value: string | null) => void;
  placeholder?: string;
}

function EditableTextCell({ value, onSave, placeholder = "-" }: EditableTextCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");

  // URL olup olmadığını kontrol et
  const isUrl = (text: string | null): boolean => {
    if (!text) return false;
    return text.startsWith('http://') || text.startsWith('https://');
  };

  // URL'den domain adını çıkar (www.'dan sonraki kelime)
  const getDomainName = (url: string): string => {
    try {
      const hostname = new URL(url).hostname;
      // www. varsa kaldır, sonra ilk noktaya kadar al
      const cleanHost = hostname.replace(/^www\./, '');
      const domain = cleanHost.split('.')[0];
      return domain.charAt(0).toUpperCase() + domain.slice(1); // İlk harf büyük
    } catch {
      return 'Link';
    }
  };

  const handleSave = () => {
    const textValue = inputValue.trim() === "" ? null : inputValue.trim();
    onSave(textValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setInputValue(value || "");
      setIsEditing(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isUrl(value)) {
      // URL ise yeni sekmede aç
      window.open(value!, '_blank', 'noopener,noreferrer');
    } else {
      // URL değilse düzenleme moduna geç
      setInputValue(value || "");
      setIsEditing(true);
    }
  };

  const handleDoubleClick = () => {
    // Çift tıklama ile her zaman düzenleme moduna geç
    setInputValue(value || "");
    setIsEditing(true);
  };

  return (
    <div className="relative w-[120px] max-w-[120px] h-8 flex items-center justify-center">
      {isEditing ? (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="absolute inset-0 w-full h-full px-2 text-center text-xs font-mono border border-gray-300 rounded-md bg-white shadow-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 animate-[fadeIn_0.15s_ease-out]"
          placeholder="Sipariş No"
        />
      ) : (
        <button
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          className={`w-full h-full flex items-center justify-center px-2 rounded transition-colors group ${isUrl(value) ? 'hover:bg-blue-100' : 'hover:bg-blue-50'
            }`}
          title={isUrl(value) ? `${value} (tıkla: aç, çift tıkla: düzenle)` : value || undefined}
        >
          {value ? (
            <span className={`font-mono text-xs truncate max-w-full ${isUrl(value) ? 'text-blue-600 underline' : 'text-gray-600'
              }`}>
              {isUrl(value) ? `🔗 ${getDomainName(value)}` : value}
            </span>
          ) : (
            <span className="text-gray-400 group-hover:text-blue-500 text-xs">{placeholder}</span>
          )}
        </button>
      )}
    </div>
  );
}

// Yan Panel Bileşeni
interface SidePanelProps {
  order: Order | null;
  onClose: () => void;
  onSave: (orderId: string, field: string, value: string | null) => void;
}

interface FinanceData {
  postingNumber: string;
  orderDate: string;
  productName: string;
  deliveryDate: string | null;  // Teslim tarihi
  saleRevenue: number;
  saleCommission: number;
  deliveryServices: number;
  agencyFee: number;
  posFee: number;  // Sanal POS Ücreti
  otherOperations: Array<{ type: string; label: string; amount: number }>;
  totalAmount: number;
  currency: string;
  payment: {
    calculationDate: string;
    paymentDate: string;
    isPaid: boolean;
    rubUsdRate: number | null;
    usdTryRate: number | null;
    amountUsd: number | null;
    amountTry: number | null;
  };
}

function SidePanel({ order, onClose, onSave }: SidePanelProps) {
  const [noteValue, setNoteValue] = useState(order?.note || "");
  const [supplierOrderNoValue, setSupplierOrderNoValue] = useState(order?.supplierOrderNo || "");
  const [financeData, setFinanceData] = useState<FinanceData | null>(null);
  const [isLoadingFinance, setIsLoadingFinance] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);

  // Finance verilerini çek
  useEffect(() => {
    if (order?.postingNumber) {
      const fetchFinance = async () => {
        setIsLoadingFinance(true);
        setFinanceError(null);
        try {
          const res = await fetch(`/api/ozon/finance?postingNumber=${order.postingNumber}`);
          if (res.ok) {
            const data = await res.json();
            setFinanceData(data);
          } else {
            const err = await res.json();
            setFinanceError(err.error || 'Finansal veri yüklenemedi');
          }
        } catch (err) {
          setFinanceError('Bağlantı hatası');
        } finally {
          setIsLoadingFinance(false);
        }
      };
      fetchFinance();
    }
  }, [order?.postingNumber]);

  // Order değiştiğinde state'leri güncelle
  useEffect(() => {
    if (order) {
      setNoteValue(order.note || "");
      setSupplierOrderNoValue(order.supplierOrderNo || "");
    }
  }, [order?.id]);

  if (!order) return null;

  // Tutar formatlama (RUB)
  const formatRub = (amount: number) => {
    const formatted = Math.abs(amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount >= 0 ? `+${formatted} ₽` : `-${formatted} ₽`;
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 animate-[slideIn_0.2s_ease-out] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200" style={{ backgroundColor: '#222b35' }}>
          <h2 className="text-lg font-bold text-white">Sipariş Detayı</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Sipariş Bilgileri */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Sipariş Tarihi</span>
              <span className="text-sm font-medium">{new Date(order.orderDate).toLocaleDateString("tr-TR")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Gönderi No</span>
              <span className="text-sm font-mono text-blue-600">{order.postingNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Ürün Kodu</span>
              <span className="text-sm font-mono">{order.productCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Ürün</span>
              <span className="text-sm font-medium text-right max-w-[180px]">{order.productName || '-'}</span>
            </div>
            {/* Kargoya Verilme Tarihi */}
            {order.deliveryDate && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Kargoya Verilme Tarihi</span>
                <span className="text-sm font-medium">
                  {new Date(order.deliveryDate).toLocaleDateString("tr-TR")}
                </span>
              </div>
            )}
            {/* Teslim Tarihi (Finance API'den) */}
            {financeData?.deliveryDate && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Teslim Tarihi</span>
                <span className="text-sm font-medium text-emerald-600">
                  {new Date(financeData.deliveryDate).toLocaleDateString("tr-TR")}
                </span>
              </div>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Finansal Bilgiler */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">💰 Finansal Bilgiler</h3>

            {isLoadingFinance ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-sm text-gray-500">Yükleniyor...</span>
              </div>
            ) : financeError ? (
              <div className="text-sm text-red-500 py-2">{financeError}</div>
            ) : financeData ? (
              <>
                {/* Satış Geliri */}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Satış Geliri</span>
                  <span className="text-sm font-bold text-emerald-600">{formatRub(financeData.saleRevenue)}</span>
                </div>

                {/* Komisyon */}
                {financeData.saleCommission !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Komisyon</span>
                    <span className="text-sm text-red-500">{formatRub(financeData.saleCommission)}</span>
                  </div>
                )}

                {/* Uluslararası Nakliyat Hizmetleri */}
                {financeData.deliveryServices !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Uluslararası Nakliyat Hizmetleri</span>
                    <span className="text-sm text-red-500">{formatRub(financeData.deliveryServices)}</span>
                  </div>
                )}

                {/* Ozon Acentelik Ücreti */}
                {financeData.agencyFee !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Ozon Acentelik Ücreti</span>
                    <span className="text-sm text-red-500">{formatRub(financeData.agencyFee)}</span>
                  </div>
                )}

                {/* Sanal POS Ücreti */}
                {financeData.posFee !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Sanal POS Ücreti</span>
                    <span className="text-sm text-red-500">{formatRub(financeData.posFee)}</span>
                  </div>
                )}

                {/* Diğer İşlemler */}
                {financeData.otherOperations.map((op, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-sm text-gray-500 truncate max-w-[150px]" title={op.label}>{op.label}</span>
                    <span className={`text-sm ${op.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatRub(op.amount)}
                    </span>
                  </div>
                ))}

                {/* Ayırıcı çizgi */}
                <div className="border-t border-gray-200 pt-2 mt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Net Ödeme (RUB)</span>
                    <span className={`text-sm font-bold ${financeData.totalAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatRub(financeData.totalAmount)}
                    </span>
                  </div>

                  {/* Hesaplama ve Ödeme Tarihleri */}
                  {financeData.payment.calculationDate && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Hesaplama Tarihi</span>
                        <span className="text-sm text-gray-600">
                          {new Date(financeData.payment.calculationDate).toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Tahmini Ödeme</span>
                        <span className={`text-sm ${financeData.payment.isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {financeData.payment.isPaid ? '✓ ' : '~'}
                          {new Date(financeData.payment.paymentDate).toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                    </>
                  )}

                  {/* USD ve TL Tutarları */}
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Net Ödeme (USD)</span>
                    <span className="text-sm font-medium">
                      {financeData.payment.amountUsd !== null
                        ? `$${financeData.payment.amountUsd.toFixed(2)}`
                        : <span className="text-gray-400 italic">Bekliyor...</span>
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Net Ödeme (TL)</span>
                    <span className="text-sm font-medium">
                      {financeData.payment.amountTry !== null
                        ? `₺${financeData.payment.amountTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                        : <span className="text-gray-400 italic">Bekliyor...</span>
                      }
                    </span>
                  </div>

                  {/* Alış Fiyatı ve Net Kar */}
                  {order.purchasePrice && financeData.payment.amountTry !== null && (
                    <>
                      <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                        <span className="text-sm text-gray-500">Alış Fiyatı</span>
                        <span className="text-sm font-medium text-orange-600">
                          -₺{order.purchasePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-semibold text-gray-700">Net Kar (TL)</span>
                        <span className={`text-sm font-bold ${(financeData.payment.amountTry - order.purchasePrice) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {(financeData.payment.amountTry - order.purchasePrice) >= 0 ? '+' : ''}
                          ₺{(financeData.payment.amountTry - order.purchasePrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {/* Net Kar USD */}
                      {financeData.payment.usdTryRate && (
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold text-gray-700">Net Kar (USD)</span>
                          <span className={`text-sm font-bold ${((financeData.payment.amountTry - order.purchasePrice) / financeData.payment.usdTryRate) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {((financeData.payment.amountTry - order.purchasePrice) / financeData.payment.usdTryRate) >= 0 ? '+' : ''}
                            ${((financeData.payment.amountTry - order.purchasePrice) / financeData.payment.usdTryRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Kullanılan Kurlar */}
                  {(financeData.payment.rubUsdRate || financeData.payment.usdTryRate) && (
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                      <p className="text-xs text-gray-400 italic text-right">
                        {financeData.payment.rubUsdRate && (
                          <>USD/RUB: {financeData.payment.rubUsdRate.toFixed(2)} ({new Date(financeData.orderDate).toLocaleDateString("tr-TR")})</>
                        )}
                        {financeData.payment.rubUsdRate && financeData.payment.usdTryRate && ' • '}
                        {financeData.payment.usdTryRate && (
                          <>USD/TRY: {financeData.payment.usdTryRate.toFixed(2)} ({new Date(financeData.payment.paymentDate).toLocaleDateString("tr-TR")})</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400 py-2">Finansal veri bekleniyor...</div>
            )}
          </div>

          <hr className="border-gray-200" />

          {/* Tedarik Bilgileri */}
          <div className="space-y-3">
            {order.procurementNote && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Tedarik</span>
                <span className="text-sm font-medium">{order.procurementNote}</span>
              </div>
            )}

            {/* Sipariş No / URL - Düzenlenebilir */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                🔗 Sipariş No / URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={supplierOrderNoValue}
                  onChange={(e) => setSupplierOrderNoValue(e.target.value)}
                  placeholder="Sipariş numarası veya URL girin..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => {
                    onSave(order.id, 'supplierOrderNo', supplierOrderNoValue || null);
                  }}
                  className="px-3 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Kaydet
                </button>
              </div>
              {supplierOrderNoValue && supplierOrderNoValue.startsWith('http') && (
                <a
                  href={supplierOrderNoValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline block truncate"
                >
                  🔗 {supplierOrderNoValue}
                </a>
              )}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Ozon Durum</span>
              {getOzonStatusBadge(order.ozonStatus, order.ozonStatusLabel)}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Not Alanı */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📝 Not
            </label>
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Sipariş hakkında not ekleyin..."
              className="w-full h-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => {
              onSave(order.id, 'note', noteValue.trim() || null);
              onClose();
            }}
            className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Kaydet
          </button>
        </div>
      </div>
    </>
  );
}

// Ozon Status Badge
const getOzonStatusBadge = (status?: string, label?: string) => {
  const statusStyles: Record<string, string> = {
    'awaiting_deliver': 'bg-amber-100 text-amber-700',
    'awaiting_packaging': 'bg-blue-100 text-blue-700',
    'delivering': 'bg-indigo-100 text-indigo-700',
    'delivered': 'bg-emerald-100 text-emerald-700',
    'cancelled': 'bg-red-100 text-red-700',
    'arbitration': 'bg-orange-100 text-orange-700',
  };

  const style = statusStyles[status || ''] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${style}`}>
      {label || status || '-'}
    </span>
  );
};

export default function SiparislerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // Arka plan yenilemesi için
  const [error, setError] = useState<string | null>(null);
  const { rates } = useExchangeRates(); // Canlı döviz kurları

  // Yıl ve ay state'leri - varsayılan: Aralık 2025
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedMonth, setSelectedMonth] = useState(12);

  // Excel import state
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtreleme ve kar hesaplama state'leri
  const [filterNoPurchase, setFilterNoPurchase] = useState(false);
  const [filterCancelled, setFilterCancelled] = useState(false);
  const [isCalculatingProfit, setIsCalculatingProfit] = useState(false);
  const [calculateProgress, setCalculateProgress] = useState(0);

  // Ayın 15'i için USD/TRY kuru (TCMB'den)
  const [midMonthRate, setMidMonthRate] = useState<number | null>(null);

  // Cache helper fonksiyonları
  const getCacheKey = (year: number, month: number) => `ozon_orders_${year}_${month}`;

  const getFromCache = (year: number, month: number): { orders: Order[], timestamp: number } | null => {
    try {
      const cached = localStorage.getItem(getCacheKey(year, month));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.error('Cache okuma hatası:', e);
    }
    return null;
  };

  const saveToCache = (year: number, month: number, ordersData: Order[]) => {
    try {
      localStorage.setItem(getCacheKey(year, month), JSON.stringify({
        orders: ordersData,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Cache yazma hatası:', e);
    }
  };

  const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

  // Excel import handler
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ozon/orders/import", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (result.success) {
        alert(`✅ Import başarılı!\n\n${result.updated} kayıt güncellendi\n${result.skipped} satır atlandı`);
        // Verileri yenile (cache'i bypass et)
        fetchOrders(true);
      } else {
        alert(`❌ Hata: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Import hatası: ${err.message}`);
    } finally {
      setIsImporting(false);
      // Input'u sıfırla
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Kar hesaplama sonuçları için state
  const [profitResults, setProfitResults] = useState<{
    success: boolean;
    processed: number;
    skippedNoPurchase: number;
    skippedReturn: number;
    totalProfitTry: number;
    totalProfitUsd: number;
    cancelledLossTry: number;
    cancelledLossUsd: number;
    details: Array<{
      postingNumber: string;
      productName?: string;
      ozonPaymentTry: number;
      ozonPaymentUsd: number;
      purchasePrice: number;
      netProfitTry: number;
      netProfitUsd: number;
      isCancelled: boolean;
      orderDate?: string;
      deliveryDate?: string;
      calculationDate?: string;
      paymentDate?: string;
    }>;
  } | null>(null);
  const [showProfitModal, setShowProfitModal] = useState(false);

  // Modal sıralama state'leri
  type SortField = 'orderDate' | 'deliveryDate' | 'netProfitTry' | 'ozonPaymentUsd' | 'purchasePrice';
  const [modalSortField, setModalSortField] = useState<SortField>('orderDate');
  const [modalSortDirection, setModalSortDirection] = useState<'asc' | 'desc'>('asc');

  // Sıralama toggle fonksiyonu
  const toggleModalSort = (field: SortField) => {
    if (modalSortField === field) {
      setModalSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setModalSortField(field);
      setModalSortDirection('asc');
    }
  };

  // Sıralanmış sonuçlar
  const sortedProfitDetails = profitResults?.details ? [...profitResults.details].sort((a, b) => {
    let valueA: number = 0;
    let valueB: number = 0;

    switch (modalSortField) {
      case 'orderDate':
        valueA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
        valueB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
        break;
      case 'deliveryDate':
        valueA = a.deliveryDate ? new Date(a.deliveryDate).getTime() : 0;
        valueB = b.deliveryDate ? new Date(b.deliveryDate).getTime() : 0;
        break;
      case 'netProfitTry':
        valueA = a.netProfitTry || 0;
        valueB = b.netProfitTry || 0;
        break;
      case 'ozonPaymentUsd':
        valueA = a.ozonPaymentUsd || 0;
        valueB = b.ozonPaymentUsd || 0;
        break;
      case 'purchasePrice':
        valueA = a.purchasePrice || 0;
        valueB = b.purchasePrice || 0;
        break;
    }

    return modalSortDirection === 'asc' ? valueA - valueB : valueB - valueA;
  }) : [];

  // Kar hesaplama handler
  const handleCalculateProfit = async () => {
    setIsCalculatingProfit(true);
    setCalculateProgress(0);

    try {
      const postingNumbers = orders.map(o => o.postingNumber);

      const res = await fetch("/api/ozon/orders/calculate-profit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postingNumbers, year: selectedYear, month: selectedMonth }),
      });

      const result = await res.json();

      if (result.success) {
        setProfitResults(result);
        setShowProfitModal(true);
        // Verileri yenile (cache'i bypass et)
        fetchOrders(true);
      } else {
        alert(`❌ Hata: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Hesaplama hatası: ${err.message}`);
    } finally {
      setIsCalculatingProfit(false);
    }
  };

  // Ay isimleri
  const MONTHS = [
    { value: 1, label: 'Ocak' },
    { value: 2, label: 'Şubat' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' },
    { value: 5, label: 'Mayıs' },
    { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' },
    { value: 8, label: 'Ağustos' },
    { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' },
    { value: 11, label: 'Kasım' },
    { value: 12, label: 'Aralık' },
  ];

  // Mevcut tarihe göre seçilebilir yılları hesapla
  const getAvailableYears = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];

    // 2025'ten mevcut yıla kadar (2025 başlangıç yılı)
    for (let year = 2025; year <= currentYear; year++) {
      years.push(year);
    }
    return years;
  };

  // Seçili yıla göre seçilebilir ayları hesapla
  const getAvailableMonths = (year: number) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    if (year < currentYear) {
      // Geçmiş yıllar için tüm aylar
      return MONTHS;
    } else if (year === currentYear) {
      // Bu yıl için sadece mevcut aya kadar
      return MONTHS.filter(m => m.value <= currentMonth);
    }
    return [];
  };

  // Siparişleri çek (cache destekli)
  const fetchOrders = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);

      // Cache'den veri kontrolü
      const cached = getFromCache(selectedYear, selectedMonth);
      const isCacheValid = cached && (Date.now() - cached.timestamp) < CACHE_DURATION;

      if (cached && !forceRefresh) {
        // Cache varsa hemen göster
        setOrders(cached.orders);
        setIsLoading(false);
        console.log(`📦 Cache'den ${cached.orders.length} sipariş yüklendi (${selectedYear}-${selectedMonth})`);

        // Cache geçerliyse API çağrısı yapma
        if (isCacheValid) {
          console.log('✅ Cache geçerli, API çağrısı atlanıyor');
          return;
        }

        // Cache eskiyse arka planda güncelle
        setIsRefreshing(true);
      } else {
        // Cache yoksa loading göster
        setIsLoading(true);
      }

      // API'den güncel veriyi çek
      const response = await fetch(`/api/ozon/orders?year=${selectedYear}&month=${selectedMonth}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Siparişler yüklenemedi');
      }

      const data = await response.json();
      const newOrders = data.orders || [];

      setOrders(newOrders);
      saveToCache(selectedYear, selectedMonth, newOrders);
      console.log(`🔄 API'den ${newOrders.length} sipariş yüklendi ve cache'lendi (${selectedYear}-${selectedMonth})`);
    } catch (err: any) {
      console.error('Sipariş yükleme hatası:', err);
      // Cache varsa hatada bile göstermeye devam et
      if (orders.length === 0) {
        setError(err.message || 'Bir hata oluştu');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedYear, selectedMonth]);

  // Manuel yenileme fonksiyonu (cache'i bypass eder)
  const handleManualRefresh = () => {
    fetchOrders(true);
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchOrders();
    }
  }, [session?.user?.id, fetchOrders]);

  // Kayıtlı kar hesaplama sonuçlarını çek
  useEffect(() => {
    const fetchProfitResults = async () => {
      try {
        const res = await fetch(`/api/ozon/orders/profit-results?year=${selectedYear}&month=${selectedMonth}`);
        const data = await res.json();

        if (data.exists && data.success) {
          setProfitResults(data);
          console.log(`📊 Kayıtlı kar sonuçları yüklendi (${selectedYear}-${selectedMonth})`);
        } else {
          setProfitResults(null);
        }
      } catch (err) {
        console.error('Kar sonuçları çekme hatası:', err);
        setProfitResults(null);
      }
    };

    if (session?.user?.id) {
      fetchProfitResults();
    }
  }, [session?.user?.id, selectedYear, selectedMonth]);

  // Yıl değiştiğinde ayı kontrol et
  useEffect(() => {
    const availableMonths = getAvailableMonths(selectedYear);
    if (!availableMonths.find(m => m.value === selectedMonth)) {
      // Seçili ay bu yıl için geçerli değilse, son geçerli ayı seç
      setSelectedMonth(availableMonths[availableMonths.length - 1]?.value || 12);
    }
  }, [selectedYear]);

  // Ayın 15'i için kur çek (TCMB)
  useEffect(() => {
    const fetchMidMonthRate = async () => {
      // Tarih formatı: DD.MM.YYYY
      const day = '15';
      const month = String(selectedMonth).padStart(2, '0');
      const year = String(selectedYear);

      // Retry mekanizması (hafta sonu/tatil için geri git)
      for (let i = 0; i < 5; i++) {
        const currentDay = 15 - i;
        if (currentDay < 1) break;

        const dateStr = `${String(currentDay).padStart(2, '0')}.${month}.${year}`;
        try {
          const res = await fetch(`/api/exchange-rates/historical?date=${dateStr}&source=tcmb`);
          if (res.ok) {
            const data = await res.json();
            if (data.usdTry) {
              setMidMonthRate(data.usdTry);
              console.log(`💱 ${dateStr} kuru: ${data.usdTry}`);
              return;
            }
          }
        } catch (e) {
          console.log(`${dateStr} kuru alınamadı, önceki güne deneniyor...`);
        }
      }
      setMidMonthRate(null);
    };

    fetchMidMonthRate();
  }, [selectedYear, selectedMonth]);

  // Yetki kontrolü - sadece Elif erişebilir
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Yükleniyor...</div>
      </div>
    );
  }

  if (!isElif(session?.user?.email)) {
    router.push("/dashboard");
    return null;
  }

  // Sipariş güncelleme fonksiyonu
  const updateOrder = (orderId: string, field: keyof Order, value: any) => {
    setOrders(prev => prev.map(order =>
      order.id === orderId ? { ...order, [field]: value } : order
    ));
  };

  // Canlı kur (Coinbase'den gelen)
  const liveRate = rates?.usdTry;

  // Siparişleri kar hesaplaması ile güncelle (canlı kur kullanarak)
  const ordersWithProfit = orders.map(order => ({
    ...order,
    profit: calculateProfit(order, liveRate)
  }));

  // Gösterilecek siparişler (filtreli veya tümü)
  const displayOrders = filterNoPurchase
    ? ordersWithProfit.filter(o => o.purchasePrice === null)
    : filterCancelled
      ? ordersWithProfit.filter(o => o.ozonStatus === 'cancelled')
      : ordersWithProfit;

  // İstatistikleri hesapla
  const stats = {
    orderCount: ordersWithProfit.length,
    totalPurchaseTry: ordersWithProfit.reduce((sum, o) => sum + (o.purchasePrice || 0), 0),
    totalRevenueUsd: ordersWithProfit.reduce((sum, o) => sum + o.saleUsd, 0),
    // Cache'li kar USD (iptal hariç, alış fiyatı olanlar)
    cachedProfitUsd: ordersWithProfit
      .filter(o => o.ozonStatus !== 'cancelled' && o.purchasePrice !== null && o.cachedNetProfitUsd !== undefined)
      .reduce((sum, o) => sum + (o.cachedNetProfitUsd || 0), 0),
    // Cache'li kar TL (iptal hariç, alış fiyatı olanlar)
    cachedProfitTry: ordersWithProfit
      .filter(o => o.ozonStatus !== 'cancelled' && o.purchasePrice !== null && o.cachedNetProfitTry !== undefined)
      .reduce((sum, o) => sum + (o.cachedNetProfitTry || 0), 0),
    // İptal edilen sipariş sayısı
    cancelledCount: ordersWithProfit.filter(o => o.ozonStatus === 'cancelled').length,
    // Alış fiyatı girilmemiş sipariş sayısı
    noPurchaseCount: ordersWithProfit.filter(o => o.purchasePrice === null).length,
    // Hesaplanmış sipariş sayısı
    calculatedCount: ordersWithProfit.filter(o => o.profitCalculatedAt).length,
  };
  const profitMargin = stats.totalRevenueUsd > 0 ? (stats.cachedProfitUsd / stats.totalRevenueUsd) * 100 : 0;
  const roi = stats.totalPurchaseTry > 0 ? (stats.cachedProfitUsd / (stats.totalPurchaseTry / 35)) * 100 : 0;


  // Loading durumu
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">{MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear} siparişleri yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Error durumu
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-red-50 p-6 rounded-lg max-w-md">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-700 mb-2">Hata Oluştu</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => fetchOrders()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full overflow-hidden flex flex-col">
      {/* Yıl ve Ay Seçici */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">Siparişler</h1>
          <div className="flex items-center gap-2">
            {/* Yıl Seçici */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {getAvailableYears().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Ay Seçici */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {getAvailableMonths(selectedYear).map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>

            {/* Yenileme Butonu */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
              title="Verileri yenile"
            >
              <svg
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Arka Plan Yenileme Göstergesi */}
            {isRefreshing && (
              <span className="text-xs text-indigo-500 flex items-center gap-1">
                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                Güncelleniyor...
              </span>
            )}
          </div>
        </div>

        {/* Canlı Kur Bilgisi */}


        {/* Butonlar */}
        <div className="flex items-center gap-2">
          {/* Excel Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelImport}
            className="hidden"
            id="excel-import"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {isImporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>İçe Aktarılıyor...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Excel İçe Aktar</span>
              </>
            )}
          </button>

          {/* Kar Hesapla */}
          <button
            onClick={handleCalculateProfit}
            disabled={isCalculatingProfit}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isCalculatingProfit ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Hesaplanıyor...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Kar Hesapla</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Sipariş Sayısı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Sipariş Sayısı</p>
              <p className="text-xl font-bold text-gray-800">{stats.orderCount}</p>
            </div>
          </div>
        </div>

        {/* Toplam Alım */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Toplam Alım</p>
              <p className="text-xl font-bold text-gray-800">{stats.totalPurchaseTry.toLocaleString("tr-TR")} ₺</p>
            </div>
          </div>
        </div>

        {/* Toplam Ciro */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Toplam Ciro</p>
              <p className="text-xl font-bold text-gray-800">${stats.totalRevenueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              {midMonthRate && (
                <p className="text-xs text-gray-400">
                  ≈ {(stats.totalRevenueUsd * midMonthRate).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Toplam Kar (Cache'li) */}
        <div
          className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${profitResults ? 'cursor-pointer hover:border-emerald-300 transition-colors' : ''}`}
          onClick={() => profitResults && setShowProfitModal(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">
                Toplam Kar {profitResults && <span className="text-emerald-500">📊</span>}
              </p>
              {stats.calculatedCount > 0 ? (
                <>
                  <p className={`text-xl font-bold ${stats.cachedProfitUsd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {stats.cachedProfitUsd >= 0 ? "+" : ""}${stats.cachedProfitUsd.toFixed(2)}
                  </p>
                  {stats.cachedProfitTry !== 0 && (
                    <p className={`text-xs ${stats.cachedProfitTry >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {stats.cachedProfitTry >= 0 ? "+" : ""}{stats.cachedProfitTry.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400">Hesaplanmadı</p>
              )}
            </div>
          </div>
        </div>

        {/* İptaller */}
        <div
          className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition-colors ${filterCancelled ? 'border-red-400 bg-red-50' : 'border-red-100 hover:border-red-300'}`}
          onClick={() => { setFilterCancelled(!filterCancelled); setFilterNoPurchase(false); }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">İptaller</p>
              <p className="text-xl font-bold text-red-600">
                {stats.cancelledCount}
              </p>
            </div>
          </div>
        </div>

        {/* Hesaplanmayanlar (Alış Fiyatı Eksik) */}
        <div
          className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition-colors ${filterNoPurchase ? 'border-amber-400 bg-amber-50' : 'border-amber-100 hover:border-amber-300'}`}
          onClick={() => { setFilterNoPurchase(!filterNoPurchase); setFilterCancelled(false); }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Hesaplanmayanlar</p>
              <p className="text-xl font-bold text-amber-600">
                {stats.noPurchaseCount}
              </p>
            </div>
          </div>
        </div>
      </div>



      {/* Sipariş Tablosu */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#222b35' }}>
              <tr>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Sipariş Tarihi
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Gönderi No
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Görsel
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Ürün
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Alış
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Satış
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Tedarik
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Sipariş No
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Ozon Durum
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Detay
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayOrders.map((order) => (
                <tr
                  key={order.id}
                  className={`transition-colors ${order.ozonStatus === 'cancelled' ? 'bg-red-50/40' : ''} hover:bg-gray-50`}
                >
                  <td className={`px-4 py-3 whitespace-nowrap text-center text-gray-700 relative ${order.ozonStatus === 'cancelled' ? '' : ''}`}>
                    {order.ozonStatus === 'cancelled' && (
                      <div className="absolute left-0 top-1 bottom-1 w-1 bg-red-400 rounded-r"></div>
                    )}
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString("tr-TR") : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-gray-800">
                    {order.postingNumber || '-'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {order.productImage ? (
                      <img
                        src={order.productImage}
                        alt={order.productName || 'Ürün'}
                        className="w-10 h-10 object-contain rounded-md mx-auto border border-gray-200 bg-white p-0.5"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-md mx-auto flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-800 max-w-[200px] truncate" title={order.productName}>
                    {order.productName || '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-center">
                    <EditableCell
                      value={order.purchasePrice}
                      onSave={(value) => updateOrder(order.id, "purchasePrice", value)}
                      placeholder="Gir..."
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-emerald-600">
                    ${order.saleUsd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex justify-center">
                      <EditableTextCell
                        value={order.procurementNote}
                        onSave={(value) => updateOrder(order.id, "procurementNote", value)}
                        placeholder="Gir..."
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex justify-center">
                      <EditableTextCell
                        value={order.supplierOrderNo}
                        onSave={(value) => updateOrder(order.id, "supplierOrderNo", value)}
                        placeholder="Gir..."
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {getOzonStatusBadge(order.ozonStatus, order.ozonStatusLabel)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex justify-center">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${order.note
                          ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                          }`}
                        title={order.note || "Not ekle"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Yan Panel */}
      <SidePanel
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onSave={(orderId: string, field: string, value: string | null) => updateOrder(orderId, field as keyof Order, value)}
      />

      {/* Kar Hesaplama Sonuçları Modal */}
      {showProfitModal && profitResults && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowProfitModal(false)}
          />
          <div className="fixed inset-4 lg:inset-20 bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b text-white" style={{ background: 'linear-gradient(to right, #222b35, #3a4a5c)' }}>
              <h2 className="text-xl font-bold">📊 Kar Hesaplama Sonuçları</h2>
              <button
                onClick={() => setShowProfitModal(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gray-50 border-b">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">İşlenen</p>
                <p className="text-2xl font-bold text-indigo-600">{profitResults.processed}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm space-y-1">
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>Alış Fiyatı Eksik:</span>
                  <span className="font-bold text-amber-600">{profitResults.skippedNoPurchase}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>İade/İptal:</span>
                  <span className="font-bold text-red-600">{profitResults.skippedReturn || 0}</span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Toplam Kar (TL)</p>
                <p className={`text-2xl font-bold ${profitResults.totalProfitTry >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ₺{profitResults.totalProfitTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">Toplam Kar (USD)</p>
                <p className={`text-2xl font-bold ${profitResults.totalProfitUsd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${profitResults.totalProfitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700">Gönderi No</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700">Ürün</th>
                    <th
                      className="px-3 py-3 text-center font-semibold text-gray-700 text-xs cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      onClick={() => toggleModalSort('orderDate')}
                    >
                      Sipariş Tarihi {modalSortField === 'orderDate' && (modalSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-3 py-3 text-center font-semibold text-gray-700 text-xs cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      onClick={() => toggleModalSort('deliveryDate')}
                    >
                      Teslim {modalSortField === 'deliveryDate' && (modalSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700 text-xs">Hesaplama</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700 text-xs">Ödeme</th>
                    <th
                      className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      onClick={() => toggleModalSort('ozonPaymentUsd')}
                    >
                      Ödeme ($) {modalSortField === 'ozonPaymentUsd' && (modalSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      onClick={() => toggleModalSort('purchasePrice')}
                    >
                      Alış (TL) {modalSortField === 'purchasePrice' && (modalSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="px-3 py-3 text-center font-semibold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors select-none"
                      onClick={() => toggleModalSort('netProfitTry')}
                    >
                      Net Kar (TL) {modalSortField === 'netProfitTry' && (modalSortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-700">Net Kar ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedProfitDetails.map((item, idx) => (
                    <tr key={idx} className={item.isCancelled ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-3 text-center text-xs text-gray-700">{item.postingNumber}</td>
                      <td className="px-3 py-3 text-center text-xs text-gray-700 max-w-[200px] truncate" title={item.productName}>
                        {item.productName || '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">
                        {item.orderDate ? new Date(item.orderDate).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">
                        {item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">
                        {item.calculationDate ? new Date(item.calculationDate).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-600">
                        {item.paymentDate ? new Date(item.paymentDate).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td className="px-3 py-3 text-center">${item.ozonPaymentUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-3 text-center text-orange-600">₺{item.purchasePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-3 py-3 text-center font-medium ${item.netProfitTry >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.netProfitTry >= 0 ? '+' : ''}₺{item.netProfitTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-3 py-3 text-center font-medium ${item.netProfitUsd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.netProfitUsd >= 0 ? '+' : ''}${item.netProfitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowProfitModal(false)}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}