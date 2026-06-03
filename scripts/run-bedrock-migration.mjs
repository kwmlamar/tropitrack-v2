// One-time migration script — run with: node scripts/run-bedrock-migration.mjs
// Applies all Bedrock tables to the live Supabase project.
// Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");
  process.exit(1);
}

// Split into individual statements so we can report progress
const STEPS = [
  {
    name: "Create gantt_phases",
    sql: `CREATE TABLE IF NOT EXISTS gantt_phases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  order_index   integer NOT NULL DEFAULT 0,
  planned_start date,
  planned_end   date,
  actual_start  date,
  actual_end    date,
  progress      integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  crew_size     integer,
  notes         text,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create materials",
    sql: `CREATE TABLE IF NOT EXISTS materials (
  id            text PRIMARY KEY,
  division_code text NOT NULL,
  division_name text NOT NULL,
  category      text NOT NULL,
  name          text NOT NULL,
  unit          text NOT NULL,
  unit_cost     numeric(10,2) NOT NULL CHECK (unit_cost >= 0),
  supplier      text,
  notes         text,
  updated_at    date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create receipts",
    sql: `CREATE TABLE IF NOT EXISTS receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  submitted_by  uuid,
  image_url     text NOT NULL,
  vendor        text,
  receipt_date  date,
  total_amount  numeric(10,2),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create receipt_line_items",
    sql: `CREATE TABLE IF NOT EXISTS receipt_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id        uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  material_id       text REFERENCES materials(id) ON DELETE SET NULL,
  receipt_name      text NOT NULL,
  qty               numeric(10,3),
  unit              text,
  unit_cost         numeric(10,2),
  total_cost        numeric(10,2),
  match_confidence  text CHECK (match_confidence IN ('high','medium','low','none')),
  applied           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create exports",
    sql: `CREATE TABLE IF NOT EXISTS exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  export_type   text NOT NULL CHECK (export_type IN ('estimate','payroll','progress','timesheet')),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  file_url      text NOT NULL,
  file_name     text NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create company_docs",
    sql: `CREATE TABLE IF NOT EXISTS company_docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  title         text NOT NULL,
  doc_type      text NOT NULL DEFAULT 'note' CHECK (doc_type IN ('compass','sop','goal','note')),
  content       text NOT NULL DEFAULT '',
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create business_goals",
    sql: `CREATE TABLE IF NOT EXISTS business_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','paused')),
  target_date   date,
  progress      integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  notes         text,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)`
  },
  {
    name: "Create indexes",
    sql: `
CREATE INDEX IF NOT EXISTS idx_gantt_phases_project   ON gantt_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_gantt_phases_company   ON gantt_phases(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_division     ON materials(division_code);
CREATE INDEX IF NOT EXISTS idx_receipts_company       ON receipts(company_id);
CREATE INDEX IF NOT EXISTS idx_receipts_project       ON receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt  ON receipt_line_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_exports_company        ON exports(company_id);
CREATE INDEX IF NOT EXISTS idx_company_docs_company   ON company_docs(company_id);
CREATE INDEX IF NOT EXISTS idx_business_goals_company ON business_goals(company_id)
`
  },
  {
    name: "Grant permissions",
    sql: `
GRANT SELECT, INSERT, UPDATE, DELETE ON gantt_phases       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON materials          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipts           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipt_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exports            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_docs       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON business_goals     TO authenticated;
GRANT SELECT ON materials TO anon
`
  },
  {
    name: "Reload PostgREST schema",
    sql: `NOTIFY pgrst, 'reload schema'`
  },
];

async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "params=single-object",
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

// Use the pg-based approach via supabase's sql endpoint
async function execSQL(sql, name) {
  try {
    // Try Supabase's pg endpoint
    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✓ ${name}`);
      return true;
    } else {
      console.log(`  ✗ ${name}: ${text.slice(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("Bedrock migration — applying to live Supabase project...\n");

  let success = 0;
  for (const step of STEPS) {
    const ok = await execSQL(step.sql, step.name);
    if (ok) success++;
  }

  console.log(`\n${success}/${STEPS.length} steps completed.`);
  if (success < STEPS.length) {
    console.log("\nSome steps failed. The /pg/query endpoint may not be available.");
    console.log("In that case, paste supabase/migrations/20260602_bedrock_setup.sql");
    console.log("into your Supabase Dashboard → SQL Editor and run it there.");
  }
}

main().catch(console.error);
