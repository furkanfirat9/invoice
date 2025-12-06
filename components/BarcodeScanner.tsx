"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onError?: (error: string) => void;
    isActive: boolean;
}

export default function BarcodeScanner({
    onScan,
    onError,
    isActive,
}: BarcodeScannerProps) {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const lastScannedRef = useRef<string>("");
    const lastScanTimeRef = useRef<number>(0);

    // Beep sesi çal
    const playBeep = useCallback(() => {
        try {
            const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 1000;
            oscillator.type = "sine";
            gainNode.gain.value = 0.3;

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.15);
        } catch {
            console.log("Ses çalınamadı");
        }
    }, []);

    useEffect(() => {
        const scannerId = "barcode-scanner";

        const startScanner = async () => {
            try {
                // Önce div'in var olduğundan emin ol
                const scannerElement = document.getElementById(scannerId);
                if (!scannerElement) {
                    console.log("Scanner element not found");
                    return;
                }

                // Eğer zaten tarama yapılıyorsa çık
                if (isScanning) return;

                // Yeni scanner oluştur
                const html5QrCode = new Html5Qrcode(scannerId, {
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                        Html5QrcodeSupportedFormats.QR_CODE,
                    ],
                    verbose: false,
                });

                scannerRef.current = html5QrCode;

                await html5QrCode.start(
                    { facingMode: "environment" },
                    {
                        fps: 10,
                        qrbox: { width: 280, height: 150 },
                        aspectRatio: 1.5,
                    },
                    (decodedText) => {
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

                        playBeep();
                        onScan(decodedText);
                    },
                    () => {
                        // Tarama hatası - sessizce geç
                    }
                );

                setIsScanning(true);
                setCameraError(null);
            } catch (err) {
                console.error("Kamera başlatma hatası:", err);
                const errorMessage =
                    err instanceof Error ? err.message : "Kamera başlatılamadı";
                setCameraError(errorMessage);
                onError?.(errorMessage);
            }
        };

        const stopScanner = async () => {
            if (scannerRef.current && isScanning) {
                try {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                } catch (err) {
                    console.error("Scanner durdurma hatası:", err);
                }
                scannerRef.current = null;
                setIsScanning(false);
            }
        };

        if (isActive) {
            // Küçük bir gecikme ile başlat (DOM hazır olsun)
            const timer = setTimeout(() => {
                startScanner();
            }, 100);
            return () => {
                clearTimeout(timer);
                stopScanner();
            };
        } else {
            stopScanner();
        }

        return () => {
            stopScanner();
        };
    }, [isActive, isScanning, onScan, onError, playBeep]);

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

            {/* Hata Mesajı */}
            {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl">
                    <div className="text-center p-4">
                        <svg
                            className="w-12 h-12 text-red-500 mx-auto mb-3"
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
                        <p className="text-white text-sm">{cameraError}</p>
                        <p className="text-gray-400 text-xs mt-2">
                            Kamera izni verin veya farklı bir tarayıcı deneyin
                        </p>
                    </div>
                </div>
            )}

            {/* Tarama Çerçevesi */}
            {isScanning && !cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-72 h-36 border-2 border-green-500 rounded-lg relative">
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />

                        {/* Tarama çizgisi animasyonu */}
                        <div className="absolute inset-x-4 top-1/2 h-0.5 bg-green-400 animate-pulse" />
                    </div>
                </div>
            )}
        </div>
    );
}
