"use client";

import { useState, useRef } from "react";

export default function OcrTestPage() {
  // ETGB State
  const [etgbFile, setEtgbFile] = useState<File | null>(null);
  const [etgbSiparisNo, setEtgbSiparisNo] = useState(""); // Sipariş No input
  const [etgbNo, setEtgbNo] = useState("");
  const [etgbTutar, setEtgbTutar] = useState("");
  const [etgbLoading, setEtgbLoading] = useState(false);
  const [etgbRawText, setEtgbRawText] = useState("");
  const [etgbDebug, setEtgbDebug] = useState(""); // Debug info
  const etgbInputRef = useRef<HTMLInputElement>(null);

  // Alış Faturası State
  const [faturaFile, setFaturaFile] = useState<File | null>(null);
  const [faturaNo, setFaturaNo] = useState("");
  const [faturaTarihi, setFaturaTarihi] = useState("");
  const [saticiUnvani, setSaticiUnvani] = useState("");
  const [saticiVkn, setSaticiVkn] = useState("");
  const [kdvHaricTutar, setKdvHaricTutar] = useState("");
  const [kdvTutari, setKdvTutari] = useState("");
  const [urunBilgisi, setUrunBilgisi] = useState("");
  const [urunAdedi, setUrunAdedi] = useState("");
  const [faturaLoading, setFaturaLoading] = useState(false);
  const [faturaRawText, setFaturaRawText] = useState("");
  const [faturaDragging, setFaturaDragging] = useState(false);
  const faturaInputRef = useRef<HTMLInputElement>(null);

  // ETGB OCR işlemi (Gemini AI)
  const handleEtgbOcr = async () => {
    if (!etgbFile) return;

    setEtgbLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", etgbFile);
      formData.append("type", "etgb");
      formData.append("siparisNo", etgbSiparisNo);

      // Gemini AI endpoint kullan
      const response = await fetch("/api/ocr/gemini", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setEtgbNo(data.etgbNo || "");
        setEtgbTutar(data.tutar || "");
        setEtgbRawText(data.rawResponse || "");
        setEtgbDebug("Gemini AI kullanıldı");
      } else {
        alert("OCR hatası: " + data.error + (data.rawResponse ? "\n\nYanıt: " + data.rawResponse : ""));
      }
    } catch (error) {
      console.error("OCR error:", error);
      alert("OCR işlemi başarısız");
    } finally {
      setEtgbLoading(false);
    }
  };

  // Alış Faturası OCR işlemi (Gemini AI)
  const handleFaturaOcr = async () => {
    if (!faturaFile) return;

    setFaturaLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", faturaFile);
      formData.append("type", "alis-test"); // Özelleştirilmiş test prompt

      // Gemini AI endpoint kullan
      const response = await fetch("/api/ocr/gemini", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setFaturaNo(data.faturaNo || "");
        setFaturaTarihi(data.faturaTarihi || "");
        setSaticiUnvani(data.saticiUnvani || "");
        setSaticiVkn(data.saticiVkn || "");
        setKdvHaricTutar(data.kdvHaricTutar || "");
        setKdvTutari(data.kdvTutari || "");
        setUrunBilgisi(data.urunBilgisi || "");
        setUrunAdedi(data.urunAdedi || "");
        setFaturaRawText(data.rawResponse || "");
      } else {
        alert("OCR hatası: " + data.error + (data.rawResponse ? "\n\nYanıt: " + data.rawResponse : ""));
      }
    } catch (error) {
      console.error("OCR error:", error);
      alert("OCR işlemi başarısız");
    } finally {
      setFaturaLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">OCR Test Sayfası</h1>
      <p className="text-gray-600 mb-8">
        Bu sayfa belge OCR özelliğini test etmek içindir. PNG/JPG yükleyerek otomatik alan çıkarma işlemini test edebilirsiniz.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ETGB Modülü */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">ETGB</h2>
          </div>

          {/* Sipariş No Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş No (Opsiyonel)</label>
            <input
              type="text"
              value={etgbSiparisNo}
              onChange={(e) => setEtgbSiparisNo(e.target.value)}
              placeholder="Örn: 61209824-0065-1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Toplu beyannamede ilgili siparişin tutarını bulmak için girin</p>
          </div>

          {/* PNG/JPG Yükleme */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Görsel Dosyası (PNG/JPG)</label>
            <input
              type="file"
              ref={etgbInputRef}
              accept=".png,.jpg,.jpeg"
              onChange={(e) => setEtgbFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div
              onClick={() => etgbInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {etgbFile ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{etgbFile.name}</span>
                </div>
              ) : (
                <div className="text-gray-500">
                  <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>PNG/JPG yüklemek için tıklayın</span>
                </div>
              )}
            </div>
          </div>

          {/* OCR Butonu */}
          <button
            onClick={handleEtgbOcr}
            disabled={!etgbFile || etgbLoading}
            className="w-full mb-4 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {etgbLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8m0 16a8 8 0 01-8-8" />
                </svg>
                İşleniyor...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                OCR ile Oku
              </>
            )}
          </button>

          {/* Çıkarılan Değerler */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ETGB No</label>
              <input
                type="text"
                value={etgbNo}
                onChange={(e) => setEtgbNo(e.target.value)}
                placeholder="Otomatik doldurulacak..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (USD)</label>
              <input
                type="text"
                value={etgbTutar}
                onChange={(e) => setEtgbTutar(e.target.value)}
                placeholder="Otomatik doldurulacak..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Raw Text Debug */}
          {etgbRawText && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ham Metin (Debug)</label>
              <textarea
                readOnly
                value={etgbRawText}
                className="w-full h-32 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 font-mono"
              />
            </div>
          )}
        </div>

        {/* Alış Faturası Modülü */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Alış Faturası</h2>
          </div>

          {/* PDF/PNG/JPG Yükleme - Sürükle Bırak */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Dosya (PDF/PNG/JPG)</label>
            <input
              type="file"
              ref={faturaInputRef}
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFaturaFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div
              onClick={() => faturaInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setFaturaDragging(true); }}
              onDragLeave={() => setFaturaDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setFaturaDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
                  setFaturaFile(file);
                }
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${faturaDragging ? "border-orange-500 bg-orange-50" : "border-gray-300 hover:border-orange-400"
                }`}
            >
              {faturaFile ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{faturaFile.name}</span>
                </div>
              ) : (
                <div className="text-gray-500">
                  <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Sürükle bırak veya tıkla</span>
                </div>
              )}
            </div>
          </div>

          {/* OCR Butonu */}
          <button
            onClick={handleFaturaOcr}
            disabled={!faturaFile || faturaLoading}
            className="w-full mb-4 py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {faturaLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8m0 16a8 8 0 01-8-8" />
                </svg>
                İşleniyor...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                OCR ile Oku
              </>
            )}
          </button>

          {/* Çıkarılan Değerler - Grid */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fatura No</label>
                <input
                  type="text"
                  value={faturaNo}
                  onChange={(e) => setFaturaNo(e.target.value)}
                  placeholder="Otomatik..."
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fatura Tarihi</label>
                <input
                  type="text"
                  value={faturaTarihi}
                  onChange={(e) => setFaturaTarihi(e.target.value)}
                  placeholder="GG.AA.YYYY"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Satıcı Ünvanı</label>
              <input
                type="text"
                value={saticiUnvani}
                onChange={(e) => setSaticiUnvani(e.target.value)}
                placeholder="Otomatik..."
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Satıcı VKN</label>
              <input
                type="text"
                value={saticiVkn}
                onChange={(e) => setSaticiVkn(e.target.value)}
                placeholder="10-11 hane"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">KDV Hariç Tutar</label>
                <input
                  type="text"
                  value={kdvHaricTutar}
                  onChange={(e) => setKdvHaricTutar(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">KDV Tutarı</label>
                <input
                  type="text"
                  value={kdvTutari}
                  onChange={(e) => setKdvTutari(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Bilgisi</label>
              <input
                type="text"
                value={urunBilgisi}
                onChange={(e) => setUrunBilgisi(e.target.value)}
                placeholder="Marka, model..."
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Adedi</label>
              <input
                type="text"
                value={urunAdedi}
                onChange={(e) => setUrunAdedi(e.target.value)}
                placeholder="1"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Raw Text Debug */}
          {faturaRawText && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ham Metin (Debug)</label>
              <textarea
                readOnly
                value={faturaRawText}
                className="w-full h-32 px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Debug Bilgisi */}
      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold text-gray-700 mb-2">Çıkarılan Değerler</h3>
        <pre className="mt-2 text-xs bg-gray-800 text-green-400 p-3 rounded overflow-x-auto">
          {JSON.stringify({ etgbNo, etgbTutar, faturaNo, siparisNo: etgbSiparisNo, debug: etgbDebug }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
