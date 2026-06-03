import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BASE_SYSTEM = `You are Claude, the AI assistant built into Bedrock — the business OS for ODS Construction (also known as Whelsco), a construction company based in central Eleuthera, Bahamas.

You help the ODS team — Wallace Sr. (owner), Jay (admin), Omar (site foreman), and Lamar (operator) — run their business more efficiently.

ODS runs:
- SB Construction: active construction jobs across Eleuthera
- A laundromat currently under build-out (top priority for Wallace Sr.)
- Maple House property

Bedrock manages: jobs/projects, crew timesheets, payroll (cash-paid in BSD$), materials (Eleuthera pricing DB), receipt scanning, Gantt charts, and business goals.

BSD$ = USD$ at 1:1 parity. All prices are in Bahamian Dollars.

Key people:
- Wallace Sr.: owner, phone/WhatsApp only, wants Sundays off, focused on finishing the laundromat
- Jay: dashboard admin, owns timesheets, disciplined
- Omar: runs job sites
- Lamar: builds and operates Bedrock

When answering:
- Be direct and practical — these are builders, not executives
- Keep responses tight. No fluff.
- You are part of the system. Act like it.`;

const SKILL_PROMPTS: Record<string, string> = {
  estimate: `

━━ ACTIVE SKILL: ESTIMATE BUILDER ━━
You are now in estimate-building mode for ODS Construction.

When the user describes a job, generate a structured estimate with:
- Trade sections in ALL CAPS (ROOF REPAIRS, MASONRY/CEMENT WORK, CARPENTRY, ELECTRICAL, GENERAL CONDITIONS, etc.)
- Line items per section: description | labor | material | equipment | total
- Eleuthera pricing: Nassau freight adds ~35% to mainland material prices
- Labor rates: General laborer BSD$15-18/hr, Skilled trades BSD$20-28/hr, Foreman BSD$25-32/hr
- Standard work day = 8hrs. Include crew-days per section.
- Subtotal → Overhead (15%) → VAT (10%) → Total Job Cost
- Present as a clean markdown table

After generating, ask: "Want me to adjust quantities, add a section, or draft this for the client?"
If asked to refine, do it. If asked for a PDF-ready version, format it cleanly.`,

  timesheet: `

━━ ACTIVE SKILL: TIMESHEETS ━━
You are in timesheet-logging mode.

Help the user log crew hours. When they describe a work day:
- Ask: worker name(s), project, date, start/end times, any breaks
- Standard day: 7am–4pm with 1hr lunch = 7 net hrs. OT starts after 8hrs at 1.5×.
- If multiple workers on same job, batch them together
- Output format: | Worker | Project | Date | Regular Hrs | OT Hrs | Notes |
- Flag if anything looks off (e.g. 12+ hour days, missing project)

If the user says "log [name] on [job] today" — fill in today's date automatically and use standard hours unless told otherwise.`,

  payroll: `

━━ ACTIVE SKILL: PAYROLL ━━
You are in payroll-calculation mode.

Help process or review ODS payroll:
- All amounts in BSD$ (= USD$)
- NIB (National Insurance Board) deductions:
  - Employee: 4.65% of insurable wages (max $550/week insurable)
  - Employer: 6.65% of insurable wages
- Workers are paid in cash, weekly or bi-weekly
- Formula: Gross Pay = (Regular hrs × rate) + (OT hrs × rate × 1.5)
- Net Pay = Gross - NIB Employee deduction

When given hours and a rate, calculate and show:
- Gross pay breakdown (regular + OT)
- NIB employee deduction
- NIB employer contribution (employer cost, not deducted from worker)
- Net pay to worker

If the user says "run payroll for [name]", ask for: dates covered, hours worked, hourly rate.`,

  client_update: `

━━ ACTIVE SKILL: CLIENT UPDATE ━━
You are drafting professional client updates for ODS Construction.

Write updates that:
- Are under 150 words
- Use plain English — no construction jargon
- Cover: what's been done, current status, what's next, anything needed from client
- Tone: professional but warm, like a Bahamian contractor who gets things done and respects the client's time

If the user gives you bullet points or rough notes, turn them into a polished WhatsApp/email message.
If they just say "write an update for [job]", ask: what was done this week, any issues, next steps.

Always end with the contractor's name or "ODS Construction" as the sign-off.`,

  job_status: `

━━ ACTIVE SKILL: JOB STATUS ━━
You are reviewing active construction job status.

When the user asks about a job:
- Focus on: % complete, phases done vs remaining, current phase, expected finish
- Flag anything that could cause delays: material delays, weather, crew shortages
- Keep it to 4-6 bullet points max — builders need facts, not reports
- If you don't have specific data, ask the user to tell you what's been completed

If asked to compare multiple jobs, use a simple table.`,
};

// Derive a short title from the user's first message
function deriveTitle(msg: string): string {
  const cleaned = msg.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 48) return cleaned;
  return cleaned.slice(0, 48).replace(/\s+\S*$/, "") + "…";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, message: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

    const { thread_id, skill_id, message } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Resolve user's company for new-thread creation
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "User has no company" }, { status: 400 });
    }

    // Resolve thread: either load existing (and verify ownership) or create new
    let activeThreadId = thread_id as string | undefined;
    let activeSkillId: string | null = null;

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
      const { data: newThread, error: createErr } = await supabase
        .from("ai_threads")
        .insert({
          user_id: user.id,
          company_id: profile.company_id,
          skill_id: skill_id ?? null,
          title: deriveTitle(message),
        })
        .select("id, skill_id")
        .single();
      if (createErr || !newThread) {
        return NextResponse.json({ error: `Thread create failed: ${createErr?.message}` }, { status: 500 });
      }
      activeThreadId = newThread.id;
      activeSkillId = newThread.skill_id;
    }

    // Persist the user's message
    await supabase.from("ai_thread_messages").insert({
      thread_id: activeThreadId,
      role: "user",
      content: message,
    });

    // Load recent history for context (last 20 messages, in order)
    const { data: history } = await supabase
      .from("ai_thread_messages")
      .select("role, content")
      .eq("thread_id", activeThreadId)
      .order("created_at", { ascending: false })
      .limit(20);

    const orderedHistory = (history ?? []).slice().reverse();

    // Build system prompt with skill addon
    const skillAddon = activeSkillId && SKILL_PROMPTS[activeSkillId] ? SKILL_PROMPTS[activeSkillId] : "";
    const systemPrompt = BASE_SYSTEM + skillAddon;

    // Call Anthropic
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: orderedHistory,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: false, message: `Claude API error: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    const responseText = data.content?.find((b: { type: string }) => b.type === "text")?.text?.trim();
    if (!responseText) throw new Error("No response from Claude");

    // Persist assistant response
    await supabase.from("ai_thread_messages").insert({
      thread_id: activeThreadId,
      role: "assistant",
      content: responseText,
    });

    return NextResponse.json({
      success: true,
      thread_id: activeThreadId,
      message: responseText,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
