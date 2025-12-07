"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isElif } from "@/lib/auth-utils";

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
    const [handovers, setHandovers] = useState<Handover[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Yetki kontrolü
    useEffect(() => {
        if (status === "loading") return;
        if (!session?.user?.email || !isElif(session.user.email)) {
            router.push("/dashboard");
        }
    }, [session, status, router]);

    // Teslimatları yükle
    const loadHandovers = useCallback(async () => {
        try {
            const res = await fetch("/api/courier-handover");
            if (res.ok) {
                const data = await res.json();
                setHandovers(data.handovers || []);
            }
        } catch (error) {
            console.error("Veri yüklenirken hata:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (session?.user?.email && isElif(session.user.email)) {
            loadHandovers();
        }
    }, [session, loadHandovers]);

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

    // Kısa tarih formatla
    const formatShortDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    // Toplam barkod sayısı
    const totalBarcodes = handovers.reduce((sum, h) => sum + h.barcodes.length, 0);

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
            <div className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-4">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="p-2 -ml-2 text-gray-400 hover:text-white active:scale-95 transition"
                    >
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    <h1 className="text-xl font-bold">📦 Kurye Teslim Kayıtları</h1>

                    <button
                        onClick={loadHandovers}
                        className="p-2 text-gray-400 hover:text-white active:scale-95 transition"
                        title="Yenile"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="p-4 max-w-4xl mx-auto">
                {/* Özet Kartları */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-blue-400">{handovers.length}</div>
                        <div className="text-sm text-gray-400">Toplam Teslim</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 border border-green-500/30 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-green-400">{totalBarcodes}</div>
                        <div className="text-sm text-gray-400">Toplam Barkod</div>
                    </div>
                </div>

                {/* Mobil Uygulama Bilgisi */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📱</span>
                        <div>
                            <p className="text-sm text-gray-300">Barkod tarama <strong>Ozon Barkod</strong> mobil uygulamasından yapılmaktadır.</p>
                            <p className="text-xs text-gray-500 mt-1">Mobil uygulama ile taranan barkodlar otomatik olarak burada listelenir.</p>
                        </div>
                    </div>
                </div>

                {/* Tablo */}
                {handovers.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <svg className="w-20 h-20 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-lg">Henüz teslim kaydı yok</p>
                        <p className="text-sm mt-2">Mobil uygulamadan barkod tarayarak kayıt oluşturun</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {handovers.map((handover) => (
                            <div
                                key={handover.id}
                                className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition"
                            >
                                {/* Satır Başlığı */}
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer"
                                    onClick={() => setExpandedId(expandedId === handover.id ? null : handover.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center">
                                            <span className="text-xl font-bold text-green-400">{handover.barcodes.length}</span>
                                        </div>
                                        <div>
                                            <div className="font-medium">{formatShortDate(handover.handoverDate)}</div>
                                            <div className="text-sm text-gray-500">{formatDate(handover.handoverDate).split(" ")[1]}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {handover.note && (
                                            <span className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-400 hidden sm:block">
                                                📝 Not var
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(handover.id);
                                            }}
                                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition active:scale-95"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                        <svg
                                            className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === handover.id ? 'rotate-180' : ''}`}
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Detay Bölümü */}
                                {expandedId === handover.id && (
                                    <div className="border-t border-gray-700 p-4 bg-gray-800/50">
                                        {handover.note && (
                                            <div className="mb-3 p-3 bg-gray-700/50 rounded-lg">
                                                <span className="text-sm text-gray-400">Not: </span>
                                                <span className="text-sm">{handover.note}</span>
                                            </div>
                                        )}

                                        <div className="text-sm text-gray-400 mb-2">Barkodlar:</div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                                            {handover.barcodes.map((b, index) => (
                                                <div
                                                    key={b.id}
                                                    className="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2"
                                                >
                                                    <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                                                    <span className="font-mono text-sm truncate">{b.barcode}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
