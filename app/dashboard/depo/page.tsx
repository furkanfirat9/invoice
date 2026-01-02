"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { isElif } from "@/lib/auth-utils";

interface CancellationItem {
    id: string;
    postingNumber: string;
    productName: string;
    productImage: string | null;
    sku: string;
    quantity: number;
    cancelDate: string;
    cancelDateRaw: string | null;
    cancelReason: string;
    status: "PENDING_NOTIFICATION" | "PENDING_WAREHOUSE" | "IN_WAREHOUSE";
}

interface RefundItem {
    id: string;
    postingNumber: string;
    productName: string;
    sku: string;
    quantity: number;
    deliveryDate: string;
    refundDate: string;
    refundReason: string;
    status: string;
}

type TabType = "cancellations" | "refunds";

// Status labels
const STATUS_LABELS: Record<string, { text: string; color: string; bgColor: string }> = {
    PENDING_NOTIFICATION: { text: "Bildirim Bekliyor", color: "text-yellow-700", bgColor: "bg-yellow-100" },
    PENDING_WAREHOUSE: { text: "Depo Bekleniyor", color: "text-blue-700", bgColor: "bg-blue-100" },
    IN_WAREHOUSE: { text: "Depoda", color: "text-green-700", bgColor: "bg-green-100" },
};

export default function DepoPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<TabType>("cancellations");
    const [isLoading, setIsLoading] = useState(false);
    const [cancellations, setCancellations] = useState<CancellationItem[]>([]);
    const [refunds, setRefunds] = useState<RefundItem[]>([]);
    const [isPageLoaded, setIsPageLoaded] = useState(false);
    const [notifyingItems, setNotifyingItems] = useState<Set<string>>(new Set());
    const [revertingItems, setRevertingItems] = useState<Set<string>>(new Set());

    // Check if user is authorized
    const isAuthorized = isElif(session?.user?.email);

    // Sayfa yüklenme animasyonu
    useEffect(() => {
        setIsPageLoaded(true);
    }, []);

    // Veri çekme fonksiyonu
    const fetchData = useCallback(async () => {
        if (status === "loading" || !isAuthorized) return;

        if (activeTab === "cancellations") {
            setIsLoading(true);
            try {
                // Ozon'dan iptal verileri çek
                const response = await fetch('/api/ozon/cancellations');
                if (!response.ok) throw new Error('Failed to fetch');
                const data = await response.json();

                // Mapping
                const mappedData: CancellationItem[] = data.map((item: any) => ({
                    id: item.posting_number,
                    postingNumber: item.posting_number,
                    productName: item.products?.[0]?.name || "Ürün bilgisi yok",
                    productImage: item.product_image || null,
                    sku: String(item.products?.[0]?.sku || ""),
                    quantity: item.products?.[0]?.quantity || 1,
                    cancelDate: item.cancel_date ? new Date(item.cancel_date).toLocaleDateString('tr-TR') : "-",
                    cancelDateRaw: item.cancel_date || null,
                    cancelReason: item.cancellation?.cancel_reason_tr || item.cancellation?.cancel_reason || "-",
                    status: "PENDING_NOTIFICATION" as const
                }));

                // Mevcut tracking durumlarını çek
                if (mappedData.length > 0) {
                    const postingNumbers = mappedData.map(d => d.postingNumber).join(",");
                    const statusResponse = await fetch(`/api/cancellations/status?postingNumbers=${encodeURIComponent(postingNumbers)}`);
                    if (statusResponse.ok) {
                        const statusMap = await statusResponse.json();
                        mappedData.forEach(item => {
                            if (statusMap[item.postingNumber]) {
                                item.status = statusMap[item.postingNumber].status;
                            }
                        });
                    }
                }

                setCancellations(mappedData);
            } catch (error) {
                console.error("Error fetching cancellations:", error);
            } finally {
                setIsLoading(false);
            }
        }
        // İadeler henüz implement edilmedi
    }, [activeTab, status, isAuthorized]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle unauthorized access
    useEffect(() => {
        if (status !== "loading" && !isAuthorized) {
            router.push("/dashboard");
        }
    }, [status, isAuthorized, router]);

    // Loading state
    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-500">Yükleniyor...</div>
            </div>
        );
    }

    // Unauthorized state
    if (!isAuthorized) {
        return null;
    }

    // Kargo firmasına bildir
    const handleNotifyCarrier = async (item: CancellationItem) => {
        setNotifyingItems(prev => new Set(prev).add(item.postingNumber));

        try {
            const response = await fetch('/api/cancellations/notify-carrier', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postingNumber: item.postingNumber,
                    productName: item.productName,
                    productImage: item.productImage,
                    sku: item.sku,
                    quantity: item.quantity,
                    cancelDate: item.cancelDateRaw,
                    cancelReason: item.cancelReason,
                }),
            });

            if (response.ok) {
                // Update local state
                setCancellations(prev => prev.map(c =>
                    c.postingNumber === item.postingNumber
                        ? { ...c, status: "PENDING_WAREHOUSE" as const }
                        : c
                ));
            } else {
                const error = await response.json();
                console.error("Failed to notify carrier:", error);
                alert(error.error || "Bildirim gönderilemedi");
            }
        } catch (error) {
            console.error("Error notifying carrier:", error);
            alert("Bir hata oluştu");
        } finally {
            setNotifyingItems(prev => {
                const next = new Set(prev);
                next.delete(item.postingNumber);
                return next;
            });
        }
    };

    // Bildirimi geri al
    const handleRevertNotification = async (postingNumber: string) => {
        if (!confirm("Bildirimi geri almak istediğinize emin misiniz?")) return;

        setRevertingItems(prev => new Set(prev).add(postingNumber));

        try {
            const response = await fetch('/api/cancellations/revert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postingNumber,
                    action: "revert-notification"
                }),
            });

            if (response.ok) {
                setCancellations(prev => prev.map(c =>
                    c.postingNumber === postingNumber
                        ? { ...c, status: "PENDING_NOTIFICATION" as const }
                        : c
                ));
            } else {
                const error = await response.json();
                console.error("Failed to revert notification:", error);
                alert(error.error || "Geri alma başarısız");
            }
        } catch (error) {
            console.error("Error reverting notification:", error);
            alert("Bir hata oluştu");
        } finally {
            setRevertingItems(prev => {
                const next = new Set(prev);
                next.delete(postingNumber);
                return next;
            });
        }
    };

    const stats = {
        cancellations: cancellations.length,
        pendingNotification: cancellations.filter(c => c.status === "PENDING_NOTIFICATION").length,
        pendingWarehouse: cancellations.filter(c => c.status === "PENDING_WAREHOUSE").length,
        inWarehouse: cancellations.filter(c => c.status === "IN_WAREHOUSE").length,
        refunds: refunds.length,
        total: cancellations.length + refunds.length,
    };

    return (
        <div className={`p-6 transition-all duration-500 ${isPageLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            {/* Özet Kartları */}
            <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 transition-all duration-500 delay-100 ${isPageLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                {/* İptaller Kartı */}
                <div className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:shadow-red-500/10 hover:border-red-200 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 group-hover:text-red-600 transition-colors">{t("cancellations")}</p>
                            <p className="text-3xl font-bold text-red-600 mt-1 group-hover:scale-110 transition-transform origin-left">{stats.cancellations}</p>
                        </div>
                        <div className="w-14 h-14 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-400 to-red-600 rounded-full w-0 group-hover:w-full transition-all duration-500"></div>
                    </div>
                </div>

                {/* Bildirim Bekliyor */}
                <div className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:shadow-yellow-500/10 hover:border-yellow-200 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 group-hover:text-yellow-600 transition-colors">Bildirim Bekliyor</p>
                            <p className="text-3xl font-bold text-yellow-600 mt-1 group-hover:scale-110 transition-transform origin-left">{stats.pendingNotification}</p>
                        </div>
                        <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full w-0 group-hover:w-full transition-all duration-500"></div>
                    </div>
                </div>

                {/* Depo Bekleniyor */}
                <div className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:shadow-blue-500/10 hover:border-blue-200 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 group-hover:text-blue-600 transition-colors">Depo Bekleniyor</p>
                            <p className="text-3xl font-bold text-blue-600 mt-1 group-hover:scale-110 transition-transform origin-left">{stats.pendingWarehouse}</p>
                        </div>
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full w-0 group-hover:w-full transition-all duration-500"></div>
                    </div>
                </div>

                {/* Depoda */}
                <div className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:shadow-green-500/10 hover:border-green-200 hover:-translate-y-1 transition-all duration-300 cursor-pointer">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 group-hover:text-green-600 transition-colors">Depoda</p>
                            <p className="text-3xl font-bold text-green-600 mt-1 group-hover:scale-110 transition-transform origin-left">{stats.inWarehouse}</p>
                        </div>
                        <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <div className="mt-3 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full w-0 group-hover:w-full transition-all duration-500"></div>
                    </div>
                </div>
            </div>

            {/* Tab ve Tablo Alanı */}
            <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-500 delay-300 ${isPageLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                {/* Tab Başlıkları */}
                <div className="border-b border-gray-100 bg-gray-50/50">
                    <nav className="flex">
                        <button
                            onClick={() => setActiveTab("cancellations")}
                            className={`relative flex-1 md:flex-none px-8 py-4 text-sm font-medium transition-all duration-300 ${activeTab === "cancellations"
                                ? "text-red-600"
                                : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <svg className={`w-5 h-5 transition-transform duration-300 ${activeTab === "cancellations" ? "scale-110" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>{t("cancellations")}</span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-300 ${activeTab === "cancellations"
                                    ? "bg-red-100 text-red-600 scale-110"
                                    : "bg-gray-100 text-gray-600"
                                    }`}>
                                    {stats.cancellations}
                                </span>
                            </div>
                            {/* Alt çizgi animasyonu */}
                            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-400 to-red-600 transition-all duration-300 ${activeTab === "cancellations" ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
                                }`}></div>
                        </button>

                        <button
                            onClick={() => setActiveTab("refunds")}
                            className={`relative flex-1 md:flex-none px-8 py-4 text-sm font-medium transition-all duration-300 ${activeTab === "refunds"
                                ? "text-orange-600"
                                : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <svg className={`w-5 h-5 transition-transform duration-300 ${activeTab === "refunds" ? "scale-110" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                <span>{t("refunds")}</span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all duration-300 ${activeTab === "refunds"
                                    ? "bg-orange-100 text-orange-600 scale-110"
                                    : "bg-gray-100 text-gray-600"
                                    }`}>
                                    {stats.refunds}
                                </span>
                            </div>
                            {/* Alt çizgi animasyonu */}
                            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300 ${activeTab === "refunds" ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"
                                }`}></div>
                        </button>
                    </nav>
                </div>

                {/* Tab İçeriği */}
                <div className="p-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600"></div>
                                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent rounded-full animate-ping border-t-blue-400 opacity-20"></div>
                            </div>
                            <span className="mt-4 text-gray-600 animate-pulse">{t("loading")}</span>
                        </div>
                    ) : activeTab === "cancellations" ? (
                        // İptaller Tablosu
                        cancellations.length > 0 ? (
                            <div className="overflow-x-auto animate-fadeIn">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="text-center py-3 px-2 font-semibold text-gray-600 w-16">Görsel</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("postingNumber")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("productName")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("sku")}</th>
                                            <th className="text-center py-3 px-4 font-semibold text-gray-600">{t("quantity")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("cancelDate")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("reason")}</th>
                                            <th className="text-center py-3 px-4 font-semibold text-gray-600">{t("tableStatus")}</th>
                                            <th className="text-center py-3 px-4 font-semibold text-gray-600">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cancellations.map((item, index) => {
                                            const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.PENDING_NOTIFICATION;
                                            const isNotifying = notifyingItems.has(item.postingNumber);

                                            return (
                                                <tr
                                                    key={item.id}
                                                    className="border-b border-gray-100 hover:bg-red-50/50 transition-colors duration-200"
                                                    style={{ animationDelay: `${index * 50}ms` }}
                                                >
                                                    <td className="py-2 px-2 text-center">
                                                        {item.productImage ? (
                                                            <img
                                                                src={item.productImage}
                                                                alt={item.productName}
                                                                className="w-12 h-12 object-contain bg-white rounded-lg shadow-sm mx-auto p-1"
                                                            />
                                                        ) : (
                                                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto">
                                                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-blue-600 hover:text-blue-800 transition-colors">{item.postingNumber}</td>
                                                    <td className="py-3 px-4 max-w-[200px] truncate" title={item.productName}>{item.productName}</td>
                                                    <td className="py-3 px-4 font-mono text-gray-500">{item.sku}</td>
                                                    <td className="py-3 px-4 text-center">{item.quantity}</td>
                                                    <td className="py-3 px-4">{item.cancelDate}</td>
                                                    <td className="py-3 px-4 max-w-[150px] truncate" title={item.cancelReason}>{item.cancelReason}</td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm ${statusInfo.bgColor} ${statusInfo.color}`}>
                                                            {statusInfo.text}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        {item.status === "PENDING_NOTIFICATION" ? (
                                                            <button
                                                                onClick={() => handleNotifyCarrier(item)}
                                                                disabled={isNotifying}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium rounded-lg shadow-sm hover:shadow-md hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {isNotifying ? (
                                                                    <>
                                                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        <span>Bildiriliyor</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                                        </svg>
                                                                        <span>Kargoya Bildir</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        ) : item.status === "PENDING_WAREHOUSE" ? (
                                                            <button
                                                                onClick={() => handleRevertNotification(item.postingNumber)}
                                                                disabled={revertingItems.has(item.postingNumber)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                                                title="Bildirimi geri al"
                                                            >
                                                                {revertingItems.has(item.postingNumber) ? (
                                                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                    </svg>
                                                                )}
                                                                <span>Geri Al</span>
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-green-600 font-medium flex items-center justify-center gap-1">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                Onaylandı
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            // Boş Durum - İptaller
                            <div className="text-center py-16 animate-fadeIn">
                                <div className="relative mx-auto w-24 h-24 mb-6">
                                    <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse"></div>
                                    <div className="relative w-24 h-24 bg-gradient-to-br from-red-50 to-red-100 rounded-full flex items-center justify-center">
                                        <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">{t("noCancellationsFound")}</h3>
                                <p className="text-gray-500 max-w-sm mx-auto">{t("noCancellationsFoundDesc")}</p>
                            </div>
                        )
                    ) : (
                        // İadeler Tablosu
                        refunds.length > 0 ? (
                            <div className="overflow-x-auto animate-fadeIn">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-200">
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("postingNumber")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("productName")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("sku")}</th>
                                            <th className="text-center py-3 px-4 font-semibold text-gray-600">{t("quantity")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("refundDate")}</th>
                                            <th className="text-left py-3 px-4 font-semibold text-gray-600">{t("reason")}</th>
                                            <th className="text-center py-3 px-4 font-semibold text-gray-600">{t("tableStatus")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {refunds.map((item, index) => (
                                            <tr
                                                key={item.id}
                                                className="border-b border-gray-100 hover:bg-orange-50/50 transition-colors duration-200"
                                                style={{ animationDelay: `${index * 50}ms` }}
                                            >
                                                <td className="py-3 px-4 font-mono text-blue-600 hover:text-blue-800 transition-colors">{item.postingNumber}</td>
                                                <td className="py-3 px-4">{item.productName}</td>
                                                <td className="py-3 px-4 font-mono text-gray-500">{item.sku}</td>
                                                <td className="py-3 px-4 text-center">{item.quantity}</td>
                                                <td className="py-3 px-4">{item.refundDate}</td>
                                                <td className="py-3 px-4">{item.refundReason}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 shadow-sm">
                                                        {item.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            // Boş Durum - İadeler
                            <div className="text-center py-16 animate-fadeIn">
                                <div className="relative mx-auto w-24 h-24 mb-6">
                                    <div className="absolute inset-0 bg-orange-100 rounded-full animate-pulse"></div>
                                    <div className="relative w-24 h-24 bg-gradient-to-br from-orange-50 to-orange-100 rounded-full flex items-center justify-center">
                                        <svg className="w-12 h-12 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                        </svg>
                                    </div>
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">{t("noRefundsFound")}</h3>
                                <p className="text-gray-500 max-w-sm mx-auto">{t("noRefundsFoundDesc")}</p>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Global Styles for Animations */}
            <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
        </div>
    );
}
