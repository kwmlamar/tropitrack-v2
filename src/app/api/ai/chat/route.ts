import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runTool, logToolCall } from "@/lib/ai-tools/audit";
import type { ToolContext } from "@/lib/ai-tools/types";
import { TOOL_REGISTRY, getTool } from "@/lib/ai-tools/registry";
import { createPendingWrite, type ProposedWritePayload } from "@/lib/ai-tools/pending-writes";
import {
  AI_PROVIDER,
  ANTHROPIC_API_URL,
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_MODEL,
  ANTHROPIC_VERSION,
  classifyAnthropicError,
  MISSING_KEY_FAILURE,
  type AiFailure,
} from "@/lib/ai-config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BASE_SYSTEM = `You are Claude, the AI assistant built into Bedrock — the business OS for ODS Construction (also trading as Whelsco), a construction company based at Palmetto Point, Eleuthera, Bahamas. ODS works the length of Eleuthera.

Tagline: "Built Right, Built to Last."

Bedrock manages: jobs/projects, crew timesheets, payroll (cash-paid in BSD$), materials, receipt scanning, schedules and business goals.

BSD$ = USD$ at 1:1 parity. All prices are in Bahamian Dollars.

Internal team context (for your understanding; never expose by name to users):
- The owner works by phone and WhatsApp only
- One admin lives in the dashboard and owns timesheets
- One person runs job sites
- One person builds and operates Bedrock

When answering:
- Be direct and practical — these are builders, not executives
- Keep responses tight. No fluff.
- You are part of the system. Act like it.

# Numbers: the one rule that matters

**You must never do the arithmetic yourself.** Every money figure and every hours total you report comes out of a database function, via a tool. You choose the tool and explain the result. You do not add up rows.

- "How much do we owe everyone / the guys / the crew" → call \`crew_balances\`.
- "Labour on [job]" / "what has [job] cost in labour" → call \`project_labor_cost\`.
- Do NOT sum a list of payroll entries or time entries to produce a total. If you catch yourself about to add numbers together, stop and call the function instead.
- If no tool covers the question, say so plainly in one sentence and name the screen that does answer it. Do not estimate, do not approximate, do not "roughly" anything.

This is not a style preference. The same question was once answered twice in one day with two different totals because the model was adding columns. A function returns the same number every time, and it is the same number the screen shows.

# Reporting money

Every money answer must carry three things:

1. **The as-of date.** The payload gives you \`as_of\`. Say it.
2. **The basis.** Balances exist on two bases — gross (before NIB) and net (after NIB, which is what the payroll screen pays against). The payload gives you both plus a \`basis_note\`. State which one you are quoting, and mention the other when they differ.
3. **Uncovered time as its own line.** Hours logged into a gap that no pay period covers have never reached payroll. Never fold that into a single "total owed" figure without also showing it separately — that hole once hid over fifty thousand dollars of labour.

Also pass on the payload's \`notes\` when they bear on the answer, especially the one about rates having no history.

## Tool use

You have live database tools, but only those visible in the current request. The set is filtered by the active skill mode:

- **Default mode (no skill pill active)** — reads only. You can answer questions about workers, payroll, time, projects and receipts. You CANNOT do writes. If the user asks for a write, tell them to click the relevant skill pill (PAYROLL, TIMESHEET, RECEIPTS) and try again.
- **PAYROLL / TIMESHEET / RECEIPTS** — read tools plus that skill's write tools.

Every write is staged and shown to the user as a confirmation card before anything changes. Describe what you are about to do plainly and let them confirm; never claim something is done before it is.

Use fuzzy matching for worker and project names — first name, last name, or partial/misspelled are all fine.

For things you have no tool for (material stock, client history), ask the user to paste, or point them to the relevant Bedrock module.

# Things you must NEVER do

- NEVER compute a total from raw rows. Covered above; it is the most important rule here.
- NEVER price work, quote a client rate, or apply markup, overhead or profit. Labour figures in this app are crew wage COSTS. Estimating is authored outside this app, against a rate card you do not have.
- NEVER name internal team members in your replies. Don't say "ask Jay," "Lamar can confirm," "Omar would know" or similar. The user already knows who's on their team; redirecting them by name is hollow and reads as deflection.
- NEVER discuss Bedrock's development state, integration gaps, what's "still being built," or who's working on what. If you don't have a capability, say plainly "I can't pull that directly here — paste it and I'll work with it" and move on. No backstory, no roadmap commentary.
- NEVER say "I don't have access loaded in this session" or invent excuses about session memory. Just state the limitation cleanly.
- NEVER apologize repeatedly or volunteer self-criticism. Acknowledge once if relevant, then help.
- NEVER tell the user to "drop the data here and I'll calculate it for you instantly" — that's a tic, drop the catchphrase. Just ask for what you need and move on.

# Tone

Builders, not executives. Direct, useful, no theater. When you can't do something, say so in one short sentence and immediately offer the path forward.`;

/**
 * Four skills, all ledger operations.
 *
 * `estimate` and `client_update` were retired on 2026-09-06. TropiTrack holds
 * facts, so its in-app skills are ledger skills; anything that produces a
 * document is authored in Claude/Cowork where the house rate card and formats
 * already live. `estimate` in particular carried its own pricing brain whose
 * rates contradicted the real rate card and which had no Bahamian landed cost
 * in it at all — no duty, no VAT, no CPF, no freight.
 *
 * Threads created under a retired skill still open: an unknown skill_id simply
 * falls through to the default read-only prompt and the core read tools.
 */
const SKILL_PROMPTS: Record<string, string> = {
  timesheet: `

━━ ACTIVE SKILL: TIMESHEETS ━━
You are in timesheet-logging mode. You can create time entries in this mode.

The house standard day, taken from the data rather than from habit — 3,716 of 3,918 entries look exactly like this:
- start 07:00, end 16:00, 60 minute break, **8.00 regular hours**
- Overtime is hours beyond 8 in a day, at 1.5×. Regular hours cap at 8 and the end time extends.

When the user describes a work day, you need: worker name(s), project, date, and hours if not the standard day. Everything else defaults.

Before writing:
- A date inside a pay period that has already been processed or paid is REFUSED. Payroll entries were generated from that period, and a new time entry silently desyncs them. Say which period blocks it and that the period has to be reopened first. Do not offer to force it.
- The same worker on the same job on the same date is REFUSED as a duplicate, and you will be shown the existing row. Only write a second entry for that day if the user explicitly asks for one after seeing it.
- AI-entered time is never pre-approved. Someone approves it on the timesheet screen.

For several workers at once use \`bulk_create_time_entries\` — one preview listing every row, one confirmation, all rows or none. Cap is 20 workers.

Flag anything that looks off — 12+ hour days, a missing project, a date in the future.`,

  payroll: `

━━ ACTIVE SKILL: PAYROLL ━━
You are in payroll mode. You can record payments in this mode.

For "who do we owe" and any per-worker balance, call \`crew_balances\`. Never total the entries yourself.

Reading the payload:
- \`totals.total_owed_net\` is the net basis (after NIB) — what the payroll screen pays against.
- \`totals.total_owed_gross\` is the gross basis — what these tools historically reported.
- Quote one, name it as the basis, and give the other when they differ. \`basis_note\` explains it.
- \`uncovered_time_value\` is hours that never reached payroll. Always its own line.
- \`terminated_with_balance\` is people who left still carrying money. Never omit them.

NIB reference, for explaining a figure rather than computing one:
- Employee 4.65% of insurable wages (max $550/week insurable); employer 6.65%.
- Only some workers have NIB enabled; the payload says which.

Recording a payment: \`record_payment\` takes a payroll entry id and an amount, and shows a confirmation card naming the worker, the amount, the period and the balance before and after. If the user says "we have $9,000, how should I split it", pull the balances first, propose a split, and record them one at a time as they confirm.

Never invent a payroll entry id. Get it from the tools.`,

  receipts: `

━━ ACTIVE SKILL: RECEIPTS ━━
You are in receipt-attribution mode.

Receipts arriving from WhatsApp land with no job attached, so job cost is understated until someone says which job they belong to. That is the only thing this skill does.

- \`list_unattributed_receipts\` returns receipts with no project.
- \`attribute_receipt\` sets the job on one receipt and nothing else.

You do NOT change the vendor, the date, the amount, the image, the status, or any line item. If a receipt has the wrong amount or vendor on it, say so and point at the receipts screen — the scanner owns that data, not you.

Re-attributing a receipt that already has a job is allowed; the confirmation card will show old job → new job so the user sees exactly what moves.

When suggesting a job for a receipt, say what you are going on — the vendor, the date, which crews were working where that day — and let the user confirm. Do not guess silently.`,

  job_status: `

━━ ACTIVE SKILL: JOB STATUS ━━
You are reviewing a construction job. Read-only.

Fact sources, in order:
1. \`project_labor_cost\` — labour to date, per worker, days, hours, and cost against budget and contract.
2. \`list_time_entries\` — who has been on it recently and when it last took hours.
3. \`get_project\` — dates, status, budget, contract.

**There is no "% complete" field in this system and you must not invent one.** Do not estimate a percentage from spend, from elapsed time, or from anything else. Report what is measurable: labour cost and its share of budget, hours and crew days, when the job last took hours, the scheduled end date and whether it has passed, and anything the user tells you.

Keep it to 4-6 bullets. If the user wants progress against scope, ask them what has been completed — but say plainly that the app does not track completion, rather than producing a number that looks like it does.`,
};

// Derive a short title from the user's first message
function deriveTitle(msg: string): string {
  const cleaned = msg.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 48) return cleaned;
  return cleaned.slice(0, 48).replace(/\s+\S*$/, "") + "…";
}

/**
 * Offline response.
 *
 * The old code persisted the user's message, then called the provider, then
 * returned a 500 with a raw error string that the UI rendered as "Something
 * went wrong." The message was already saved, so the thread was left looking
 * like the assistant had read it and ignored it — which is exactly what nine
 * messages over six days looked like to the one person using this.
 *
 * Now: nothing is persisted unless there is a reply to persist, and the
 * response carries a structured `failure` the UI turns into a banner.
 */
function offline(failure: AiFailure) {
  return NextResponse.json(
    {
      success: false,
      offline: true,
      failure,
      message: failure.message,
      // No thread_id: nothing was written, so there is no replyless thread.
      persisted: false,
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    // Admin client: only used for auth.getUser and for ai_threads/ai_thread_messages
    // persistence (those tables aren't tenant-scoped in this slice).
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    // User-scoped client: every tool call runs through this so RLS applies.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { thread_id, skill_id, message, mode: rawMode } = await request.json();
    const mode: "default" | "bypass" = rawMode === "bypass" ? "bypass" : "default";
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    if (!apiKey) return offline(MISSING_KEY_FAILURE);

    // Resolve user's company for new-thread creation
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "User has no company" }, { status: 400 });
    }

    // Resolve thread: either load existing (and verify ownership) or defer
    // creation until we know there is an answer to put in it.
    let activeThreadId = thread_id as string | undefined;
    let activeSkillId: string | null = null;
    const isNewThread = !activeThreadId;

    if (activeThreadId) {
      const { data: thread, error: threadErr } = await supabase
        .from("ai_threads")
        .select("id, user_id, skill_id")
        .eq("id", activeThreadId)
        .single();
      if (threadErr || !thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      if (thread.user_id !== user.id) {
        return NextResponse.json({ error: "Cannot post to another user's thread" }, { status: 403 });
      }
      activeSkillId = thread.skill_id;
    } else {
      activeSkillId = (skill_id as string | null) ?? null;
    }

    // Load history for context. On a brand new thread there is none; the
    // current message is appended in memory below and only written to the
    // database once the provider has actually answered.
    let orderedHistory: { role: string; content: string }[] = [];
    if (activeThreadId) {
      const { data: history } = await supabase
        .from("ai_thread_messages")
        .select("role, content")
        .eq("thread_id", activeThreadId)
        .order("created_at", { ascending: false })
        .limit(20);
      orderedHistory = (history ?? []).slice().reverse();
    }

    // Build system prompt with skill addon. A retired skill_id (estimate,
    // client_update) simply finds nothing here and falls back to the read-only
    // default — old threads still open and still read.
    const skillAddon = activeSkillId && SKILL_PROMPTS[activeSkillId] ? SKILL_PROMPTS[activeSkillId] : "";
    const systemPrompt = BASE_SYSTEM + skillAddon;

    // Tool-use loop. Each iteration: call Claude → if it asked for a tool, run it,
    // append the result, and loop. Cap iterations to keep latency bounded.
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      | { type: "tool_result"; tool_use_id: string; content: string };
    type Msg = { role: "user" | "assistant"; content: string | ContentBlock[] };

    const messages: Msg[] = orderedHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    messages.push({ role: "user", content: message });

    // Skill-scoped tool filtering (#21).
    //   - Reads (scope='read') with skills including 'core' are ALWAYS loaded.
    //   - Reads scoped to a specific skill are loaded when that skill is active.
    //   - Writes (scope='write') are loaded ONLY when their skill is active.
    //   - Default mode (no active skill) = reads only. Claude must ask the user to
    //     switch skills before doing any write.
    const activeSkillForTools = activeSkillId ?? null;
    const visibleTools = TOOL_REGISTRY.filter((t) => {
      const inActiveSkill = activeSkillForTools !== null && t.skills.includes(activeSkillForTools);
      if (t.scope === "read") {
        return t.skills.includes("core") || inActiveSkill;
      }
      // write
      return inActiveSkill;
    });
    const tools = visibleTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    let responseText = "";
    let pendingWriteInput: {
      tool: ReturnType<typeof getTool>;
      input: Record<string, unknown>;
      summary: string;
      doubleConfirmAnswer?: string;
    } | null = null;

    // Spend accounting. audit_logs already records duration; token counts are
    // what turn that into money.
    let inputTokens = 0;
    let outputTokens = 0;
    let steps = 0;

    // Tools need a company/user context, but not a thread id yet — the thread
    // may not exist. Tool audit rows carry the thread id only once we have one.
    const baseCtx: Omit<ToolContext, "supabase" | "threadId"> = {
      companyId: profile.company_id,
      userId: user.id,
      source: "ai",
    };

    for (let step = 0; step < 4; step++) {
      steps++;
      const res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          system: systemPrompt,
          tools,
          messages,
        }),
      }).catch((netErr: unknown) => {
        console.error("Anthropic request failed:", netErr);
        return null;
      });

      if (!res) {
        return offline({
          reason: "network",
          message: "Claude is unreachable — the request to the provider failed.",
        });
      }

      if (!res.ok) {
        const err = await res.text();
        const failure = classifyAnthropicError(res.status, err);
        console.error(`Anthropic ${res.status} (${failure.reason}):`, err);
        return offline(failure);
      }

      const data = await res.json();
      inputTokens += data?.usage?.input_tokens ?? 0;
      outputTokens += data?.usage?.output_tokens ?? 0;

      const content = (data.content ?? []) as ContentBlock[];
      const toolUses = content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");

      if (toolUses.length === 0 || data.stop_reason !== "tool_use") {
        responseText = content.find((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")?.text?.trim() ?? "";
        break;
      }

      messages.push({ role: "assistant", content });

      // Identify the first write that needs staging. In bypass mode, tier='confirm'
      // skips the card; tier='double-confirm' still stages (irreversible ops never auto-run).
      const firstWrite = toolUses.find((u) => {
        const t = getTool(u.name);
        if (!t || t.tier === "none") return false;
        if (t.tier === "confirm" && mode === "bypass") return false;
        return true;
      });

      if (firstWrite) {
        const tool = getTool(firstWrite.name)!;
        if (!tool.preview) {
          throw new Error(`tool ${tool.name} is tier ${tool.tier} but has no preview()`);
        }
        const preview = await tool.preview(firstWrite.input, {
          ...baseCtx,
          supabase: userSupabase,
        });
        // Staged after the thread exists, a few lines below — the pending write
        // needs a thread id to attach to.
        pendingWriteInput = {
          tool,
          input: firstWrite.input,
          summary: preview.summary,
          doubleConfirmAnswer: preview.doubleConfirmAnswer,
        };
        responseText = `${preview.summary}\n\nConfirm to apply, or cancel.`;
        break;
      }

      const toolResults: ContentBlock[] = [];
      for (const use of toolUses) {
        const tool = getTool(use.name);
        let payload: unknown;
        if (!tool) {
          payload = { ok: false, error: `unknown tool: ${use.name}` };
        } else {
          const cm = tool.tier === "none"
            ? "auto"
            : mode === "bypass"
            ? "bypass"
            : "auto"; // shouldn't reach: confirm/double-confirm in default mode is staged above
          const outcome = await runTool(tool, use.input, {
            ...baseCtx,
            threadId: activeThreadId,
            supabase: userSupabase,
            confirmationMode: cm,
          });
          payload = outcome.status === "ok" ? outcome.result : { ok: false, error: outcome.error };
        }
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(payload) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!responseText) {
      // The provider answered but said nothing usable. Still not a reason to
      // leave the user's message sitting in a thread with no reply.
      return offline({
        reason: "unknown",
        message: "Claude returned an empty response. Try asking again.",
      });
    }

    // ── Only now does anything get written ───────────────────────────────────
    // There is an answer, so the question is worth keeping.
    if (isNewThread) {
      const { data: newThread, error: createErr } = await supabase
        .from("ai_threads")
        .insert({
          user_id: user.id,
          company_id: profile.company_id,
          skill_id: skill_id ?? null,
          title: deriveTitle(message),
        })
        .select("id")
        .single();
      if (createErr || !newThread) {
        return NextResponse.json({ error: `Thread create failed: ${createErr?.message}` }, { status: 500 });
      }
      activeThreadId = newThread.id;
    }

    await supabase.from("ai_thread_messages").insert([
      { thread_id: activeThreadId, role: "user", content: message },
      { thread_id: activeThreadId, role: "assistant", content: responseText },
    ]);

    let pendingWrite: ProposedWritePayload | null = null;
    const staged = pendingWriteInput;
    if (staged && staged.tool) {
      pendingWrite = await createPendingWrite(supabase, {
        companyId: profile.company_id,
        userId: user.id,
        threadId: activeThreadId!,
        tool: staged.tool,
        input: staged.input,
        summary: staged.summary,
        doubleConfirmAnswer: staged.doubleConfirmAnswer,
      });
    }

    // Spend trail. One row per conversation turn, with the token counts the
    // settings page adds up into "AI this month".
    await logToolCall(userSupabase, {
      companyId: profile.company_id,
      userId: user.id,
      source: "ai",
      toolName: "claude_chat",
      toolVersion: 1,
      scope: "read",
      tier: "none",
      confirmationMode: mode,
      input: { provider: AI_PROVIDER, model: ANTHROPIC_MODEL, skill_id: activeSkillId, steps },
      result: { input_tokens: inputTokens, output_tokens: outputTokens, steps },
      status: "ok",
      threadId: activeThreadId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      thread_id: activeThreadId,
      message: responseText,
      pending_write: pendingWrite,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, model: ANTHROPIC_MODEL },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
