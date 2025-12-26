"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isElif } from "@/lib/auth-utils";

// Sekme tipi
type TabType = "analiz" | "uyumsuzluk";

interface Invoice {
    faturaNo: string;
    faturaTarihi: string | null;
    saticiUnvani: string | null;
    saticiVkn: string | null;
    aliciVkn: string | null;
    urunBilgisi: string | null;
    urunAdedi: number;
    kullanimSayisi: number;
    pdfUrl: string | null;
    siparisler: string[];
    durum: "normal" | "kullanilabilir" | "fazla_kullanilmis";
}

interface Stats {
    toplamFatura: number;
    normalKullanim: number;
    kullanilabilir: number;
    fazlaKullanilmis: number;
}

// Tarih uyumsuzluğu interface'i
interface DateConflict {
    postingNumber: string;
    alisFaturaNo: string | null;
    alisFaturaTarihi: string | null;
    alisSaticiUnvani: string | null;
    alisSaticiVkn: string | null;
    alisAliciVkn: string | null;
    alisUrunBilgisi: string | null;
    alisPdfUrl: string | null;
    satisFaturaNo: string | null;
    satisFaturaTarihi: string | null;
    satisAliciAdSoyad: string | null;
    satisPdfUrl: string | null;
    farkGun: number;
}

interface ConflictStats {
    toplamKayit: number;
    uyumsuzKayit: number;
    uyumluKayit: number;
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

export default function FaturalarPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // Sekme state
    const [activeTab, setActiveTab] = useState<TabType>("analiz");

    // Fatura Analizi state
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Yetki kontrolü - sadece Elif erişebilir
    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-gray-500">Yükleniyor...</div>
            </div>
        );
    }

    if (!isElif(session?.user?.email)) {
        router.push("/dashboard");
        return null;
    }

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

    // Filter state
    const [filterDurum, setFilterDurum] = useState<"all" | "normal" | "kullanilabilir" | "fazla_kullanilmis">("all");
    const [searchTerm, setSearchTerm] = useState("");

    // PDF Modal state
    const [pdfModalOpen, setPdfModalOpen] = useState(false);
    const [selectedPdfUrl, setSelectedPdfUrl] = useState<string | null>(null);

    // Sipariş detay modal
    const [siparisModalOpen, setSiparisModalOpen] = useState(false);
    const [selectedSiparisler, setSelectedSiparisler] = useState<string[]>([]);
    const [selectedFaturaNo, setSelectedFaturaNo] = useState<string>("");

    // Tarih uyumsuzlukları state
    const [conflicts, setConflicts] = useState<DateConflict[]>([]);
    const [conflictStats, setConflictStats] = useState<ConflictStats | null>(null);
    const [conflictLoading, setConflictLoading] = useState(false);
    const [conflictError, setConflictError] = useState<string | null>(null);

    const fetchInvoices = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/invoices/analysis?year=${selectedYear}&month=${selectedMonth}`);
            if (!response.ok) {
                throw new Error("Fatura verileri alınamadı");
            }
            const data = await response.json();
            setInvoices(data.invoices || []);
            setStats(data.stats || null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchConflicts = async () => {
        setConflictLoading(true);
        setConflictError(null);
        try {
            const response = await fetch(`/api/invoices/date-conflicts?year=${selectedYear}&month=${selectedMonth}`);
            if (!response.ok) {
                throw new Error("Tarih uyumsuzlukları alınamadı");
            }
            const data = await response.json();
            setConflicts(data.conflicts || []);
            setConflictStats(data.stats || null);
        } catch (err: any) {
            setConflictError(err.message);
        } finally {
            setConflictLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === "analiz") {
            fetchInvoices();
        } else {
            fetchConflicts();
        }
    }, [selectedYear, selectedMonth, activeTab]);

    // Filtrelenmiş faturalar
    const filteredInvoices = invoices.filter(invoice => {
        // Durum filtresi
        if (filterDurum !== "all" && invoice.durum !== filterDurum) {
            return false;
        }
        // Arama filtresi
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            return (
                invoice.faturaNo.toLowerCase().includes(search) ||
                invoice.saticiUnvani?.toLowerCase().includes(search) ||
                invoice.urunBilgisi?.toLowerCase().includes(search)
            );
        }
        return true;
    });

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        return date.toLocaleDateString("tr-TR");
    };

    const getDurumBadge = (durum: Invoice["durum"], urunAdedi: number, kullanimSayisi: number) => {
        if (durum === "normal") {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Tam Kullanım
                </span>
            );
        } else if (durum === "kullanilabilir") {
            const kalan = urunAdedi - kullanimSayisi;
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    {kalan} Adet Kullanılabilir
                </span>
            );
        } else {
            const fazla = kullanimSayisi - urunAdedi;
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 animate-pulse">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {fazla} Fazla Kullanım!
                </span>
            );
        }
    };

    const openPdfModal = (url: string) => {
        setSelectedPdfUrl(url);
        setPdfModalOpen(true);
    };

    const openSiparisModal = (siparisler: string[], faturaNo: string) => {
        setSelectedSiparisler(siparisler);
        setSelectedFaturaNo(faturaNo);
        setSiparisModalOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Faturalar</h1>
                            <p className="text-sm text-gray-500">Fatura analizi ve tarih uyumsuzluk kontrolü</p>
                        </div>
                    </div>

                    {/* Ay/Yıl Seçici */}
                    <div className="flex items-center gap-2">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            {MONTHS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            {[2024, 2025, 2026].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => activeTab === "analiz" ? fetchInvoices() : fetchConflicts()}
                            disabled={loading || conflictLoading}
                            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                        >
                            {(loading || conflictLoading) ? "Yükleniyor..." : "Yenile"}
                        </button>
                    </div>
                </div>

                {/* Sekmeler */}
                <div className="mt-6 border-t border-gray-200 pt-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab("analiz")}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "analiz"
                                ? "bg-violet-600 text-white shadow-md"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Fatura Analizi
                                {stats && (
                                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-white/20">
                                        {stats.toplamFatura}
                                    </span>
                                )}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab("uyumsuzluk")}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "uyumsuzluk"
                                ? "bg-amber-500 text-white shadow-md"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Tarih Uyumsuzlukları
                                {conflictStats && conflictStats.uyumsuzKayit > 0 && (
                                    <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-red-500 text-white animate-pulse">
                                        {conflictStats.uyumsuzKayit}
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === "analiz" ? (
                <>
                    {/* İstatistik Kartları */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{stats.toplamFatura}</p>
                                        <p className="text-sm text-gray-500">Toplam Fatura</p>
                                    </div>
                                </div>
                            </div>
                            <div
                                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-emerald-300 transition-colors"
                                onClick={() => setFilterDurum(filterDurum === "normal" ? "all" : "normal")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-emerald-600">{stats.normalKullanim}</p>
                                        <p className="text-sm text-gray-500">Tam Kullanım</p>
                                    </div>
                                </div>
                            </div>
                            <div
                                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-blue-300 transition-colors"
                                onClick={() => setFilterDurum(filterDurum === "kullanilabilir" ? "all" : "kullanilabilir")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-blue-600">{stats.kullanilabilir}</p>
                                        <p className="text-sm text-gray-500">Kullanılabilir</p>
                                    </div>
                                </div>
                            </div>
                            <div
                                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-red-300 transition-colors"
                                onClick={() => setFilterDurum(filterDurum === "fazla_kullanilmis" ? "all" : "fazla_kullanilmis")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-red-600">{stats.fazlaKullanilmis}</p>
                                        <p className="text-sm text-gray-500">Fazla Kullanım</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filtreler */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex-1 min-w-[200px]">
                                <input
                                    type="text"
                                    placeholder="Fatura no, satıcı veya ürün ara..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Durum:</span>
                                <select
                                    value={filterDurum}
                                    onChange={(e) => setFilterDurum(e.target.value as any)}
                                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="all">Tümü</option>
                                    <option value="normal">Tam Kullanım</option>
                                    <option value="kullanilabilir">Kullanılabilir</option>
                                    <option value="fazla_kullanilmis">Fazla Kullanım</option>
                                </select>
                            </div>
                            <div className="text-sm text-gray-500">
                                {filteredInvoices.length} fatura gösteriliyor
                            </div>
                        </div>
                    </div>

                    {/* Tablo */}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-3">
                                    <svg className="w-6 h-6 animate-spin text-violet-600" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-gray-600">Faturalar yükleniyor...</span>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <p className="text-red-600 mb-2">{error}</p>
                                    <button
                                        onClick={fetchInvoices}
                                        className="text-violet-600 hover:underline"
                                    >
                                        Tekrar dene
                                    </button>
                                </div>
                            </div>
                        ) : filteredInvoices.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-gray-600 font-medium">Fatura bulunamadı</p>
                                <p className="text-gray-400 text-sm">Bu dönem için kayıtlı alış faturası yok</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Fatura No</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tarih</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Satıcı</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ürün Bilgisi</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Kapasite</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Kullanım</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Durum</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredInvoices.map((invoice, index) => (
                                            <tr key={invoice.faturaNo} className={`hover:bg-gray-50 ${invoice.durum === "fazla_kullanilmis" ? "bg-red-50" : ""}`}>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-sm font-medium text-gray-900">{invoice.faturaNo}</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">
                                                    {formatDate(invoice.faturaTarihi)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={invoice.saticiUnvani || ""}>
                                                            {invoice.saticiUnvani || "-"}
                                                        </p>
                                                        {invoice.saticiVkn && (
                                                            <p className="text-xs text-gray-400 font-mono">{invoice.saticiVkn}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm text-gray-700 truncate max-w-[250px]" title={invoice.urunBilgisi || ""}>
                                                        {invoice.urunBilgisi || "-"}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold text-sm">
                                                        {invoice.urunAdedi}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => openSiparisModal(invoice.siparisler, invoice.faturaNo)}
                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold text-sm hover:bg-violet-200 transition-colors cursor-pointer"
                                                        title="Siparişleri görüntüle"
                                                    >
                                                        {invoice.kullanimSayisi}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {getDurumBadge(invoice.durum, invoice.urunAdedi, invoice.kullanimSayisi)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {invoice.pdfUrl ? (
                                                            <button
                                                                onClick={() => openPdfModal(invoice.pdfUrl!)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                PDF
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">PDF yok</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* PDF Modal */}
                    {pdfModalOpen && selectedPdfUrl && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <h3 className="text-lg font-semibold text-gray-900">Fatura PDF</h3>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={selectedPdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            Yeni Sekmede Aç
                                        </a>
                                        <button
                                            onClick={() => setPdfModalOpen(false)}
                                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <iframe
                                        src={selectedPdfUrl}
                                        className="w-full h-[70vh]"
                                        title="Fatura PDF"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sipariş Listesi Modal */}
                    {siparisModalOpen && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Kullanılan Siparişler</h3>
                                        <p className="text-sm text-gray-500">Fatura: {selectedFaturaNo}</p>
                                    </div>
                                    <button
                                        onClick={() => setSiparisModalOpen(false)}
                                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="p-6">
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                        {selectedSiparisler.map((siparis, index) => (
                                            <div key={siparis} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                                <span className="w-6 h-6 flex items-center justify-center bg-violet-100 text-violet-700 rounded-full text-xs font-bold">
                                                    {index + 1}
                                                </span>
                                                <span className="font-mono text-sm text-gray-700">{siparis}</span>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(siparis);
                                                    }}
                                                    className="ml-auto p-1 text-gray-400 hover:text-gray-600"
                                                    title="Kopyala"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                                    <button
                                        onClick={() => setSiparisModalOpen(false)}
                                        className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
                                    >
                                        Kapat
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Tarih Uyumsuzlukları Sekmesi */
                <>
                    {/* İstatistik Kartları */}
                    {conflictStats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-gray-900">{conflictStats.toplamKayit}</p>
                                        <p className="text-sm text-gray-500">Toplam Kayıt</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white border border-amber-200 rounded-lg p-4 bg-amber-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-amber-600">{conflictStats.uyumsuzKayit}</p>
                                        <p className="text-sm text-gray-500">Tarih Uyumsuzluğu</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white border border-emerald-200 rounded-lg p-4 bg-emerald-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-emerald-600">{conflictStats.uyumluKayit}</p>
                                        <p className="text-sm text-gray-500">Uyumlu Kayıt</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bilgilendirme */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div>
                                <p className="text-sm font-medium text-amber-800">Tarih Uyumsuzluğu Nedir?</p>
                                <p className="text-sm text-amber-700 mt-1">
                                    Alış faturası tarihi, satış faturası tarihinden sonra olan kayıtlar burada listelenir.
                                    Bu durum, ürünü satmadan önce almadığınız anlamına gelebilir ve muhasebe açısından sorunlu olabilir.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tablo */}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {conflictLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-3">
                                    <svg className="w-6 h-6 animate-spin text-amber-600" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="text-gray-600">Tarih uyumsuzlukları yükleniyor...</span>
                                </div>
                            </div>
                        ) : conflictError ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <p className="text-red-600 mb-2">{conflictError}</p>
                                    <button
                                        onClick={fetchConflicts}
                                        className="text-amber-600 hover:underline"
                                    >
                                        Tekrar dene
                                    </button>
                                </div>
                            </div>
                        ) : conflicts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                                    <svg className="w-8 h-8 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <p className="text-gray-600 font-medium">Tarih uyumsuzluğu bulunamadı</p>
                                <p className="text-gray-400 text-sm">Bu dönem için tüm fatura tarihleri uyumlu</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Gönderi No</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ürün Bilgisi</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Alış Faturası</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Satış Faturası</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Fark</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {conflicts.map((conflict) => (
                                            <tr key={conflict.postingNumber} className="hover:bg-amber-50 bg-amber-50/30">
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-sm font-medium text-gray-900">{conflict.postingNumber}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm text-gray-700 truncate max-w-[200px]" title={conflict.alisUrunBilgisi || ""}>
                                                        {conflict.alisUrunBilgisi || "-"}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-red-600">
                                                            {conflict.alisFaturaTarihi ? new Date(conflict.alisFaturaTarihi).toLocaleDateString("tr-TR") : "-"}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono">{conflict.alisFaturaNo || "-"}</p>
                                                        <p className="text-xs text-gray-400 truncate max-w-[150px]">{conflict.alisSaticiUnvani || "-"}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-emerald-600">
                                                            {conflict.satisFaturaTarihi ? new Date(conflict.satisFaturaTarihi).toLocaleDateString("tr-TR") : "-"}
                                                        </p>
                                                        <p className="text-xs text-gray-500 font-mono">{conflict.satisFaturaNo || "-"}</p>
                                                        <p className="text-xs text-gray-400 truncate max-w-[150px]">{conflict.satisAliciAdSoyad || "-"}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                        +{conflict.farkGun} gün
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        {/* Alış Faturası PDF */}
                                                        <button
                                                            onClick={() => conflict.alisPdfUrl && openPdfModal(conflict.alisPdfUrl)}
                                                            disabled={!conflict.alisPdfUrl}
                                                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${conflict.alisPdfUrl
                                                                ? "text-violet-600 bg-violet-50 hover:bg-violet-100 cursor-pointer"
                                                                : "text-gray-400 bg-gray-100 cursor-not-allowed"
                                                                }`}
                                                            title={conflict.alisPdfUrl ? "Alış Faturası PDF" : "Alış Faturası PDF yok"}
                                                        >
                                                            A
                                                        </button>
                                                        {/* Satış Faturası PDF */}
                                                        <button
                                                            onClick={() => conflict.satisPdfUrl && openPdfModal(conflict.satisPdfUrl)}
                                                            disabled={!conflict.satisPdfUrl}
                                                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${conflict.satisPdfUrl
                                                                ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                                                                : "text-gray-400 bg-gray-100 cursor-not-allowed"
                                                                }`}
                                                            title={conflict.satisPdfUrl ? "Satış Faturası PDF" : "Satış Faturası PDF yok"}
                                                        >
                                                            S
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* PDF Modal (shared) */}
                    {pdfModalOpen && selectedPdfUrl && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                                    <h3 className="text-lg font-semibold text-gray-900">Fatura PDF</h3>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={selectedPdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                            Yeni Sekmede Aç
                                        </a>
                                        <button
                                            onClick={() => setPdfModalOpen(false)}
                                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <iframe
                                        src={selectedPdfUrl}
                                        className="w-full h-[70vh]"
                                        title="Fatura PDF"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
