"use client";

import { useState, useCallback } from "react";
import { OzonPosting } from "@/types/ozon";

export function useOzonOrders() {
  const [orders, setOrders] = useState<OzonPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (status: string, startDate: Date, endDate: Date) => {
      setLoading(true);
      setError(null);

      try {
        const since = startDate.toISOString();
        const to = endDate.toISOString();

        const response = await fetch(
          `/api/ozon/fbs-postings?status=${status}&since=${since}&to=${to}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Siparişler alınamadı");
        }

        const data = await response.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(err.message || "Bir hata oluştu");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    orders,
    loading,
    error,
    fetchOrders,
  };
}

