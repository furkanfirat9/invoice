"use client";

import useSWR from "swr";
import { OzonPosting } from "@/types/ozon";
import { fetchAPI } from "@/lib/api";

// SWR fetcher function using our unified API wrapper
const fetcher = (url: string) => fetchAPI<OzonPosting[]>(url);

interface UseOzonOrdersParams {
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  sellerId?: string;
}

export function useOzonOrders({ status, startDate, endDate, sellerId }: UseOzonOrdersParams) {
  // Construct the URL key for SWR
  // If dates are missing, we don't fetch (conditional fetching)
  const getKey = () => {
    if (!startDate || !endDate) return null;

    const since = startDate.toISOString();
    const to = endDate.toISOString();

    let url = `/api/ozon/fbs-postings?status=${status}&since=${since}&to=${to}`;
    if (sellerId) {
      url += `&sellerId=${sellerId}`;
    }
    return url;
  };

  const { data, error, isLoading, mutate } = useSWR(getKey, fetcher, {
    revalidateOnFocus: false, // Don't revalidate on window focus to save API calls
    dedupingInterval: 60000, // Dedup requests for 1 minute
    errorRetryCount: 3,
  });

  return {
    orders: data || [],
    loading: isLoading,
    error: error ? (error.message || "Siparişler yüklenirken bir hata oluştu") : null,
    mutate, // Expose mutate to manually refresh if needed
  };
}
