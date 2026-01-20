"use client";

import Link from "next/link";
import {
  FileText,
  Briefcase,
  Users,
  Package,
  Building2,
  Receipt,
  User,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SearchResult } from "@/types";

interface SearchResultsProps {
  results: SearchResult[];
  summary: string;
  executionTimeMs: number;
  onResultClick: () => void;
}

const typeIcons: Record<string, React.ElementType> = {
  project: Briefcase,
  invoice: Receipt,
  estimate: FileText,
  worker: Users,
  material: Package,
  vendor: Building2,
  client: User,
  purchase_order: ShoppingCart,
};

const typeLabels: Record<string, string> = {
  project: "Project",
  invoice: "Invoice",
  estimate: "Estimate",
  worker: "Worker",
  material: "Material",
  vendor: "Vendor",
  client: "Client",
  purchase_order: "Purchase Order",
};

const typeColors: Record<string, string> = {
  project: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  invoice: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  estimate: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  worker: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  material: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  vendor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  client: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  purchase_order: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
};

export function SearchResults({
  results,
  summary,
  executionTimeMs,
  onResultClick,
}: SearchResultsProps) {
  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>(
    (acc, result) => {
      const type = result.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(result);
      return acc;
    },
    {}
  );

  if (results.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{summary || "No results found"}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Try a different search query
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <p className="text-sm">{summary}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {results.length} result{results.length !== 1 ? "s" : ""} in{" "}
          {executionTimeMs}ms
        </p>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {Object.entries(groupedResults).map(([type, items]) => {
            const Icon = typeIcons[type] || FileText;
            const label = typeLabels[type] || type;

            return (
              <div key={type}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {label}s ({items.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((result) => (
                    <Link
                      key={result.id}
                      href={result.url}
                      onClick={onResultClick}
                      className="block px-3 py-2.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{result.title}</p>
                          {result.subtitle && (
                            <p className="text-sm text-muted-foreground truncate">
                              {result.subtitle}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={`flex-shrink-0 ${typeColors[type] || ""}`}
                        >
                          {label}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
