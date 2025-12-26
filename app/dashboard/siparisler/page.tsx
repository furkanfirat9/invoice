"use client";

import { useState, useEffect, useCallback } from "react";
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
  onSaveNote: (orderId: string, note: string | null) => void;
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

function SidePanel({ order, onClose, onSaveNote }: SidePanelProps) {
  const [noteValue, setNoteValue] = useState(order?.note || "");
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

  // Order değiştiğinde noteValue'yu güncelle
  useEffect(() => {
    if (order) {
      setNoteValue(order.note || "");
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
                    </>
                  )}

                  {/* Kullanılan Kurlar */}
                  {(financeData.payment.rubUsdRate || financeData.payment.usdTryRate) && (
                    <div className="mt-2 pt-2 border-t border-dashed border-gray-200">
                      <p className="text-xs text-gray-400 italic text-right">
                        {financeData.payment.rubUsdRate && (
                          <>USD/RUB: {financeData.payment.rubUsdRate.toFixed(2)} ({new Date(financeData.payment.calculationDate).toLocaleDateString("tr-TR")})</>
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
            {order.supplierOrderNo && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-gray-500 shrink-0">Sipariş No</span>
                {order.supplierOrderNo.startsWith('http') ? (
                  <a
                    href={order.supplierOrderNo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-mono text-blue-600 underline truncate max-w-[180px]"
                    title={order.supplierOrderNo}
                  >
                    {order.supplierOrderNo}
                  </a>
                ) : (
                  <span className="text-sm font-mono truncate max-w-[180px]" title={order.supplierOrderNo}>
                    {order.supplierOrderNo}
                  </span>
                )}
              </div>
            )}
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
              onSaveNote(order.id, noteValue.trim() || null);
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
  const [error, setError] = useState<string | null>(null);
  const { rates } = useExchangeRates(); // Canlı döviz kurları

  // Yıl ve ay state'leri - varsayılan: Aralık 2025
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedMonth, setSelectedMonth] = useState(12);

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

  // Siparişleri çek
  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/ozon/orders?year=${selectedYear}&month=${selectedMonth}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Siparişler yüklenemedi');
      }

      const data = await response.json();
      setOrders(data.orders || []);
      console.log(`${data.orders?.length || 0} sipariş yüklendi.`);
    } catch (err: any) {
      console.error('Sipariş yükleme hatası:', err);
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchOrders();
    }
  }, [session?.user?.id, fetchOrders]);

  // Yıl değiştiğinde ayı kontrol et
  useEffect(() => {
    const availableMonths = getAvailableMonths(selectedYear);
    if (!availableMonths.find(m => m.value === selectedMonth)) {
      // Seçili ay bu yıl için geçerli değilse, son geçerli ayı seç
      setSelectedMonth(availableMonths[availableMonths.length - 1]?.value || 12);
    }
  }, [selectedYear]);

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

  // İstatistikleri hesapla (USD bazlı)
  const stats = {
    orderCount: ordersWithProfit.length,
    totalPurchaseTry: ordersWithProfit.reduce((sum, o) => sum + (o.purchasePrice || 0), 0), // Alış TL olarak kalıyor
    totalRevenueUsd: ordersWithProfit.reduce((sum, o) => sum + o.saleUsd, 0), // Ciro USD
    totalProfitUsd: ordersWithProfit.reduce((sum, o) => sum + (o.profit || 0), 0), // Kar USD
  };
  const profitMargin = stats.totalRevenueUsd > 0 ? (stats.totalProfitUsd / stats.totalRevenueUsd) * 100 : 0;
  const roi = stats.totalPurchaseTry > 0 ? (stats.totalProfitUsd / (stats.totalPurchaseTry / 35)) * 100 : 0; // ROI: Kar(USD) / Alış(USD)

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
            onClick={fetchOrders}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
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
          </div>
        </div>

        {/* Canlı Kur Bilgisi */}
        {rates?.usdTry && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Canlı Kur:</span>
            <span className="font-bold text-indigo-600">1 USD = {rates.usdTry.toFixed(2)} TL</span>
          </div>
        )}
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
              <p className="text-xl font-bold text-gray-800">${stats.totalRevenueUsd.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Toplam Kar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Toplam Kar</p>
              <p className={`text-xl font-bold ${stats.totalProfitUsd >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {stats.totalProfitUsd >= 0 ? "+" : ""}${stats.totalProfitUsd.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Kar Oranı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Kar Oranı</p>
              <p className={`text-xl font-bold ${profitMargin >= 0 ? "text-purple-600" : "text-red-600"}`}>
                %{profitMargin.toFixed(1)}
              </p>
            </div>
          </div>
        </div>

        {/* ROI - Yatırım Geri Dönüş */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">ROI</p>
              <p className={`text-xl font-bold ${roi >= 0 ? "text-teal-600" : "text-red-600"}`}>
                %{roi.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sipariş Tablosu */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: '#222b35' }}>
              <tr>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Sipariş Tarihi
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Gönderi No
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
                  Kargo
                </th>
                <th className="px-4 py-4 text-center text-sm font-bold text-white whitespace-nowrap">
                  Kar
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
              {ordersWithProfit.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-center text-gray-700">
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString("tr-TR") : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center font-mono text-xs text-blue-600">
                    {order.postingNumber || '-'}
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
                  <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-blue-600">
                    ${order.saleUsd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-center">
                    <EditableCell
                      value={order.shippingCost}
                      onSave={(value) => updateOrder(order.id, "shippingCost", value)}
                      placeholder="Gir..."
                      suffix="$"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {order.profit !== null ? (
                      <span className={order.profit >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
                        {order.profit >= 0 ? "+" : ""}${order.profit.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
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
        onSaveNote={(orderId, note) => updateOrder(orderId, "note", note)}
      />
    </div>
  );
}
