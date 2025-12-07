const API_BASE_URL = "https://invoice-efa.vercel.app";

export interface LoginResponse {
    success: boolean;
    user?: {
        id: string;
        username: string;
        role: string;
    };
    error?: string;
}

export interface HandoverResponse {
    success: boolean;
    handover?: {
        id: string;
        barcode: string;
        note?: string;
        imageUrl?: string;
        createdAt: string;
    };
    error?: string;
    isDuplicate?: boolean;
}

export interface Handover {
    id: string;
    barcode: string;
    note?: string;
    createdAt: string;
}

// Giriş yap
export async function login(
    username: string,
    password: string
): Promise<LoginResponse> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/mobile/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            error: "Bağlantı hatası",
        };
    }
}

// Barkod kaydet (görsel ile)
export async function saveHandover(
    barcodes: string[],
    note: string,
    token: string,
    imageUri?: string
): Promise<HandoverResponse> {
    try {
        // Token'dan userId çıkar
        const user = JSON.parse(token);

        // FormData oluştur
        const formData = new FormData();
        formData.append("barcodes", JSON.stringify(barcodes));
        formData.append("note", note || "");
        formData.append("userId", user.id);

        // Görsel varsa ekle
        if (imageUri) {
            const filename = imageUri.split('/').pop() || 'photo.jpg';
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';

            formData.append("image", {
                uri: imageUri,
                name: filename,
                type: type,
            } as unknown as Blob);
        }

        const response = await fetch(`${API_BASE_URL}/api/mobile/handover`, {
            method: "POST",
            body: formData,
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Save handover error:", error);
        return {
            success: false,
            error: "Bağlantı hatası",
        };
    }
}

// Geçmiş teslimler
export async function getHandovers(token: string): Promise<Handover[]> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/handover`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const data = await response.json();
        return data.handovers || [];
    } catch (error) {
        return [];
    }
}
