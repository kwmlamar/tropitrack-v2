"use client";

/**
 * Quick Entry Buttons
 * Fast shortcuts for common line item entry scenarios
 */

import { Button } from "@/components/ui/button";
import { Briefcase, Package, Wrench, DollarSign, ListPlus } from "lucide-react";
import type { LineItemEntryMode } from "@/types";

interface QuickEntryButtonsProps {
  onQuickAdd: (mode: LineItemEntryMode, category: string) => void;
}

export function QuickEntryButtons({ onQuickAdd }: QuickEntryButtonsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ListPlus className="h-4 w-4" />
        <span className="font-medium">Quick Add:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onQuickAdd("lump_sum", "labor")}
          className="gap-2"
        >
          <DollarSign className="h-4 w-4" />
          Labor Lump Sum
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onQuickAdd("lump_sum", "material")}
          className="gap-2"
        >
          <DollarSign className="h-4 w-4" />
          Materials Lump Sum
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onQuickAdd("simple", "equipment")}
          className="gap-2"
        >
          <Wrench className="h-4 w-4" />
          Equipment
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onQuickAdd("detailed", "labor")}
          className="gap-2"
        >
          <Briefcase className="h-4 w-4" />
          Detailed Item
        </Button>
      </div>
    </div>
  );
}
