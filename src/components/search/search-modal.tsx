"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { SearchResults } from "./search-results";
import { SearchHistory } from "./search-history";
import type { SearchResult, SmartSearchResponse } from "@/types";

interface SearchHistoryItem {
  id: string;
  query_text: string;
  results_count: number;
  successful: boolean;
  created_at: string;
}

export function SearchModal() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [summary, setSummary] = useState("");
  const [executionTimeMs, setExecutionTimeMs] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch search history when modal opens
  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) return;

    setHistoryLoading(true);
    try {
      const response = await fetch("/api/ai/search-history", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch search history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (open) {
      fetchHistory();
      // Focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset state when modal closes
      setQuery("");
      setResults([]);
      setSummary("");
      setHasSearched(false);
      setError(null);
    }
  }, [open, fetchHistory]);

  // Perform search
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!session?.access_token || !searchQuery.trim()) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ query: searchQuery }),
        });

        const data: SmartSearchResponse = await response.json();

        if (data.success) {
          setResults(data.results);
          setSummary(data.summary);
          setExecutionTimeMs(data.executionTimeMs);
          // Refresh history after successful search
          fetchHistory();
        } else {
          setError(data.error || "Search failed");
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

  // Debounced search on input change
  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length > 2) {
      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 500);
    } else {
      setHasSearched(false);
      setResults([]);
      setSummary("");
    }
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (query.trim()) {
      performSearch(query);
    }
  };

  // Handle history item selection
  const handleSelectHistory = (historyQuery: string) => {
    setQuery(historyQuery);
    performSearch(historyQuery);
  };

  // Clear search history
  const handleClearHistory = async () => {
    if (!session?.access_token) return;

    try {
      await fetch("/api/ai/search-history", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  return (
    <>
      {/* Search trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground rounded-md border bg-background hover:bg-accent transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Mobile search button */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-md hover:bg-accent"
      >
        <Search className="h-5 w-5" />
      </button>

      {/* Search modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          {/* Search input */}
          <form onSubmit={handleSubmit} className="border-b">
            <div className="flex items-center px-4">
              {loading ? (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
              <Input
                ref={inputRef}
                type="text"
                placeholder="Ask anything... e.g., 'Show me unpaid invoices older than 30 days'"
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base py-6 px-3"
              />
            </div>
          </form>

          {/* Content area */}
          <div className="min-h-[300px] max-h-[60vh] overflow-hidden flex flex-col">
            {error && (
              <div className="p-4 bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {!hasSearched && !query && (
              <SearchHistory
                history={history}
                onSelectQuery={handleSelectHistory}
                onClearHistory={handleClearHistory}
                loading={historyLoading}
              />
            )}

            {hasSearched && (
              <SearchResults
                results={results}
                summary={summary}
                executionTimeMs={executionTimeMs}
                onResultClick={() => setOpen(false)}
              />
            )}

            {loading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Searching with AI...</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                  Enter
                </kbd>{" "}
                to search
              </span>
              <span>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
                  Esc
                </kbd>{" "}
                to close
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Powered by AI
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
