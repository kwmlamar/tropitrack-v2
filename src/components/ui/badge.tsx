import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Chips are squared off (4px, matching the design system's chip radius) and
// set in the same mono the tables use. Tone lives in the text, not in a filled
// pill — a filled capsule reads as an alert and there are too many of them for
// that to be true. For row status prefer <Status> from ./status, which is the
// dot-plus-label form the registers use; Badge is for counts and labels.
const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-1.5 py-[1px] text-[10px] font-mono uppercase tracking-wide leading-[16px] transition-colors focus:outline-none focus:ring-1 focus:ring-ring/40 focus:ring-offset-0",
  {
    variants: {
      variant: {
        default: "bg-surface-200 text-foreground-lighter border-border",
        secondary: "bg-surface-200 text-foreground-lighter border-border",
        destructive: "bg-transparent text-destructive border-destructive-border",
        outline: "bg-transparent text-foreground-lighter border-strong",
        success: "bg-transparent text-success border-success-border",
        warning: "bg-transparent text-warning border-warning-border",
        info: "bg-transparent text-info border-info-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
