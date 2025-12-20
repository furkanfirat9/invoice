"use client";

import { useState, useRef, useEffect } from "react";

interface DocumentUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    postingNumber: string;
    customerName?: string;
    onSave: (data: DocumentFormData) => Promise<void>;
}

export interface DocumentFormData {
    postingNumber: string;
    alis: {
        faturaNo: string;
        faturaTarihi: string;
        saticiUnvani: string;
        saticiVkn: string;
        kdvHaricTutar: string;
        kdvTutari: string;
        urunBilgisi: string;
        urunAdedi: string;
        pdfFile: File | null;
    };
    satis: {
        faturaTarihi: string;
        faturaNo: string;
        aliciAdSoyad: string;
        pdfFile: File | null;
    };
    etgb: {
        etgbNo: string;
        tutar: string;
        dovizCinsi: "USD" | "EUR";
        etgbTarihi: string;
        faturaTarihi: string;
        isLegacyFormat: boolean;
        pdfFile: File | null;
    };
}

interface ExistingDocument {
    alisFaturaNo?: string;
    alisFaturaTarihi?: string;
    alisSaticiUnvani?: string;
    alisSaticiVkn?: string;
    alisKdvHaricTutar?: number;
    alisKdvTutari?: number;
    alisUrunBilgisi?: string;
    alisUrunAdedi?: string;
    alisPdfUrl?: string;
    satisFaturaTarihi?: string;
    satisFaturaNo?: string;
    satisAliciAdSoyad?: string;
    satisPdfUrl?: string;
    etgbNo?: string;
    etgbTutar?: number;
    etgbDovizCinsi?: string;
    etgbTarihi?: string;
    etgbFaturaTarihi?: string;
    etgbPdfUrl?: string;
}

type TabType = "alis" | "satis" | "etgb";

// Normalize decimal numbers from European/Turkish format to standard format
// 2.915,83 → 2915.83 (dot = thousand sep, comma = decimal sep)
// 2,915.83 → 2915.83 (comma = thousand sep, dot = decimal sep)
function normalizeDecimal(value: string): string {
    if (!value) return "";

    const hasDot = value.includes(".");
    const hasComma = value.includes(",");

    if (hasDot && hasComma) {
        const lastDot = value.lastIndexOf(".");
        const lastComma = value.lastIndexOf(",");

        if (lastComma > lastDot) {
            // European format: 2.915,83
            return value.replace(/\./g, "").replace(",", ".");
        } else {
            // American format: 2,915.83
            return value.replace(/,/g, "");
        }
    } else if (hasComma) {
        // Only comma - treat as decimal separator
        return value.replace(",", ".");
    }
    return value;
}

export default function DocumentUploadModal({
    isOpen,
    onClose,
    postingNumber,
    customerName,
    onSave,
}: DocumentUploadModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>("alis");
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [existingDoc, setExistingDoc] = useState<ExistingDocument | null>(null);

    // Alış Faturası States
    const [alisFaturaNo, setAlisFaturaNo] = useState("");
    const [alisFaturaTarihi, setAlisFaturaTarihi] = useState("");
    const [alisSaticiUnvani, setAlisSaticiUnvani] = useState("");
    const [alisSaticiVkn, setAlisSaticiVkn] = useState("");
    const [alisKdvHaricTutar, setAlisKdvHaricTutar] = useState("");
    const [alisKdvTutari, setAlisKdvTutari] = useState("");
    const [alisUrunBilgisi, setAlisUrunBilgisi] = useState("");
    const [alisUrunAdedi, setAlisUrunAdedi] = useState("");
    const [alisPdf, setAlisPdf] = useState<File | null>(null);
    const [alisOcrLoading, setAlisOcrLoading] = useState(false);
    const alisInputRef = useRef<HTMLInputElement>(null);

    // Satış Faturası States
    const [satisFaturaTarihi, setSatisFaturaTarihi] = useState("");
    const [satisFaturaNo, setSatisFaturaNo] = useState("");
    const [satisAliciAdSoyad, setSatisAliciAdSoyad] = useState("");
    const [satisPdf, setSatisPdf] = useState<File | null>(null);
    const [satisOcrLoading, setSatisOcrLoading] = useState(false);
    const satisInputRef = useRef<HTMLInputElement>(null);

    // ETGB States
    const [etgbNo, setEtgbNo] = useState("");
    const [etgbTutar, setEtgbTutar] = useState("");
    const [etgbDovizCinsi, setEtgbDovizCinsi] = useState<"USD" | "EUR">("USD");
    const [etgbTarihi, setEtgbTarihi] = useState("");
    const [etgbFaturaTarihi, setEtgbFaturaTarihi] = useState("");
    const [etgbPdf, setEtgbPdf] = useState<File | null>(null);
    const [etgbOcrLoading, setEtgbOcrLoading] = useState(false);
    const etgbInputRef = useRef<HTMLInputElement>(null);

    // Alış Faturası OCR - PDF'den tüm bilgileri çıkarma
    const runAlisOcr = async (file: File) => {
        setAlisOcrLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "fatura");

            const response = await fetch("/api/ocr/gemini", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                if (data.faturaNo) setAlisFaturaNo(data.faturaNo);
                if (data.faturaTarihi) {
                    // Önce boşluktan ayır (saat bilgisi varsa kaldır)
                    const dateOnly = data.faturaTarihi.split(' ')[0];
                    // Tarihi GG.AA.YYYY, GG-AA-YYYY veya GG/AA/YYYY formatından YYYY-MM-DD formatına çevir
                    const parts = dateOnly.split(/[.\/-]/);
                    if (parts.length >= 3) {
                        const [day, month, year] = parts;
                        setAlisFaturaTarihi(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                    }
                }
                if (data.saticiUnvani) setAlisSaticiUnvani(data.saticiUnvani);
                if (data.saticiVkn) setAlisSaticiVkn(data.saticiVkn);
                if (data.kdvHaricTutar) setAlisKdvHaricTutar(normalizeDecimal(data.kdvHaricTutar));
                if (data.kdvTutari) setAlisKdvTutari(normalizeDecimal(data.kdvTutari));
                if (data.urunBilgisi) setAlisUrunBilgisi(data.urunBilgisi);
                if (data.urunAdedi) setAlisUrunAdedi(data.urunAdedi);
            }
        } catch (error) {
            console.error("OCR error:", error);
        } finally {
            setAlisOcrLoading(false);
        }
    };

    // Alış PDF değiştiğinde OCR çalıştır
    const handleAlisPdfChange = (file: File | null) => {
        setAlisPdf(file);
        if (file) {
            runAlisOcr(file);
        }
    };

    // ETGB OCR - PDF'den ETGB No ve Tutar çıkarma (sipariş numarasına göre)
    const runEtgbOcr = async (file: File) => {
        setEtgbOcrLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "etgb");
            formData.append("siparisNo", postingNumber); // Sipariş numarasını gönder
            console.log("ETGB OCR isteği gönderiliyor, sipariş no:", postingNumber);

            const response = await fetch("/api/ocr/gemini", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            console.log("ETGB OCR yanıtı:", data);
            console.log("ETGB No:", data.etgbNo);
            console.log("Tutar:", data.tutar);
            console.log("Raw Response:", data.rawResponse);

            if (data.success) {
                if (data.etgbNo) {
                    setEtgbNo(data.etgbNo);
                }
                if (data.tutar) {
                    // Virgülü noktaya çevir (32,00 → 32.00)
                    const normalizedTutar = data.tutar.replace(",", ".");
                    setEtgbTutar(normalizedTutar);
                }
            }
        } catch (error) {
            console.error("ETGB OCR error:", error);
        } finally {
            setEtgbOcrLoading(false);
        }
    };

    // ETGB PDF değiştiğinde OCR çalıştır
    const handleEtgbPdfChange = (file: File | null) => {
        setEtgbPdf(file);
        if (file) {
            runEtgbOcr(file);
        }
    };

    // Satış Faturası OCR - PDF'den bilgileri çıkarma
    const runSatisOcr = async (file: File) => {
        setSatisOcrLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "satis");

            const response = await fetch("/api/ocr/gemini", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            console.log("Satış Faturası OCR yanıtı:", data);
            console.log("Fatura Tarihi raw:", data.faturaTarihi);

            if (data.success) {
                if (data.faturaNo) setSatisFaturaNo(data.faturaNo);
                if (data.faturaTarihi) {
                    // Önce boşluktan ayır (saat bilgisi varsa kaldır: "08-09-2025 09:23:00" -> "08-09-2025")
                    const dateOnly = data.faturaTarihi.split(' ')[0];
                    // Tarihi GG.AA.YYYY, GG-AA-YYYY veya GG/AA/YYYY formatından YYYY-MM-DD formatına çevir
                    const parts = dateOnly.split(/[.\/-]/);
                    console.log("Tarih parts:", parts);
                    if (parts.length >= 3) {
                        const [day, month, year] = parts;
                        const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        console.log("Formatted date:", formattedDate);
                        setSatisFaturaTarihi(formattedDate);
                    }
                }
                if (data.aliciAdSoyad) setSatisAliciAdSoyad(data.aliciAdSoyad);
            }
        } catch (error) {
            console.error("Satış Faturası OCR error:", error);
        } finally {
            setSatisOcrLoading(false);
        }
    };

    // Satış PDF değiştiğinde OCR çalıştır
    const handleSatisPdfChange = (file: File | null) => {
        setSatisPdf(file);
        if (file) {
            runSatisOcr(file);
        }
    };

    useEffect(() => {
        if (isOpen && postingNumber) {
            // Önce formu sıfırla, sonra yeni siparişin belgelerini yükle
            // Bu, farklı bir siparişe geçildiğinde önceki verilerin kalmasını önler
            resetForm();
            loadExistingDocument();
        }
    }, [isOpen, postingNumber]);

    const loadExistingDocument = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/order-documents?postingNumber=${encodeURIComponent(postingNumber)}`);
            if (response.ok) {
                const data = await response.json();

                if (data.document) {
                    const doc = data.document;
                    setExistingDoc(doc);

                    // Alış Faturası
                    setAlisFaturaNo(doc.alisFaturaNo || "");
                    if (doc.alisFaturaTarihi) {
                        const date = new Date(doc.alisFaturaTarihi);
                        setAlisFaturaTarihi(date.toISOString().split('T')[0]);
                    }
                    setAlisSaticiUnvani(doc.alisSaticiUnvani || "");
                    setAlisSaticiVkn(doc.alisSaticiVkn || "");
                    setAlisKdvHaricTutar(doc.alisKdvHaricTutar?.toString() || "");
                    setAlisKdvTutari(doc.alisKdvTutari?.toString() || "");
                    setAlisUrunBilgisi(doc.alisUrunBilgisi || "");
                    setAlisUrunAdedi(doc.alisUrunAdedi || "");

                    // Satış Faturası
                    if (doc.satisFaturaTarihi) {
                        const date = new Date(doc.satisFaturaTarihi);
                        setSatisFaturaTarihi(date.toISOString().split('T')[0]);
                    }
                    setSatisFaturaNo(doc.satisFaturaNo || "");
                    setSatisAliciAdSoyad(doc.satisAliciAdSoyad || "");

                    // ETGB
                    setEtgbNo(doc.etgbNo || "");
                    setEtgbTutar(doc.etgbTutar?.toString() || "");
                    setEtgbDovizCinsi((doc.etgbDovizCinsi as "USD" | "EUR") || "USD");
                    if (doc.etgbTarihi) {
                        const date = new Date(doc.etgbTarihi);
                        setEtgbTarihi(date.toISOString().split('T')[0]);
                    }
                    if (doc.etgbFaturaTarihi) {
                        const date = new Date(doc.etgbFaturaTarihi);
                        setEtgbFaturaTarihi(date.toISOString().split('T')[0]);
                    }
                }

                if (data.invoice) {
                    const inv = data.invoice;
                    if (!data.document?.satisFaturaNo && inv.invoiceNumber) {
                        setSatisFaturaNo(inv.invoiceNumber);
                    }
                    if (!data.document?.satisFaturaTarihi && inv.invoiceDate) {
                        const date = new Date(inv.invoiceDate);
                        setSatisFaturaTarihi(date.toISOString().split('T')[0]);
                    }
                    if (!data.document?.satisPdfUrl && inv.pdfUrl) {
                        setExistingDoc(prev => ({
                            ...prev,
                            satisPdfUrl: inv.pdfUrl,
                        }));
                    }
                    // Sevkiyatlar'dan ETGB bilgilerini al (eğer Belgeler'de yoksa)
                    if (!data.document?.etgbPdfUrl && inv.etgbPdfUrl) {
                        setExistingDoc(prev => ({
                            ...prev,
                            etgbPdfUrl: inv.etgbPdfUrl,
                        }));
                    }
                    // Invoice'dan ETGB No'yu al
                    if (!data.document?.etgbNo && inv.etgbNumber) {
                        setEtgbNo(inv.etgbNumber);
                    }
                    // Invoice'dan ETGB Tutarı al (Sevkiyatlar'daki amount)
                    if (!data.document?.etgbTutar && inv.amount) {
                        setEtgbTutar(inv.amount.toString());
                    }
                }

                if (!data.document?.satisAliciAdSoyad && customerName) {
                    setSatisAliciAdSoyad(customerName);
                }
            }
        } catch (error) {
            console.error("Error loading document:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        setter: (file: File | null) => void
    ) => {
        const file = e.target.files?.[0] || null;
        if (file && file.type === "application/pdf") {
            setter(file);
        } else if (file) {
            alert("Sadece PDF dosyası yüklenebilir.");
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const formData: DocumentFormData = {
                postingNumber,
                alis: {
                    faturaNo: alisFaturaNo,
                    faturaTarihi: alisFaturaTarihi,
                    saticiUnvani: alisSaticiUnvani,
                    saticiVkn: alisSaticiVkn,
                    kdvHaricTutar: alisKdvHaricTutar,
                    kdvTutari: alisKdvTutari,
                    urunBilgisi: alisUrunBilgisi,
                    urunAdedi: alisUrunAdedi,
                    pdfFile: alisPdf
                },
                satis: { faturaTarihi: satisFaturaTarihi, faturaNo: satisFaturaNo, aliciAdSoyad: satisAliciAdSoyad, pdfFile: satisPdf },
                etgb: { etgbNo, tutar: etgbTutar, dovizCinsi: etgbDovizCinsi, etgbTarihi, faturaTarihi: etgbFaturaTarihi, isLegacyFormat: true, pdfFile: etgbPdf },
            };
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error("Save error:", error);
            alert("Kaydetme sırasında hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        // Alış Faturası
        setAlisFaturaNo("");
        setAlisFaturaTarihi("");
        setAlisSaticiUnvani("");
        setAlisSaticiVkn("");
        setAlisKdvHaricTutar("");
        setAlisKdvTutari("");
        setAlisUrunBilgisi("");
        setAlisUrunAdedi("");
        setAlisPdf(null);
        setAlisOcrLoading(false);

        // Satış Faturası
        setSatisFaturaTarihi("");
        setSatisFaturaNo("");
        setSatisAliciAdSoyad("");
        setSatisPdf(null);
        setSatisOcrLoading(false);

        // ETGB
        setEtgbNo("");
        setEtgbTutar("");
        setEtgbDovizCinsi("USD");
        setEtgbTarihi("");
        setEtgbFaturaTarihi("");
        setEtgbPdf(null);
        setEtgbOcrLoading(false);

        setActiveTab("alis");
        setExistingDoc(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    if (!isOpen) return null;

    const tabs = [
        { key: "alis" as TabType, label: "Alış Faturası" },
        { key: "satis" as TabType, label: "Satış Faturası" },
        { key: "etgb" as TabType, label: "ETGB" },
    ];

    const FileUpload = ({
        file,
        existingUrl,
        inputRef,
        onFileChange,
        setFile,
    }: {
        file: File | null;
        existingUrl?: string;
        inputRef: React.RefObject<HTMLInputElement>;
        onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
        setFile: (file: File | null) => void;
    }) => {
        const [isDragging, setIsDragging] = useState(false);

        const handleDragOver = (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
        };

        const handleDragLeave = (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
        };

        const handleDrop = (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);

            const droppedFile = e.dataTransfer.files?.[0];
            if (droppedFile) {
                if (droppedFile.type === "application/pdf") {
                    setFile(droppedFile);
                } else {
                    alert("Sadece PDF dosyası yüklenebilir.");
                }
            }
        };

        const handleView = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (existingUrl) {
                window.open(existingUrl, '_blank');
            }
        };

        const handleDownload = async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (existingUrl) {
                try {
                    const response = await fetch(existingUrl);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = existingUrl.split('/').pop() || 'document.pdf';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Download error:', error);
                    window.open(existingUrl, '_blank');
                }
            }
        };

        return (
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">PDF Dosyası</label>
                <input ref={inputRef} type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
                <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-300 group ${isDragging
                        ? "border-indigo-500 bg-indigo-50 scale-[1.02] shadow-lg shadow-indigo-500/20"
                        : file
                            ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50"
                            : existingUrl
                                ? "border-indigo-400 bg-gradient-to-br from-indigo-50 to-purple-50"
                                : "border-gray-200 hover:border-indigo-400 hover:bg-gradient-to-br hover:from-indigo-50/50 hover:to-purple-50/50"
                        }`}
                >
                    {file ? (
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/30">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span className="font-medium text-emerald-700 text-sm">{file.name}</span>
                            <p className="text-xs text-emerald-600 mt-1">Yeni dosya seçildi</p>
                        </div>
                    ) : existingUrl ? (
                        <div className="flex flex-col items-center">
                            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/30">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <span className="font-medium text-indigo-700 text-sm">Mevcut PDF yüklü</span>
                            <p className="text-xs text-indigo-500 mt-1">Değiştirmek için tıklayın</p>
                            <div className="flex gap-2 mt-3">
                                <button
                                    type="button"
                                    onClick={handleView}
                                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-all duration-200 flex items-center gap-1.5 shadow-sm"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Görüntüle
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-all duration-200 flex items-center gap-1.5 shadow-sm"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    İndir
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-2">
                            <div className="w-12 h-12 bg-gray-100 group-hover:bg-gradient-to-br group-hover:from-indigo-500 group-hover:to-purple-600 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-indigo-500/30">
                                <svg className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600 transition-colors">PDF dosyası yükleyin</p>
                            <p className="text-xs text-gray-400 mt-1">Tıklayın veya sürükleyip bırakın</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop with blur */}
            <div
                className="fixed inset-0 bg-gradient-to-br from-slate-900/60 via-purple-900/40 to-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
                onClick={handleClose}
            />

            <div className="flex min-h-full items-center justify-center p-4">
                {/* Modal Container with animation */}
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all duration-300 animate-[modalSlideIn_0.3s_ease-out]">
                    {/* Header with gradient */}
                    <div className="relative overflow-hidden rounded-t-2xl">
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700" />
                        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                        <div className="relative flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Belge Yükle</h2>
                                    <p className="text-xs text-white/70 mt-0.5 font-mono">{postingNumber}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-white/20 rounded-xl transition-all duration-200 group"
                            >
                                <svg className="w-5 h-5 text-white/80 group-hover:text-white group-hover:rotate-90 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Modern Pill Tabs */}
                    <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
                        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.key
                                        ? "bg-white text-indigo-600 shadow-sm"
                                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                                        }`}
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        {tab.key === "alis" && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                        )}
                                        {tab.key === "satis" && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                        )}
                                        {tab.key === "etgb" && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        )}
                                        {tab.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content with fade animation */}
                    <div className="p-5 space-y-4 min-h-[280px]">
                        {loading ? (
                            <div className="py-12 text-center">
                                <div className="relative inline-flex">
                                    <div className="w-10 h-10 border-2 border-indigo-200 rounded-full"></div>
                                    <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                                </div>
                                <p className="mt-3 text-sm text-gray-500">Mevcut belgeler yükleniyor...</p>
                            </div>
                        ) : (
                            <div key={activeTab} className="animate-[fadeIn_0.2s_ease-out]">
                                {activeTab === "alis" && (
                                    <div className="space-y-4">
                                        {/* OCR Loading Badge */}
                                        {alisOcrLoading && (
                                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                                                <svg className="w-4 h-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span className="text-sm text-indigo-700 font-medium">Belge okunuyor...</span>
                                            </div>
                                        )}

                                        {/* Row 1: Fatura No & Fatura Tarihi */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fatura No</label>
                                                <input
                                                    type="text"
                                                    value={alisFaturaNo}
                                                    onChange={(e) => setAlisFaturaNo(e.target.value)}
                                                    placeholder={alisOcrLoading ? "Okunuyor..." : "Fatura numarası"}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fatura Tarihi</label>
                                                <input
                                                    type="date"
                                                    value={alisFaturaTarihi}
                                                    onChange={(e) => setAlisFaturaTarihi(e.target.value)}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 2: Satıcı Ünvanı */}
                                        <div className="group">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Satıcı Ünvanı</label>
                                            <input
                                                type="text"
                                                value={alisSaticiUnvani}
                                                onChange={(e) => setAlisSaticiUnvani(e.target.value)}
                                                placeholder={alisOcrLoading ? "Okunuyor..." : "Satıcı firma ünvanı"}
                                                disabled={alisOcrLoading}
                                                className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                            />
                                        </div>

                                        {/* Row 3: VKN & Ürün Adedi */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Satıcı VKN</label>
                                                <input
                                                    type="text"
                                                    value={alisSaticiVkn}
                                                    onChange={(e) => setAlisSaticiVkn(e.target.value)}
                                                    placeholder={alisOcrLoading ? "Okunuyor..." : "Vergi kimlik no"}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ürün Adedi</label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={alisUrunAdedi}
                                                    onChange={(e) => setAlisUrunAdedi(e.target.value)}
                                                    placeholder={alisOcrLoading ? "Okunuyor..." : "Örn: 1, 3, 5"}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 4: KDV Hariç & KDV Tutarı */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">KDV Hariç Tutar (₺)</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={alisKdvHaricTutar}
                                                    onChange={(e) => setAlisKdvHaricTutar(e.target.value)}
                                                    placeholder={alisOcrLoading ? "Okunuyor..." : "Örn: 1250.50"}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5">KDV Tutarı (₺)</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={alisKdvTutari}
                                                    onChange={(e) => setAlisKdvTutari(e.target.value)}
                                                    placeholder={alisOcrLoading ? "Okunuyor..." : "Örn: 225.09"}
                                                    disabled={alisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                        </div>

                                        {/* Row 5: Ürün Bilgisi */}
                                        <div className="group">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Ürün Bilgisi</label>
                                            <input
                                                type="text"
                                                value={alisUrunBilgisi}
                                                onChange={(e) => setAlisUrunBilgisi(e.target.value)}
                                                placeholder={alisOcrLoading ? "Okunuyor..." : "Örn: Tefal EY8018, Philips EP3347"}
                                                disabled={alisOcrLoading}
                                                className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${alisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                            />
                                        </div>

                                        {/* PDF Upload */}
                                        <FileUpload
                                            file={alisPdf}
                                            existingUrl={existingDoc?.alisPdfUrl}
                                            inputRef={alisInputRef}
                                            onFileChange={(e) => handleFileChange(e, handleAlisPdfChange)}
                                            setFile={handleAlisPdfChange}
                                        />
                                    </div>
                                )}

                                {activeTab === "satis" && (
                                    <div className="space-y-4">
                                        {/* OCR Loading Badge */}
                                        {satisOcrLoading && (
                                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                                                <svg className="w-4 h-4 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span className="text-sm text-indigo-700 font-medium">Belge okunuyor...</span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                    Fatura Tarihi
                                                </label>
                                                <input
                                                    type="date"
                                                    value={satisFaturaTarihi}
                                                    onChange={(e) => setSatisFaturaTarihi(e.target.value)}
                                                    disabled={satisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${satisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                    Fatura No
                                                </label>
                                                <input
                                                    type="text"
                                                    value={satisFaturaNo}
                                                    onChange={(e) => setSatisFaturaNo(e.target.value)}
                                                    placeholder={satisOcrLoading ? "Okunuyor..." : "Fatura numarası"}
                                                    disabled={satisOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${satisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                        </div>
                                        <div className="group">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                Alıcı Ad Soyad
                                            </label>
                                            <input
                                                type="text"
                                                value={satisAliciAdSoyad}
                                                onChange={(e) => setSatisAliciAdSoyad(e.target.value)}
                                                placeholder={satisOcrLoading ? "Okunuyor..." : "Alıcının adı soyadı"}
                                                disabled={satisOcrLoading}
                                                className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${satisOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                            />
                                        </div>
                                        <FileUpload
                                            file={satisPdf}
                                            existingUrl={existingDoc?.satisPdfUrl}
                                            inputRef={satisInputRef}
                                            onFileChange={(e) => handleFileChange(e, handleSatisPdfChange)}
                                            setFile={handleSatisPdfChange}
                                        />
                                    </div>
                                )}

                                {activeTab === "etgb" && (
                                    <div className="space-y-4">
                                        <div className="group">
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                ETGB No
                                                {etgbOcrLoading && (
                                                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-indigo-500 font-normal">
                                                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        OCR ile okunuyor...
                                                    </span>
                                                )}
                                            </label>
                                            <input
                                                type="text"
                                                value={etgbNo}
                                                onChange={(e) => setEtgbNo(e.target.value)}
                                                placeholder={etgbOcrLoading ? "ETGB numarası okunuyor..." : "ETGB numarası"}
                                                disabled={etgbOcrLoading}
                                                className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${etgbOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                    Tutar
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={etgbTutar}
                                                    onChange={(e) => setEtgbTutar(e.target.value)}
                                                    placeholder={etgbOcrLoading ? "Okunuyor..." : "Örn: 32,00 veya 32.00"}
                                                    disabled={etgbOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 ${etgbOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                />
                                            </div>
                                            <div className="group">
                                                <label className="block text-sm font-medium text-gray-700 mb-1.5 group-focus-within:text-indigo-600 transition-colors">
                                                    Döviz
                                                </label>
                                                <select
                                                    value={etgbDovizCinsi}
                                                    onChange={(e) => setEtgbDovizCinsi(e.target.value as "USD" | "EUR")}
                                                    disabled={etgbOcrLoading}
                                                    className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 hover:border-gray-300 bg-white ${etgbOcrLoading ? "bg-gray-50 text-gray-400" : ""}`}
                                                >
                                                    <option value="USD">USD ($)</option>
                                                    <option value="EUR">EUR (€)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <FileUpload
                                            file={etgbPdf}
                                            existingUrl={existingDoc?.etgbPdfUrl}
                                            inputRef={etgbInputRef}
                                            onFileChange={(e) => handleFileChange(e, handleEtgbPdfChange)}
                                            setFile={handleEtgbPdfChange}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Modern Footer */}
                    <div className="flex items-center justify-end gap-3 px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100/80 border-t border-gray-100 rounded-b-2xl">
                        <button
                            onClick={handleClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Kaydediliyor...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Kaydet
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom keyframe animations */}
            <style jsx>{`
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95) translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateX(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
            `}</style>
        </div>
    );
}
