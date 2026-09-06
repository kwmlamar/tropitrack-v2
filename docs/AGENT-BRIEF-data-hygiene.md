# Agent Brief — TropiTrack Data Hygiene (SCOPED WRITES, PROPOSE-THEN-APPLY)

**Database:** Supabase project `rrqpwtggiirexptnhyqy` (TropiTrack-V2 / Bedrock), schema `public`
**Company:** ODS Construction, Governors Harbour, Eleuthera, Bahamas
**Requested by:** Lamar Sineus (office manager — data entry and paper-trail accuracy is his remit)

---

## Scope boundary — read this first

You may correct **descriptive** fields: names, spellings, locations, contact details, and links between existing records.

You may **never** touch anything that carries or implies money or wages. Off limits entirely:

- `invoices`, `invoice_line_items`, `payments`
- `payroll_entries`, `pay_periods`, `payment_transactions`, `payroll_adjustments`
- `time_entries` (every row is someone's hours — do not edit, merge, or delete one)
- any `budget`, `contract_value`, `total_amount`, `unit_cost`, `hourly_rate` or similar numeric field
- `estimates` and their line items

Money, contracts and vendor relationships are the owner's decisions, not this task's. If a money field looks wrong, **report it, don't change it.**

Also: **never delete a row.** Merging duplicates means updating foreign keys to point at the survivor and reporting the orphan — not `DELETE`.

## Working method — mandatory

1. **Propose first.** Produce a complete change table — one row per proposed edit: table, row id, field, current value, new value, and the evidence for the new value. Write it to `docs/PROPOSED-hygiene-changes.md`.
2. **Stop and wait for Lamar's approval** on that table.
3. **Only then apply**, in one transaction per table, and write what you actually changed to `docs/APPLIED-hygiene-changes.md` so it can be reversed.

Never skip step 2, even for changes that look trivially safe.

---

## The work

### 1. Client names

`clients` has 14 rows; several are first names, fragments or typos, and `projects.client_name` disagrees with `clients.name` in places. Known bad values include: `Eric`, `Sven`, `Sineus`, `Crhis`, `Broderick`, `Lolly & David`, `Banks`, `Ms. Rooshe`, `TBD — Twin Coves area inquiry`.

Correct them to full legal names **only where you have evidence** — a matching `clients` row, a project record, or an invoice. Where you cannot establish the real name, leave it and list it as needing Lamar's input. Do not guess a surname.

Then make `projects.client_id` populated and `projects.client_name` consistent with the linked client for all 25 projects (1 project currently has no client link).

### 2. Duplicate/typo'd vendors

There are two unlinked vendor tables: `vendors` (5 rows) and `vendor_directory` (8 rows), with the same real-world companies under inconsistent spellings — e.g. "Lord Byron Enterprise" vs "Lord Byron Enterprises", "Metal Master" vs "Metal Masters", "Mikro Coparation" (typo) vs "Mikro Corporation", "Unique's Hardware Store" vs "UNIQUE HARDWARE & LUMBER".

**Investigate before proposing anything.** `purchase_orders.vendor_id` references one of these tables — determine which, and whether anything references the other. A merge that breaks PO linkage is worse than the duplication. If a safe merge isn't possible without schema work, say so and propose only the spelling corrections.

Canonical spellings from ODS's approved-supplier list: Ferguson, Metal Masters, Virginia Tile Co, Leon General Hardwoods, Artivo Surfaces, Mikro Corporation, Simple Steps, All Stones FL, ADI Metal, Sutton Brick & Stone, Home Depot, Lowe's; freight forwarders King Ocean and TWINex.

### 3. Project locations

Several projects carry `location = 'Nassau, Bahamas'` that appear to be a default rather than the real site — ODS works almost entirely in Eleuthera. Affected: `Beam & column repair`, `Masonry Repairs`, `Office Doors Replacement`, `Chris Property`.

(Two have already been corrected by hand and should be left alone: `Twin Coves Beach, Lot #227` and `Laundromat`.)

Where the correct location isn't determinable from other records, leave it and list it for Lamar.

### 4. Orphaned records

- All 6 `receipts` rows have `project_id = null`. Propose a project for each **only** where the vendor, date and amount make it unambiguous; otherwise list them for a human. Do not guess.
- 4 of 13 `purchase_orders` have no `project_id`. Same rule.
- 5 of 8 `invoices` have no `project_id`. **Report these; do not link them** — invoices are out of scope.

### 5. Report only — do not act

- 10 of 14 clients have no email address.
- 8 projects have no budget set.
- All 6 receipts have `image_url` set to the literal string `"uploaded"` — the source images do not exist. Investigate whether a Supabase storage bucket holds them and report what you find; do not modify the rows.
- `material_price_history` is empty despite receipts existing.

---

## Definition of done

- `docs/PROPOSED-hygiene-changes.md` exists, complete, with evidence per row.
- Nothing applied before Lamar approves.
- After approval: `docs/APPLIED-hygiene-changes.md` records every change with old and new values.
- A clear list of everything you left alone because it needed a human decision.
- Zero rows touched in any table named in the scope boundary.
