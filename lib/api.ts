import { signOut } from "next-auth/react";

interface FetchOptions extends RequestInit {
    retries?: number;
    retryDelay?: number;
    timeout?: number;
}

export class APIError extends Error {
    status: number;
    data: any;

    constructor(message: string, status: number, data?: any) {
        super(message);
        this.status = status;
        this.data = data;
        this.name = "APIError";
    }
}

const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_TIMEOUT = 15000; // 15 seconds

/**
 * Unified fetch wrapper with retry logic, timeout, and error handling.
 */
export async function fetchAPI<T = any>(
    url: string,
    options: FetchOptions = {}
): Promise<T> {
    const {
        retries = DEFAULT_RETRIES,
        retryDelay = DEFAULT_RETRY_DELAY,
        timeout = DEFAULT_TIMEOUT,
        ...fetchOptions
    } = options;

    let attempt = 0;

    while (attempt <= retries) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    ...fetchOptions.headers,
                },
            });

            clearTimeout(id);

            // Handle 401 Unauthorized globally (optional, depending on requirements)
            if (response.status === 401) {
                // If we are in the browser, we might want to redirect to login
                if (typeof window !== "undefined") {
                    // window.location.href = "/login"; // Or use signOut()
                }
            }

            if (!response.ok) {
                // Don't retry on client errors (4xx) except 429 (Too Many Requests)
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new APIError(
                        errorData.error || `API Error: ${response.statusText}`,
                        response.status,
                        errorData
                    );
                }

                // Throw to trigger retry for 5xx or 429
                throw new APIError(
                    `Request failed with status ${response.status}`,
                    response.status
                );
            }

            // Handle empty responses (e.g. 204 No Content)
            if (response.status === 204) {
                return {} as T;
            }

            return await response.json();
        } catch (error: any) {
            clearTimeout(id);
            attempt++;

            const isRetryable =
                error.name === "AbortError" || // Timeout
                error.name === "TypeError" || // Network error
                (error instanceof APIError &&
                    (error.status >= 500 || error.status === 429));

            if (attempt > retries || !isRetryable) {
                throw error;
            }

            console.warn(
                `API Request failed (${url}). Retrying... (${attempt}/${retries})`,
                error.message
            );

            // Exponential backoff
            await new Promise((resolve) =>
                setTimeout(resolve, retryDelay * Math.pow(2, attempt - 1))
            );
        }
    }

    throw new Error("Max retries reached");
}
