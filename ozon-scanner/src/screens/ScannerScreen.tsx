import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Pressable,
    StyleSheet,
    Alert,
    Vibration,
    ScrollView,
    Dimensions,
    Image,
    ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as ImageManipulator from "expo-image-manipulator";
import { saveHandover, type Handover, getPendingBarcodes } from "../api/handover";

interface ScannerScreenProps {
    token: string;
    onLogout: () => void;
}

const OZON_BARCODE_REGEX = /^\d{8,10}-\d{3,4}-\d{1,3}$/;
const { width } = Dimensions.get("window");

function isValidOzonBarcode(barcode: string): boolean {
    return OZON_BARCODE_REGEX.test(barcode);
}

export default function ScannerScreen({ token, onLogout }: ScannerScreenProps) {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    // State
    const [scannedBarcodes, setScannedBarcodes] = useState<(Handover & { isNotInPendingList?: boolean })[]>([]);
    const [note, setNote] = useState("");
    const [isScanning, setIsScanning] = useState(true);
    const [lastScanned, setLastScanned] = useState("");
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isTakingPhoto, setIsTakingPhoto] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);

    // Bekleyen siparişler listesi
    const [pendingBarcodes, setPendingBarcodes] = useState<Set<string>>(new Set());
    const [isLoadingPending, setIsLoadingPending] = useState(true);

    const lastScanTimeRef = useRef(0);

    // Sesi hazırla
    const loadSound = async () => {
        try {
            // Sesi lokal dosyadan yükle
            const { sound } = await Audio.Sound.createAsync(
                require('../../assets/sounds/barcode.mp3'),
                { shouldPlay: false }
            );
            soundRef.current = sound;
        } catch (error) {
            console.log("Ses yükleme hatası", error);
        }
    };

    // Ses Çal
    const playSuccessSound = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            if (soundRef.current) {
                await soundRef.current.replayAsync();
            } else {
                await loadSound();
            }
        } catch (error) {
            Vibration.vibrate(100);
        }
    };

    const playErrorSound = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (error) {
            Vibration.vibrate([100, 50, 100]);
        }
    };

    // İzin ve Ses Hazırlığı
    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }

        loadSound();

        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, [permission]);

    // Bekleyen siparişleri yükle
    useEffect(() => {
        const loadPendingBarcodes = async () => {
            setIsLoadingPending(true);
            try {
                const response = await getPendingBarcodes(token);
                if (response.success) {
                    setPendingBarcodes(new Set(response.barcodes));
                    console.log(`${response.count} bekleyen sipariş yüklendi`);
                } else {
                    console.error("Bekleyen siparişler yüklenemedi:", response.error);
                }
            } catch (error) {
                console.error("Bekleyen siparişler hatası:", error);
            } finally {
                setIsLoadingPending(false);
            }
        };

        loadPendingBarcodes();
    }, [token]);

    // Fotoğraf Çek (CameraView üzerinden)
    const takePhoto = async () => {
        if (!cameraRef.current || isTakingPhoto) return;
        if (!cameraReady) {
            Alert.alert("Hata", "Kamera henüz hazır değil, lütfen bekleyin.");
            return;
        }

        try {
            setIsTakingPhoto(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.5,
                base64: false,
                skipProcessing: true
            });

            if (photo) {
                const manipResult = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [{ resize: { width: 1000 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                setSelectedImage(manipResult.uri);
                await playSuccessSound();
                setIsScanning(false);
            }
        } catch (error: any) {
            console.error("Photo error:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            Alert.alert("Fotoğraf Hatası", errorMessage);
        } finally {
            setIsTakingPhoto(false);
        }
    };

    const removePhoto = () => {
        setSelectedImage(null);
        setIsScanning(true);
    };

    // Barkod Tarama
    const handleBarcodeScanned = async ({ data }: { data: string }) => {
        if (!isScanning) return;

        if (!data || data.length < 5) return;
        if (!isValidOzonBarcode(data)) return;

        const now = Date.now();
        if (data === lastScanned && now - lastScanTimeRef.current < 2000) return;

        lastScanTimeRef.current = now;
        setLastScanned(data);

        const isDuplicate = scannedBarcodes.some((b) => b.barcode === data);

        if (isDuplicate) {
            await playErrorSound();
            return;
        }

        // Bekleyen listede olup olmadığını kontrol et
        const isNotInPendingList = !pendingBarcodes.has(data);

        if (isNotInPendingList) {
            // Listede değilse uyarı sesi çal
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Vibration.vibrate([100, 100, 100]);
        } else {
            await playSuccessSound();
        }

        const newHandover: Handover & { isNotInPendingList?: boolean } = {
            id: Date.now().toString(),
            barcode: data,
            createdAt: new Date().toISOString(),
            isNotInPendingList,
        };

        setScannedBarcodes((prev) => [newHandover, ...prev]);
    };

    // Kaydetme
    const handleSave = async () => {
        if (scannedBarcodes.length === 0) {
            Alert.alert("Uyarı", "Kaydedilecek barkod yok");
            return;
        }

        Alert.alert(
            "Kaydet",
            `${scannedBarcodes.length} barkod${selectedImage ? " ve 1 fotoğraf" : ""} kaydedilecek.`,
            [
                { text: "İptal", style: "cancel" },
                {
                    text: "Kaydet",
                    onPress: async () => {
                        setIsUploading(true);
                        const barcodeList = scannedBarcodes.map(h => h.barcode);
                        const response = await saveHandover(
                            barcodeList,
                            note,
                            token,
                            selectedImage || undefined
                        );

                        setIsUploading(false);

                        if (response.success) {
                            Alert.alert("Başarılı", "Kayıt tamamlandı");
                            setScannedBarcodes([]);
                            setNote("");
                            setSelectedImage(null);
                            setIsScanning(true);
                        } else {
                            Alert.alert("Hata", response.error || "Hata oluştu");
                        }
                    },
                },
            ]
        );
    };

    const handleCancel = () => {
        if (scannedBarcodes.length > 0 || selectedImage) {
            Alert.alert("İptal", "Tüm veriler silinecek?", [
                { text: "Hayır", style: "cancel" },
                {
                    text: "Evet",
                    style: "destructive",
                    onPress: () => {
                        setScannedBarcodes([]);
                        setNote("");
                        setSelectedImage(null);
                        setIsScanning(true);
                    },
                },
            ]);
        }
    };

    // Tek barkod silme
    const handleDeleteBarcode = async (item: Handover) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        Alert.alert(
            "Barkodu Sil",
            `"${item.barcode}" barkodunu silmek istiyor musunuz?`,
            [
                { text: "İptal", style: "cancel" },
                {
                    text: "Sil",
                    style: "destructive",
                    onPress: () => {
                        setScannedBarcodes((prev) => prev.filter((b) => b.id !== item.id));
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    },
                },
            ]
        );
    };

    if (!permission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Kamera izni gerekli</Text>
                <TouchableOpacity style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>İzin Ver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.cameraContainer}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    mode="picture"
                    facing="back"
                    onCameraReady={() => setCameraReady(true)}
                    barcodeScannerSettings={{
                        barcodeTypes: ["code128"],
                    }}
                    onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
                />

                <View style={styles.overlay}>
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.topLeft]} />
                        <View style={[styles.corner, styles.topRight]} />
                        <View style={[styles.corner, styles.bottomLeft]} />
                        <View style={[styles.corner, styles.bottomRight]} />
                    </View>
                    <Text style={styles.scanText}>
                        {isScanning ? "Barkod taranıyor..." : "Bekleniyor"}
                    </Text>
                </View>
            </View>

            <View style={styles.bottomPanel}>
                <View style={styles.counter}>
                    <Text style={styles.counterNumber}>{scannedBarcodes.length}</Text>
                    <Text style={styles.counterLabel}>barkod</Text>
                </View>

                {/* Bekleyen sipariş durumu */}
                <View style={styles.pendingStatus}>
                    {isLoadingPending ? (
                        <Text style={styles.pendingStatusText}>
                            ⏳ Bekleyen siparişler yükleniyor...
                        </Text>
                    ) : pendingBarcodes.size > 0 ? (
                        <Text style={styles.pendingStatusText}>
                            ✅ {pendingBarcodes.size} bekleyen sipariş listelendi
                        </Text>
                    ) : (
                        <Text style={[styles.pendingStatusText, styles.pendingStatusWarning]}>
                            ⚠️ Bekleyen sipariş listesi yüklenemedi
                        </Text>
                    )}
                </View>

                {/* Fotoğraf Kontrolü */}
                <View style={styles.photoSection}>
                    {selectedImage ? (
                        <View style={styles.photoPreviewContainer}>
                            <Image source={{ uri: selectedImage }} style={styles.photoPreview} />
                            <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
                                <Text style={styles.removePhotoBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[styles.photoButton, isTakingPhoto && styles.disabledButton]}
                            onPress={takePhoto}
                            disabled={isTakingPhoto}
                        >
                            {isTakingPhoto ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Text style={styles.photoButtonIcon}>📷</Text>
                                    <Text style={styles.photoButtonText}>Fotoğraf Çek</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {scannedBarcodes.length > 0 && (
                    <ScrollView style={styles.barcodeList} horizontal>
                        {scannedBarcodes.map((item) => (
                            <Pressable
                                key={item.id}
                                style={({ pressed }) => [
                                    styles.barcodeItem,
                                    item.isNotInPendingList && styles.barcodeItemWarning,
                                    pressed && styles.barcodeItemPressed
                                ]}
                                onLongPress={() => handleDeleteBarcode(item)}
                                delayLongPress={500}
                            >
                                {item.isNotInPendingList && (
                                    <Text style={styles.warningIcon}>⚠️</Text>
                                )}
                                <Text style={[
                                    styles.barcodeText,
                                    item.isNotInPendingList && styles.barcodeTextWarning
                                ]}>{item.barcode}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                )}

                <View style={styles.buttons}>
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleCancel}>
                        <Text style={styles.buttonText}>İptal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.saveButton, isUploading && styles.disabledButton]}
                        onPress={handleSave}
                        disabled={isUploading}
                    >
                        {isUploading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>✓ Kaydet</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
                    <Text style={styles.logoutText}>Çıkış Yap</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0f172a" },
    message: { color: "#fff", fontSize: 18, textAlign: "center", marginTop: 100, marginBottom: 20 },
    cameraContainer: { flex: 1, position: "relative" },
    camera: { flex: 1 },
    overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
    scanFrame: { width: width * 0.8, height: 100, position: "relative" },
    corner: { position: "absolute", width: 30, height: 30, borderColor: "#22c55e", borderWidth: 4 },
    topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
    topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
    bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
    bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
    scanText: { color: "#fff", marginTop: 20, fontSize: 16, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 },
    bottomPanel: { backgroundColor: "#1e293b", padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    counter: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", marginBottom: 12 },
    counterNumber: { fontSize: 48, fontWeight: "bold", color: "#22c55e", marginRight: 8 },
    counterLabel: { fontSize: 18, color: "#94a3b8" },
    pendingStatus: { alignItems: "center", marginBottom: 8 },
    pendingStatusText: { color: "#64748b", fontSize: 12 },
    pendingStatusWarning: { color: "#f97316" },
    barcodeList: { maxHeight: 50, marginBottom: 12 },
    barcodeItem: { backgroundColor: "#334155", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, flexDirection: "row", alignItems: "center" },
    barcodeItemPressed: { backgroundColor: "#ef4444", transform: [{ scale: 0.95 }] },
    barcodeItemWarning: { backgroundColor: "#f97316", borderWidth: 2, borderColor: "#fbbf24" },
    barcodeText: { color: "#fff", fontSize: 12 },
    barcodeTextWarning: { color: "#fef3c7", fontWeight: "bold" },
    warningIcon: { fontSize: 12, marginRight: 4 },
    photoSection: { marginBottom: 12, alignItems: "center" },
    photoButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#3b82f6", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, gap: 8, minWidth: 150, justifyContent: "center" },
    photoButtonIcon: { fontSize: 20 },
    photoButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    photoPreviewContainer: { position: "relative" },
    photoPreview: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: "#22c55e" },
    removePhotoBtn: { position: "absolute", top: -8, right: -8, backgroundColor: "#ef4444", width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    removePhotoBtnText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
    buttons: { flexDirection: "row", gap: 12 },
    button: { flex: 1, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    cancelButton: { backgroundColor: "#475569" },
    saveButton: { backgroundColor: "#22c55e" },
    disabledButton: { backgroundColor: "#4b5563", opacity: 0.7 },
    buttonText: { color: "#fff", fontSize: 18, fontWeight: "600" },
    logoutButton: { marginTop: 12, padding: 8, alignItems: "center" },
    logoutText: { color: "#64748b", fontSize: 14 },
});
