"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CancellationItem {
    id: string;
    postingNumber: string;
    productName: string | null;
    productImage: string | null;
    sku: string | null;
    quantity: number;
    cancelDate: string | null;
    cancelReason: string | null;
    status: "PENDING_WAREHOUSE" | "IN_WAREHOUSE";
    notifiedAt: string | null;
    confirmedAt: string | null;
    seller: {
        id: string;
        storeName: string | null;
    } | null;
}

// Tour step positions (static)
const TOUR_POSITIONS = ["bottom", "top", "left", "left"] as const;

export default function CarrierDepoPage() {
    const { t } = useLanguage();

    // Tour steps with translations
    const TOUR_STEPS = [
        {
            target: "tour-cards",
            title: t("tourCardsTitle"),
            content: t("tourCardsContent"),
            position: TOUR_POSITIONS[0],
        },
        {
            target: "tour-table",
            title: t("tourTableTitle"),
            content: t("tourTableContent"),
            position: TOUR_POSITIONS[1],
        },
        {
            target: "tour-status",
            title: t("tourStatusTitle"),
            content: t("tourStatusContent"),
            position: TOUR_POSITIONS[2],
        },
        {
            target: "tour-action",
            title: t("tourActionTitle"),
            content: t("tourActionContent"),
            position: TOUR_POSITIONS[3],
        },
    ];
    const [isLoading, setIsLoading] = useState(true);
    const [cancellations, setCancellations] = useState<CancellationItem[]>([]);
    const [confirmingItems, setConfirmingItems] = useState<Set<string>>(new Set());
    const [revertingItems, setRevertingItems] = useState<Set<string>>(new Set());

    // Tour state
    const [showTour, setShowTour] = useState(false);
    const [tourStep, setTourStep] = useState(0);

    // Check if tour should be shown
    useEffect(() => {
        const tourSeen = localStorage.getItem("carrier-depo-tour-seen");
        if (!tourSeen) {
            // Delay tour start to allow page to load
            const timer = setTimeout(() => setShowTour(true), 500);
            return () => clearTimeout(timer);
        }
    }, []);

    // Tour controls
    const handleNextStep = () => {
        if (tourStep < TOUR_STEPS.length - 1) {
            setTourStep(tourStep + 1);
        } else {
            handleEndTour();
        }
    };

    const handlePrevStep = () => {
        if (tourStep > 0) {
            setTourStep(tourStep - 1);
        }
    };

    const handleEndTour = () => {
        setShowTour(false);
        localStorage.setItem("carrier-depo-tour-seen", "true");
    };

    const handleRestartTour = () => {
        setTourStep(0);
        setShowTour(true);
    };

    // Veri çekme fonksiyonu
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/cancellations/carrier');
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            setCancellations(data);
        } catch (error) {
            console.error("Error fetching cancellations:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Ürün depoda onayı
    const handleConfirmWarehouse = async (postingNumber: string) => {
        setConfirmingItems(prev => new Set(prev).add(postingNumber));

        try {
            const response = await fetch('/api/cancellations/confirm-warehouse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postingNumber }),
            });

            if (response.ok) {
                setCancellations(prev => prev.map(c =>
                    c.postingNumber === postingNumber
                        ? { ...c, status: "IN_WAREHOUSE" as const, confirmedAt: new Date().toISOString() }
                        : c
                ));
            } else {
                const error = await response.json();
                console.error("Failed to confirm warehouse:", error);
                alert(error.error || "Onaylama başarısız");
            }
        } catch (error) {
            console.error("Error confirming warehouse:", error);
            alert("Bir hata oluştu");
        } finally {
            setConfirmingItems(prev => {
                const next = new Set(prev);
                next.delete(postingNumber);
                return next;
            });
        }
    };

    // Onayı geri al
    const handleRevertConfirmation = async (postingNumber: string) => {
        if (!confirm("Onayı geri almak istediğinize emin misiniz?")) return;

        setRevertingItems(prev => new Set(prev).add(postingNumber));

        try {
            const response = await fetch('/api/cancellations/revert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postingNumber,
                    action: "revert-confirmation"
                }),
            });

            if (response.ok) {
                setCancellations(prev => prev.map(c =>
                    c.postingNumber === postingNumber
                        ? { ...c, status: "PENDING_WAREHOUSE" as const, confirmedAt: null }
                        : c
                ));
            } else {
                const error = await response.json();
                console.error("Failed to revert confirmation:", error);
                alert(error.error || "Geri alma başarısız");
            }
        } catch (error) {
            console.error("Error reverting confirmation:", error);
            alert("Bir hata oluştu");
        } finally {
            setRevertingItems(prev => {
                const next = new Set(prev);
                next.delete(postingNumber);
                return next;
            });
        }
    };

    // Format date
    const formatDate = (dateString: string | null) => {
        if (!dateString) return "-";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "-";
            const day = String(date.getDate()).padStart(2, "0");
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        } catch {
            return "-";
        }
    };

    const stats = {
        total: cancellations.length,
        pendingWarehouse: cancellations.filter(c => c.status === "PENDING_WAREHOUSE").length,
        inWarehouse: cancellations.filter(c => c.status === "IN_WAREHOUSE").length,
    };

    const currentStep = TOUR_STEPS[tourStep];

    return (
        <div className="p-6 relative">
            {/* Tour Overlay */}
            {showTour && (
                <div className="fixed inset-0 z-50">
                    {/* Dark overlay */}
                    <div className="absolute inset-0 bg-black/50" onClick={handleEndTour} />

                    {/* Spotlight and tooltip */}
                    <div className="relative h-full">
                        {/* Tour tooltip */}
                        <div
                            className="absolute bg-white rounded-lg shadow-xl p-5 max-w-sm z-50"
                            style={{
                                top: tourStep === 0 ? "180px" : tourStep === 1 ? "300px" : "350px",
                                left: tourStep <= 1 ? "50%" : "auto",
                                right: tourStep > 1 ? "100px" : "auto",
                                transform: tourStep <= 1 ? "translateX(-50%)" : "none",
                            }}
                        >
                            {/* Step indicator */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-gray-500">
                                    {t("tourStep")} {tourStep + 1} / {TOUR_STEPS.length}
                                </span>
                                <button
                                    onClick={handleEndTour}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Content */}
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{currentStep.title}</h3>
                            <p className="text-sm text-gray-600 mb-4">{currentStep.content}</p>

                            {/* Navigation buttons */}
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={handleEndTour}
                                    className="text-sm text-gray-500 hover:text-gray-700"
                                >
                                    {t("tourSkip")}
                                </button>
                                <div className="flex items-center space-x-2">
                                    {tourStep > 0 && (
                                        <button
                                            onClick={handlePrevStep}
                                            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                                        >
                                            {t("tourBack")}
                                        </button>
                                    )}
                                    <button
                                        onClick={handleNextStep}
                                        className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        {tourStep < TOUR_STEPS.length - 1 ? t("tourNext") : t("tourFinish")}
                                    </button>
                                </div>
                            </div>

                            {/* Arrow pointer */}
                            <div
                                className="absolute w-3 h-3 bg-white transform rotate-45"
                                style={{
                                    top: currentStep.position === "bottom" ? "-6px" : "auto",
                                    bottom: currentStep.position === "top" ? "-6px" : "auto",
                                    left: currentStep.position === "left" ? "auto" : "50%",
                                    right: currentStep.position === "left" ? "-6px" : "auto",
                                    marginLeft: currentStep.position !== "left" ? "-6px" : 0,
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Help button to restart tour */}
            <button
                onClick={handleRestartTour}
                className="fixed bottom-6 right-6 w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center z-40"
                title={t("tourRestartTitle")}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>

            {/* Özet Kartları */}
            <div id="tour-cards" className={`grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 ${showTour && tourStep === 0 ? "relative z-50 bg-gray-100 rounded-lg p-2 -m-2" : ""}`}>
                {/* Toplam Bildirim */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t("totalNotifications")}</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                        </div>
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Depo Bekleniyor */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t("pendingWarehouse")}</p>
                            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.pendingWarehouse}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Depoda */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">{t("inWarehouse")}</p>
                            <p className="text-2xl font-bold text-green-600 mt-1">{stats.inWarehouse}</p>
                        </div>
                        <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tablo */}
            <div id="tour-table" className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${showTour && tourStep === 1 ? "relative z-50" : ""}`}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("image")}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("orderNo")}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("seller")}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("product")}</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">{t("quantity")}</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">{t("notificationDate")}</th>
                                <th id="tour-status" className={`px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase ${showTour && tourStep === 2 ? "bg-blue-100 relative z-50" : ""}`}>{t("tableStatus")}</th>
                                <th id="tour-action" className={`px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase ${showTour && tourStep === 3 ? "bg-blue-100 relative z-50" : ""}`}>{t("action")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">{t("loading")}</td>
                                </tr>
                            ) : cancellations.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                        {t("noNotificationsYet")}
                                    </td>
                                </tr>
                            ) : (
                                cancellations.map((item) => {
                                    const isConfirming = confirmingItems.has(item.postingNumber);

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                {item.productImage ? (
                                                    <img
                                                        src={item.productImage}
                                                        alt={item.productName || "Ürün"}
                                                        className="w-10 h-10 object-contain bg-white rounded border"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center">
                                                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 font-mono">{item.postingNumber}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">{item.seller?.storeName || "-"}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate" title={item.productName || "-"}>
                                                {item.productName || "-"}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 text-center">{item.quantity}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(item.notifiedAt)}</td>
                                            <td className={`px-4 py-3 text-sm text-center ${showTour && tourStep === 2 ? "bg-blue-50" : ""}`}>
                                                {item.status === "PENDING_WAREHOUSE" ? (
                                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                                                        {t("pendingWarehouse")}
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                                        {t("inWarehouse")}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`px-4 py-3 text-sm text-center ${showTour && tourStep === 3 ? "bg-blue-50" : ""}`}>
                                                {item.status === "PENDING_WAREHOUSE" ? (
                                                    <button
                                                        onClick={() => handleConfirmWarehouse(item.postingNumber)}
                                                        disabled={isConfirming}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isConfirming ? (
                                                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                        {isConfirming ? t("loading") : t("productInWarehouse")}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRevertConfirmation(item.postingNumber)}
                                                        disabled={revertingItems.has(item.postingNumber)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={t("revert")}
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
                                                        <span>{t("revert")}</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
