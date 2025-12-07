"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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
    imageUrl: string | null;
    barcodes: HandoverBarcode[];
    createdAt: string;
}

export default function KuryeTeslimPage() {
    const { data: session, status } = useSession();

    // State
    const [handovers, setHandovers] = useState<Handover[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedHandover, setSelectedHandover] = useState<Handover | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

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
        } else if (status !== "loading") {
            setIsLoading(false);
        }
    }, [session, status, loadHandovers]);

    // Modal aç
    const openModal = (handover: Handover) => {
        setSelectedHandover(handover);
        setSearchTerm("");
        setIsModalOpen(true);
    };

    // Modal kapat
    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedHandover(null);
        setSearchTerm("");
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
        });
    };

    // Tam tarih formatla
    const formatFullDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    // Filtrelenmiş barkodlar
    const filteredBarcodes = selectedHandover?.barcodes.filter(b =>
        b.barcode.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    // Loading durumu
    if (status === "loading" || isLoading) {
        return (
            <div className="p-6 flex justify-center items-center min-h-[400px]">
                <svg
                    className="animate-spin h-12 w-12 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
        );
    }

    // Yetki kontrolü
    if (!session?.user?.email || !isElif(session.user.email)) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                    Bu sayfayı görüntüleme yetkiniz bulunmamaktadır.
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Başlık */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Kurye Teslim Kayıtları</h1>
                <p className="text-gray-600 mt-1">
                    Mobil uygulama üzerinden taranan barkod kayıtları
                </p>
            </div>

            {/* Tablo */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Teslim Listesi</h2>
                    <button
                        onClick={loadHandovers}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center space-x-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>Yenile</span>
                    </button>
                </div>

                {handovers.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <p className="text-lg font-medium">Henüz teslim kaydı yok</p>
                        <p className="text-sm mt-1">Mobil uygulamadan barkod tarayarak kayıt oluşturun</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        ID
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        TARİH
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        NOT
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        BARKOD SAYISI
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        KAYIT TARİHİ
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        GÖRSEL
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        SİL
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {handovers.map((handover, index) => (
                                    <tr key={handover.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                            {index + 1}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                            {formatDate(handover.handoverDate)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                                            {handover.note || "-"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={() => openModal(handover)}
                                                className="inline-flex items-center justify-center min-w-[40px] px-3 py-1 bg-teal-500 text-white rounded text-sm font-medium hover:bg-teal-600 transition-colors"
                                            >
                                                {handover.barcodes.length}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                            {formatFullDate(handover.createdAt)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {handover.imageUrl ? (
                                                <a
                                                    href={handover.imageUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center px-3 py-1 bg-indigo-500 text-white rounded text-sm font-medium hover:bg-indigo-600 transition-colors"
                                                >
                                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    Görüntüle
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={() => handleDelete(handover.id)}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Sil"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && selectedHandover && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900">
                                BARKOD LİSTESİ
                            </h3>
                            <button
                                onClick={closeModal}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Search & Actions */}
                        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-600">Ara:</span>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                    placeholder="Barkod ara..."
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-sm text-gray-500">
                                    Toplam: <strong>{selectedHandover.barcodes.length}</strong> barkod
                                </span>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            #
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            BARKOD
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            TARAMA TARİHİ
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredBarcodes.map((barcode, index) => (
                                        <tr key={barcode.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {index + 1}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-mono text-gray-900">
                                                {barcode.barcode}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {formatFullDate(barcode.scannedAt)}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredBarcodes.length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                                Sonuç bulunamadı
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-sm text-blue-600">
                                {filteredBarcodes.length} / {selectedHandover.barcodes.length} kayıt gösteriliyor
                            </span>
                            <button
                                onClick={closeModal}
                                className="px-6 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 transition-colors font-medium flex items-center space-x-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Tamam</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
