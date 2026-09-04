import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-transparent font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary hover:bg-primary/90",
        destructive:
          "bg-destructive-solid text-destructive-foreground hover:bg-destructive-solid/90",
        outline:
          "bg-card text-foreground border border-strong hover:bg-surface-200 hover:border-hover",
        secondary:
          "bg-card text-foreground border border-strong hover:bg-surface-200 hover:border-hover",
        ghost: "hover:bg-surface-200 text-foreground-light hover:text-foreground",
        link: "text-brand underline-offset-4 hover:underline",
        dashed:
          "border border-dashed border-strong bg-transparent text-foreground-light hover:border-hover",
      },
      size: {
        default: "h-[34px] px-3 text-sm",
        sm: "h-[26px] px-2.5 text-xs",
        lg: "h-[38px] px-4 text-sm",
        xl: "h-[42px] px-4 text-base",
        icon: "h-[34px] w-[34px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
