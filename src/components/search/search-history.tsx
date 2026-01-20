"use client";

import { Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchHistoryItem {
  id: string;
  query_text: string;
  results_count: number;
  successful: boolean;
  created_at: string;
}

interface SearchHistoryProps {
  history: SearchHistoryItem[];
  onSelectQuery: (query: string) => void;
  onClearHistory: () => void;
  loading?: boolean;
}

export function SearchHistory({
  history,
  onSelectQuery,
  onClearHistory,
  loading,
}: SearchHistoryProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Loading search history...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No recent searches. Try asking a question like &quot;Show me unpaid invoices&quot;
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Recent Searches
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={onClearHistory}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <div className="space-y-1 px-1">
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectQuery(item.query_text)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent transition-colors"
          >
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{item.query_text}</p>
              <p className="text-xs text-muted-foreground">
                {item.results_count} result{item.results_count !== 1 ? "s" : ""}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
