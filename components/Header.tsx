"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useExchangeRates } from "@/contexts/ExchangeRateContext";

export default function Header() {
  const { language, setLanguage, t } = useLanguage();
  const { data: session } = useSession() || {};
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const { rates } = useExchangeRates();

  // Kullanıcı adını storeName veya role'e göre belirle
  const displayName = session?.user?.storeName ||
    (session?.user?.role === "SELLER" ? "Satıcı" : "SPEGAT");

  const languages = [
    { code: "tr" as const, name: "Türkçe", flag: "🇹🇷" },
    { code: "ru" as const, name: "Русский", flag: "🇷🇺" },
  ];

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-10">
      <div className="flex-1"></div>

      <div className="flex items-center space-x-6">
        {/* Döviz Bilgileri */}
        {rates && (
          <div className="flex items-center gap-4 text-xs border-r border-gray-200 pr-6">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-gray-500">
                USD/TRY: <span className="font-medium text-gray-800">{rates.usdTry.toFixed(2)} ₺</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-gray-500">
                USD/RUB: <span className="font-medium text-gray-800">{rates.usdRub.toFixed(2)} ₽</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-gray-500">
                Gram Altın: <span className="font-medium text-gray-800">{rates.goldTry.toFixed(2)} ₺</span>
              </span>
            </div>
          </div>
        )}

        {/* Language Selector - Sadece CARRIER için */}
        {session?.user?.role === "CARRIER" && (
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
              <span className="text-sm font-medium">{t("selectedLanguage")}</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showLanguageMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLanguageMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center space-x-2 ${language === lang.code
                      ? "text-blue-600 font-medium"
                      : "text-gray-700"
                      }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Info */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div className="text-sm">
            <p className="font-medium text-gray-900">{t("hi")}, {displayName}</p>
          </div>
        </div>
      </div>

      {/* Overlay for closing menu */}
      {showLanguageMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowLanguageMenu(false)}
        />
      )}
    </header>
  );
}

