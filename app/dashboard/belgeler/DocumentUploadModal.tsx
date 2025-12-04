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
        pdfFile: File | null;
    };
}

interface ExistingDocument {
    alisFaturaNo?: string;
    alisPdfUrl?: string;
    satisFaturaTarihi?: string;
    satisFaturaNo?: string;
    satisAliciAdSoyad?: string;
    satisPdfUrl?: string;
    etgbNo?: string;
    etgbTutar?: number;
    etgbDovizCinsi?: string;
    etgbPdfUrl?: string;
}

type TabType = "alis" | "satis" | "etgb";

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

    const [alisFaturaNo, setAlisFaturaNo] = useState("");
    const [alisPdf, setAlisPdf] = useState<File | null>(null);
    const alisInputRef = useRef<HTMLInputElement>(null);

    const [satisFaturaTarihi, setSatisFaturaTarihi] = useState("");
    const [satisFaturaNo, setSatisFaturaNo] = useState("");
    const [satisAliciAdSoyad, setSatisAliciAdSoyad] = useState("");
    const [satisPdf, setSatisPdf] = useState<File | null>(null);
    const satisInputRef = useRef<HTMLInputElement>(null);

    const [etgbNo, setEtgbNo] = useState("");
    const [etgbTutar, setEtgbTutar] = useState("");
    const [etgbDovizCinsi, setEtgbDovizCinsi] = useState<"USD" | "EUR">("USD");
    const [etgbPdf, setEtgbPdf] = useState<File | null>(null);
    const etgbInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && postingNumber) {
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
                    setAlisFaturaNo(doc.alisFaturaNo || "");
                    if (doc.satisFaturaTarihi) {
                        const date = new Date(doc.satisFaturaTarihi);
                        setSatisFaturaTarihi(date.toISOString().split('T')[0]);
                    }
                    setSatisFaturaNo(doc.satisFaturaNo || "");
                    setSatisAliciAdSoyad(doc.satisAliciAdSoyad || "");
                    setEtgbNo(doc.etgbNo || "");
                    setEtgbTutar(doc.etgbTutar?.toString() || "");
                    setEtgbDovizCinsi((doc.etgbDovizCinsi as "USD" | "EUR") || "USD");
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
                alis: { faturaNo: alisFaturaNo, pdfFile: alisPdf },
                satis: { faturaTarihi: satisFaturaTarihi, faturaNo: satisFaturaNo, aliciAdSoyad: satisAliciAdSoyad, pdfFile: satisPdf },
                etgb: { etgbNo, tutar: etgbTutar, dovizCinsi: etgbDovizCinsi, pdfFile: etgbPdf },
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
        setAlisFaturaNo("");
        setAlisPdf(null);
        setSatisFaturaTarihi("");
        setSatisFaturaNo("");
        setSatisAliciAdSoyad("");
        setSatisPdf(null);
        setEtgbNo("");
        setEtgbTutar("");
        setEtgbDovizCinsi("USD");
        setEtgbPdf(null);
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
    }: {
        file: File | null;
        existingUrl?: string;
        inputRef: React.RefObject<HTMLInputElement>;
        onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    }) => {
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
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF Dosyası</label>
                <input ref={inputRef} type="file" accept=".pdf" onChange={onFileChange} className="hidden" />
                <div
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${file ? "border-teal-400 bg-teal-50" : existingUrl ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50"
                        }`}
                >
                    {file ? (
                        <div className="text-sm">
                            <span className="font-medium text-teal-700">{file.name}</span>
                            <p className="text-xs text-teal-600 mt-1">Yeni dosya seçildi</p>
                        </div>
                    ) : existingUrl ? (
                        <div className="text-sm">
                            <span className="font-medium text-indigo-700">Mevcut PDF yüklü</span>
                            <p className="text-xs text-indigo-600 mt-1">Değiştirmek için tıklayın</p>
                            <div className="flex justify-center gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={handleView}
                                    className="px-3 py-1 text-xs font-medium text-indigo-700 bg-white border border-indigo-300 rounded hover:bg-indigo-100"
                                >
                                    Görüntüle
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    className="px-3 py-1 text-xs font-medium text-indigo-700 bg-white border border-indigo-300 rounded hover:bg-indigo-100"
                                >
                                    İndir
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500">
                            <p>PDF dosyası yüklemek için tıklayın</p>
                            <p className="text-xs mt-1">veya sürükleyip bırakın</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/50" onClick={handleClose} />

                <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">Belge Yükle</h2>
                            <p className="text-xs text-gray-500 mt-0.5">Gönderi: {postingNumber}</p>
                        </div>
                        <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.key
                                    ? "text-indigo-600 border-b-2 border-indigo-600 -mb-px"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-4">
                        {loading ? (
                            <div className="py-8 text-center">
                                <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                                <p className="mt-2 text-sm text-gray-500">Mevcut belgeler yükleniyor...</p>
                            </div>
                        ) : (
                            <>
                                {activeTab === "alis" && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fatura No</label>
                                            <input
                                                type="text"
                                                value={alisFaturaNo}
                                                onChange={(e) => setAlisFaturaNo(e.target.value)}
                                                placeholder="Fatura numarası"
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <FileUpload
                                            file={alisPdf}
                                            existingUrl={existingDoc?.alisPdfUrl}
                                            inputRef={alisInputRef}
                                            onFileChange={(e) => handleFileChange(e, setAlisPdf)}
                                        />
                                    </>
                                )}

                                {activeTab === "satis" && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Fatura Tarihi</label>
                                                <input
                                                    type="date"
                                                    value={satisFaturaTarihi}
                                                    onChange={(e) => setSatisFaturaTarihi(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Fatura No</label>
                                                <input
                                                    type="text"
                                                    value={satisFaturaNo}
                                                    onChange={(e) => setSatisFaturaNo(e.target.value)}
                                                    placeholder="Fatura numarası"
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Alıcı Ad Soyad</label>
                                            <input
                                                type="text"
                                                value={satisAliciAdSoyad}
                                                onChange={(e) => setSatisAliciAdSoyad(e.target.value)}
                                                placeholder="Alıcının adı soyadı"
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <FileUpload
                                            file={satisPdf}
                                            existingUrl={existingDoc?.satisPdfUrl}
                                            inputRef={satisInputRef}
                                            onFileChange={(e) => handleFileChange(e, setSatisPdf)}
                                        />
                                    </>
                                )}

                                {activeTab === "etgb" && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">ETGB No</label>
                                            <input
                                                type="text"
                                                value={etgbNo}
                                                onChange={(e) => setEtgbNo(e.target.value)}
                                                placeholder="ETGB numarası"
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={etgbTutar}
                                                    onChange={(e) => setEtgbTutar(e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Döviz</label>
                                                <select
                                                    value={etgbDovizCinsi}
                                                    onChange={(e) => setEtgbDovizCinsi(e.target.value as "USD" | "EUR")}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                                            onFileChange={(e) => handleFileChange(e, setEtgbPdf)}
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {saving ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
