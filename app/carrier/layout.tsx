"use client";

import { useEffect } from "react";
import CarrierSidebar from "@/components/CarrierSidebar";
import Header from "@/components/Header";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CarrierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setLanguage } = useLanguage();

  // Kargo paneline girildiğinde varsayılan dili Rusça yap
  useEffect(() => {
    setLanguage("ru");
  }, [setLanguage]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <CarrierSidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-64">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 pt-16">
          {children}
        </main>
      </div>
    </div>
  );
}
