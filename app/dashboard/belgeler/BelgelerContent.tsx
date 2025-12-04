"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import DocumentUploadModal, { DocumentFormData } from "./DocumentUploadModal";

interface OzonOrder {
    posting_number: string;
    order_id?: number;
    status?: string;
    in_process_at?: string;
    shipment_date?: string;
    products?: Array<{
        name: string;
        quantity: number;
        price: string;
        offer_id?: string;
    }>;
    analytics_data?: {
        region: string;
        city: string;
        delivery_type: string;
    };
    customer?: {
        name?: string;
        phone?: string;
        email?: string;
    };
}

interface OrderStats {
    totalOrders: number;
    cancelledOrders: number;
    deliveredOrders: number;
    awaitingDeliveryOrders: number;
    deliveringOrders: number;
}

interface Pagination {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
}

interface ApiResponse {
    orders: OzonOrder[];
    stats: OrderStats;
    pagination: Pagination;
    filter: { year: number; month: number };
    error?: string;
}

const MONTHS = [
    { value: 1, label: "Ocak" },
    { value: 2, label: "Şubat" },
    { value: 3, label: "Mart" },
    { value: 4, label: "Nisan" },
    { value: 5, label: "Mayıs" },
    { value: 6, label: "Haziran" },
    { value: 7, label: "Temmuz" },
    { value: 8, label: "Ağustos" },
    { value: 9, label: "Eylül" },
    { value: 10, label: "Ekim" },
    { value: 11, label: "Kasım" },
    { value: 12, label: "Aralık" },
];

function getStatusConfig(status: string | undefined): { text: string; className: string } {
    switch (status) {
        case "delivered":
            return { text: "Teslim Edildi", className: "bg-teal-600 text-white" };
        case "cancelled":
            return { text: "İptal Edildi", className: "bg-rose-600 text-white" };
        case "awaiting_deliver":
        case "awaiting_packaging":
            return { text: "Hazırlanıyor", className: "bg-amber-600 text-white" };
        case "delivering":
            return { text: "Kargoda", className: "bg-indigo-600 text-white" };
        case "awaiting_registration":
            return { text: "Kayıt Bekliyor", className: "bg-slate-500 text-white" };
        default:
            return { text: status || "Bilinmiyor", className: "bg-slate-400 text-white" };
    }
}

function formatDate(dateString: string | undefined): string {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function BelgelerContent() {
    const { data: session } = useSession();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [allOrders, setAllOrders] = useState<OzonOrder[]>([]); // Cache all orders

    const currentDate = new Date();
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [currentPage, setCurrentPage] = useState(1);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPostingNumber, setSelectedPostingNumber] = useState("");
    const [selectedCustomerName, setSelectedCustomerName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResult, setSearchResult] = useState<OzonOrder | null>(null);
    const [searching, setSearching] = useState(false);
    const [searchAttempted, setSearchAttempted] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);

    const handleSearch = async () => {
        const trimmedQuery = searchQuery.trim();
        if (trimmedQuery.length < 3) return;

        setSearching(true);
        setSearchResult(null);
        setSearchAttempted(true);
        try {
            const response = await fetch(`/api/order-documents/search?postingNumber=${encodeURIComponent(trimmedQuery)}`);

            const data = await response.json();
            if (data.found && data.order) {
                setSearchResult(data.order);
            }
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setSearching(false);
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setSearchResult(null);
        setSearchAttempted(false);
    };

    const openModal = (order: OzonOrder) => {
        setSelectedPostingNumber(order.posting_number);
        setSelectedCustomerName(order.customer?.name || "");
        setIsModalOpen(true);
    };

    const handleSaveDocument = async (formData: DocumentFormData) => {
        const data = new FormData();
        data.append("postingNumber", formData.postingNumber);

        // Alış
        if (formData.alis.faturaNo) {
            data.append("alisFaturaNo", formData.alis.faturaNo);
        }
        if (formData.alis.pdfFile) {
            data.append("alisPdf", formData.alis.pdfFile);
        }

        // Satış
        if (formData.satis.faturaTarihi) {
            data.append("satisFaturaTarihi", formData.satis.faturaTarihi);
        }
        if (formData.satis.faturaNo) {
            data.append("satisFaturaNo", formData.satis.faturaNo);
        }
        if (formData.satis.aliciAdSoyad) {
            data.append("satisAliciAdSoyad", formData.satis.aliciAdSoyad);
        }
        if (formData.satis.pdfFile) {
            data.append("satisPdf", formData.satis.pdfFile);
        }

        // ETGB
        if (formData.etgb.etgbNo) {
            data.append("etgbNo", formData.etgb.etgbNo);
        }
        if (formData.etgb.tutar) {
            data.append("etgbTutar", formData.etgb.tutar);
        }
        if (formData.etgb.dovizCinsi) {
            data.append("etgbDovizCinsi", formData.etgb.dovizCinsi);
        }
        if (formData.etgb.pdfFile) {
            data.append("etgbPdf", formData.etgb.pdfFile);
        }

        const response = await fetch("/api/order-documents", {
            method: "POST",
            body: data,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Kayıt başarısız");
        }

        alert("Belgeler başarıyla kaydedildi!");
    };

    // Fetch all orders for the month (only when year/month changes)
    const fetchOrders = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all orders at once for client-side caching
            const url = `/api/ozon/monthly-orders?year=${selectedYear}&month=${selectedMonth}&all=true`;
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Veriler alınamadı");
            }
            const result = await response.json();

            // Cache all orders for instant filtering
            if (result.allOrders) {
                setAllOrders(result.allOrders);
            } else {
                setAllOrders(result.orders);
            }
            setData(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Get filtered and paginated orders from cache
    const getDisplayOrders = () => {
        if (allOrders.length === 0) return data?.orders || [];

        let filtered = allOrders;
        if (statusFilter) {
            if (statusFilter === 'delivered') {
                filtered = allOrders.filter(o => o.status === 'delivered');
            } else if (statusFilter === 'delivering') {
                filtered = allOrders.filter(o => o.status === 'delivering');
            } else if (statusFilter === 'awaiting') {
                filtered = allOrders.filter(o => o.status === 'awaiting_deliver' || o.status === 'awaiting_packaging');
            } else if (statusFilter === 'cancelled') {
                filtered = allOrders.filter(o => o.status === 'cancelled');
            }
        }

        const pageSize = 50;
        const startIndex = (currentPage - 1) * pageSize;
        return filtered.slice(startIndex, startIndex + pageSize);
    };

    // Get pagination info from cache
    const getPagination = () => {
        if (allOrders.length === 0) return data?.pagination;

        let filtered = allOrders;
        if (statusFilter) {
            if (statusFilter === 'delivered') {
                filtered = allOrders.filter(o => o.status === 'delivered');
            } else if (statusFilter === 'delivering') {
                filtered = allOrders.filter(o => o.status === 'delivering');
            } else if (statusFilter === 'awaiting') {
                filtered = allOrders.filter(o => o.status === 'awaiting_deliver' || o.status === 'awaiting_packaging');
            } else if (statusFilter === 'cancelled') {
                filtered = allOrders.filter(o => o.status === 'cancelled');
            }
        }

        const pageSize = 50;
        return {
            currentPage,
            totalPages: Math.ceil(filtered.length / pageSize),
            pageSize,
            totalItems: filtered.length,
        };
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter]);

    useEffect(() => {
        setStatusFilter(null);
        setCurrentPage(1);
        fetchOrders();
    }, [selectedYear, selectedMonth]);

    const yearOptions = [];
    for (let y = currentDate.getFullYear(); y >= currentDate.getFullYear() - 2; y--) {
        yearOptions.push(y);
    }

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Dönem:</span>
                        <select
                            value={selectedMonth}
                            onChange={(e) => {
                                setSelectedMonth(parseInt(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            {MONTHS.map((month) => (
                                <option key={month.value} value={month.value}>
                                    {month.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => {
                                setSelectedYear(parseInt(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                            {yearOptions.map((year) => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={() => {
                            setSelectedYear(currentDate.getFullYear());
                            setSelectedMonth(currentDate.getMonth() + 1);
                            setCurrentPage(1);
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                        Mevcut Ay
                    </button>
                    <button
                        onClick={async () => {
                            const link = document.createElement('a');
                            link.href = `/api/order-documents/export?year=${selectedYear}&month=${selectedMonth}`;
                            link.download = `Belgeler_${selectedYear}_${selectedMonth.toString().padStart(2, '0')}.xlsx`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 rounded hover:bg-teal-700"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Excel İndir
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Gönderi no ile ara (tüm siparişlerde)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        {searchQuery && (
                            <button
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={searching || searchQuery.length < 3}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {searching ? "Aranıyor..." : "Ara"}
                    </button>
                </div>

                {/* Search Result */}
                {searchResult && (
                    <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-teal-800">Sipariş Bulundu!</p>
                                <p className="text-xs text-teal-600 mt-1">Gönderi No: {searchResult.posting_number}</p>
                                <p className="text-xs text-teal-600">Tarih: {formatDate(searchResult.in_process_at || searchResult.shipment_date)}</p>
                                <p className="text-xs text-teal-600">Şehir: {searchResult.analytics_data?.city || "—"}</p>
                            </div>
                            <button
                                onClick={() => openModal(searchResult)}
                                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                            >
                                İşlem Yap
                            </button>
                        </div>
                    </div>
                )}

                {searchAttempted && !searching && !searchResult && (
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">Sipariş bulunamadı. Gönderi numarasını kontrol edin.</p>
                    </div>
                )}
            </div>

            {/* Stats - Clickable Filter Cards */}
            {data?.stats && (
                <div className="grid grid-cols-5 gap-4">
                    <div
                        onClick={() => setStatusFilter(null)}
                        className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === null ? 'border-slate-400 ring-2 ring-slate-200' : 'border-gray-200'
                            }`}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Toplam</div>
                        <div className="mt-1 text-2xl font-semibold text-gray-900">{data.stats.totalOrders}</div>
                    </div>
                    <div
                        onClick={() => setStatusFilter(statusFilter === 'delivered' ? null : 'delivered')}
                        className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delivered' ? 'border-teal-400 ring-2 ring-teal-200' : 'border-gray-200'
                            }`}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Teslim Edildi</div>
                        <div className="mt-1 text-2xl font-semibold text-teal-600">{data.stats.deliveredOrders}</div>
                    </div>
                    <div
                        onClick={() => setStatusFilter(statusFilter === 'delivering' ? null : 'delivering')}
                        className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delivering' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                            }`}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Kargoda</div>
                        <div className="mt-1 text-2xl font-semibold text-indigo-600">{data.stats.deliveringOrders}</div>
                    </div>
                    <div
                        onClick={() => setStatusFilter(statusFilter === 'awaiting' ? null : 'awaiting')}
                        className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'awaiting' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'
                            }`}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hazırlanıyor</div>
                        <div className="mt-1 text-2xl font-semibold text-amber-600">{data.stats.awaitingDeliveryOrders}</div>
                    </div>
                    <div
                        onClick={() => setStatusFilter(statusFilter === 'cancelled' ? null : 'cancelled')}
                        className={`bg-white border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'cancelled' ? 'border-rose-400 ring-2 ring-rose-200' : 'border-gray-200'
                            }`}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">İptal</div>
                        <div className="mt-1 text-2xl font-semibold text-rose-600">{data.stats.cancelledOrders}</div>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-red-800">Hata: {error}</p>
                        </div>
                        <button
                            onClick={fetchOrders}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                        >
                            Tekrar Dene
                        </button>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                    <p className="mt-2 text-sm text-gray-500">Yükleniyor...</p>
                </div>
            )}

            {/* Table */}
            {!loading && !error && data && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Gönderi No</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tarih</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Şehir</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ürün</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Durum</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Detay</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {getDisplayOrders().length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                                        {statusFilter ? "Bu filtreye uygun sipariş bulunamadı." : "Bu dönem için sipariş bulunamadı."}
                                    </td>
                                </tr>
                            ) : (
                                getDisplayOrders().map((order, index) => {
                                    const status = getStatusConfig(order.status);
                                    const pagination = getPagination();
                                    const rowIndex = pagination ? (pagination.currentPage - 1) * pagination.pageSize + index + 1 : index + 1;
                                    return (
                                        <tr key={order.posting_number} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-500">{rowIndex}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{order.posting_number}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(order.in_process_at || order.shipment_date)}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{order.analytics_data?.city || "—"}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600">{order.products?.length || 0}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${status.className}`}>
                                                    {status.text}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => openModal(order)}
                                                    className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                                                >
                                                    İşlem Yap
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {(() => {
                        const pagination = getPagination();
                        if (!pagination || pagination.totalPages <= 1) return null;
                        return (
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
                                <div className="text-sm text-gray-600">
                                    Toplam {pagination.totalItems} kayıt
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                    >
                                        Önceki
                                    </button>
                                    <span className="px-3 py-1 text-sm text-gray-600">
                                        {pagination.currentPage} / {pagination.totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                                        disabled={currentPage === pagination.totalPages}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                    >
                                        Sonraki
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            <DocumentUploadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                postingNumber={selectedPostingNumber}
                customerName={selectedCustomerName}
                onSave={handleSaveDocument}
            />
        </div>
    );
}
