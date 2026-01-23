"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DatePickerProps {
  /** The selected date value (ISO string format: YYYY-MM-DD) */
  value?: string;
  /** Callback when date changes (returns ISO string: YYYY-MM-DD) */
  onChange?: (value: string) => void;
  /** Placeholder text when no date is selected */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is required */
  required?: boolean;
  /** ID for the input (for label association) */
  id?: string;
  /** Additional className for the trigger button */
  className?: string;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Whether to show the clear button */
  clearable?: boolean;
  /** Error state */
  error?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  required = false,
  id,
  className,
  minDate,
  maxDate,
  clearable = true,
  error = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  // Parse the ISO string value to a Date object (using local timezone)
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    // Parse date string (YYYY-MM-DD) as local date to avoid timezone shifts
    const [year, month, day] = value.split('-').map(Number);
    if (year && month && day) {
      const date = new Date(year, month - 1, day);
      return isValid(date) ? date : undefined;
    }
    return undefined;
  }, [value]);

  // Update input value when selected date changes
  React.useEffect(() => {
    if (selectedDate) {
      setInputValue(format(selectedDate, "MMM d, yyyy"));
    } else {
      setInputValue("");
    }
  }, [selectedDate]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Format date using local date components to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      onChange?.(`${year}-${month}-${day}`);
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  const handleToday = () => {
    const today = new Date();
    onChange?.(format(today, "yyyy-MM-dd"));
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
    // Allow keyboard shortcut for today
    if (e.key === "t" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleToday();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          type="button"
          onClick={(e) => {
            // Ensure click works even inside forms/dialogs
            e.preventDefault();
            if (!disabled) {
              setOpen(!open);
            }
          }}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">
            {selectedDate ? format(selectedDate, "MMMM d, yyyy") : placeholder}
          </span>
          {clearable && selectedDate && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear(e);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="ml-2 rounded-sm opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="Clear date"
            >
              <X className="h-4 w-4" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          initialFocus
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
        />
        <div className="border-t p-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={handleToday}
          >
            Today
          </Button>
          <p className="text-xs text-muted-foreground">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
              <span className="text-xs">⌘</span>T
            </kbd>
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Date Range Picker for selecting a range of dates
export interface DateRangePickerProps {
  /** Start date (ISO string: YYYY-MM-DD) */
  startDate?: string;
  /** End date (ISO string: YYYY-MM-DD) */
  endDate?: string;
  /** Callback when dates change */
  onChange?: (start: string, end: string) => void;
  /** Placeholder for start date */
  startPlaceholder?: string;
  /** Placeholder for end date */
  endPlaceholder?: string;
  /** Whether the inputs are disabled */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  startPlaceholder = "Start date",
  endPlaceholder = "End date",
  disabled = false,
  className,
}: DateRangePickerProps) {
  const handleStartChange = (value: string) => {
    onChange?.(value, endDate || "");
  };

  const handleEndChange = (value: string) => {
    onChange?.(startDate || "", value);
  };

  const parsedStartDate = startDate
    ? parse(startDate, "yyyy-MM-dd", new Date())
    : undefined;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DatePicker
        value={startDate}
        onChange={handleStartChange}
        placeholder={startPlaceholder}
        disabled={disabled}
        clearable
        className="flex-1"
      />
      <span className="text-muted-foreground">to</span>
      <DatePicker
        value={endDate}
        onChange={handleEndChange}
        placeholder={endPlaceholder}
        disabled={disabled}
        minDate={parsedStartDate}
        clearable
        className="flex-1"
      />
    </div>
  );
}
