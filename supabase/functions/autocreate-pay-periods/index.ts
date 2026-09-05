// Supabase Edge Function: Autocreate Pay Periods
//
// Invoked weekly by pg_cron (see supabase/migrations/20260905120100_pay_period_autocreate_cron.sql).
// For every company, walks forward from the latest non-voided pay_periods
// row's end_date to today, creating one 'open' period per week so a lapse
// self-heals on the next run instead of silently accumulating unpaid weeks
// (see docs/FINDINGS-labour-payroll-reconciliation.md).
//
// Deliberately narrow:
//  - Never reaches backward past a company's latest period, so it can never
//    backfill a historical gap — those are a money decision for the owner,
//    not an automation (see the brief, docs/AGENT-BRIEF-payperiod-autocreate.md).
//  - Only ever inserts into pay_periods. Never touches payroll_entries —
//    period creation is structural; running payroll stays human-triggered.
//  - A company with no existing pay period is skipped rather than guessed
//    at, since there's no prior boundary to anchor the Sat-Fri cadence to.
//  - The pay_periods_check_no_overlap trigger is the real safety net against
//    overlap; the forward-only walk (next start = previous end + 1 day) is
//    just what keeps this function from ever tripping it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const PERIOD_DAYS = 7;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface CreatedPeriod {
  company_id: string;
  start_date: string;
  end_date: string;
}

interface SkippedCompany {
  company_id: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment variables not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().slice(0, 10);

    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id");
    if (companiesError) throw companiesError;

    const created: CreatedPeriod[] = [];
    const skipped: SkippedCompany[] = [];

    for (const company of companies ?? []) {
      const { data: latest, error: latestError } = await supabase
        .from("pay_periods")
        .select("end_date")
        .eq("company_id", company.id)
        .is("voided_at", null)
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        skipped.push({ company_id: company.id, reason: latestError.message });
        continue;
      }
      if (!latest) {
        skipped.push({
          company_id: company.id,
          reason: "no existing pay period to anchor the weekly cadence to",
        });
        continue;
      }

      let nextStart = addDays(latest.end_date, 1);
      while (nextStart <= today) {
        const nextEnd = addDays(nextStart, PERIOD_DAYS - 1);
        const { error: insertError } = await supabase.from("pay_periods").insert({
          company_id: company.id,
          start_date: nextStart,
          end_date: nextEnd,
          status: "open",
        });

        if (insertError) {
          // Overlap-trigger rejection, a manual period created since we read
          // `latest`, or similar — stop this company's walk, not the run.
          skipped.push({ company_id: company.id, reason: insertError.message });
          break;
        }

        created.push({ company_id: company.id, start_date: nextStart, end_date: nextEnd });
        nextStart = addDays(nextEnd, 1);
      }
    }

    return new Response(JSON.stringify({ success: true, created, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Error autocreating pay periods:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
