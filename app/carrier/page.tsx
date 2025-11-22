"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useOzonOrders } from "@/hooks/useOzonOrders";
import { OzonPosting } from "@/types/ozon";
import ShipmentDetailModal from "@/components/ShipmentDetailModal";
import countries from "world-countries";
import { exportToExcel, exportToCSV } from "@/lib/exportUtils";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CarrierPage() {
  const { t } = useLanguage();

  // Tarih State'leri (Mutable)
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date("2025-11-18");
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const { orders, loading, error, fetchOrders } = useOzonOrders();

  // Gelişmiş Filtre State'leri
  const [filters, setFilters] = useState({
    postingNumber: "",
    receiverName: "",
    trackingNumber: "",
  });

  const [selectedOrder, setSelectedOrder] = useState<OzonPosting | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // ETGB ve Fatura Durumları
  const [invoiceRecords, setInvoiceRecords] = useState<Map<string, any>>(new Map());
  const [etgbRecords, setEtgbRecords] = useState<Map<string, string>>(new Map()); // postingNumber -> pdfUrl
  const [uploadingEtgb, setUploadingEtgb] = useState<string | null>(null); // Yükleme yapan postingNumber

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPostingForUpload, setSelectedPostingForUpload] = useState<string | null>(null);

  // Verileri Çek
  useEffect(() => {
    fetchOrders("all", startDate, endDate);
  }, [fetchOrders, startDate, endDate]);

  // Fatura ve ETGB Kayıtlarını Kontrol Et
  useEffect(() => {
    const checkRecords = async () => {
      if (orders.length === 0) return;

      const postingNumbers = orders.map(
        (order) => order.posting_number || order.order_number
      ).filter(Boolean) as string[];

      const newInvoiceMap = new Map<string, any>();
      const newEtgbMap = new Map<string, string>();

      await Promise.all(
        postingNumbers.map(async (postingNumber) => {
          try {
            // Fatura Kontrolü
            const invRes = await fetch(`/api/invoice?postingNumber=${encodeURIComponent(postingNumber)}`);
            const invData = await invRes.json();
            if (invData.invoice && invData.invoice.pdfUrl) {
              newInvoiceMap.set(postingNumber, invData.invoice);

              if (invData.invoice.etgbPdfUrl) {
                newEtgbMap.set(postingNumber, invData.invoice.etgbPdfUrl);
              }
            } else {
              const etgbRes = await fetch(`/api/etgb?postingNumber=${encodeURIComponent(postingNumber)}`);
              const etgbData = await etgbRes.json();
              if (etgbData.etgb && etgbData.etgb.etgbPdfUrl) {
                newEtgbMap.set(postingNumber, etgbData.etgb.etgbPdfUrl);
              }
            }
          } catch (error) {
            console.error(`Kayıt kontrolü hatası (${postingNumber}):`, error);
          }
        })
      );

      setInvoiceRecords(newInvoiceMap);
      setEtgbRecords(newEtgbMap);
    };

    checkRecords();
  }, [orders]);

  // Filtreleme
  const filteredOrders = orders.filter((order) => {
    const matchPosting = filters.postingNumber
      ? (order.posting_number?.toLowerCase().includes(filters.postingNumber.trim().toLowerCase()) ||
        order.order_number?.toLowerCase().includes(filters.postingNumber.trim().toLowerCase()))
      : true;

    const matchReceiver = filters.receiverName
      ? order.customer?.name?.toLowerCase().includes(filters.receiverName.trim().toLowerCase())
      : true;

    const matchTracking = filters.trackingNumber
      ? order.tracking_number?.toLowerCase().includes(filters.trackingNumber.trim().toLowerCase())
      : true;

    return matchPosting && matchReceiver && matchTracking;
  });

  // Sayfalama
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Tarih Formatlama
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    } catch (error) {
      return "";
    }
  };

  // Input Helper
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Başlangıç tarihi kısıtlaması: 18.11.2025
  const MIN_DATE = new Date("2025-11-18");
  MIN_DATE.setHours(0, 0, 0, 0);

  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day);

    if (type === 'start') {
      // Minimum tarih kontrolü
      if (newDate < MIN_DATE) {
        alert(t("alertDateLimit"));
        setStartDate(MIN_DATE);
        return;
      }
      newDate.setHours(0, 0, 0, 0);
      setStartDate(newDate);
    } else {
      newDate.setHours(23, 59, 59, 999);
      setEndDate(newDate);
    }
  };

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    let newValue = value;

    // Gönderi No ve Takip No için boşlukları tamamen temizle
    if (key === 'postingNumber' || key === 'trackingNumber') {
      newValue = value.trim();
    }
    // Alıcı Adı için sadece baştaki boşluğu temizle (isimler arası boşluk olabilir)
    else if (key === 'receiverName') {
      newValue = value.trimStart();
    }

    setFilters(prev => ({ ...prev, [key]: newValue }));
    setCurrentPage(1); // Filtre değişince ilk sayfaya dön
  };

  const clearFilters = () => {
    setFilters({
      postingNumber: "",
      receiverName: "",
      trackingNumber: "",
    });

    // Tarihleri varsayılana döndür
    setStartDate(MIN_DATE);

    const defaultEnd = new Date();
    defaultEnd.setHours(23, 59, 59, 999);
    setEndDate(defaultEnd);

    setCurrentPage(1);
  };

  // ETGB Dosya Seçme Tetikleyici
  const handleEtgbUploadClick = (postingNumber: string) => {
    setSelectedPostingForUpload(postingNumber);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ETGB Dosya Yükleme
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPostingForUpload) return;

    setUploadingEtgb(selectedPostingForUpload);

    const formData = new FormData();
    formData.append("postingNumber", selectedPostingForUpload);
    formData.append("file", file);

    try {
      const res = await fetch("/api/etgb", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.etgb?.etgbPdfUrl) {
        // Başarılı, state'i güncelle
        setEtgbRecords(prev => new Map(prev).set(selectedPostingForUpload, data.etgb.etgbPdfUrl));
        alert(t("alertEtgbSuccess"));
      } else {
        alert(t("alertError") + (data.error || "Yükleme başarısız"));
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(t("alertGenericError"));
    } finally {
      setUploadingEtgb(null);
      setSelectedPostingForUpload(null);
      // Input değerini temizle ki aynı dosyayı tekrar seçebilsin
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Dışa Aktırma Fonksiyonları
  const handleExportExcel = () => {
    const categoryNames: Record<string, string> = {
      "shaving-machine": "Tıraş Makinesi",
      "steam-iron": "Buharlı/Kazanlı Ütü",
      "epilator": "Epilatör",
      "hair-straightener": "Saç Düzleştirici",
      "hair-dryer": "Saç Kurutma Makinesi",
      "hair-styler": "Saç Şekillendirici",
      "deep-fryer": "Fritöz",
      "coffee-machine": "Kahve Makinesi",
      "tablet": "Tablet",
      "robot-vacuum": "Robot/Şarjlı Süpürge",
      "kettle": "Kettle",
      "blender": "Blender",
      "toaster": "Ekmek Kızartma",
      "electric-vacuum": "Elektrikli Süpürge",
    };

    const data = filteredOrders.map((order, index) => {
      const postingNumber = order.posting_number || order.order_number || "";
      const invoice = invoiceRecords.get(postingNumber);

      let countryName = "-";
      if (invoice?.countryOfOrigin) {
        const country = countries.find(c => c.cca2 === invoice.countryOfOrigin);
        countryName = country ? country.name.common : invoice.countryOfOrigin;
      }

      return {
        [t("id")]: index + 1,
        [t("cwb")]: order.tracking_number || "-",
        [t("reference")]: postingNumber || "-",
        [t("tableRecipientName")]: order.customer?.name || "-",
        [t("city")]: order.analytics_data?.city || "-",
        [t("tableDate")]: formatDate(order.in_process_at),
        [t("tableStatus")]: order.status === 'cancelled' ? t("statusCancel") : t("notCancel"),
        [t("tableInvoice")]: invoice ? t("exists") : t("none"),
        [t("invoiceNumber")]: invoice?.invoiceNumber || "-",
        [t("invoiceDate")]: invoice?.invoiceDate ? formatDate(invoice.invoiceDate) : "-",
        [t("amount")]: invoice ? `${invoice.amount} ${invoice.currencyType}` : "-",
        [t("currencyType")]: invoice?.currencyType || "-",
        [t("productCategory")]: invoice?.productCategory ? (categoryNames[invoice.productCategory] || invoice.productCategory) : "-",
        [t("gtipCode")]: invoice?.gtipCode || "-",
        [t("countryOfOrigin")]: countryName,
        [t("invoicePdfFile")]: invoice?.pdfUrl || "-",
        [t("productInfo")]: order.products?.map(p => p.name).join(" | ") || "-",
        [t("productQuantity")]: order.products?.map(p => p.quantity).join(" | ") || "-",
        [t("etgb")]: etgbRecords.has(postingNumber) ? t("view") : t("none")
      };
    });
    exportToExcel(data, "Sevkiyatlar_Carrier");
  };

  const handleExportCSV = () => {
    const categoryNames: Record<string, string> = {
      "shaving-machine": "Tıraş Makinesi",
      "steam-iron": "Buharlı/Kazanlı Ütü",
      "epilator": "Epilatör",
      "hair-straightener": "Saç Düzleştirici",
      "hair-dryer": "Saç Kurutma Makinesi",
      "hair-styler": "Saç Şekillendirici",
      "deep-fryer": "Fritöz",
      "coffee-machine": "Kahve Makinesi",
      "tablet": "Tablet",
      "robot-vacuum": "Robot/Şarjlı Süpürge",
      "kettle": "Kettle",
      "blender": "Blender",
      "toaster": "Ekmek Kızartma",
      "electric-vacuum": "Elektrikli Süpürge",
    };

    const data = filteredOrders.map((order, index) => {
      const postingNumber = order.posting_number || order.order_number || "";
      const invoice = invoiceRecords.get(postingNumber);

      let countryName = "-";
      if (invoice?.countryOfOrigin) {
        const country = countries.find(c => c.cca2 === invoice.countryOfOrigin);
        countryName = country ? country.name.common : invoice.countryOfOrigin;
      }

      return {
        [t("id")]: index + 1,
        [t("cwb")]: order.tracking_number || "-",
        [t("reference")]: postingNumber || "-",
        [t("tableRecipientName")]: order.customer?.name || "-",
        [t("city")]: order.analytics_data?.city || "-",
        [t("tableDate")]: formatDate(order.in_process_at),
        [t("tableStatus")]: order.status === 'cancelled' ? t("statusCancel") : t("notCancel"),
        [t("tableInvoice")]: invoice ? t("exists") : t("none"),
        [t("invoiceNumber")]: invoice?.invoiceNumber || "-",
        [t("invoiceDate")]: invoice?.invoiceDate ? formatDate(invoice.invoiceDate) : "-",
        [t("amount")]: invoice ? `${invoice.amount} ${invoice.currencyType}` : "-",
        [t("currencyType")]: invoice?.currencyType || "-",
        [t("productCategory")]: invoice?.productCategory ? (categoryNames[invoice.productCategory] || invoice.productCategory) : "-",
        [t("gtipCode")]: invoice?.gtipCode || "-",
        [t("countryOfOrigin")]: countryName,
        [t("invoicePdfFile")]: invoice?.pdfUrl || "-",
        [t("productInfo")]: order.products?.map(p => p.name).join(" | ") || "-",
        [t("productQuantity")]: order.products?.map(p => p.quantity).join(" | ") || "-",
        [t("etgb")]: etgbRecords.has(postingNumber) ? t("view") : t("none")
      };
    });
    exportToCSV(data, "Sevkiyatlar_Carrier");
  };

  return (
    <div className="p-6">
      {/* Gizli Dosya Inputu */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf"
        className="hidden"
      />

      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("carrierTitle")}</h1>
          <p className="text-gray-600 mt-1">
            {t("carrierSubtitle")}
          </p>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleExportExcel} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">{t("downloadExcel")}</button>
          <button onClick={handleExportCSV} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">{t("downloadCsv")}</button>
        </div>
      </div>

      {/* Advanced Filters Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Tarih Aralığı */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t("startDate")}</label>
            <input
              type="date"
              min="2025-11-18"
              value={formatDateForInput(startDate)}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t("endDate")}</label>
            <input
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Text Filtreleri */}
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t("referenceCode")}</label>
            <input
              type="text"
              value={filters.postingNumber}
              onChange={(e) => handleFilterChange('postingNumber', e.target.value)}
              placeholder={t("postingNumberPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t("recipientName")}</label>
            <input
              type="text"
              value={filters.receiverName}
              onChange={(e) => handleFilterChange('receiverName', e.target.value)}
              placeholder={t("receiverNamePlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1">{t("cwbCode")}</label>
            <input
              type="text"
              value={filters.trackingNumber}
              onChange={(e) => handleFilterChange('trackingNumber', e.target.value)}
              placeholder={t("trackingNumberPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {/* Temizle Butonu */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t("clearFilters")}
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("id")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("cwb")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("reference")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("tableRecipientName")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("tableDate")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("tableStatus")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("tableInvoice")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("etgb")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t("loading")}</td>
                </tr>
              ) : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t("noShipments")}</td>
                </tr>
              ) : (
                paginatedOrders.map((order, index) => {
                  const postingNumber = order.posting_number || order.order_number || "";
                  const hasInvoice = invoiceRecords.has(postingNumber);
                  const etgbUrl = etgbRecords.get(postingNumber);
                  const isUploading = uploadingEtgb === postingNumber;
                  const isCancelled = order.status === 'cancelled';

                  return (
                    <tr key={postingNumber} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{startIndex + index + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{order.tracking_number || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{postingNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{order.customer?.name || order.analytics_data?.city || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatDate(order.in_process_at)}</td>

                      {/* Durum Sütunu */}
                      <td className="px-4 py-3 text-sm">
                        {isCancelled ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                            {t("statusCancel")}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                            {t("notCancel")}
                          </span>
                        )}
                      </td>

                      {/* Fatura Sütunu */}
                      <td className="px-4 py-3 text-sm">
                        {hasInvoice ? (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsDetailModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            {t("view")}
                          </button>
                        ) : (
                          <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">{t("none")}</span>
                        )}
                      </td>

                      {/* ETGB Sütunu */}
                      <td className="px-4 py-3 text-sm">
                        {isUploading ? (
                          <span className="text-blue-600 text-xs animate-pulse">{t("loading")}</span>
                        ) : etgbUrl ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => window.open(etgbUrl, '_blank')}
                              className="text-blue-600 hover:underline text-xs font-medium flex items-center"
                            >
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              {t("pdf")}
                            </button>
                            {/* İsteğe bağlı: Silme veya güncelleme butonu eklenebilir */}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEtgbUploadClick(postingNumber)}
                            className="px-3 py-1 border border-blue-600 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 transition-colors flex items-center"
                          >
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            {t("upload")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded hover:bg-white disabled:opacity-50 text-sm"
            >
              {t("previous")}
            </button>
            <span className="text-sm text-gray-600">
              {t("page")} {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded hover:bg-white disabled:opacity-50 text-sm"
            >
              {t("next")}
            </button>
          </div>
        )}
      </div>

      {/* Read-Only Modal */}
      {selectedOrder && (
        <ShipmentDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          readOnly={true} // Salt okunur mod
        />
      )}
    </div>
  );
}
