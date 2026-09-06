# Proposed Data Hygiene Changes — ODS Construction

**Status: PROPOSAL ONLY — nothing has been applied.** Per [AGENT-BRIEF-data-hygiene.md](AGENT-BRIEF-data-hygiene.md), this document is step 1 (propose) and requires Lamar's sign-off before step 3 (apply). Zero rows have been touched in `clients`, `projects`, `vendors`, `vendor_directory`, `purchase_orders`, `receipts`, or `invoices`.

Database: Supabase project `rrqpwtggiirexptnhyqy` (TropiTrack-V2), schema `public`.

**Revision 2** — incorporates Lamar's corrections: (1) client names are now fixed *before* the project sync that depends on them, so Section 2 no longer bakes in unverified placeholder names; (2) the PO-76228349 project link is pulled and held with its 3 siblings, since it was the only inference in that batch and it would move a completed job's margin; (3) the `Unique's Hardware Store` → `Unique Hardware & Lumber` change is now called out as a vendor-identity rename needing explicit confirmation, not bundled in with the plain typo fixes.

---

## 1. Client name corrections (`clients` — applied first, everything downstream depends on this)

| # | Table | Row ID | Field | Current | Proposed | Evidence |
|---|-------|--------|-------|---------|----------|----------|
| 1 | `clients` | `574bbfad-ebfe-416c-9586-402c912d3346` | `name` | `Crhis` | `Chris` | The one project linked to this client (`Chris Property`, id `3cccf944`) confirms the intended first name is "Chris" — a typo fix, not a guessed surname. Full legal name (surname) still unresolved — see Section 6. |
| 2 | `clients` | `73382fc3-c594-4e42-857f-c7d2d6a9d93e` | `name` | `Eric` | `Eric & Robynn Mann` | Confirmed by Lamar from project records |
| 3 | `clients` | `8aba6987-dba2-435e-b2fc-f4d6c6f67aa9` | `name` | `Sven` | `Sven Borho` | Confirmed by Lamar from project records |
| 4 | `clients` | `837c7ea5-6639-4c21-be42-a9fa102b0d81` | `name` | `Broderick` | `Michael Broderick` | Confirmed by Lamar from project records |

**No change — confirmed intentional:** `Sineus` (id `3a9421a7`) is Wallace's own owner-build (the `Laundromat` project), not a data-entry slip. Leaving as-is.

**No change — still unresolved, no new evidence:** `Banks` (id `31f1dfe4`), `Ms. Rooshe` (id `7e682764`). `Lolly & David` (id `b9f3c717`) now has partial evidence — surnames are Van Sickle and Merrell — but which first name pairs with which surname isn't confirmed yet, so the client record is left unchanged pending that. All three remain in Section 6.

## 2. `projects.client_name` sync with linked client

Regenerated from the **corrected** client names in Section 1 (not the pre-correction placeholders). 25 projects total; 24 already have `client_id` populated (1 does not — see Section 6). Of those 24, five already have `client_name` matching their client and need no change.

| # | Project | Row ID | Field | Current | Proposed | Evidence |
|---|---------|--------|-------|---------|----------|----------|
| 5 | 2026 Site Improvements — Governor's Harbour (Rev. 2) | `2280ad46-f007-478c-996f-824238abe544` | `client_name` | `Jeff Christiansen` | `Mr. Jeff Christiansen & Mrs. Debbie Christiansen` | Matches linked `clients.name` (id `884b59c3`) |
| 6 | Blue Sky Villa — Great Room Flooring | `3358dd68-862f-407a-b5f0-efc42535f7c7` | `client_name` | `NULL` | `Eric & Robynn Mann` | Matches corrected `clients.name` (id `73382fc3`, row 2) |
| 7 | Capricorn | `8639ca68-ae98-4a4f-9a79-40c96f3331e9` | `client_name` | `NULL` | `Sven Borho` | Matches corrected `clients.name` (id `8aba6987`, row 3) |
| 8 | Chris Property | `3cccf944-ac51-42c3-8c83-428fd87fd71e` | `client_name` | `Crhis` | `Chris` | Matches corrected `clients.name` (id `574bbfad`, row 1) |
| 9 | Gutters & Garbage Houses | `11c8ef61-a747-4ada-a021-280917db519c` | `client_name` | `NULL` | `Ms. Rooshe` | Matches linked `clients.name` (id `7e682764`, unchanged) |
| 10 | Metal Roof Installalation & Old Roof Demolition | `c3e66b04-c73a-44bb-8397-ed738e896944` | `client_name` | `NULL` | `Michael Broderick` | Matches corrected `clients.name` (id `837c7ea5`, row 4) |
| 11 | Off The Reef - Interior Renovation - Phase 2 | `3ceafb21-acc5-4cd4-ba0a-80282f8bc22e` | `client_name` | `NULL` | `Lolly & David` | Matches linked `clients.name` (id `b9f3c717`, unchanged pending surname pairing) |
| 12 | Off the Reef - Light Renovations | `ca56f7c4-9e6f-4d62-b9ef-d47d7c1501c9` | `client_name` | `NULL` | `Lolly & David` | Matches linked `clients.name` (id `b9f3c717`, unchanged pending surname pairing) |
| 13 | Re-Roof Project - Tropical Impulse | `45a43ae3-91f6-4c95-bf2e-860a3f8ad1a1` | `client_name` | `NULL` | `Mr. Richard Parks` | Matches linked `clients.name` (id `6fbe9ede`) |
| 14 | Sand Grading | `02b2a539-a5d2-4dbe-98d1-48c86cff3126` | `client_name` | `NULL` | `Banks` | Matches linked `clients.name` (id `31f1dfe4`, unchanged) |
| 15 | SHOWER DEMOLITION, WATERPROOFING & RE-TILE | `cceb5aa5-6584-453a-bbfa-c47e6ada9619` | `client_name` | `NULL` | `Eric & Robynn Mann` | Matches corrected `clients.name` (id `73382fc3`, row 2) |
| 16 | Sotheby's Caretaking Properties | `da49e444-6327-4372-81b4-e606b4ecb89c` | `client_name` | `NULL` | `George Damianos` | Matches linked `clients.name` (id `c95ab617`) |
| 17 | SunDancer - Great Room — Cathedral Ceiling & Trim, Painting | `8d02f44b-f2e6-4d84-9bf7-3f93ad74462e` | `client_name` | `NULL` | `George Damianos` | Matches linked `clients.name` (id `c95ab617`) |
| 18 | Treasure Chest dock | `7dab62b9-03be-4908-b5d4-a7fff637acc9` | `client_name` | `NULL` | `Kelly & Shane Jensen` | Matches linked `clients.name` (id `72f475f4`) |
| 19 | Wockenfuss Pool | `b50ddb43-2c55-41fb-be6c-cae8ea513aae` | `client_name` | `NULL` | `David & Michelle Wockenfuss` | Matches linked `clients.name` (id `656251af`) |
| 20 | Tropical Impulse - Ceilings Sanded, Caulked, Primed, Painted White | `9e6e400e-a67e-4b68-8868-fde987e98b3d` | `client_name` | `NULL` | `Mr. Richard Parks` | Matches linked `clients.name` (id `6fbe9ede`) |
| 21 | Tropical Impulse - Kitchen Remodel | `0443a7a1-667f-4bea-97f7-4137fcb32166` | `client_name` | `NULL` | `Mr. Richard Parks` | Matches linked `clients.name` (id `6fbe9ede`) |
| 22 | Tropical Impulse Showers | `3a01b60a-e44d-43af-9d7c-f442570d3578` | `client_name` | `NULL` | `Mr. Richard Parks` | Matches linked `clients.name` (id `6fbe9ede`) |

No change needed (already consistent): `Beam & column repair`, `Masonry Repairs` (both "Brent Fox"), `Laundromat` ("Sineus"), `Office Doors Replacement` ("George Damianos"), `Twin Coves Beach, Lot #227` ("David & Michelle Wockenfuss").

`projects.client_id` is populated for 24 of 25 projects already. The 25th (`1-Car Detached Garage — Twin Coves area`, id `5db053ce`) has no client and cannot be assigned without a guess — see Section 6.

## 3. Vendor name corrections

**Investigation finding (unchanged from rev. 1):** `purchase_orders.vendor_id` has a foreign key to `vendors` only. No foreign key anywhere references `vendor_directory` — it's not linked to `purchase_orders`, `material_price_history`, or anything else. Only one name overlaps between the two tables: Lord Byron. Since nothing depends on `vendor_directory`, there's no PO-linkage risk in correcting `vendors` directly.

### 3a. Straightforward spelling/typo fixes (evidenced by canonical list or cross-table match)

| # | Table | Row ID | Field | Current | Proposed | Evidence |
|---|-------|--------|-------|---------|----------|----------|
| 23 | `vendors` | `e077affb-3229-4f60-be90-0b99d8da1c33` | `name` | `Lord Byron Enterprise` | `Lord Byron Enterprises` | Matches `vendor_directory` row `58338f01` for the same company (full address/phone/TIN on file there) |
| 24 | `vendors` | `e077affb-3229-4f60-be90-0b99d8da1c33` | `address` | `NULL` | `Queen's Highway, P.O. Box EL-25045, Governor's Harbour` | Backfilled from `vendor_directory` row `58338f01` — same company |
| 25 | `vendors` | `e077affb-3229-4f60-be90-0b99d8da1c33` | `phone` | `NULL` | `(242) 828-3476` | Backfilled from `vendor_directory` row `58338f01` |
| 26 | `vendors` | `463d68a0-e5af-4915-8a0d-bfdbf8d95a23` | `name` | `Metal Master` | `Metal Masters` | ODS approved-supplier canonical list |
| 27 | `vendors` | `0511d2e2-b8eb-4736-a5f2-1efba6ba94d9` | `name` | `Mikro Coparation` | `Mikro Corporation` | ODS approved-supplier canonical list; also an unambiguous typo |
| 28 | `receipts` | `1620e327-4d84-4c31-ad99-07a0365858d6` | `vendor` | `LORD BYRON ENTERPRISES` | `Lord Byron Enterprises` | Case normalization to match row 23 |
| 29 | `receipts` | `02121c84-7bb3-4a94-9a4e-37a8496aff03` | `vendor` | `LORD BYRON ENTERPRISES` | `Lord Byron Enterprises` | Case normalization to match row 23 |

### 3b. ⚠️ Proposed vendor rename — needs your confirmation before it's applied

Unlike 3a, this isn't a spelling fix on a name we already know is the same company — it's a proposal that two differently-named records are the *same* business. **Please confirm this is one business, not two**, before it goes into the applied batch.

| # | Table | Row ID | Field | Current | Proposed | Evidence |
|---|-------|--------|-------|---------|----------|----------|
| 30 | `vendors` | `eae7f56c-5245-4400-935c-53b91e410ef8` | `name` | `Unique's Hardware Store` | `Unique Hardware & Lumber` | No cross-table match like Lord Byron has — this is inferred from `receipts.vendor` independently recording "UNIQUE HARDWARE & LUMBER" 3 times (rows below). Plausible same business, but it's an inference, not a confirmed record match. |
| 31 | `receipts` | `7f76d7f6-a202-4e75-a543-ba291eb800c8` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` | Case normalization, tied to row 30's confirmation |
| 32 | `receipts` | `8cfb9010-e8d2-48ac-a2d1-9d1cbbd067c5` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` | Case normalization, tied to row 30's confirmation |
| 33 | `receipts` | `d125e844-0d17-4504-95f9-7ab0db1c6d15` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` | Case normalization, tied to row 30's confirmation |

No change proposed for `vendors."Caribbean Coral Marble"` (no issue found) or any `vendor_directory` row (see Section 6 for the "what to do with this unused table" question).

## 4. Project locations

All four flagged projects (`Beam & column repair`, `Masonry Repairs`, `Office Doors Replacement`, `Chris Property`) currently show `location = 'Nassau, Bahamas'`, which looks like a leftover default — ODS's other 21 projects are all in Eleuthera. No record anywhere (client address, other projects for the same client, notes) states the real site for any of the four, so no value is proposed for any of them. See Section 6.

`Twin Coves Beach, Lot #227` and `Laundromat` were confirmed already correct and left untouched, per the brief.

## 5. Orphaned records

### Purchase orders (4 of 13 have no `project_id`) — all 4 held, none proposed

Per Lamar: pull PO-76228349 out of the proposed batch. It was the only inference in this set of 4, and linking it would move a completed job's final margin — if the other three same-vendor POs are ambiguous enough to hold, this one holds with them. All 4 now listed together in Section 6.

### Receipts (all 6 have no `project_id`)

No proposal — none are unambiguous (see Section 6 for candidates per row).

### Invoices (5 of 8 have no `project_id`)

Per the brief, invoices are out of scope to link. Reporting only: `INV-2026-003` (Lolly & David), `468` and `ODS-2026-0807-PARKS A/C` and `INV-2026-007` (all Mr. Richard Parks), `INV-2026-006` (client name "Island Breeze" — this client has no `clients` row at all; flagged for awareness, not something to create/fix here since invoices are out of scope).

## 6. Left alone — needs Lamar's input

**Client names with no corroborating evidence anywhere in the database:**
- `Banks` (id `31f1dfe4`) — linked to `Sand Grading`
- `Ms. Rooshe` (id `7e682764`) — linked to `Gutters & Garbage Houses`
- `Lolly & David` (id `b9f3c717`) — linked to both "Off The Reef" projects. Surnames now known (Van Sickle, Merrell) but pairing to first names is not — waiting on Lamar to confirm before either the client record or its two project syncs can be finalized.
- `Crhis` → `Chris` (row 1 fixes the typo) — surname still unknown.

**Confirmed, no action needed:** `Sineus` (id `3a9421a7`) is Wallace's own owner-build project, not a data-entry slip — leaving as-is.

**`projects.client_id`:** `1-Car Detached Garage — Twin Coves area` (id `5db053ce`) has no client and its own `client_name` says "TBD — Twin Coves area inquiry" — reads as a genuinely unresolved inquiry. Needs a real client assigned once known.

**Vendor rename needing confirmation:** see Section 3b — `Unique's Hardware Store` (`vendors`) vs. `UNIQUE HARDWARE & LUMBER` (`receipts.vendor`, 3 occurrences). Held pending Lamar confirming it's one business.

**Project locations** (currently "Nassau, Bahamas", believed wrong, real site unknown): `Beam & column repair`, `Masonry Repairs`, `Office Doors Replacement`, `Chris Property`.

**Purchase orders, all 4 held (none linked):**
- PO-76228349 (2026-03-23, Lord Byron, "Paint Stripper") — held per Lamar's instruction even though same-day co-occurrence with two other POs already linked to `Off the Reef - Light Renovations` (`ca56f7c4`) made it look inferable; linking it would move cost onto that already-completed job's margin, so it's grouped with the other ambiguous POs below instead.
- PO-70228612 (2025-09-23, Lord Byron, ~$702 lumber) — candidates: `Twin Coves Beach, Lot #227` or `Laundromat` (both active with no end date at that time)
- PO-70397968 (2025-09-26, Lord Byron, ~$473 lumber/hardware) — same two candidates
- PO-97823564 (2026-01-09, Lord Byron, tile mortar) — candidates: `Twin Coves Beach, Lot #227`, `Laundromat`, or `Chris Property` (all open at that time)

**Receipts, ambiguous project match** (all `project_id = NULL`):
- `1620e327` — Lord Byron, $60.00, 2025-06-15 — candidates: `Twin Coves Beach, Lot #227` or `Laundromat` (both started within the prior 2 days)
- `02121c84` — Lord Byron, $288.67, 2026-06-10 — candidates: `Sand Grading`, `1-Car Detached Garage`, or `2026 Site Improvements` (all started 2026-06-04)
- `338d6b1a` — Buywise Hardware & Appliance, $380.95, 2026-06-11 — same 3 candidates as above; also note "Buywise Hardware & Appliance" isn't in `vendors` or `vendor_directory` at all
- `7f76d7f6` — Unique Hardware & Lumber, $235.34, 2026-07-09 — 4+ projects were active that week (Blue Sky Villa, Off The Reef Phase 2, Tropical Impulse Kitchen/Showers, SHOWER DEMOLITION)
- `8cfb9010` — Unique Hardware & Lumber, $155.10, 2026-07-09 — same as above
- `d125e844` — Unique Hardware & Lumber, $19.00, 2026-08-07 — several long-running projects were active; nothing narrows it down

**`vendor_directory` table itself:** confirmed nothing in the schema references it (no foreign keys point to it). Looks like a defunct or parallel vendor list that never got wired up. Whether to retire it, migrate its 8 rows into `vendors`, or start actually using it is a schema/workflow decision outside this task's scope.

**Report-only findings (no action taken, none requested):**
- 10 of 14 clients have no email address (confirmed: only Brent Fox, Kelly & Shane Jensen, Mr. Jeff Christiansen, and Mr. Richard Parks have one on file).
- One existing email value looks malformed: client `Mr. Jeff Christiansen & Mrs. Debbie Christiansen` has `email = "jcsnook@aol.com; ck.goodlife23"` — the second address has no domain. Flagging for Lamar to correct with the real address; not guessing it.
- 8 projects have no budget set (`budget = 0.00`): Beam & column repair, Capricorn, Chris Property, Laundromat, Masonry Repairs, Office Doors Replacement, Sotheby's Caretaking Properties, Tropical Impulse - Ceilings Sanded/Caulked/Primed/Painted.
- All 6 `receipts` rows have `image_url = 'uploaded'` (a literal placeholder string, not a real path). Checked Supabase storage: one bucket, `documents`, containing 10 objects under `receipts/`, but all of them are OCR uploads tied to **`purchase_orders.receipt_image_path`** (2 POs currently reference one each: PO-70228612 and PO-97823564) — none of the 10 stored files correspond to the `receipts` table. No actual receipt images exist anywhere for any of those 6 `receipts` rows; the upload step appears to have written the string "uploaded" instead of a real storage path. This looks like an app bug worth a developer's attention, not a data-fix.
- `material_price_history` is confirmed empty (0 rows) despite receipts and purchase orders existing with pricing data.

---

## Summary

- **29 proposed field-level edits** ready to apply on approval: `clients` (4, Section 1), `projects` (18, Section 2), `vendors`/`receipts` typo-and-backfill fixes (7, Section 3a).
- **4 additional edits held pending a separate confirmation** (Section 3b — vendor identity rename, `Unique's Hardware Store` / `Unique Hardware & Lumber`).
- **Zero rows deleted, merged, or removed.**
- **Zero rows touched in any off-limits table** (`invoices`, `invoice_line_items`, `payments`, `payroll_entries`, `pay_periods`, `payment_transactions`, `payroll_adjustments`, `time_entries`, `estimates`, or any money/budget/rate field).
- 4 client names/pairings, 1 project's client link, 4 project locations, 4 purchase orders (all held together per Lamar's instruction), and 6 receipts are listed in Section 6 as needing Lamar's judgment rather than a guess.

**Waiting for approval before applying anything.**
