"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOzonOrders } from "@/hooks/useOzonOrders";
import { OzonPosting } from "@/types/ozon";
import ShipmentDetailModal from "@/components/ShipmentDetailModal";
import { exportToExcel, exportToCSV } from "@/lib/exportUtils";
import countries from "world-countries";

export default function DashboardPage() {
  const { t } = useLanguage();
  const { orders, loading, error, fetchOrders } = useOzonOrders();

  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Son 1 ay (30 gün önce)
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterCwbCode, setFilterCwbCode] = useState<string>("");
  const [filterReferenceCode, setFilterReferenceCode] = useState<string>("");
  const [filterRecipientName, setFilterRecipientName] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Son 1 ay (30 gün önce)
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const [selectedOrder, setSelectedOrder] = useState<OzonPosting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Hangi siparişlerin fatura kaydı var
  const [invoiceRecords, setInvoiceRecords] = useState<Map<string, any>>(new Map());

  // Sipariş için fatura kaydı var mı kontrol et
  const hasInvoiceRecord = (postingNumber: string) => {
    return invoiceRecords.has(postingNumber);
  };

  // Invoice kayıtlarını yükle
  useEffect(() => {
    // Tüm siparişler için invoice kayıtlarını kontrol et
    const checkInvoices = async () => {
      const postingNumbers = orders.map(
        (order) => order.posting_number || order.order_number
      ).filter(Boolean) as string[];

      const invoiceMap = new Map<string, any>();

      // Her posting number için invoice kontrolü yap
      await Promise.all(
        postingNumbers.map(async (postingNumber) => {
          try {
            const res = await fetch(`/api/invoice?postingNumber=${encodeURIComponent(postingNumber)}`);
            const data = await res.json();
            // Sadece invoice var VE pdfUrl var ise VAR olarak işaretle
            if (data.invoice && data.invoice.pdfUrl) {
              invoiceMap.set(postingNumber, data.invoice);
            }
          } catch (error) {
            console.error(`Invoice kontrolü hatası (${postingNumber}):`, error);
          }
        })
      );

      setInvoiceRecords(invoiceMap);
    };

    if (orders.length > 0) {
      checkInvoices();
    }
  }, [orders]);

  const handleSearch = useCallback(() => {
    // Eğer spesifik bir arama yapılıyorsa (Takip No, Gönderi No veya Genel Arama)
    // Tarih kısıtlamasını kaldırıp geniş bir aralıkta ara (Son 1 yıl)
    const hasSearchQuery = filterCwbCode || filterReferenceCode || searchTerm;

    let searchStartDate: Date;
    let searchEndDate: Date;

    if (hasSearchQuery) {
      // Arama varsa son 1 yıla bak
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      d.setHours(0, 0, 0, 0);
      searchStartDate = d;

      const end = new Date();
      end.setHours(23, 59, 59, 999);
      searchEndDate = end;
    } else {
      // Arama yoksa seçili tarihleri kullan
      searchStartDate = filterStartDate || startDate;
      searchEndDate = filterEndDate || endDate;
    }

    fetchOrders(filterStatus, searchStartDate, searchEndDate);
  }, [fetchOrders, filterStatus, startDate, endDate, filterStartDate, filterEndDate, filterCwbCode, filterReferenceCode, searchTerm]);

  useEffect(() => {
    handleSearch();
  }, []);

  // Tarih filtreleri değiştiğinde otomatik olarak API'yi çağır
  useEffect(() => {
    // Sadece tarih değiştiğinde ve arama kutuları boşsa tetikle
    // Arama kutuları doluysa handleSearch zaten çalışacak veya kullanıcı butona basacak
    if (!filterCwbCode && !filterReferenceCode && !searchTerm) {
      const searchStartDate = filterStartDate || startDate;
      const searchEndDate = filterEndDate || endDate;
      fetchOrders(filterStatus, searchStartDate, searchEndDate);
    }
  }, [filterStartDate, filterEndDate]);

  // API yanıtını console'da göster (debug için)
  useEffect(() => {
    if (orders.length > 0) {
      console.log("=== FRONTEND - İLK POSTING ===");
      const firstOrder = orders[0];
      console.log("Posting Number:", firstOrder.posting_number);
      console.log("Tüm tarih alanları:", {
        shipment_date: firstOrder.shipment_date,
        order_date: firstOrder.order_date,
        in_process_at: firstOrder.in_process_at,
      });
      console.log("Tüm order objesi:", firstOrder);
      console.log("===============================");
    }
  }, [orders]);
  // useEffect(() => {
  //   if (orders.length > 0) {
  //     console.log("=== FRONTEND - İLK POSTING ===");
  //     const firstOrder = orders[0];
  //     console.log("Posting Number:", firstOrder.posting_number);
  //     console.log("Tüm tarih alanları:", {
  //       shipment_date: firstOrder.shipment_date,
  //       order_date: firstOrder.order_date,
  //       in_process_at: firstOrder.in_process_at,
  //     });
  //   }
  // }, [orders]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      // ISO 8601 formatındaki tarihleri parse et
      const date = new Date(dateString);

      // Geçerli tarih kontrolü
      if (isNaN(date.getTime())) {
        console.warn("Geçersiz tarih:", dateString);
        return "";
      }

      // Tarih formatını kontrol et ve düzelt (DD.MM.YYYY)
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      return `${day}.${month}.${year}`;
    } catch (error) {
      console.error("Tarih formatlama hatası:", error, dateString);
      return "";
    }
  };

  // Tarihi YYYY-MM-DD formatına çevir (local timezone için)
  const formatDateForInput = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const filteredOrders = orders.filter((order) => {
    // CWB Code filtresi
    if (filterCwbCode) {
      const cwb = filterCwbCode.toLowerCase();
      if (!order.tracking_number?.toLowerCase().includes(cwb)) {
        return false;
      }
    }

    // Reference Code filtresi
    if (filterReferenceCode) {
      const ref = filterReferenceCode.toLowerCase();
      if (
        !order.order_number?.toLowerCase().includes(ref) &&
        !order.posting_number?.toLowerCase().includes(ref)
      ) {
        return false;
      }
    }

    // Recipient Name filtresi
    if (filterRecipientName) {
      const recipient = filterRecipientName.toLowerCase();
      const customerName = order.customer?.name?.toLowerCase() || "";
      const city = order.analytics_data?.city?.toLowerCase() || "";
      if (!customerName.includes(recipient) && !city.includes(recipient)) {
        return false;
      }
    }

    // Date Range filtresi - in_process_at tarihine göre filtrele
    if (filterStartDate || filterEndDate) {
      const processDate = order.in_process_at;
      if (processDate) {
        // in_process_at ISO formatında geliyor (örn: "2025-11-11T06:00:00Z")
        // Tarih kısmını al (YYYY-MM-DD)
        const orderDateStr = processDate.split('T')[0];

        if (filterStartDate) {
          const startDateStr = formatDateForInput(filterStartDate);
          // String karşılaştırması (YYYY-MM-DD formatı lexicographic olarak karşılaştırılabilir)
          if (orderDateStr < startDateStr) {
            return false;
          }
        }

        if (filterEndDate) {
          const endDateStr = formatDateForInput(filterEndDate);
          if (orderDateStr > endDateStr) {
            return false;
          }
        }
      } else {
        // Eğer işleme tarihi yoksa ve filtre varsa, bu kaydı gösterme
        if (filterStartDate || filterEndDate) {
          return false;
        }
      }
    }

    // Genel arama filtresi
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        order.posting_number?.toLowerCase().includes(search) ||
        order.tracking_number?.toLowerCase().includes(search) ||
        order.order_number?.toLowerCase().includes(search) ||
        order.customer?.name?.toLowerCase().includes(search) ||
        order.analytics_data?.city?.toLowerCase().includes(search)
      );
    }

    return true;
  });

  // Sayfalama hesaplamaları
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Filtre değiştiğinde sayfayı sıfırla
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCwbCode, filterReferenceCode, filterRecipientName, filterStartDate, filterEndDate, searchTerm, filterStatus]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        [t("etgbPdfFile")]: invoice?.etgbPdfUrl || "-",
        [t("productInfo")]: order.products?.map(p => p.name).join(" | ") || "-",
        [t("productQuantity")]: order.products?.map(p => p.quantity).join(" | ") || "-",
      };
    });
    exportToExcel(data, "Sevkiyatlar_Seller");
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
        [t("etgbPdfFile")]: invoice?.etgbPdfUrl || "-",
        [t("productInfo")]: order.products?.map(p => p.name).join(" | ") || "-",
        [t("productQuantity")]: order.products?.map(p => p.quantity).join(" | ") || "-",
      };
    });
    exportToCSV(data, "Sevkiyatlar_Seller");
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("shipmentsTitle")}</h1>
        <p className="text-gray-600 mt-1">
          {t("shipmentsSubtitle")}
        </p>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <svg
            className="w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <h2 className="text-lg font-semibold text-gray-900">
            {t("filterInputs")}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("cwbCode")}
            </label>
            <input
              type="text"
              value={filterCwbCode}
              onChange={(e) => setFilterCwbCode(e.target.value)}
              onBlur={(e) => setFilterCwbCode(e.target.value.trim())}
              onPaste={(e) => {
                e.preventDefault();
                const pastedText = e.clipboardData.getData('text').trim();
                setFilterCwbCode(pastedText);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t("cwbCode")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("referenceCode")}
            </label>
            <input
              type="text"
              value={filterReferenceCode}
              onChange={(e) => setFilterReferenceCode(e.target.value)}
              onBlur={(e) => setFilterReferenceCode(e.target.value.trim())}
              onPaste={(e) => {
                e.preventDefault();
                const pastedText = e.clipboardData.getData('text').trim();
                setFilterReferenceCode(pastedText);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t("referenceCode")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("ozon")}
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option>{t("ozon")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("allRecords")}
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">{t("allStatuses") || "Tümü"}</option>
              <option value="awaiting_deliver">{t("awaitingDeliver")}</option>
              <option value="delivering">{t("delivering")}</option>
              <option value="delivered">{t("delivered")}</option>
              <option value="cancelled">{t("cancelled")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("recipientName")}
            </label>
            <input
              type="text"
              value={filterRecipientName}
              onChange={(e) => setFilterRecipientName(e.target.value)}
              onBlur={(e) => setFilterRecipientName(e.target.value.trim())}
              onPaste={(e) => {
                e.preventDefault();
                const pastedText = e.clipboardData.getData('text').trim();
                setFilterRecipientName(pastedText);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t("recipientName")}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("dateRange")}
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <input
                  type="date"
                  max={formatDateForInput(new Date())}
                  value={
                    filterStartDate
                      ? formatDateForInput(filterStartDate)
                      : formatDateForInput(startDate)
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      // Tarihi local timezone'da parse et (YYYY-MM-DD formatından)
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const d = new Date(year, month - 1, day);
                      d.setHours(0, 0, 0, 0);
                      setFilterStartDate(d);
                    } else {
                      setFilterStartDate(null);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">{t("dateFormat")}</p>
              </div>
              <span className="text-gray-500 pt-2">{t("to")}</span>
              <div className="flex-1">
                <input
                  type="date"
                  max={formatDateForInput(new Date())}
                  value={
                    filterEndDate
                      ? formatDateForInput(filterEndDate)
                      : formatDateForInput(endDate)
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      // Tarihi local timezone'da parse et (YYYY-MM-DD formatından)
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const d = new Date(year, month - 1, day);
                      d.setHours(23, 59, 59, 999);
                      setFilterEndDate(d);
                    } else {
                      setFilterEndDate(null);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">{t("dateFormat")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>{t("loading")}</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <span>{t("search")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Shipments Table Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">{t("shipmentsTitle")}</h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
              >
                {t("excel")}
              </button>
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                {t("csv")}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <svg
                className="animate-spin h-12 w-12 mx-auto mb-4 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-600">{t("loading")}</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600 mb-2">{error}</p>
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t("tryAgain")}
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <p className="text-lg font-medium">{t("noShipments")}</p>
              <p className="text-sm mt-1">{t("noShipmentsDesc")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("id")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("cwb")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("reference")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("senderName")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("recipientName")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("date")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("check")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("etgb")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("etgbDate")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t("isCancel")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedOrders.map((order, index) => (
                    <tr key={order.posting_number} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center space-x-2">
                          <svg
                            className="w-4 h-4 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                          <span>{order.tracking_number || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {order.posting_number || order.order_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          EFA Home Россия
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {order.customer?.name || order.analytics_data?.city || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(order.in_process_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {hasInvoiceRecord(order.posting_number || order.order_number || "") ? (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsModalOpen(true);
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-md text-xs font-semibold flex items-center space-x-1.5 hover:bg-green-700 active:bg-green-800 transition-all shadow-sm hover:shadow-md border border-green-700"
                            title="Fatura kaydı mevcut"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span>MIC</span>
                            <span className="ml-1 px-1.5 py-0.5 bg-green-700 rounded text-[10px] font-bold">
                              VAR
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsModalOpen(true);
                            }}
                            className="px-4 py-2 bg-gray-500 text-white rounded-md text-xs font-semibold flex items-center space-x-1.5 hover:bg-gray-600 active:bg-gray-700 transition-all shadow-sm hover:shadow-md border border-gray-600"
                            title="Fatura kaydı yok"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span>MIC</span>
                            <span className="ml-1 px-1.5 py-0.5 bg-gray-600 rounded text-[10px] font-bold">
                              YOK
                            </span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        -
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        -
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {order.status === "cancelled" ? (
                          <span className="px-3 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                            {t("cancel")}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                            {t("notCancel")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-700">
                  {t("showingEntries")
                    .replace("{from}", (startIndex + 1).toString())
                    .replace("{to}", Math.min(endIndex, filteredOrders.length).toString())
                    .replace("{total}", filteredOrders.length.toString())}
                </p>

                {/* Sayfalama Kontrolleri */}
                {totalPages > 1 && (() => {
                  // Gösterilecek sayfa numaralarını hesapla
                  const pagesToShow: (number | string)[] = [];
                  const addedPages = new Set<number>();

                  // İlk sayfa her zaman gösterilir
                  pagesToShow.push(1);
                  addedPages.add(1);

                  // Mevcut sayfa ve bir sonraki sayfayı ekle
                  if (currentPage === 1) {
                    // Sayfa 1'deyken 2 ve 3'ü de göster
                    if (totalPages > 1 && !addedPages.has(2)) {
                      pagesToShow.push(2);
                      addedPages.add(2);
                    }
                    if (totalPages > 2 && !addedPages.has(3)) {
                      pagesToShow.push(3);
                      addedPages.add(3);
                    }
                  } else {
                    // İlk sayfadan sonra "..." ekle (eğer mevcut sayfa 2'den büyükse)
                    if (currentPage > 2) {
                      pagesToShow.push("...");
                    }

                    // Mevcut sayfa ve bir sonraki sayfayı ekle
                    if (!addedPages.has(currentPage)) {
                      pagesToShow.push(currentPage);
                      addedPages.add(currentPage);
                    }
                    // Bir sonraki sayfayı ekle (eğer son sayfa değilse)
                    if (currentPage + 1 < totalPages && !addedPages.has(currentPage + 1)) {
                      pagesToShow.push(currentPage + 1);
                      addedPages.add(currentPage + 1);
                    }
                  }

                  // Son sayfa her zaman gösterilir (eğer zaten eklenmemişse)
                  if (!addedPages.has(totalPages)) {
                    // Son sayfadan önce "..." ekle (eğer gerekliyse)
                    const lastNumber = pagesToShow.filter(p => typeof p === 'number').pop() as number;
                    if (lastNumber && lastNumber < totalPages - 1) {
                      pagesToShow.push("...");
                    }
                    pagesToShow.push(totalPages);
                  }

                  return (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t("previous")}
                      </button>

                      {/* Sayfa Numaraları */}
                      <div className="flex items-center space-x-1">
                        {pagesToShow.map((page, index) => {
                          if (page === "...") {
                            return (
                              <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                                ...
                              </span>
                            );
                          }

                          const pageNum = page as number;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => goToPage(pageNum)}
                              className={`px-3 py-1 text-sm border rounded-lg transition-colors ${currentPage === pageNum
                                ? "bg-blue-600 text-white border-blue-600"
                                : "border-gray-300 hover:bg-gray-50"
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t("next")}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shipment Detail Modal */}
      <ShipmentDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedOrder(null);
        }}
        onSave={async (postingNumber) => {
          // Fatura kaydı eklendiğinde API'den kontrol et ve pdfUrl varsa ekle
          try {
            const res = await fetch(`/api/invoice?postingNumber=${encodeURIComponent(postingNumber)}`);
            const data = await res.json();
            if (data.invoice && data.invoice.pdfUrl) {
              setInvoiceRecords((prev) => new Map(prev).set(postingNumber, data.invoice));
            } else {
              // pdfUrl yoksa Map'ten çıkar
              setInvoiceRecords((prev) => {
                const newMap = new Map(prev);
                newMap.delete(postingNumber);
                return newMap;
              });
            }
          } catch (error) {
            console.error(`Invoice kontrolü hatası (${postingNumber}):`, error);
          }
        }}
        order={selectedOrder}
      />
    </div>
  );
}


