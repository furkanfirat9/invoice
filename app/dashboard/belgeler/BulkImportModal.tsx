"use client";

import { useState, useRef } from "react";

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ImportStats {
    total: number;
    success: number;
    skipped: number;
    errors: number;
}

export default function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string; stats?: ImportStats; errorDetails?: string[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            validateAndSetFile(droppedFile);
        }
    };

    const validateAndSetFile = (file: File) => {
        const validTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
            "application/vnd.ms-excel", // .xls
        ];

        if (validTypes.includes(file.type) || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
            setFile(file);
            setResult(null);
        } else {
            alert("Sadece Excel dosyası (.xlsx veya .xls) yüklenebilir.");
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            validateAndSetFile(selectedFile);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setImporting(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/order-documents/bulk-import", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                setResult({
                    success: true,
                    message: data.message,
                    stats: data.stats,
                    errorDetails: data.errorDetails,
                });
                onSuccess();
            } else {
                setResult({
                    success: false,
                    message: data.error || "İçe aktarma başarısız",
                });
            }
        } catch (error: any) {
            setResult({
                success: false,
                message: error.message || "Bir hata oluştu",
            });
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResult(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-gradient-to-br from-slate-900/60 via-purple-900/40 to-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
                onClick={handleClose}
            />

            <div className="flex min-h-full items-center justify-center p-4">
                {/* Modal Container */}
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all duration-300 animate-[modalSlideIn_0.3s_ease-out]">
                    {/* Header */}
                    <div className="relative overflow-hidden rounded-t-2xl">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700" />
                        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '20px 20px' }} />
                        <div className="relative flex items-center justify-between px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Toplu Belge İçe Aktar</h2>
                                    <p className="text-xs text-white/70 mt-0.5">Excel dosyasından URL'leri içe aktar</p>
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

                    {/* Content */}
                    <div className="p-5 space-y-4">
                        {/* Instructions */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <h4 className="text-sm font-medium text-blue-800 mb-2">Excel Formatı</h4>
                            <ul className="text-xs text-blue-700 space-y-1">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span><strong>A kolonu:</strong> Sipariş No (Gönderi Numarası)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span><strong>B kolonu:</strong> Alış Faturası URL</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span><strong>C kolonu:</strong> Satış Faturası URL</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span><strong>D kolonu:</strong> ETGB URL</span>
                                </li>
                            </ul>
                            <p className="text-xs text-blue-600 mt-2 italic">İlk satır başlık satırı olmalıdır.</p>
                        </div>

                        {/* File Upload Area */}
                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 group ${isDragging
                                        ? "border-emerald-500 bg-emerald-50 scale-[1.02] shadow-lg shadow-emerald-500/20"
                                        : file
                                            ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50"
                                            : "border-gray-200 hover:border-emerald-400 hover:bg-gradient-to-br hover:from-emerald-50/50 hover:to-teal-50/50"
                                    }`}
                            >
                                {file ? (
                                    <div className="flex flex-col items-center">
                                        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/30">
                                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <span className="font-medium text-emerald-700">{file.name}</span>
                                        <p className="text-xs text-emerald-600 mt-1">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFile(null);
                                                setResult(null);
                                            }}
                                            className="mt-3 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                                        >
                                            Dosyayı Kaldır
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center py-4">
                                        <div className="w-14 h-14 bg-gray-100 group-hover:bg-gradient-to-br group-hover:from-emerald-500 group-hover:to-teal-600 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-emerald-500/30">
                                            <svg className="w-7 h-7 text-gray-400 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>
                                        <p className="font-medium text-gray-600 group-hover:text-emerald-600 transition-colors">
                                            Excel dosyası yükleyin
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            Tıklayın veya sürükleyip bırakın (.xlsx, .xls)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Result Message */}
                        {result && (
                            <div className={`rounded-xl p-4 ${result.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${result.success ? "bg-emerald-500" : "bg-red-500"}`}>
                                        {result.success ? (
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${result.success ? "text-emerald-800" : "text-red-800"}`}>
                                            {result.success ? "İçe Aktarma Tamamlandı!" : "Hata Oluştu"}
                                        </p>
                                        <p className={`text-xs mt-1 ${result.success ? "text-emerald-700" : "text-red-700"}`}>
                                            {result.message}
                                        </p>

                                        {result.stats && (
                                            <div className="flex gap-3 mt-3">
                                                <div className="text-center px-3 py-2 bg-white rounded-lg">
                                                    <p className="text-lg font-semibold text-emerald-600">{result.stats.success}</p>
                                                    <p className="text-xs text-gray-500">Başarılı</p>
                                                </div>
                                                <div className="text-center px-3 py-2 bg-white rounded-lg">
                                                    <p className="text-lg font-semibold text-amber-600">{result.stats.skipped}</p>
                                                    <p className="text-xs text-gray-500">Atlandı</p>
                                                </div>
                                                <div className="text-center px-3 py-2 bg-white rounded-lg">
                                                    <p className="text-lg font-semibold text-red-600">{result.stats.errors}</p>
                                                    <p className="text-xs text-gray-500">Hata</p>
                                                </div>
                                            </div>
                                        )}

                                        {result.errorDetails && result.errorDetails.length > 0 && (
                                            <div className="mt-3 text-xs text-red-600">
                                                <p className="font-medium mb-1">Hata Detayları:</p>
                                                {result.errorDetails.map((err, i) => (
                                                    <p key={i} className="truncate">• {err}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-5 py-4 bg-gradient-to-r from-gray-50 to-gray-100/80 border-t border-gray-100 rounded-b-2xl">
                        <button
                            onClick={handleClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                            {result?.success ? "Kapat" : "İptal"}
                        </button>
                        {!result?.success && (
                            <button
                                onClick={handleImport}
                                disabled={!file || importing}
                                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 flex items-center gap-2"
                            >
                                {importing ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        İçe Aktarılıyor...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        İçe Aktar
                                    </>
                                )}
                            </button>
                        )}
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
            `}</style>
        </div>
    );
}
