"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onError?: (error: string) => void;
    isActive: boolean;
}

// Ozon barkod formatı doğrulama: RAKAMLAR-RAKAMLAR-RAKAMLAR
// Örnekler: 61305981-0070-3, 0118471972-0250-1, 0124177088-0063-1
const OZON_BARCODE_REGEX = /^\d{8,10}-\d{3,4}-\d{1,3}$/;

function isValidOzonBarcode(barcode: string): boolean {
    return OZON_BARCODE_REGEX.test(barcode);
}

export default function BarcodeScanner({
    onScan,
    onError,
    isActive,
}: BarcodeScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [invalidScan, setInvalidScan] = useState<string | null>(null);
    const lastScannedRef = useRef<string>("");
    const lastScanTimeRef = useRef<number>(0);
    const mountedRef = useRef(true);

    // Beep sesi çal
    const playBeep = useCallback((success: boolean = true) => {
        try {
            const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Başarılı: yüksek ton, başarısız: düşük ton
            oscillator.frequency.value = success ? 1200 : 400;
            oscillator.type = "sine";
            gainNode.gain.value = 0.5;

            oscillator.start();
            oscillator.stop(audioContext.currentTime + (success ? 0.15 : 0.3));

            // Vibrasyon
            if (navigator.vibrate) {
                navigator.vibrate(success ? 100 : [100, 50, 100]);
            }
        } catch {
            console.log("Ses çalınamadı");
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        const scannerId = "barcode-scanner";

        const startScanner = async () => {
            try {
                const scannerElement = document.getElementById(scannerId);
                if (!scannerElement || !mountedRef.current) {
                    return;
                }

                if (scannerRef.current) {
                    try {
                        await scannerRef.current.stop();
                    } catch {
                        // ignore
                    }
                }

                // Sadece CODE_128 formatını destekle (Ozon barkodları bu formatta)
                const html5QrCode = new Html5Qrcode(scannerId, {
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_128,
                    ],
                    verbose: false,
                });

                scannerRef.current = html5QrCode;

                // Yüksek çözünürlük + arka kamera ile başlat
                await html5QrCode.start(
                    { facingMode: "environment" },
                    {
                        fps: 15,
                        qrbox: { width: 350, height: 120 },
                        aspectRatio: 1.777778,
                        disableFlip: false,
                    },
                    (decodedText) => {
                        if (!mountedRef.current) return;

                        const now = Date.now();
                        // Aynı barkodu 2 saniye içinde tekrar okuma
                        if (
                            decodedText === lastScannedRef.current &&
                            now - lastScanTimeRef.current < 2000
                        ) {
                            return;
                        }

                        lastScannedRef.current = decodedText;
                        lastScanTimeRef.current = now;

                        // Ozon barkod formatını doğrula
                        if (isValidOzonBarcode(decodedText)) {
                            setInvalidScan(null);
                            playBeep(true);
                            onScan(decodedText);
                        } else {
                            // Geçersiz format - uyarı göster
                            setInvalidScan(decodedText);
                            playBeep(false);
                            // 2 saniye sonra uyarıyı kaldır
                            setTimeout(() => {
                                if (mountedRef.current) {
                                    setInvalidScan(null);
                                }
                            }, 2000);
                        }
                    },
                    () => {
                        // Tarama devam ediyor
                    }
                );

                if (mountedRef.current) {
                    setIsScanning(true);
                    setCameraError(null);
                }
            } catch (err) {
                console.error("Kamera başlatma hatası:", err);
                if (mountedRef.current) {
                    const errorMessage =
                        err instanceof Error ? err.message : "Kamera başlatılamadı";
                    setCameraError(errorMessage);
                    onError?.(errorMessage);
                }
            }
        };

        const stopScanner = async () => {
            if (scannerRef.current) {
                try {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                } catch {
                    // ignore
                }
                scannerRef.current = null;
            }
            if (mountedRef.current) {
                setIsScanning(false);
                setInvalidScan(null);
            }
        };

        if (isActive) {
            const timer = setTimeout(() => {
                startScanner();
            }, 200);

            return () => {
                clearTimeout(timer);
                mountedRef.current = false;
                stopScanner();
            };
        } else {
            stopScanner();
        }

        return () => {
            mountedRef.current = false;
            stopScanner();
        };
    }, [isActive, onScan, onError, playBeep]);

    if (!isActive) {
        return null;
    }

    return (
        <div className="relative w-full">
            {/* Kamera Görünümü */}
            <div
                id="barcode-scanner"
                className="w-full rounded-xl overflow-hidden bg-black"
                style={{ minHeight: "300px" }}
            />

            {/* Geçersiz Barkod Uyarısı */}
            {invalidScan && (
                <div className="absolute top-4 left-4 right-4 p-3 bg-red-600/90 rounded-lg text-white text-center text-sm animate-pulse">
                    ❌ Geçersiz format: {invalidScan.substring(0, 20)}...
                </div>
            )}

            {/* Hata Mesajı */}
            {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-xl">
                    <div className="text-center p-6">
                        <svg
                            className="w-16 h-16 text-red-500 mx-auto mb-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                        <p className="text-white text-lg font-medium mb-2">Kamera Hatası</p>
                        <p className="text-gray-400 text-sm">{cameraError}</p>
                        <p className="text-gray-500 text-xs mt-3">
                            Kamera izni verdiğinizden emin olun
                        </p>
                    </div>
                </div>
            )}

            {/* Tarama Çerçevesi - Üst barkod için optimize edilmiş dar alan */}
            {isScanning && !cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-80 h-24 border-2 border-green-500/70 rounded-lg relative bg-green-500/5">
                        {/* Köşe işaretleri */}
                        <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                        <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                        <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />

                        {/* Tarama çizgisi */}
                        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse" />
                    </div>

                    {/* Alt bilgi */}
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                        <p className="text-white/80 text-sm font-medium">Üstteki barkodu çerçeveye hizalayın</p>
                        <p className="text-white/50 text-xs mt-1">Format: XXXXXXXX-XXXX-X</p>
                    </div>
                </div>
            )}
        </div>
    );
}
