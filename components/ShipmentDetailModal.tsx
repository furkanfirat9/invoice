"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { OzonPosting } from "@/types/ozon";
import countries from "world-countries";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";

interface ShipmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (postingNumber: string) => void;
  order: OzonPosting | null;
  readOnly?: boolean;
}

export default function ShipmentDetailModal({
  isOpen,
  onClose,
  onSave,
  order,
  readOnly = false,
}: ShipmentDetailModalProps) {
  const { t } = useLanguage();
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [amount, setAmount] = useState<string>("0");
  const [productCategory, setProductCategory] = useState<string>("");
  const [countryOfOrigin, setCountryOfOrigin] = useState<string>("");

  // Kategori-GTIP eşleşmesi
  const categoryGtipMap: Record<string, string> = {
    "shaving-machine": "851010000000", // TIRAŞ MAKİNESİ
    "steam-iron": "851640000011", // BUHARLI/KAZANLI ÜTÜ
    "epilator": "851030000000", // EPİLATÖR
    "hair-straightener": "851632000019", // SAÇ DÜZLEŞTİRİCİ
    "hair-dryer": "851631000019", // SAÇ KURUTMA MAKİNESİ
    "hair-styler": "851632000019", // SAÇ ŞEKİLLENDİRİCİ
    "deep-fryer": "851679200000", // FRİTÖZ
    "coffee-machine": "851671000011", // KAHVE MAKİNESİ / TÜM
    "tablet": "847130000000", // TABLET
    "robot-vacuum": "850860000000", // ROBOT/ŞARJLI SÜPÜRGE
    "kettle": "851671000012", // KETTLE
    "blender": "850940000013", // BLENDER
    "toaster": "851690000019", // EKMEK KIZARTMA
    "electric-vacuum": "850811000011", // ELEKTRİKLİ SÜPÜRGE
    "pill": "210690920000", // HAP
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCategory = e.target.value;
    setProductCategory(selectedCategory);
    // Kategori seçildiğinde GTIP kodunu otomatik doldur
    if (selectedCategory && categoryGtipMap[selectedCategory]) {
      setGtipCode(categoryGtipMap[selectedCategory]);
    } else {
      setGtipCode("");
    }
  };
  const getTodayDateString = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    return getTodayDateString();
  });
  const [currencyType, setCurrencyType] = useState<string>("USD");
  const [gtipCode, setGtipCode] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // Blob'dan gelen URL
  const [countrySearch, setCountrySearch] = useState<string>("");
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [duplicateWarning, setDuplicateWarning] = useState<string>("");
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState<boolean>(false);
  const [duplicatePostingNumber, setDuplicatePostingNumber] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside handler for country dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCountryDropdownOpen(false);
        setCountrySearch("");
      }
    };

    if (isCountryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isCountryDropdownOpen]);

  // Modal açıldığında verileri yükle veya temizle
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage("");
      setDuplicateWarning("");
      setDuplicatePostingNumber(null);
      // Tüm form alanlarını da temizle
      setInvoiceNumber("");
      setAmount("0");
      setProductCategory("");
      setCountryOfOrigin("");
      setGtipCode("");
      setSelectedFile(null);
      setPdfUrl(null);
      setCountrySearch("");
      setIsCountryDropdownOpen(false);
    } else {
      // Modal açıldığında hata mesajını temizle
      setErrorMessage("");
      setDuplicateWarning("");
      setDuplicatePostingNumber(null);

      // Veritabanından verileri yükle
      if (order) {
        const postingNumber = order.posting_number || order.order_number;
        if (postingNumber) {
          fetch(`/api/invoice?postingNumber=${encodeURIComponent(postingNumber)}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.invoice) {
                const invoice = data.invoice;
                setInvoiceNumber(invoice.invoiceNumber || "");
                setAmount(invoice.amount?.toString() || "0");
                setProductCategory(invoice.productCategory || "");
                setCountryOfOrigin(invoice.countryOfOrigin || "");
                setGtipCode(invoice.gtipCode || "");

                // Tarihi formatla (YYYY-MM-DD)
                if (invoice.invoiceDate) {
                  const date = new Date(invoice.invoiceDate);
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, "0");
                  const day = String(date.getDate()).padStart(2, "0");
                  setInvoiceDate(`${year}-${month}-${day}`);
                }

                setCurrencyType(invoice.currencyType || "USD");

                // PDF URL'ini kaydet (Blob'dan gelen URL)
                if (invoice.pdfUrl) {
                  console.log("Loaded PDF URL from database:", invoice.pdfUrl);
                  setPdfUrl(invoice.pdfUrl);
                }
              }
            })
            .catch((error) => {
              console.error("Invoice yükleme hatası:", error);
            });
        }
      }
    }
  }, [isOpen, order]);

  // Fatura numarası değiştiğinde duplicate kontrolü yap
  const checkInvoiceDuplicate = useCallback(async (invoiceNum: string) => {
    if (!invoiceNum.trim()) {
      setDuplicateWarning("");
      setDuplicatePostingNumber(null);
      return;
    }

    const postingNumber = order?.posting_number || order?.order_number;
    if (!postingNumber) return;

    setIsCheckingDuplicate(true);
    try {
      const response = await fetch(
        `/api/invoice/check-duplicate?invoiceNumber=${encodeURIComponent(invoiceNum)}&postingNumber=${encodeURIComponent(postingNumber)}`
      );
      const data = await response.json();

      if (data.isDuplicate) {
        setDuplicateWarning(data.message);
        setDuplicatePostingNumber(data.existingPostingNumber);
      } else {
        setDuplicateWarning("");
        setDuplicatePostingNumber(null);
      }
    } catch (error) {
      console.error("Duplicate check error:", error);
      setDuplicateWarning("");
      setDuplicatePostingNumber(null);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, [order]);

  // Fatura numarası input'tan çıkıldığında kontrol et
  const handleInvoiceNumberBlur = useCallback(() => {
    if (invoiceNumber.trim()) {
      checkInvoiceDuplicate(invoiceNumber);
    }
  }, [invoiceNumber, checkInvoiceDuplicate]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      // Dosya başarıyla yüklendiyse hata mesajını temizle
      setErrorMessage((prev) => {
        if (prev && (prev.includes("PDF") || prev.includes("dosya"))) {
          return "";
        }
        return prev;
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection.errors[0]?.code === 'file-invalid-type') {
        setErrorMessage(t("fileHelper"));
      } else if (rejection.errors[0]?.code === 'file-too-large') {
        setErrorMessage(t("fileSizeError"));
      } else {
        setErrorMessage(t("fileUploadError"));
      }
    }
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value;
    if (!selectedDate) {
      setInvoiceDate("");
      return;
    }

    // Bugünün tarihini al (local timezone)
    const today = new Date();
    const todayStr = getTodayDateString();

    // Seçilen tarih bugünden ileri mi kontrol et
    if (selectedDate > todayStr) {
      setErrorMessage(t("futureDateError"));
      return;
    }

    setInvoiceDate(selectedDate);
    // Tarih geçerliyse hata mesajını temizle (eğer sadece tarih hatası varsa)
    if (errorMessage && errorMessage.includes("Fatura tarihi")) {
      setErrorMessage("");
    }
  };

  const getCustomerName = () => {
    return order?.customer?.name || order?.analytics_data?.city || "-";
  };

  const getOrderNumber = () => {
    return order?.posting_number || order?.order_number || "-";
  };

  const getSelectedCountryName = () => {
    if (!countryOfOrigin) return "";
    const country = countries.find((c) => c.cca2 === countryOfOrigin);
    return country ? `${country.name.common} (${country.cca2})` : "";
  };

  const filteredCountries = countries
    .filter((country) => {
      if (!countrySearch) return true;
      const searchLower = countrySearch.toLowerCase();
      return (
        country.name.common.toLowerCase().includes(searchLower) ||
        country.cca2.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => a.name.common.localeCompare(b.name.common));

  return (
    <AnimatePresence>
      {isOpen && order && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/30"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
            className="bg-white rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] ring-1 ring-white/20 w-[90%] sm:w-[85%] md:w-[75%] lg:w-[70%] max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Invoice Badge */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 rounded px-3 py-2 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900">
                    {getOrderNumber()}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {getCustomerName()}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Error Message */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-start">
                    <svg
                      className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-sm text-red-800">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Sipariş Ürünleri - Salt Okunur */}
              {order?.products && order.products.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">📦 Sipariş İçeriği</h4>
                  <div className="space-y-2">
                    {order.products.map((product, index) => (
                      <div key={index} className="flex justify-between items-center text-sm bg-white px-3 py-2 rounded border border-blue-100">
                        <span className="text-gray-700 font-medium">{product.name}</span>
                        <span className="text-blue-600 font-semibold">Adet: {product.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Two Column Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Invoice Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("invoiceNumberLabel")} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => {
                          setInvoiceNumber(e.target.value);
                          // Değer değiştiğinde uyarıyı temizle
                          if (duplicateWarning) {
                            setDuplicateWarning("");
                            setDuplicatePostingNumber(null);
                          }
                        }}
                        onBlur={handleInvoiceNumberBlur}
                        className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 ${duplicateWarning
                          ? "border-orange-400 focus:ring-orange-500"
                          : "border-gray-300 focus:ring-blue-500"
                          }`}
                        placeholder={t("invoiceNumberLabel")}
                        disabled={readOnly}
                      />
                      {isCheckingDuplicate && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    {duplicateWarning && (
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
                        <div className="flex items-start">
                          <svg className="w-4 h-4 text-orange-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-xs text-orange-800">{duplicateWarning}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("amount")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder="0"
                      disabled={readOnly}
                    />
                  </div>

                  {/* Product Category */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("productCategory")} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={productCategory}
                      onChange={handleCategoryChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      disabled={readOnly}
                    >
                      <option value="">{t("selectCategory")}</option>
                      <option value="shaving-machine">Tıraş Makinesi</option>
                      <option value="steam-iron">Buharlı/Kazanlı Ütü</option>
                      <option value="epilator">Epilatör</option>
                      <option value="hair-straightener">Saç Düzleştirici</option>
                      <option value="hair-dryer">Saç Kurutma Makinesi</option>
                      <option value="hair-styler">Saç Şekillendirici</option>
                      <option value="deep-fryer">Fritöz</option>
                      <option value="coffee-machine">Kahve Makinesi</option>
                      <option value="tablet">Tablet</option>
                      <option value="robot-vacuum">Robot/Şarjlı Süpürge</option>
                      <option value="kettle">Kettle</option>
                      <option value="blender">Blender</option>
                      <option value="toaster">Ekmek Kızartma</option>
                      <option value="electric-vacuum">Elektrikli Süpürge</option>
                      <option value="pill">Hap</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {t("categoryHelper")}
                    </p>
                  </div>

                  {/* Country of Origin */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("countryOfOrigin")} <span className="text-red-500">*</span>
                    </label>
                    <div className={`relative ${readOnly ? 'pointer-events-none opacity-75' : ''}`} ref={countryDropdownRef}>
                      {/* Selected Value Input */}
                      <div
                        onClick={() => !readOnly && setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                        className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex items-center justify-between bg-white ${readOnly ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={countryOfOrigin ? "text-gray-900" : "text-gray-400"}>
                          {countryOfOrigin ? getSelectedCountryName() : t("selectCountry")}
                        </span>
                        <div className="flex items-center gap-2">
                          {countryOfOrigin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCountryOfOrigin("");
                                setCountrySearch("");
                              }}
                              className="text-gray-400 hover:text-gray-600"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isCountryDropdownOpen ? "rotate-180" : ""
                              }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* Dropdown Menu */}
                      {isCountryDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-hidden flex flex-col">
                          {/* Search Input */}
                          <div className="p-2 border-b border-gray-200">
                            <input
                              type="text"
                              value={countrySearch}
                              onChange={(e) => setCountrySearch(e.target.value)}
                              placeholder={t("searchCountry")}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                          {/* Country List */}
                          <div className="overflow-y-auto max-h-48">
                            {filteredCountries.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                {t("noCountryFound")}
                              </div>
                            ) : (
                              filteredCountries.map((country) => (
                                <div
                                  key={country.cca2}
                                  onClick={() => {
                                    setCountryOfOrigin(country.cca2);
                                    setIsCountryDropdownOpen(false);
                                    setCountrySearch("");
                                  }}
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${countryOfOrigin === country.cca2 ? "bg-blue-100" : ""
                                    }`}
                                >
                                  {country.name.common} ({country.cca2})
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  {/* Invoice Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("invoiceDate")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={invoiceDate}
                      onChange={handleDateChange}
                      onClick={(e) => {
                        if (readOnly) return;
                        e.preventDefault();
                        // Max değerini her tıklamada güncelle
                        const todayStr = getTodayDateString();
                        if (dateInputRef.current) {
                          dateInputRef.current.max = todayStr;
                        }
                        dateInputRef.current?.showPicker?.();
                      }}
                      onFocus={(e) => {
                        // Focus olduğunda text selection'ı kaldır ve blur yap
                        e.target.blur();
                      }}
                      max={getTodayDateString()}
                      className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent select-none ${readOnly ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={{ caretColor: 'transparent' }}
                      disabled={readOnly}
                    />
                  </div>

                  {/* Currency Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("currencyType")} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={currencyType}
                      onChange={(e) => setCurrencyType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled
                    >
                      <option value="USD">USD</option>
                    </select>
                  </div>

                  {/* GTIP Code */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {t("gtipCode")} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={gtipCode}
                      onChange={(e) => setGtipCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder={t("gtipCode")}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              </div>

              {/* File Upload Section - ReadOnly Mode handled in logic */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("invoicePdfFile")} {readOnly ? null : <span className="text-red-500">*</span>}
                </label>

                {readOnly ? (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    {pdfUrl ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm font-medium text-gray-700">{t("invoicePdfFile")}</span>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={() => window.open(pdfUrl, "_blank")}
                            className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-600 rounded hover:bg-blue-50"
                          >
                            {t("view")}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const response = await fetch(pdfUrl);
                                const blob = await response.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = `fatura-${order?.posting_number || "belge"}.pdf`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                              } catch (e) {
                                window.open(pdfUrl, "_blank");
                              }
                            }}
                            className="px-3 py-1 text-xs font-medium text-green-600 border border-green-600 rounded hover:bg-green-50"
                          >
                            {t("download")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic text-center">{t("noFileChosen")}</p>
                    )}
                  </div>
                ) : (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragActive
                      ? "border-blue-500 bg-blue-50"
                      : selectedFile
                        ? "border-green-300 bg-green-50"
                        : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
                      }`}
                  >
                    <input {...getInputProps()} />
                    {selectedFile || pdfUrl ? (
                      <div className="flex flex-col items-center">
                        <svg
                          className="w-12 h-12 text-green-600 mb-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {selectedFile ? selectedFile.name : t("invoicePdfFile")}
                        </p>
                        {selectedFile && (
                          <p className="text-xs text-gray-500 mb-3">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        )}
                        <div className="flex gap-3">
                          {(pdfUrl || selectedFile) && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Önce blob URL'ini kontrol et (Vercel Blob'dan gelen HTTP URL), yoksa local dosyayı kullan
                                  if (pdfUrl) {
                                    // Vercel Blob URL'i - direkt aç
                                    console.log("Opening PDF from Blob URL:", pdfUrl);
                                    window.open(pdfUrl, "_blank");
                                  } else if (selectedFile) {
                                    // Local dosya - blob URL oluştur ve aç
                                    const localBlobUrl = URL.createObjectURL(selectedFile);
                                    const newWindow = window.open(localBlobUrl, "_blank");
                                    if (newWindow) {
                                      // URL'i yeni sekme açıldıktan sonra temizle
                                      setTimeout(() => {
                                        URL.revokeObjectURL(localBlobUrl);
                                      }, 100);
                                    } else {
                                      // Popup blocker varsa URL'i hemen temizle
                                      URL.revokeObjectURL(localBlobUrl);
                                    }
                                  }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors flex items-center gap-1.5"
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
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                                {t("view")}
                              </button>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  // PDF'i indir
                                  if (pdfUrl) {
                                    // Vercel Blob URL'inden fetch ile çekip indir
                                    try {
                                      const response = await fetch(pdfUrl);
                                      const blob = await response.blob();
                                      const blobUrl = URL.createObjectURL(blob);
                                      const link = document.createElement('a');
                                      link.href = blobUrl;
                                      link.download = selectedFile?.name || `fatura-${order?.posting_number || order?.order_number || "belge"}.pdf`;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      // URL'i temizle
                                      setTimeout(() => {
                                        URL.revokeObjectURL(blobUrl);
                                      }, 100);
                                    } catch (error) {
                                      console.error("PDF indirme hatası:", error);
                                      // Hata durumunda fallback olarak direkt link aç
                                      window.open(pdfUrl, "_blank");
                                    }
                                  } else if (selectedFile) {
                                    // Local dosyayı indir
                                    const localBlobUrl = URL.createObjectURL(selectedFile);
                                    const link = document.createElement('a');
                                    link.href = localBlobUrl;
                                    link.download = selectedFile.name;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    // URL'i temizle
                                    setTimeout(() => {
                                      URL.revokeObjectURL(localBlobUrl);
                                    }, 100);
                                  }
                                }}
                                className="text-xs text-green-600 hover:text-green-700 font-medium px-3 py-1.5 border border-green-600 rounded-md hover:bg-green-50 transition-colors flex items-center gap-1.5"
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
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                                {t("download")}
                              </button>
                            </>
                          )}
                          {selectedFile && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(null);
                              }}
                              className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 border border-red-600 rounded-md hover:bg-red-50 transition-colors flex items-center gap-1.5"
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
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              {t("deleteDocument")}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <svg
                          className={`w-12 h-12 mb-3 ${isDragActive ? "text-blue-600" : "text-gray-400"
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        {isDragActive ? (
                          <p className="text-sm font-medium text-blue-600">
                            {t("dropFileHere")}
                          </p>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-700 mb-1">
                              Dosyayı sürükleyip bırakın veya tıklayarak seçin
                            </p>
                            <p className="text-xs text-gray-500">
                              {t("fileHelper")}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {readOnly ? t("close") : t("cancel")}
              </button>

              {!readOnly && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    // Hata mesajını temizle
                    setErrorMessage("");

                    // Zorunlu alanları kontrol et
                    const errors: string[] = [];

                    if (!invoiceNumber.trim()) {
                      errors.push("Fatura Numarası");
                    }

                    // Duplicate fatura numarası kontrolü
                    if (duplicateWarning && duplicatePostingNumber) {
                      setErrorMessage(`Bu fatura numarası (${invoiceNumber}) daha önce ${duplicatePostingNumber} numaralı gönderi için kullanılmış. Lütfen farklı bir fatura numarası kullanın.`);
                      // Scroll to top to show error message
                      const contentDiv = document.querySelector('.overflow-y-auto');
                      if (contentDiv) {
                        contentDiv.scrollTop = 0;
                      }
                      return;
                    }

                    if (!amount || amount === "0" || parseFloat(amount) <= 0) {
                      errors.push("Tutar");
                    }
                    if (!productCategory) {
                      errors.push("Ürün Kategorisi");
                    }
                    if (!countryOfOrigin) {
                      errors.push("Menşei Ülkesi");
                    }
                    if (!invoiceDate) {
                      errors.push("Fatura Tarihi");
                    } else {
                      // Fatura tarihinin bugünden ileri olmadığını kontrol et
                      const todayStr = getTodayDateString();

                      if (invoiceDate > todayStr) {
                        errors.push("Fatura Tarihi (bugünden ileri olamaz)");
                      }
                    }
                    if (!gtipCode.trim()) {
                      errors.push("GTIP Kodu");
                    }
                    if (!selectedFile && !pdfUrl) {
                      errors.push("Fatura PDF Dosyası");
                    }

                    // Hata varsa modal içinde göster
                    if (errors.length > 0) {
                      setErrorMessage(`Lütfen tüm zorunlu alanları doldurun:\n${errors.join(", ")}`);
                      // Scroll to top to show error message
                      const contentDiv = document.querySelector('.overflow-y-auto');
                      if (contentDiv) {
                        contentDiv.scrollTop = 0;
                      }
                      return;
                    }

                    // API'ye veri gönder
                    const postingNumber = order?.posting_number || order?.order_number || "";

                    if (!postingNumber) {
                      setErrorMessage("Posting number bulunamadı");
                      return;
                    }

                    // FormData oluştur
                    const formData = new FormData();
                    formData.append("postingNumber", postingNumber);
                    formData.append("invoiceNumber", invoiceNumber);
                    formData.append("amount", amount);
                    formData.append("productCategory", productCategory);
                    formData.append("countryOfOrigin", countryOfOrigin);
                    formData.append("invoiceDate", invoiceDate);
                    formData.append("currencyType", currencyType);
                    formData.append("gtipCode", gtipCode);
                    if (selectedFile) {
                      formData.append("file", selectedFile);
                    }

                    // API'ye gönder
                    fetch("/api/invoice", {
                      method: "POST",
                      body: formData,
                    })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data.error) {
                          setErrorMessage(data.error);
                          return;
                        }

                        // PDF URL'ini state'e kaydet (Blob'dan gelen URL)
                        if (data.invoice?.pdfUrl) {
                          setPdfUrl(data.invoice.pdfUrl);
                        }

                        // Kayıt başarılı olduğunda parent component'e bildir
                        if (onSave && postingNumber) {
                          onSave(postingNumber);
                        }

                        // Hata mesajını temizle ve modalı kapat
                        setErrorMessage("");
                        onClose();
                      })
                      .catch((error) => {
                        console.error("Invoice kaydetme hatası:", error);
                        setErrorMessage("Fatura kaydedilirken bir hata oluştu");
                      });
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
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
                  {t("save")}
                </motion.button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
