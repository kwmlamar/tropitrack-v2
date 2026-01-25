"use client";

/**
 * AI Agent Page — same experience as Command K (⌘K) search.
 * Full-page AI search with history, results, and liquid glass input.
 */

import { useRef } from "react";
import { useSearchView } from "@/hooks/use-search-view";
import { SearchView } from "@/components/search/search-view";

export default function AIAgentPage() {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    onQueryChange,
    loading,
    hasSearched,
    results,
    summary,
    executionTimeMs,
    error,
    history,
    historyLoading,
    performSearch,
    onSelectHistory,
    onClearHistory,
  } = useSearchView(true);

  return (
    <div className="relative flex flex-col h-[calc(100vh-5rem)] min-h-[500px]">
      {/* Same gradient overlay as Command K modal */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute bottom-0 left-0 right-0 h-[50vh] bg-gradient-to-t from-primary/10 via-primary/5 to-transparent" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 md:px-6 pt-6 pb-4 min-h-0">
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-2xl shadow-primary/5">
          <SearchView
            active
            query={query}
            onQueryChange={onQueryChange}
            onSearch={performSearch}
            loading={loading}
            hasSearched={hasSearched}
            results={results}
            summary={summary}
            executionTimeMs={executionTimeMs}
            error={error}
            history={history}
            historyLoading={historyLoading}
            onSelectHistory={onSelectHistory}
            onClearHistory={onClearHistory}
            showEscHint={false}
            placeholder="Ask anything... e.g., 'Show me unpaid invoices older than 30 days'"
            inputRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}
