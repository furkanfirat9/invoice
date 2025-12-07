import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { login } from "../api/handover";

interface LoginScreenProps {
    onLogin: (token: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            Alert.alert("Hata", "Kullanıcı adı ve şifre gerekli");
            return;
        }

        setLoading(true);

        try {
            const response = await login(username, password);

            if (response.success && response.user) {
                // Token olarak kullanıcı bilgisini sakla
                const token = JSON.stringify(response.user);
                await AsyncStorage.setItem("userToken", token);
                onLogin(token);
            } else {
                Alert.alert("Hata", response.error || "Giriş başarısız");
            }
        } catch (error) {
            Alert.alert("Hata", "Bağlantı hatası");
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <View style={styles.content}>
                {/* Logo / Başlık */}
                <View style={styles.header}>
                    <Text style={styles.logo}>📦</Text>
                    <Text style={styles.title}>Ozon Barkod</Text>
                    <Text style={styles.subtitle}>Kurye Teslim Sistemi</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <TextInput
                        style={styles.input}
                        placeholder="Kullanıcı Adı"
                        placeholderTextColor="#666"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Şifre"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Giriş Yap</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0f172a",
    },
    content: {
        flex: 1,
        justifyContent: "center",
        padding: 24,
    },
    header: {
        alignItems: "center",
        marginBottom: 48,
    },
    logo: {
        fontSize: 64,
        marginBottom: 16,
    },
    title: {
        fontSize: 32,
        fontWeight: "bold",
        color: "#fff",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#64748b",
    },
    form: {
        gap: 16,
    },
    input: {
        backgroundColor: "#1e293b",
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: "#fff",
        borderWidth: 1,
        borderColor: "#334155",
    },
    button: {
        backgroundColor: "#3b82f6",
        borderRadius: 12,
        padding: 16,
        alignItems: "center",
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "600",
    },
});
