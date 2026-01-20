"use client";

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarViewMode } from "@/types";

interface CalendarHeaderProps {
  title: string;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarHeader({
  title,
  viewMode,
  onViewModeChange,
  onPrevious,
  onNext,
  onToday,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
      {/* Left: Navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrevious}
          className="h-9 w-9 rounded-lg transition-all hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          className="h-9 w-9 rounded-lg transition-all hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Next</span>
        </Button>
        <Button
          variant="outline"
          onClick={onToday}
          className="h-9 px-4 rounded-lg font-medium transition-all hover:bg-accent"
        >
          Today
        </Button>
        <h2 className="ml-4 text-xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>

      {/* Right: View Mode Toggle */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center bg-muted rounded-lg p-1">
          {(["month", "week", "day", "agenda"] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Mobile View Mode Select */}
        <div className="sm:hidden">
          <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as CalendarViewMode)}>
            <SelectTrigger className="w-[120px]">
              <CalendarIcon className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="agenda">Agenda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
