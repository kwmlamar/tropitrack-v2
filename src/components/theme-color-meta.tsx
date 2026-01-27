"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // Update theme-color meta tag based on current theme
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    
    if (resolvedTheme === "dark") {
      // Black for dark mode
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", "#000000");
      } else {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = "#000000";
        document.getElementsByTagName("head")[0].appendChild(meta);
      }
    } else {
      // Primary teal color for light mode: hsl(174 84% 32%) = #0D9488
      const primaryColor = "#0D9488";
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", primaryColor);
      } else {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.content = primaryColor;
        document.getElementsByTagName("head")[0].appendChild(meta);
      }
    }
  }, [resolvedTheme]);

  return null;
}
