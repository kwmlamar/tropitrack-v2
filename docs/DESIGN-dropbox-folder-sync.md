# Design — Dropbox Folder Sync on Project Creation

**Status:** design only, not built. **Do not implement from this document without the owner's sign-off on the open decisions in §6.**

## 1. Goal

When a `projects` row is created in TropiTrack (via the UI or the new `POST /api/projects` from
[docs/AGENT-BRIEF-payperiod-autocreate.md](./AGENT-BRIEF-payperiod-autocreate.md)), a matching folder
tree should appear in Dropbox automatically, so a job never has a TropiTrack record with no
corresponding project folder (or vice versa).

## 2. Why this is deferred, not built

The owner has not settled on a single folder convention — there are currently **two competing ones in
use** in the existing Dropbox. Building the sync now would encode whichever convention we guess at into
every new job going forward, and picking wrong is expensive to undo (renaming Dropbox folders that
client-facing links may already point to). This is a money-adjacent decision the same way the four
historical pay-period gaps are: it needs the owner, not an automation, to make the call once.

## 3. Trigger: Supabase Database Webhook on `projects` INSERT

Supabase Database Webhooks (`supabase_functions.http_request` under the hood) fire on a table event and
POST a payload to an HTTP endpoint — here, an edge function.

```sql
-- Illustrative only — not applied by this design doc.
create trigger trg_projects_dropbox_sync
after insert on public.projects
for each row
execute function supabase_functions.http_request(
  'https://<project-ref>.supabase.co/functions/v1/dropbox-folder-sync',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
```

Using `AFTER INSERT` (not `BEFORE`) means the `projects` row and its `id` already exist and are
committed by the time the webhook fires — the edge function can safely write `projects.dropbox_folder_path`
back once the folder is created, without racing the insert itself.

Rename handling (§7) additionally needs an `AFTER UPDATE OF name` trigger on the same table, filtered to
rows where `name` actually changed (`WHEN (OLD.name IS DISTINCT FROM NEW.name)`).

## 4. Edge function shape: `dropbox-folder-sync`

Same shape as the existing functions in `supabase/functions/` (`send-invoice`, `send-estimate`,
`send-invitation-email`): a Deno `serve()` handler, a service-role Supabase client, no logic beyond
"do the one external side effect and report success/failure."

```
supabase/functions/dropbox-folder-sync/index.ts
```

Payload (from the Database Webhook):

```jsonc
{
  "type": "INSERT",
  "table": "projects",
  "record": { "id": "...", "name": "...", "client_id": "...", "status": "...", "company_id": "..." },
  "old_record": null
}
```

Handler outline:

1. Verify the webhook's shared secret (Supabase Database Webhooks support a custom header — e.g.
   `X-Webhook-Secret` — checked against an env var; this is a HMAC-style shared secret, not the Dropbox
   token, and is cheap to rotate independently).
2. Look up the client's display name (`clients.name` via `record.client_id`) for the folder name template
   (§5).
3. Call the Dropbox API (`files/create_folder_v2`, then repeat for subfolders — or a single batched
   `files/create_folder_batch`) to build the template tree under the configured root.
4. On success, `UPDATE public.projects SET dropbox_folder_path = ... WHERE id = record.id` (a new,
   nullable column — see §8) so TropiTrack knows where the folder lives without re-deriving the path
   from the name every time (names change; the path that's already live in Dropbox doesn't, until a
   rename is explicitly handled — see §7).
5. On failure (Dropbox API error, already-exists conflict, auth failure), log and return a non-2xx —
   Database Webhooks do not retry automatically, so a failed sync needs to show up somewhere a human
   will see it (the dashboard's Needs Attention panel is the natural home, following the same pattern as
   the other checks in `dashboard_summary`).

## 5. Folder template

Not yet decided (§6.1), but structurally, whichever convention wins should be expressed as a single
ordered list of relative subpaths the function iterates over, e.g.:

```ts
const FOLDER_TEMPLATE = [
  "", // the project root folder itself
  "01 - Contracts",
  "02 - Drawings",
  "03 - Permits",
  "04 - Photos",
  "05 - Invoices & Receipts",
  "06 - Correspondence",
];
```

The root folder name itself is a template string, e.g. `` `${project.name} — ${client.name}` `` or
`` `${YYYY}-${sequence} ${project.name}` `` depending on which of the two existing conventions (or a
third, reconciled one) the owner picks.

## 6. Open decisions for the owner

1. **Which folder convention wins** — the two currently in use, or a new one. This is the actual blocker
   on building this; everything else in this document can be built once this is answered.
2. **Root location** — a single shared "Projects" folder, one per client, or one per year — affects the
   template's root-path prefix.
3. **What happens to jobs that already have a Dropbox folder under either existing convention** — this
   design only covers *new* projects going forward; reconciling existing folders is a separate, larger
   piece of work (and itself a money/time decision, not something to fold in silently here).

## 7. Renames

If `projects.name` changes after the folder already exists, the safest default is: **do not move or
rename the Dropbox folder automatically.** A silent rename risks breaking any link a client, sub, or
invoice already has into that folder. Instead, the `AFTER UPDATE OF name` trigger should surface a
Needs-Attention-style prompt ("job renamed, Dropbox folder still called '<old name>' — rename it?") and
require a human click-through to actually invoke the Dropbox `files/move_v2` call. This mirrors the
project's existing philosophy of detect-and-report over automate-and-hope for anything that touches
external, hard-to-reverse state (the same posture taken with the four historical pay-period gaps and the
April 3 overlap in the sibling brief).

## 8. Where the Dropbox token lives

- The Dropbox API token is a long-lived OAuth refresh token (or a scoped app token), stored in **Supabase
  Vault**, the same mechanism already used for the pay-period cron's `project_url`/`publishable_key`
  secrets (see `supabase/migrations/20260905120100_pay_period_autocreate_cron.sql`) — created once via
  the Supabase SQL editor (`select vault.create_secret('<dropbox-token>', 'dropbox_api_token');`), never
  committed to a migration file.
- The edge function reads it via `select decrypted_secret from vault.decrypted_secrets where name =
  'dropbox_api_token'` through its service-role Supabase client at request time — it is never exposed to
  the browser or embedded in any client-side code.
- A new nullable column, `public.projects.dropbox_folder_path text`, records the created folder's path
  once known. Additive migration, no backfill of existing rows (consistent with the rest of this work —
  historical projects are a separate, human decision, per §6.3).

## 9. Explicitly out of scope for this document

- No Dropbox API calls, credentials, or folder creation happen anywhere in this repository as a result of
  this design doc.
- No migration in this branch adds the `dropbox_folder_path` column, the webhook trigger, or the
  `dropbox-folder-sync` function — those ship in a follow-up once §6 is answered.
