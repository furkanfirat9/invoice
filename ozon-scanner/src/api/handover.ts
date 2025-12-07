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

// Barkod kaydet
export async function saveHandover(
    barcode: string,
    note: string,
    token: string
): Promise<HandoverResponse> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/handover`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ barcode, note }),
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
