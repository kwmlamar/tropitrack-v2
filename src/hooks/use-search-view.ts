"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import type { SearchResult, SmartSearchResponse } from "@/types";
import type { SearchHistoryItem } from "@/components/search/search-view";

export function useSearchView(active: boolean) {
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [summary, setSummary] = useState("");
  const [executionTimeMs, setExecutionTimeMs] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/ai/search-history", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch search history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (active) fetchHistory();
  }, [active, fetchHistory]);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!session?.access_token || !searchQuery.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ query: searchQuery }),
        });
        const data: SmartSearchResponse = await res.json();
        if (data.success) {
          setResults(data.results);
          setSummary(data.summary);
          setExecutionTimeMs(data.executionTimeMs);
          fetchHistory();
        } else {
          setError(data.error ?? "Search failed");
          setResults([]);
          setSummary("");
        }
      } catch (err) {
        console.error("Search error:", err);
        setError("Failed to perform search");
        setResults([]);
        setSummary("");
      } finally {
        setLoading(false);
        setHasSearched(true);
      }
    },
    [session?.access_token, fetchHistory]
  );

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setHasSearched(false);
      setResults([]);
      setSummary("");
    }
  }, []);

  const handleSelectHistory = useCallback(
    (historyQuery: string) => {
      setQuery(historyQuery);
      performSearch(historyQuery);
    },
    [performSearch]
  );

  const handleClearHistory = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      await fetch("/api/ai/search-history", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }, [session?.access_token]);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setSummary("");
    setHasSearched(false);
    setError(null);
  }, []);

  return {
    query,
    setQuery,
    onQueryChange: handleInputChange,
    loading,
    hasSearched,
    results,
    summary,
    executionTimeMs,
    error,
    setError,
    history,
    historyLoading,
    performSearch,
    onSelectHistory: handleSelectHistory,
    onClearHistory: handleClearHistory,
    reset,
  };
}
