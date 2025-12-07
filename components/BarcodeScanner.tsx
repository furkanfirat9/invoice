"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from "@zxing/library";

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
    const videoRef = useRef<HTMLVideoElement>(null);
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [invalidScan, setInvalidScan] = useState<string | null>(null);
    const [resolution, setResolution] = useState<string>("");
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

        const startScanner = async () => {
            try {
                if (!videoRef.current || !mountedRef.current) {
                    return;
                }

                // Önceki stream'i temizle
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                }

                // Önce mevcut kameraların en yüksek çözünürlüğünü bul
                let stream: MediaStream;

                try {
                    // En yüksek çözünürlük ile dene (4K)
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: { exact: "environment" },
                            width: { ideal: 4096 },
                            height: { ideal: 2160 },
                        },
                        audio: false,
                    });
                } catch {
                    try {
                        // Full HD ile dene
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: {
                                facingMode: "environment",
                                width: { ideal: 1920 },
                                height: { ideal: 1080 },
                            },
                            audio: false,
                        });
                    } catch {
                        // Son çare - herhangi bir arka kamera
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: "environment" },
                            audio: false,
                        });
                    }
                }

                streamRef.current = stream;

                // Gerçek çözünürlüğü kontrol et ve logla
                const videoTrack = stream.getVideoTracks()[0];
                const settings = videoTrack.getSettings();
                console.log("📷 Kamera Çözünürlüğü:", settings.width, "x", settings.height);
                setResolution(`${settings.width}x${settings.height}`);

                // Video elementine bağla
                videoRef.current.srcObject = stream;

                // Video yüklenene kadar bekle
                await new Promise<void>((resolve) => {
                    if (videoRef.current) {
                        videoRef.current.onloadedmetadata = () => resolve();
                    }
                });

                await videoRef.current.play();

                // ZXing okuyucu oluştur - sadece CODE_128 formatı
                const hints = new Map();
                hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
                hints.set(DecodeHintType.TRY_HARDER, true);

                const reader = new BrowserMultiFormatReader(hints);
                readerRef.current = reader;

                // Sürekli tarama başlat
                const decodeFromStream = async () => {
                    if (!mountedRef.current || !videoRef.current || !readerRef.current) return;

                    try {
                        const result = await readerRef.current.decodeFromVideoElement(videoRef.current);

                        if (result && mountedRef.current) {
                            const decodedText = result.getText();
                            const now = Date.now();

                            // Aynı barkodu 2 saniye içinde tekrar okuma
                            if (
                                decodedText === lastScannedRef.current &&
                                now - lastScanTimeRef.current < 2000
                            ) {
                                // Tekrar taramaya devam et
                                setTimeout(decodeFromStream, 100);
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
                                setTimeout(() => {
                                    if (mountedRef.current) {
                                        setInvalidScan(null);
                                    }
                                }, 2000);
                            }
                        }
                    } catch {
                        // Barkod bulunamadı, taramaya devam et
                    }

                    // Sürekli tarama için loop
                    if (mountedRef.current) {
                        setTimeout(decodeFromStream, 100);
                    }
                };

                // Taramayı başlat
                decodeFromStream();

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

        const stopScanner = () => {
            // Stream'i durdur
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            // Reader'ı temizle
            if (readerRef.current) {
                readerRef.current.reset();
                readerRef.current = null;
            }

            // Video'yu temizle
            if (videoRef.current) {
                videoRef.current.srcObject = null;
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
            {/* Kamera Görünümü - Native Video Element */}
            <video
                ref={videoRef}
                className="w-full rounded-xl bg-black"
                style={{
                    minHeight: "50vh",  // Ekranın yarısı
                    maxHeight: "70vh",  // Ekranın %70'i
                    objectFit: "cover",
                }}
                playsInline
                muted
                autoPlay
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

            {/* Tarama Çerçevesi */}
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
                        <p className="text-white/80 text-sm font-medium">Barkodu çerçeveye hizalayın</p>
                        <p className="text-white/50 text-xs mt-1">📷 {resolution || "..."} • Format: XXXXXXXX-XXXX-X</p>
                    </div>
                </div>
            )}
        </div>
    );
}
