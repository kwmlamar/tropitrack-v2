# Bedrock design system

Bedrock's UI is a port of **Supabase Studio's** design language with a
construction-orange brand in place of Supabase's green.

Everything is driven by tokens in [`src/app/globals.css`](../src/app/globals.css)
and exposed as Tailwind utilities in [`tailwind.config.ts`](../tailwind.config.ts).
**Never hardcode a color.** No `bg-[#202224]`, no `text-gray-500`.

---

## Where the values come from

The neutral ramp is a direct port of Supabase's OKLCH token engine
(`packages/ui/build/css/source/semantic.css` in `supabase/supabase`). Surfaces,
text and borders are *derived*, not hand-picked:

```
background     = oklch(surface, chroma/2, surface-hue)
foreground     = oklch(surface + tone-span, chroma*0.55, surface-hue)
card / popover = background stepped by --elevation-step
surface-200/300/400, muted, accent
               = translucent foreground washed over the canvas
border / input = foreground at 2%+20%*contrast² / 3%+38%*contrast²
```

Supabase's own inputs (elevation step, contrast curve, muted/tertiary levels,
border alpha curves) are kept verbatim. We changed the brand hue from 159 (green)
to 50 (orange), softened the light canvas so panels have something to be white
against, and added a `success` token — Supabase gets green free from its brand,
we don't.

Values are stored as HSL triplets so Tailwind opacity modifiers still work:
`bg-muted/50`, `text-foreground/70`.

---

## Surfaces — the elevation ladder

| utility | role |
|---|---|
| `bg-background` | the page canvas. **The sidebar uses this too** — in Supabase the sidebar is part of the canvas, not a separate panel. |
| `bg-surface-100` / `bg-card` | panels, cards, tables — the things that sit on the canvas |
| `bg-surface-200` | row hover, table headers, subtle fills |
| `bg-surface-300` | active nav item, pressed states |
| `bg-surface-400` | deepest control wash, avatar chips |
| `bg-popover` | menus, dialogs, anything floating |

In light mode panels are white on a soft warm-gray canvas; in dark mode they step
*up* from a near-black canvas. Same ladder, both directions.

## Text — a three-step ramp

| utility | role |
|---|---|
| `text-foreground` | primary content, headings, table cells |
| `text-foreground-light` | secondary content |
| `text-foreground-lighter` | labels, placeholders, timestamps, inactive nav |

That's the whole ramp. The old palette went far dimmer than this; every step here
clears WCAG AA against its canvas.

## Borders

| utility | role |
|---|---|
| `border-border` | the default hairline — panels, dividers, table rows |
| `border-strong` | controls: inputs, selects, buttons |
| `border-hover` | hover/focus state for those controls |
| `border-stronger` | when something must read heavier |
| `border-overlay` | floating surfaces |

Borders are always 1px. Supabase is a border-driven UI — reach for a border
before a shadow.

## Brand — construction orange

| utility | role |
|---|---|
| `bg-primary` + `text-primary-foreground` | the vivid CTA fill (`#eb7c33`), same in both themes |
| `text-brand` | brand-colored **text and icons** — theme-aware so it stays readable on white |
| `bg-brand-subtle` + `border-brand-border` | tinted brand callouts |
| `brand-200`…`brand-600` | the stepped scale, if you need finer control |

`text-brand` and `bg-primary` are deliberately different values. A single orange
cannot be both a vivid fill and readable small text on white — Supabase splits
these the same way (`--brand` vs `--brand-link`).

Never put `text-brand` on `bg-primary`; use `text-primary-foreground`.

## Status

Five families, each with the same five parts: `success`, `warning`,
`destructive`, `info`, and the brand.

```html
<!-- chip / badge -->
<span class="rounded-full border border-success-border bg-success-subtle
             px-[6px] py-[3px] text-[10px] font-medium uppercase
             tracking-[0.06em] text-success">Active</span>

<!-- callout -->
<div class="rounded-lg border border-warning-border bg-warning-subtle
            px-4 py-3 text-sm text-warning">…</div>

<!-- filled emphasis (rare) -->
<button class="bg-destructive-solid text-destructive-foreground">Delete</button>
```

`text-<status>` is always the readable-on-canvas value.
`bg-<status>-solid` is the vivid fill, and it pairs with `text-<status>-foreground`.

Money/positive figures use `text-success`; overdue/negative use `text-destructive`.

---

## Typography

- **Plus Jakarta Sans** for UI (`font-sans`), **Source Code Pro** for mono (`font-mono`).
  (Supabase Studio uses Inter; we run a warmer humanist sans by preference.)
- Body runs at 15px / weight **450** — Supabase's tuned weight, between regular
  and medium. Set on `body`, so the rem root stays 16px and spacing is unaffected.
- The Tailwind type scale is overridden to Supabase Studio's:
  `text-sm` 13px · `text-base` 15px · `text-lg` 16px · `text-2xl` 22px · `text-3xl` 28px.
- Headings are `font-semibold` with slightly tight tracking.
- **Fraunces** (`font-display`) is reserved for client-facing estimate and invoice
  documents, alongside `text-bedrock-red`. That's a print identity — don't use it
  in app chrome.

### The micro-label

Supabase's signature: card titles and column headers are tiny mono uppercase.

```html
<p class="text-xs font-mono uppercase tracking-wider text-foreground-lighter">Budget</p>
```

There's a `.label-micro` utility for this.

## Geometry & density

| | |
|---|---|
| cards, panels, dialogs, tables | `rounded-lg` (8px) |
| buttons, inputs, selects, menus, tabs | `rounded-md` (6px) |
| badges / status pills | `rounded-full` |
| button heights | 26 / 34 / 38 / 42px (`sm` / default / `lg` / `xl`) |
| input height | 34px |
| table rows | dense — `px-4 py-2.5` |
| sidebar | 13rem expanded, 3rem collapsed |
| header | 3rem |

Inputs use `bg-field` — a barely-there sunken wash. The border carries the visual
weight, not the fill.

## Icons

lucide-react. Inline icons render at 14–18px with the default 2.0 stroke; sidebar
nav icons use a lighter **1.5** stroke, matching Supabase.

---

## Changing the brand color

The whole system hangs off one hue. `--primary`, `--brand`, `--ring` and the
`brand-*` scale in `globals.css` are all built at hue **50**. The generator that
produced them (Supabase's formulas, in Python) lets you re-derive the full set
from a different hue if the brand ever moves — the status hues are clamped away
from the brand hue so warning stays gold and destructive stays red.
