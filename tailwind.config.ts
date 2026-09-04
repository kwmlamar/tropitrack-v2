import type { Config } from "tailwindcss";

/** Every color token is an HSL triplet in globals.css, so opacity modifiers
 *  (bg-muted/50, text-foreground/70) keep working. */
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "Menlo", "monospace"],
        // Client-facing document surfaces only (estimate/invoice previews)
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      // Supabase Studio's type scale — denser than Tailwind's default at every
      // step (text-sm 13px, text-base 15px, text-2xl 22px). Source:
      // apps/studio/styles/globals.css
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1rem", { lineHeight: "1.5rem" }],
        xl: ["1.125rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.375rem", { lineHeight: "1.875rem" }],
        "3xl": ["1.75rem", { lineHeight: "2.125rem", letterSpacing: "-0.02em" }],
        "4xl": ["2.125rem", { lineHeight: "2.5rem", letterSpacing: "-0.02em" }],
        "5xl": ["2.875rem", { lineHeight: "1.1", letterSpacing: "-0.022em" }],
        "6xl": ["3.625rem", { lineHeight: "1.05", letterSpacing: "-0.024em" }],
      },
      fontWeight: {
        // Supabase runs body copy at 450 rather than 400
        normal: "450",
      },
      colors: {
        // ---- shadcn semantic pairs -------------------------------------
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: {
          DEFAULT: token("foreground"),
          // Supabase's text ramp: foreground -> light -> lighter
          light: token("foreground-light"),
          lighter: token("foreground-lighter"),
        },
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
        },
        secondary: {
          DEFAULT: token("secondary"),
          foreground: token("secondary-foreground"),
        },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
        },
        accent: {
          DEFAULT: token("accent"),
          foreground: token("accent-foreground"),
        },
        popover: {
          DEFAULT: token("popover"),
          foreground: token("popover-foreground"),
        },
        card: {
          DEFAULT: token("card"),
          foreground: token("card-foreground"),
        },

        // ---- Supabase elevation ladder ---------------------------------
        // bg-surface-100 (panel) .. bg-surface-400 (deepest control wash)
        surface: {
          100: token("surface-100"),
          200: token("surface-200"),
          300: token("surface-300"),
          400: token("surface-400"),
        },

        // ---- border strengths ------------------------------------------
        // border-strong / border-stronger / border-overlay / hover:border-hover
        strong: token("input"),
        stronger: token("border-stronger"),
        overlay: token("border-overlay"),
        hover: token("border-hover"),

        // ---- brand: construction orange ---------------------------------
        // text-brand is theme-aware and always readable; bg-primary is the
        // vivid mode-invariant fill.
        brand: {
          DEFAULT: token("brand"),
          subtle: token("brand-subtle"),
          border: token("brand-border"),
          200: token("brand-200"),
          300: token("brand-300"),
          400: token("brand-400"),
          500: token("brand-500"),
          600: token("brand-600"),
        },

        // ---- status ------------------------------------------------------
        // Pattern: text-<status> on canvas, bg-<status>-subtle +
        // border-<status>-border for chips, bg-<status>-solid +
        // text-<status>-foreground for filled emphasis.
        warning: {
          DEFAULT: token("warning"),
          solid: token("warning-solid"),
          foreground: token("warning-foreground"),
          subtle: token("warning-subtle"),
          border: token("warning-border"),
        },
        destructive: {
          DEFAULT: token("destructive"),
          solid: token("destructive-solid"),
          foreground: token("destructive-foreground"),
          subtle: token("destructive-subtle"),
          border: token("destructive-border"),
        },
        success: {
          DEFAULT: token("success"),
          solid: token("success-solid"),
          foreground: token("success-foreground"),
          subtle: token("success-subtle"),
          border: token("success-border"),
        },
        info: {
          DEFAULT: token("info"),
          solid: token("info-solid"),
          foreground: token("info-foreground"),
          subtle: token("info-subtle"),
          border: token("info-border"),
        },

        // Legacy aliases — kept so existing bedrock-* utilities resolve.
        bedrock: {
          amber: token("primary"),
          green: token("success"),
          red: token("bedrock-red"),
          surface: token("surface-100"),
          line: token("border"),
        },
      },
      borderRadius: {
        // Supabase: 8px panels, 6px controls, 4px chips
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Supabase is border-driven; shadows only lift true overlays
        xs: "0 1px 2px 0 hsl(0 0% 0% / 0.04)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

export default config;
