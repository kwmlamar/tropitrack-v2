"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";

// Keeps the PWA status-bar color in step with the active theme's canvas.
// Values mirror --background in src/app/globals.css.
const CANVAS = {
  light: "#f8f7f7",
  dark: "#141414",
} as const;

export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = CANVAS[resolvedTheme] ?? CANVAS.light;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}
