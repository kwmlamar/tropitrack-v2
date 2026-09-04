"use client";

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearchView } from "@/hooks/use-search-view";
import { SearchView } from "./search-view";

export function SearchModal() {
  const [open, setOpen] = useState(false);
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
    reset,
  } = useSearchView(open);

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

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground rounded-md border bg-background hover:bg-accent transition-colors"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md border bg-muted px-1.5 tabular-nums text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 rounded-md hover:bg-accent"
      >
        <Search className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <div className="fixed inset-0 pointer-events-none z-50">
            <div className="absolute bottom-0 left-0 right-0 h-[50vh] bg-gradient-to-t from-primary/10 via-primary/5 to-transparent" />
          </div>
        )}

        <DialogContent className="max-w-3xl h-[85vh] p-0 gap-0 overflow-hidden border-0 bg-background/80 backdrop-blur-xl">
          <SearchView
            active={open}
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
            onResultClick={() => setOpen(false)}
            showEscHint
            inputRef={inputRef}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
