"use client";

import { useState, useRef } from "react";

interface BatchOcrModalProps {
    isOpen: boolean;
    onClose: () => void;
    postingNumbers: string[];
    onSuccess: () => void;
}

interface OrderProgress {
    postingNumber: string;
    status: "pending" | "processing" | "success" | "error" | "skipped";
    results?: { type: string; status: string; error?: string }[];
}

export default function BatchOcrModal({
    isOpen,
    onClose,
    postingNumbers,
    onSuccess,
}: BatchOcrModalProps) {
    const [processing, setProcessing] = useState(false);
    const [orderProgress, setOrderProgress] = useState<OrderProgress[]>([]);
    const [currentOrder, setCurrentOrder] = useState<string>("");
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef(false);

    // Options
    const [processAlis, setProcessAlis] = useState(true);
    const [processEtgb, setProcessEtgb] = useState(true);

    if (!isOpen) return null;

    const handleStartOcr = async () => {
        setProcessing(true);
        setCompleted(false);
        setError(null);
        abortRef.current = false;

        // Initialize progress
        const initialProgress: OrderProgress[] = postingNumbers.map(pn => ({
            postingNumber: pn,
            status: "pending"
        }));
        setOrderProgress(initialProgress);

        // Process each order one by one
        for (let i = 0; i < postingNumbers.length; i++) {
            if (abortRef.current) break;

            const postingNumber = postingNumbers[i];
            setCurrentOrder(postingNumber);

            // Update status to processing
            setOrderProgress(prev => prev.map(p =>
                p.postingNumber === postingNumber
                    ? { ...p, status: "processing" }
                    : p
            ));

            try {
                const response = await fetch("/api/order-documents/single-ocr", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        postingNumber,
                        processAlis,
                        processSatis: false,  // Satış batch'te işlenmeyecek
                        processEtgb,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "İşlem başarısız");
                }

                // Determine final status
                const hasError = data.results?.some((r: any) => r.status === "error");
                const hasSuccess = data.results?.some((r: any) => r.status === "success");
                const finalStatus = hasError ? "error" : hasSuccess ? "success" : "skipped";

                // Update progress
                setOrderProgress(prev => prev.map(p =>
                    p.postingNumber === postingNumber
                        ? { ...p, status: finalStatus, results: data.results }
                        : p
                ));

                // Rate limit delay - wait 4 seconds between orders
                if (i < postingNumbers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 4000));
                }

            } catch (err: any) {
                setOrderProgress(prev => prev.map(p =>
                    p.postingNumber === postingNumber
                        ? { ...p, status: "error", results: [{ type: "Genel", status: "error", error: err.message }] }
                        : p
                ));
            }
        }

        setCurrentOrder("");
        setCompleted(true);
        setProcessing(false);
        onSuccess();
    };

    const handleClose = () => {
        if (processing) {
            abortRef.current = true;
        }
        setOrderProgress([]);
        setCurrentOrder("");
        setCompleted(false);
        setError(null);
        onClose();
    };

    const getStatusIcon = (status: OrderProgress["status"]) => {
        switch (status) {
            case "pending":
                return <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>;
            case "processing":
                return <div className="w-5 h-5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>;
            case "success":
                return (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case "error":
                return (
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                );
            case "skipped":
                return (
                    <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                        </svg>
                    </div>
                );
        }
    };

    const completedCount = orderProgress.filter(p => ["success", "error", "skipped"].includes(p.status)).length;
    const successCount = orderProgress.filter(p => p.status === "success").length;
    const errorCount = orderProgress.filter(p => p.status === "error").length;
    const skippedCount = orderProgress.filter(p => p.status === "skipped").length;
    const progressPercent = postingNumbers.length > 0 ? Math.round((completedCount / postingNumbers.length) * 100) : 0;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900/60 via-purple-900/40 to-slate-900/60 backdrop-blur-sm" onClick={!processing ? handleClose : undefined} />

            <div className="flex min-h-full items-center justify-center p-4">
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all">
                    {/* Header */}
                    <div className="relative overflow-hidden rounded-t-2xl">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700" />
                        <div className="relative px-6 py-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Toplu OCR İşlemi</h2>
                                        <p className="text-white/80 text-sm mt-0.5">
                                            {postingNumbers.length} sipariş için Gemini ile belge okuma
                                        </p>
                                    </div>
                                </div>
                                {!processing && (
                                    <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-5">
                        {!processing && !completed && (
                            <>
                                {/* Options */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-gray-700">Hangi belgeler işlensin?</h3>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                            <input type="checkbox" checked={processAlis} onChange={(e) => setProcessAlis(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                                            <div>
                                                <span className="font-medium text-gray-900">Alış Faturası</span>
                                                <p className="text-xs text-gray-500">Fatura no, tarih, satıcı bilgileri, KDV tutarları</p>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                                            <input type="checkbox" checked={processEtgb} onChange={(e) => setProcessEtgb(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                                            <div>
                                                <span className="font-medium text-gray-900">ETGB</span>
                                                <p className="text-xs text-gray-500">ETGB no ve USD tutar</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <div className="flex gap-3">
                                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div className="text-sm text-amber-800">
                                            <p className="font-medium">Rate Limit Bilgisi</p>
                                            <p className="mt-1">Her sipariş arasında 4 saniye beklenir. Tahmini süre:</p>
                                            <p className="font-bold mt-1">~{Math.ceil(postingNumbers.length * 4 / 60)} dakika</p>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500">* Sadece PDF yüklenmiş ama OCR verisi olmayan belgeler işlenir.</p>
                            </>
                        )}

                        {(processing || completed) && (
                            <div className="space-y-4">
                                {/* Progress bar */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium text-gray-700">
                                            {processing ? "İşleniyor..." : "Tamamlandı"}
                                        </span>
                                        <span className="text-gray-500">{completedCount} / {postingNumbers.length}</span>
                                    </div>
                                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500"
                                            style={{ width: `${progressPercent}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Current order indicator */}
                                {processing && currentOrder && (
                                    <div className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                        <div className="w-6 h-6 rounded-full border-3 border-orange-500 border-t-transparent animate-spin"></div>
                                        <div>
                                            <p className="text-sm font-medium text-orange-800">Şu an işleniyor:</p>
                                            <p className="text-lg font-mono font-bold text-orange-900">{currentOrder}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Stats */}
                                {completed && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-green-600">{successCount}</p>
                                            <p className="text-xs text-green-700">Başarılı</p>
                                        </div>
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-gray-600">{skippedCount}</p>
                                            <p className="text-xs text-gray-700">Atlandı</p>
                                        </div>
                                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                                            <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                                            <p className="text-xs text-red-700">Hata</p>
                                        </div>
                                    </div>
                                )}

                                {/* Order list */}
                                <div className="border rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                                        <h4 className="text-sm font-medium text-gray-700">Sipariş Listesi</h4>
                                        <span className="text-xs text-gray-500">%{progressPercent}</span>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto divide-y">
                                        {orderProgress.map((order) => (
                                            <div
                                                key={order.postingNumber}
                                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${order.status === "processing" ? "bg-orange-50" :
                                                    order.status === "error" ? "bg-red-50" :
                                                        order.status === "success" ? "bg-green-50" :
                                                            order.status === "skipped" ? "bg-gray-50" : ""
                                                    }`}
                                            >
                                                {getStatusIcon(order.status)}
                                                <span className={`flex-1 text-sm font-mono ${order.status === "processing" ? "font-bold text-orange-700" : "text-gray-700"}`}>
                                                    {order.postingNumber}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${order.status === "processing" ? "bg-orange-100 text-orange-700 animate-pulse" :
                                                    order.status === "success" ? "bg-green-100 text-green-700" :
                                                        order.status === "error" ? "bg-red-100 text-red-700" :
                                                            order.status === "skipped" ? "bg-gray-200 text-gray-600" :
                                                                "bg-gray-100 text-gray-500"
                                                    }`}>
                                                    {order.status === "processing" ? "İşleniyor..." :
                                                        order.status === "success" ? "Tamamlandı" :
                                                            order.status === "error" ? "Hata" :
                                                                order.status === "skipped" ? "Atlandı" : "Bekliyor"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <p className="text-sm text-red-800">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                        {!processing && !completed && (
                            <>
                                <button onClick={handleClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                                    İptal
                                </button>
                                <button
                                    onClick={handleStartOcr}
                                    disabled={!processAlis && !processEtgb}
                                    className="px-5 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-lg font-medium text-sm hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    OCR Başlat
                                </button>
                            </>
                        )}
                        {processing && (
                            <button
                                onClick={handleClose}
                                className="px-5 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700"
                            >
                                İptal Et
                            </button>
                        )}
                        {completed && (
                            <button
                                onClick={handleClose}
                                className="px-5 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg font-medium text-sm hover:from-gray-700 hover:to-gray-800"
                            >
                                Kapat
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
