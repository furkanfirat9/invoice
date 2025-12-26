"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ExchangeRates {
    usdTry: number;
    usdRub: number;
    goldTry: number;
    lastUpdated: Date;
}

interface ExchangeRateContextType {
    rates: ExchangeRates | null;
    isLoading: boolean;
    error: string | null;
    refreshRates: () => Promise<void>;
}

const ExchangeRateContext = createContext<ExchangeRateContextType | undefined>(undefined);

export function ExchangeRateProvider({ children }: { children: ReactNode }) {
    const [rates, setRates] = useState<ExchangeRates | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRates = async () => {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD');
            const data = await response.json();

            const usdTry = parseFloat(data.data.rates.TRY);
            const usdRub = parseFloat(data.data.rates.RUB);

            const usdPerOunceGold = 1 / parseFloat(data.data.rates.XAU);
            const usdPerGramGold = usdPerOunceGold / 31.1035;
            const goldTry = usdPerGramGold * usdTry;

            setRates({
                usdTry,
                usdRub,
                goldTry,
                lastUpdated: new Date()
            });
        } catch (err) {
            console.error('Döviz kurları alınamadı:', err);
            setError('Döviz kurları alınamadı');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRates();
        const interval = setInterval(fetchRates, 5 * 60 * 1000); // 5 dakikada bir güncelle
        return () => clearInterval(interval);
    }, []);

    return (
        <ExchangeRateContext.Provider value={{ rates, isLoading, error, refreshRates: fetchRates }}>
            {children}
        </ExchangeRateContext.Provider>
    );
}

export function useExchangeRates() {
    const context = useContext(ExchangeRateContext);
    if (context === undefined) {
        throw new Error('useExchangeRates must be used within an ExchangeRateProvider');
    }
    return context;
}
