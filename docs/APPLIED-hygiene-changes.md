# Applied Data Hygiene Changes — ODS Construction

Applied 2026-09-05, approved by Lamar Sineus against [docs/PROPOSED-hygiene-changes.md](PROPOSED-hygiene-changes.md) (Revision 2). Sections 1–3 (as written, plus Section 3b confirmed) were applied; Sections 4–5 had no edits to apply (everything in them was held — see [Section 6 of the proposal](PROPOSED-hygiene-changes.md#6-left-alone--needs-lamars-input)). Applied in 4 separate transactions, in dependency order: `clients` → `projects` → `vendors` → `receipts`. Every value below was re-verified against the live database immediately after commit.

Database: Supabase project `rrqpwtggiirexptnhyqy` (TropiTrack-V2), schema `public`.

---

## Transaction 1 — `clients` (committed first; Section 2 depends on it)

| Row ID | Field | Old value | New value |
|--------|-------|-----------|-----------|
| `574bbfad-ebfe-416c-9586-402c912d3346` | `name` | `Crhis` | `Chris` |
| `73382fc3-c594-4e42-857f-c7d2d6a9d93e` | `name` | `Eric` | `Eric & Robynn Mann` |
| `8aba6987-dba2-435e-b2fc-f4d6c6f67aa9` | `name` | `Sven` | `Sven Borho` |
| `837c7ea5-6639-4c21-be42-a9fa102b0d81` | `name` | `Broderick` | `Michael Broderick` |

## Transaction 2 — `projects` (client_name sync, using the corrected names above)

| Row ID | Project | Field | Old value | New value |
|--------|---------|-------|-----------|-----------|
| `2280ad46-f007-478c-996f-824238abe544` | 2026 Site Improvements — Governor's Harbour (Rev. 2) | `client_name` | `Jeff Christiansen` | `Mr. Jeff Christiansen & Mrs. Debbie Christiansen` |
| `3358dd68-862f-407a-b5f0-efc42535f7c7` | Blue Sky Villa — Great Room Flooring | `client_name` | `NULL` | `Eric & Robynn Mann` |
| `8639ca68-ae98-4a4f-9a79-40c96f3331e9` | Capricorn | `client_name` | `NULL` | `Sven Borho` |
| `3cccf944-ac51-42c3-8c83-428fd87fd71e` | Chris Property | `client_name` | `Crhis` | `Chris` |
| `11c8ef61-a747-4ada-a021-280917db519c` | Gutters & Garbage Houses | `client_name` | `NULL` | `Ms. Rooshe` |
| `c3e66b04-c73a-44bb-8397-ed738e896944` | Metal Roof Installalation & Old Roof Demolition | `client_name` | `NULL` | `Michael Broderick` |
| `3ceafb21-acc5-4cd4-ba0a-80282f8bc22e` | Off The Reef - Interior Renovation - Phase 2 | `client_name` | `NULL` | `Lolly & David` |
| `ca56f7c4-9e6f-4d62-b9ef-d47d7c1501c9` | Off the Reef - Light Renovations | `client_name` | `NULL` | `Lolly & David` |
| `45a43ae3-91f6-4c95-bf2e-860a3f8ad1a1` | Re-Roof Project - Tropical Impulse | `client_name` | `NULL` | `Mr. Richard Parks` |
| `02b2a539-a5d2-4dbe-98d1-48c86cff3126` | Sand Grading | `client_name` | `NULL` | `Banks` |
| `cceb5aa5-6584-453a-bbfa-c47e6ada9619` | SHOWER DEMOLITION, WATERPROOFING & RE-TILE | `client_name` | `NULL` | `Eric & Robynn Mann` |
| `da49e444-6327-4372-81b4-e606b4ecb89c` | Sotheby's Caretaking Properties | `client_name` | `NULL` | `George Damianos` |
| `8d02f44b-f2e6-4d84-9bf7-3f93ad74462e` | SunDancer - Great Room — Cathedral Ceiling & Trim, Painting | `client_name` | `NULL` | `George Damianos` |
| `7dab62b9-03be-4908-b5d4-a7fff637acc9` | Treasure Chest dock | `client_name` | `NULL` | `Kelly & Shane Jensen` |
| `b50ddb43-2c55-41fb-be6c-cae8ea513aae` | Wockenfuss Pool | `client_name` | `NULL` | `David & Michelle Wockenfuss` |
| `9e6e400e-a67e-4b68-8868-fde987e98b3d` | Tropical Impulse - Ceilings Sanded, Caulked, Primed, Painted White | `client_name` | `NULL` | `Mr. Richard Parks` |
| `0443a7a1-667f-4bea-97f7-4137fcb32166` | Tropical Impulse - Kitchen Remodel | `client_name` | `NULL` | `Mr. Richard Parks` |
| `3a01b60a-e44d-43af-9d7c-f442570d3578` | Tropical Impulse Showers | `client_name` | `NULL` | `Mr. Richard Parks` |

## Transaction 3 — `vendors`

| Row ID | Field | Old value | New value |
|--------|-------|-----------|-----------|
| `e077affb-3229-4f60-be90-0b99d8da1c33` | `name` | `Lord Byron Enterprise` | `Lord Byron Enterprises` |
| `e077affb-3229-4f60-be90-0b99d8da1c33` | `address` | `NULL` | `Queen's Highway, P.O. Box EL-25045, Governor's Harbour` |
| `e077affb-3229-4f60-be90-0b99d8da1c33` | `phone` | `NULL` | `(242) 828-3476` |
| `463d68a0-e5af-4915-8a0d-bfdbf8d95a23` | `name` | `Metal Master` | `Metal Masters` |
| `0511d2e2-b8eb-4736-a5f2-1efba6ba94d9` | `name` | `Mikro Coparation` | `Mikro Corporation` |
| `eae7f56c-5245-4400-935c-53b91e410ef8` | `name` | `Unique's Hardware Store` | `Unique Hardware & Lumber` *(Section 3b — confirmed by Lamar as one business)* |

## Transaction 4 — `receipts`

| Row ID | Field | Old value | New value |
|--------|-------|-----------|-----------|
| `1620e327-4d84-4c31-ad99-07a0365858d6` | `vendor` | `LORD BYRON ENTERPRISES` | `Lord Byron Enterprises` |
| `02121c84-7bb3-4a94-9a4e-37a8496aff03` | `vendor` | `LORD BYRON ENTERPRISES` | `Lord Byron Enterprises` |
| `7f76d7f6-a202-4e75-a543-ba291eb800c8` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` |
| `8cfb9010-e8d2-48ac-a2d1-9d1cbbd067c5` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` |
| `d125e844-0d17-4504-95f9-7ab0db1c6d15` | `vendor` | `UNIQUE HARDWARE & LUMBER` | `Unique Hardware & Lumber` |

**Total: 30 field-level edits across 4 tables, 5 transactions, all committed and re-verified** (29 from the approved Revision 2 proposal, plus 1 follow-up — see Transaction 5 below).

**Note on the original proposal's arithmetic:** Revision 2 said 24 of 25 projects had `client_id` populated — 5 already matching `client_name` + 18 needing a sync = 23, one short of 24. That uncaught gap is exactly how `b5da4de2` got missed. Worth reconciling category counts against the total before a proposal goes out next time.

---

## Untouched, as instructed (Section 6 held in full)

Nothing in the following was modified:
- Client names: `Banks`, `Ms. Rooshe`, `Lolly & David` (surname pairing still unconfirmed — Van Sickle / Merrell), and `Sineus` (confirmed correct — Wallace's own owner-build, not a data-entry slip).
- `projects.client_id` for `1-Car Detached Garage — Twin Coves area` (`5db053ce`) — still `NULL`.
- Project locations for `Beam & column repair`, `Masonry Repairs`, `Office Doors Replacement`, `Chris Property` — all still `Nassau, Bahamas`.
- All 4 ambiguous purchase orders (including PO-76228349, held per Lamar's instruction) — all still `project_id = NULL`.
- All 6 unlinked `receipts` rows — all still `project_id = NULL`.
- All 5 `invoices` rows missing a `project_id` — unchanged (out of scope).
- `vendor_directory` table — unchanged, still unreferenced by any foreign key.

## Verification — off-limits tables

Re-checked immediately after applying. Zero rows changed in any scope-boundary table:

| Table | Rows | Most recent activity timestamp | Notes |
|-------|------|-------------------------------|-------|
| `invoices` | 8 | 2026-09-03 21:42:49 UTC | Predates this session; row count unchanged from proposal baseline |
| `invoice_line_items` | 0 | — | Empty, unchanged |
| `payments` | 0 | — | Empty, unchanged |
| `time_entries` | 3,910 | 2026-09-04 17:55:03 UTC | Predates this session |
| `payroll_entries` | 375 | 2026-09-04 12:26:34 UTC | Predates this session |
| `pay_periods` | 36 | 2026-09-04 12:26:31 UTC | Predates this session |
| `payment_transactions` | 421 | 2026-09-04 20:32:45 UTC | Predates this session |
| `payroll_adjustments` | 1 | 2026-09-04 18:16:18 UTC | Predates this session |

No `budget`, `contract_value`, `total_amount`, `unit_cost`, or `hourly_rate` field was written to in any table. No row was deleted.

## Verification — every intended change landed

Re-ran the same queries used to build the original proposal against the post-apply database:
- `clients`: all 4 corrected names confirmed present; all other 10 rows unchanged.
- `projects`: all 18 `client_name` values confirmed synced to the corrected client names; the 5 already-consistent rows and the 1 client-less row (`5db053ce`) confirmed unchanged.
- `vendors`: all 3 renamed rows confirmed (`Lord Byron Enterprises`, `Metal Masters`, `Mikro Corporation`, `Unique Hardware & Lumber`), plus the address/phone backfill on Lord Byron; `Caribbean Coral Marble` unchanged.
- `vendor_directory`: all 8 rows confirmed unchanged (byte-for-byte match against the pre-apply snapshot).
- `receipts`: all 5 vendor-text rows confirmed normalized; `project_id` still `NULL` on all 6 rows (unchanged, as intended); `BUYWISE HARDWARE & APPLIANCE` row unchanged.
- `purchase_orders`: all 13 rows confirmed unchanged, including PO-76228349's `project_id` still `NULL`.

## Transaction 5 — `projects`, follow-up (found during verification, not in the approved proposal)

While re-running the verification query against `projects` after Transactions 1–4, one row surfaced that had been **missed from the original proposal entirely** — it was never listed in Revision 2, so it wasn't part of what was approved. Flagged separately, then approved on its own and applied here.

| Row ID | Project | Field | Old value | New value |
|--------|---------|-------|-----------|-----------|
| `b5da4de2-e2d0-40a2-a106-5f5da5f01e1f` | Master and Kid's Bathroom Shower Renovation | `client_name` | `NULL` | `Mr. Richard Parks` |

Same evidence as the other Richard Parks rows in Transaction 2: `client_id` (`6fbe9ede-1281-4e93-b698-c8e0a6c674fe`) matches `clients.name`. Verified post-commit: `client_id` and `client_name` both confirmed as shown above.

## Re-sync needed later

These 4 project rows now carry a `client_name` copied from a client record that is **itself still unresolved** (see Section 6 of the proposal). When Lamar finalizes those client names, these project rows will need a follow-up sync so `client_name` stays consistent with the corrected `clients.name`:

- **Sand Grading** (`02b2a539-a5d2-4dbe-98d1-48c86cff3126`) — currently `client_name = "Banks"`, pending resolution of client `Banks` (`31f1dfe4`).
- **Gutters & Garbage Houses** (`11c8ef61-a747-4ada-a021-280917db519c`) — currently `client_name = "Ms. Rooshe"`, pending resolution of client `Ms. Rooshe` (`7e682764`).
- **Off The Reef - Interior Renovation - Phase 2** (`3ceafb21-acc5-4cd4-ba0a-80282f8bc22e`) — currently `client_name = "Lolly & David"`, pending which of Van Sickle / Merrell pairs with which first name.
- **Off the Reef - Light Renovations** (`ca56f7c4-9e6f-4d62-b9ef-d47d7c1501c9`) — currently `client_name = "Lolly & David"`, same pending resolution as above.

## To reverse

Every "New value" above can be reverted to its paired "Old value" with a targeted `UPDATE ... WHERE id = '<row id>'`, in reverse order: `receipts` → `vendors` → `projects` → `clients` (undo any downstream project sync before reverting the client name it was derived from).
