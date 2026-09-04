import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-[6px] py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/55 focus:ring-offset-0",
  {
    variants: {
      variant: {
        default: "bg-surface-200 text-foreground-light border-strong",
        secondary: "bg-secondary text-secondary-foreground border-border",
        destructive:
          "bg-destructive-subtle text-destructive border-destructive-border",
        outline: "bg-transparent text-foreground border-strong",
        success: "bg-success-subtle text-success border-success-border",
        warning: "bg-warning-subtle text-warning border-warning-border",
        info: "bg-info-subtle text-info border-info-border",
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
