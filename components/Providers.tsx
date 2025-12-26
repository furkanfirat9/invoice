"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ExchangeRateProvider } from "@/contexts/ExchangeRateContext";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <LanguageProvider>
                <ExchangeRateProvider>
                    {children}
                </ExchangeRateProvider>
            </LanguageProvider>
        </SessionProvider>
    );
}
