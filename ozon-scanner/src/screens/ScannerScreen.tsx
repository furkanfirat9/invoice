import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Vibration,
    ScrollView,
    Dimensions,
    Image,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { saveHandover, type Handover } from "../api/handover";

interface ScannerScreenProps {
    token: string;
    onLogout: () => void;
}

// Ozon barkod formatı doğrulama
const OZON_BARCODE_REGEX = /^\d{8,10}-\d{3,4}-\d{1,3}$/;

function isValidOzonBarcode(barcode: string): boolean {
    return OZON_BARCODE_REGEX.test(barcode);
}

export default function ScannerScreen({ token, onLogout }: ScannerScreenProps) {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scannedBarcodes, setScannedBarcodes] = useState<Handover[]>([]);
    const [note, setNote] = useState("");
    const [isScanning, setIsScanning] = useState(true);
    const [lastScanned, setLastScanned] = useState("");
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const lastScanTimeRef = useRef(0);

    useEffect(() => {
        (async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === "granted");
        })();
    }, []);

    // Başarılı ses çal
    const playSuccessSound = async () => {
        try {
            // Haptic feedback
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Bip sesi çal
            const { sound } = await Audio.Sound.createAsync(
                { uri: 'https://www.soundjay.com/buttons/beep-01a.mp3' },
                { shouldPlay: true, volume: 1.0 }
            );
            // 1 saniye sonra sesi temizle
            setTimeout(() => {
                sound.unloadAsync();
            }, 1000);
        } catch (error) {
            Vibration.vibrate(100);
        }
    };

    // Hata ses çal
    const playErrorSound = async () => {
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (error) {
            Vibration.vibrate([100, 50, 100]);
        }
    };

    // Fotoğraf çek
    const takePhoto = async () => {
        try {
            // Kamera izni iste
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("İzin Gerekli", "Fotoğraf çekmek için kamera izni gerekli");
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.7, // İlk kalite ayarı
            });

            if (!result.canceled && result.assets[0]) {
                // Görseli sıkıştır
                const manipResult = await ImageManipulator.manipulateAsync(
                    result.assets[0].uri,
                    [{ resize: { width: 1200 } }], // Max 1200px genişlik
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                setSelectedImage(manipResult.uri);
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (error) {
            console.error("Photo error:", error);
            Alert.alert("Hata", "Fotoğraf çekilemedi");
        }
    };

    // Fotoğrafı kaldır
    const removePhoto = () => {
        setSelectedImage(null);
    };

    // Barkod tarandığında
    const handleBarcodeScanned = async ({ data }: { data: string }) => {
        // Tarama devre dışıysa hiçbir şey yapma
        if (!isScanning) return;

        // Ozon formatını kontrol et - geçersiz formatları sessizce yok say
        if (!isValidOzonBarcode(data)) {
            // Hiçbir şey yapma, taramaya devam et
            return;
        }

        const now = Date.now();

        // Aynı barkodu 5 saniye içinde tekrar tarama
        if (data === lastScanned && now - lastScanTimeRef.current < 5000) {
            return;
        }

        // Taramayı geçici olarak durdur (sadece geçerli barkodlarda)
        setIsScanning(false);
        lastScanTimeRef.current = now;
        setLastScanned(data);

        // Daha önce tarandı mı kontrol et
        if (scannedBarcodes.some((b) => b.barcode === data)) {
            await playErrorSound();
            // Alert yerine kısa süre bekle ve devam et
            setTimeout(() => {
                setIsScanning(true);
            }, 2000);
            return;
        }

        // Başarılı tarama
        await playSuccessSound();

        // Listeye ekle (henüz kaydetme)
        const newHandover: Handover = {
            id: Date.now().toString(),
            barcode: data,
            createdAt: new Date().toISOString(),
        };

        setScannedBarcodes((prev) => [newHandover, ...prev]);

        // 1.5 saniye sonra taramaya devam et
        setTimeout(() => {
            setIsScanning(true);
        }, 1500);
    };

    // Kaydet butonu
    const handleSave = async () => {
        if (scannedBarcodes.length === 0) {
            Alert.alert("Hata", "Kaydedilecek barkod yok");
            return;
        }

        Alert.alert(
            "Kaydet",
            `${scannedBarcodes.length} barkod${selectedImage ? " ve 1 fotoğraf" : ""} kaydedilecek. Onaylıyor musunuz?`,
            [
                { text: "İptal", style: "cancel" },
                {
                    text: "Kaydet",
                    onPress: async () => {
                        setIsUploading(true);
                        // Tüm barkodları tek seferde gönder
                        const barcodeList = scannedBarcodes.map(h => h.barcode);
                        const response = await saveHandover(
                            barcodeList,
                            note,
                            token,
                            selectedImage || undefined
                        );

                        setIsUploading(false);

                        if (response.success) {
                            Alert.alert(
                                "Başarılı",
                                `${barcodeList.length} barkod${selectedImage ? " ve fotoğraf" : ""} kaydedildi`
                            );
                            setScannedBarcodes([]);
                            setNote("");
                            setSelectedImage(null);
                        } else {
                            Alert.alert(
                                "Hata",
                                response.error || "Kaydetme başarısız"
                            );
                        }
                    },
                },
            ]
        );
    };

    // İptal butonu
    const handleCancel = () => {
        if (scannedBarcodes.length > 0 || selectedImage) {
            Alert.alert("İptal", "Tüm barkodlar ve fotoğraf silinecek. Emin misiniz?", [
                { text: "Hayır", style: "cancel" },
                {
                    text: "Evet",
                    style: "destructive",
                    onPress: () => {
                        setScannedBarcodes([]);
                        setNote("");
                        setSelectedImage(null);
                    },
                },
            ]);
        }
    };

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Kamera izni bekleniyor...</Text>
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <Text style={styles.message}>Kamera izni verilmedi</Text>
                <TouchableOpacity style={styles.button} onPress={onLogout}>
                    <Text style={styles.buttonText}>Çıkış Yap</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Kamera Görünümü */}
            <View style={styles.cameraContainer}>
                <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{
                        barcodeTypes: ["code128"],
                    }}
                    onBarcodeScanned={isScanning ? handleBarcodeScanned : undefined}
                />

                {/* Tarama Çerçevesi */}
                <View style={styles.overlay}>
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.topLeft]} />
                        <View style={[styles.corner, styles.topRight]} />
                        <View style={[styles.corner, styles.bottomLeft]} />
                        <View style={[styles.corner, styles.bottomRight]} />
                    </View>
                    <Text style={styles.scanText}>Barkodu çerçeveye hizalayın</Text>
                </View>
            </View>

            {/* Alt Panel */}
            <View style={styles.bottomPanel}>
                {/* Sayaç */}
                <View style={styles.counter}>
                    <Text style={styles.counterNumber}>{scannedBarcodes.length}</Text>
                    <Text style={styles.counterLabel}>barkod tarandı</Text>
                </View>

                {/* Taranan Barkodlar Listesi */}
                {scannedBarcodes.length > 0 && (
                    <ScrollView style={styles.barcodeList} horizontal>
                        {scannedBarcodes.map((item) => (
                            <View key={item.id} style={styles.barcodeItem}>
                                <Text style={styles.barcodeText}>{item.barcode}</Text>
                            </View>
                        ))}
                    </ScrollView>
                )}

                {/* Fotoğraf Bölümü */}
                <View style={styles.photoSection}>
                    {selectedImage ? (
                        <View style={styles.photoPreviewContainer}>
                            <Image source={{ uri: selectedImage }} style={styles.photoPreview} />
                            <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
                                <Text style={styles.removePhotoBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                            <Text style={styles.photoButtonIcon}>📷</Text>
                            <Text style={styles.photoButtonText}>Fotoğraf Ekle</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Not Alanı */}
                <TextInput
                    style={styles.noteInput}
                    placeholder="Not ekle (opsiyonel)"
                    placeholderTextColor="#64748b"
                    value={note}
                    onChangeText={setNote}
                    multiline
                />

                {/* Butonlar */}
                <View style={styles.buttons}>
                    <TouchableOpacity
                        style={[styles.button, styles.cancelButton]}
                        onPress={handleCancel}
                    >
                        <Text style={styles.buttonText}>İptal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.saveButton, isUploading && styles.disabledButton]}
                        onPress={handleSave}
                        disabled={isUploading}
                    >
                        <Text style={styles.buttonText}>
                            {isUploading ? "Yükleniyor..." : "✓ Kaydet"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Çıkış */}
                <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
                    <Text style={styles.logoutText}>Çıkış Yap</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0f172a",
    },
    message: {
        color: "#fff",
        fontSize: 18,
        textAlign: "center",
        marginTop: 100,
    },
    cameraContainer: {
        flex: 1,
        position: "relative",
    },
    camera: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
    },
    scanFrame: {
        width: width * 0.8,
        height: 100,
        position: "relative",
    },
    corner: {
        position: "absolute",
        width: 30,
        height: 30,
        borderColor: "#22c55e",
        borderWidth: 4,
    },
    topLeft: {
        top: 0,
        left: 0,
        borderRightWidth: 0,
        borderBottomWidth: 0,
        borderTopLeftRadius: 8,
    },
    topRight: {
        top: 0,
        right: 0,
        borderLeftWidth: 0,
        borderBottomWidth: 0,
        borderTopRightRadius: 8,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderRightWidth: 0,
        borderTopWidth: 0,
        borderBottomLeftRadius: 8,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderLeftWidth: 0,
        borderTopWidth: 0,
        borderBottomRightRadius: 8,
    },
    scanText: {
        color: "#fff",
        marginTop: 20,
        fontSize: 16,
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    bottomPanel: {
        backgroundColor: "#1e293b",
        padding: 16,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    counter: {
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "center",
        marginBottom: 12,
    },
    counterNumber: {
        fontSize: 48,
        fontWeight: "bold",
        color: "#22c55e",
        marginRight: 8,
    },
    counterLabel: {
        fontSize: 18,
        color: "#94a3b8",
    },
    barcodeList: {
        maxHeight: 50,
        marginBottom: 12,
    },
    barcodeItem: {
        backgroundColor: "#334155",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginRight: 8,
    },
    barcodeText: {
        color: "#fff",
        fontSize: 12,
    },
    photoSection: {
        marginBottom: 12,
        alignItems: "center",
    },
    photoButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#3b82f6",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    photoButtonIcon: {
        fontSize: 20,
    },
    photoButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    photoPreviewContainer: {
        position: "relative",
    },
    photoPreview: {
        width: 80,
        height: 80,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: "#22c55e",
    },
    removePhotoBtn: {
        position: "absolute",
        top: -8,
        right: -8,
        backgroundColor: "#ef4444",
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    removePhotoBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "bold",
    },
    noteInput: {
        backgroundColor: "#0f172a",
        borderRadius: 12,
        padding: 14,
        color: "#fff",
        fontSize: 16,
        marginBottom: 12,
        minHeight: 50,
    },
    buttons: {
        flexDirection: "row",
        gap: 12,
    },
    button: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: "center",
    },
    cancelButton: {
        backgroundColor: "#475569",
    },
    saveButton: {
        backgroundColor: "#22c55e",
    },
    disabledButton: {
        backgroundColor: "#4b5563",
        opacity: 0.7,
    },
    buttonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "600",
    },
    logoutButton: {
        marginTop: 12,
        padding: 8,
        alignItems: "center",
    },
    logoutText: {
        color: "#64748b",
        fontSize: 14,
    },
});
