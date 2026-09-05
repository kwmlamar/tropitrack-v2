import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Status indicators for the register-style tables.
 *
 * The app reads status as a quiet dot plus a mono label (see the estimates
 * register and the jobs list) rather than a filled pill — a table of ten rows
 * full of coloured pills reads as ten alarms. The dot carries the colour; the
 * label stays in the same low-contrast type as the rest of the row.
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const DOT: Record<Tone, string> = {
  neutral: "bg-surface-400",
  info: "bg-info-solid",
  success: "bg-success-solid",
  warning: "bg-warning-solid",
  danger: "bg-destructive-solid",
  brand: "bg-primary",
};

const TEXT: Record<Tone, string> = {
  neutral: "text-foreground-lighter",
  info: "text-foreground-lighter",
  success: "text-foreground-lighter",
  warning: "text-warning",
  danger: "text-destructive",
  brand: "text-brand",
};

export function StatusDot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", DOT[tone], className)} />;
}

export function Status({
  tone = "neutral",
  label,
  muted = false,
  className,
}: {
  tone?: Tone;
  label: string;
  /** Keep the label neutral even for warning/danger tones. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusDot tone={tone} />
      <span
        className={cn(
          "text-[11px] font-mono uppercase tracking-wide whitespace-nowrap",
          muted ? "text-foreground-lighter" : TEXT[tone]
        )}
      >
        {label}
      </span>
    </span>
  );
}

/**
 * A number that needs to read as notable without shouting — overtime hours,
 * an overdue count. Tabular, tinted, no chrome.
 */
export function Metric({
  value,
  tone = "neutral",
  suffix,
  className,
}: {
  value: string | number;
  tone?: Tone;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={cn("text-[12px] tabular-nums", TEXT[tone], className)}>
      {value}
      {suffix && <span className="text-foreground-lighter ml-0.5">{suffix}</span>}
    </span>
  );
}
