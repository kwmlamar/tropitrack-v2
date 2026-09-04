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
  Calculator,
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
  payroll: Calculator,
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
  payroll: "Payroll",
};

// 9 result categories share the 4-token status palette (no per-category token
// exists), grouped by closest semantic/hue match rather than 1:1 color.
const typeColors: Record<string, string> = {
  project: "bg-info-subtle text-info border border-info-border",
  invoice: "bg-success-subtle text-success border border-success-border",
  estimate: "bg-info-subtle text-info border border-info-border",
  worker: "bg-warning-subtle text-warning border border-warning-border",
  material: "bg-warning-subtle text-warning border border-warning-border",
  vendor: "bg-info-subtle text-info border border-info-border",
  client: "bg-destructive-subtle text-destructive border border-destructive-border",
  purchase_order: "bg-info-subtle text-info border border-info-border",
  payroll: "bg-success-subtle text-success border border-success-border",
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
                    {type === "payroll" && items.length === 1
                      ? "Payroll (1)"
                      : `${label}s (${items.length})`}
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
                          {type === "payroll" ? "Payroll" : label}
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
