"use client";

/**
 * Shared Command K–style search UI.
 * Used by SearchModal (⌘K) and AI Agent page for a consistent experience.
 */

import { useRef, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchHistory } from "./search-history";
import { SearchResults } from "./search-results";
import type { SearchResult } from "@/types";

export interface SearchHistoryItem {
  id: string;
  query_text: string;
  results_count: number;
  successful: boolean;
  created_at: string;
}

export interface SearchViewProps {
  /** When true, fetch history on mount / when opened */
  active?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  loading: boolean;
  hasSearched: boolean;
  results: SearchResult[];
  summary: string;
  executionTimeMs: number;
  error: string | null;
  history: SearchHistoryItem[];
  historyLoading: boolean;
  onSelectHistory: (query: string) => void;
  onClearHistory: () => void;
  /** Optional, e.g. close modal when result is clicked */
  onResultClick?: () => void;
  /** Show "Esc to close" hint (modal only) */
  showEscHint?: boolean;
  placeholder?: string;
  /** Optional ref for the input (e.g. focus when modal opens) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Compact mode for embedding in smaller containers */
  compact?: boolean;
}

export function SearchView({
  active = true,
  query,
  onQueryChange,
  onSearch,
  loading,
  hasSearched,
  results,
  summary,
  executionTimeMs,
  error,
  history,
  historyLoading,
  onSelectHistory,
  onClearHistory,
  onResultClick,
  showEscHint = false,
  placeholder = "Ask anything... e.g., 'Show me unpaid invoices older than 30 days'",
  inputRef: externalInputRef,
  compact = false,
}: SearchViewProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  useEffect(() => {
    if (active && inputRef?.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [active, inputRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* Scrollable content */}
      <div
        className={`flex-1 overflow-y-auto ${compact ? "px-4 pt-4 pb-24" : "px-6 pt-6 pb-32"}`}
      >
        {error && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-2xl mb-4">
            {error}
          </div>
        )}

        {!hasSearched && !query && (
          <SearchHistory
            history={history}
            onSelectQuery={onSelectHistory}
            onClearHistory={onClearHistory}
            loading={historyLoading}
          />
        )}

        {hasSearched && (
          <SearchResults
            results={results}
            summary={summary}
            executionTimeMs={executionTimeMs}
            onResultClick={onResultClick ?? (() => {})}
          />
        )}

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Searching with AI...</span>
            </div>
          </div>
        )}
      </div>

      {/* Liquid glass input bar */}
      <div
        className={`pointer-events-auto z-10 ${compact ? "absolute bottom-4 left-4 right-4" : "absolute bottom-6 left-6 right-6"}`}
      >
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative rounded-[28px] bg-background/80 backdrop-blur-2xl border border-border/50 shadow-2xl shadow-primary/5 overflow-hidden">
            <div className="absolute inset-0 rounded-[28px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-3 px-6 py-4">
              {loading ? (
                <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
              )}
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                placeholder={placeholder}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base bg-transparent placeholder:text-muted-foreground/60 h-auto p-0"
              />
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/60 flex-shrink-0">
                <kbd className="px-2 py-1 rounded-lg bg-muted/50 border border-border/50 font-mono text-[10px]">
                  Enter
                </kbd>
                <span>to send</span>
              </div>
            </div>
            <div className="px-6 pb-3 pt-0 flex items-center justify-between text-[11px] text-muted-foreground/50">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Powered by AI
              </span>
              {showEscHint && (
                <span className="hidden sm:block">
                  Press{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/50 font-mono text-[10px]">
                    Esc
                  </kbd>{" "}
                  to close
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
