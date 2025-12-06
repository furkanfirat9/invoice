"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isElif } from "@/lib/auth-utils";
import dynamic from "next/dynamic";

// BarcodeScanner'ı client-side only olarak yükle
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-64 bg-gray-800 rounded-xl flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
    ),
});

interface HandoverBarcode {
    id: string;
    barcode: string;
    scannedAt: string;
}

interface Handover {
    id: string;
    handoverDate: string;
    note: string | null;
    barcodes: HandoverBarcode[];
    createdAt: string;
}

export default function KuryeTeslimPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // State
    const [isScanning, setIsScanning] = useState(false);
    const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
    const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [handovers, setHandovers] = useState<Handover[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showHistory, setShowHistory] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Yetki kontrolü
    useEffect(() => {
        if (status === "loading") return;
        if (!session?.user?.email || !isElif(session.user.email)) {
            router.push("/dashboard");
        }
    }, [session, status, router]);

    // Geçmiş teslimatları yükle
    const loadHandovers = useCallback(async () => {
        try {
            const res = await fetch("/api/courier-handover");
            if (res.ok) {
                const data = await res.json();
                setHandovers(data.handovers || []);
            }
        } catch (error) {
            console.error("Geçmiş yüklenirken hata:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (session?.user?.email && isElif(session.user.email)) {
            loadHandovers();
        }
    }, [session, loadHandovers]);

    // Barkod tarandığında
    const handleScan = useCallback((barcode: string) => {
        setDuplicateWarning(null);

        // Aynı oturumda zaten tarandı mı?
        if (scannedBarcodes.includes(barcode)) {
            setDuplicateWarning(`"${barcode}" zaten bu listede!`);
            // Kırmızı titreme efekti için kısa vibrasyon
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
            return;
        }

        setScannedBarcodes((prev) => [...prev, barcode]);
    }, [scannedBarcodes]);

    // Barkodu listeden kaldır
    const removeBarcode = (barcode: string) => {
        setScannedBarcodes((prev) => prev.filter((b) => b !== barcode));
    };

    // Teslimi kaydet
    const handleSave = async () => {
        if (scannedBarcodes.length === 0) return;

        setIsSaving(true);
        setDuplicateWarning(null);

        try {
            const res = await fetch("/api/courier-handover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    barcodes: scannedBarcodes,
                    note: note.trim() || null,
                }),
            });

            const data = await res.json();

            if (res.status === 409) {
                // Daha önce teslim edilmiş barkodlar var
                const duplicates = data.duplicates
                    ?.map((d: { barcode: string }) => d.barcode)
                    .join(", ");
                setDuplicateWarning(`Bu barkodlar daha önce teslim edilmiş: ${duplicates}`);
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || "Kayıt başarısız");
            }

            // Başarılı
            setSuccessMessage(`${scannedBarcodes.length} barkod başarıyla kaydedildi!`);
            setScannedBarcodes([]);
            setNote("");
            setIsScanning(false);
            loadHandovers();

            // 3 saniye sonra mesajı kaldır
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (error) {
            console.error("Kayıt hatası:", error);
            setDuplicateWarning("Kayıt sırasında bir hata oluştu");
        } finally {
            setIsSaving(false);
        }
    };

    // Teslimi sil
    const handleDelete = async (id: string) => {
        if (!confirm("Bu teslim kaydını silmek istediğinize emin misiniz?")) return;

        try {
            const res = await fetch(`/api/courier-handover/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                loadHandovers();
            }
        } catch (error) {
            console.error("Silme hatası:", error);
        }
    };

    // Tarih formatla
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (status === "loading" || isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3">
                <div className="flex items-center justify-between max-w-lg mx-auto">
                    <h1 className="text-xl font-bold">Kurye Teslim</h1>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
                    >
                        {showHistory ? "Tarama" : "Geçmiş"}
                    </button>
                </div>
            </div>

            <div className="max-w-lg mx-auto p-4">
                {/* Başarı Mesajı */}
                {successMessage && (
                    <div className="mb-4 p-4 bg-green-600/20 border border-green-500 rounded-xl text-green-400 text-center animate-pulse">
                        ✓ {successMessage}
                    </div>
                )}

                {showHistory ? (
                    /* GEÇMİŞ GÖRÜNÜMÜ */
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-300">Teslim Geçmişi</h2>

                        {handovers.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                Henüz teslim kaydı yok
                            </div>
                        ) : (
                            handovers.map((handover) => (
                                <div
                                    key={handover.id}
                                    className="bg-gray-800 rounded-xl p-4 border border-gray-700"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="text-sm text-gray-400">
                                                {formatDate(handover.handoverDate)}
                                            </div>
                                            <div className="text-lg font-semibold text-green-400">
                                                {handover.barcodes.length} barkod
                                            </div>
                                            {handover.note && (
                                                <div className="text-sm text-gray-500 mt-1">
                                                    Not: {handover.note}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleDelete(handover.id)}
                                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Barkod listesi (açılır/kapanır) */}
                                    <details className="group">
                                        <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
                                            Barkodları göster
                                        </summary>
                                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                            {handover.barcodes.map((b) => (
                                                <div
                                                    key={b.id}
                                                    className="text-xs font-mono bg-gray-700 px-2 py-1 rounded"
                                                >
                                                    {b.barcode}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    /* TARAMA GÖRÜNÜMÜ */
                    <div className="space-y-4">
                        {!isScanning ? (
                            /* Başlat Butonu */
                            <button
                                onClick={() => setIsScanning(true)}
                                className="w-full py-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-2xl font-bold text-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                    </svg>
                                    Taramaya Başla
                                </div>
                            </button>
                        ) : (
                            <>
                                {/* Kamera */}
                                <BarcodeScanner
                                    isActive={isScanning}
                                    onScan={handleScan}
                                />

                                {/* Uyarı Mesajı */}
                                {duplicateWarning && (
                                    <div className="p-3 bg-red-600/20 border border-red-500 rounded-xl text-red-400 text-sm text-center">
                                        ⚠️ {duplicateWarning}
                                    </div>
                                )}

                                {/* Taranan Barkod Sayısı */}
                                <div className="text-center py-2">
                                    <span className="text-3xl font-bold text-green-400">
                                        {scannedBarcodes.length}
                                    </span>
                                    <span className="text-gray-400 ml-2">barkod tarandı</span>
                                </div>

                                {/* Taranan Barkod Listesi */}
                                {scannedBarcodes.length > 0 && (
                                    <div className="bg-gray-800 rounded-xl p-3 max-h-48 overflow-y-auto">
                                        <div className="space-y-2">
                                            {scannedBarcodes.map((barcode, index) => (
                                                <div
                                                    key={`${barcode}-${index}`}
                                                    className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2"
                                                >
                                                    <span className="font-mono text-sm truncate flex-1">
                                                        {barcode}
                                                    </span>
                                                    <button
                                                        onClick={() => removeBarcode(barcode)}
                                                        className="ml-2 p-1 text-red-400 hover:bg-red-500/20 rounded"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Not Alanı */}
                                <input
                                    type="text"
                                    placeholder="Not ekle (opsiyonel)"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                                />

                                {/* Aksiyonlar */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setIsScanning(false);
                                            setScannedBarcodes([]);
                                            setNote("");
                                            setDuplicateWarning(null);
                                        }}
                                        className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={scannedBarcodes.length === 0 || isSaving}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-bold transition flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? (
                                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Kaydet
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
