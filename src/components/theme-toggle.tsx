"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "dropdown" | "toggle" | "buttons";
  className?: string;
}

export function ThemeToggle({ variant = "dropdown", className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  if (variant === "buttons") {
    return (
      <div className={cn("flex gap-1 p-1 bg-muted rounded-lg", className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme("light")}
                className={cn(
                  "h-8 w-8 p-0",
                  theme === "light" && "bg-background shadow-sm"
                )}
              >
                <Sun className="h-4 w-4" />
                <span className="sr-only">Light mode</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Light mode</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme("dark")}
                className={cn(
                  "h-8 w-8 p-0",
                  theme === "dark" && "bg-background shadow-sm"
                )}
              >
                <Moon className="h-4 w-4" />
                <span className="sr-only">Dark mode</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dark mode</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme("system")}
                className={cn(
                  "h-8 w-8 p-0",
                  theme === "system" && "bg-background shadow-sm"
                )}
              >
                <Monitor className="h-4 w-4" />
                <span className="sr-only">System preference</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>System preference</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  if (variant === "toggle") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className={className}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default: dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
