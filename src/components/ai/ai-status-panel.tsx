"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface HealthPayload {
  ok: boolean;
  provider: string;
  model: string;
  key_present: boolean;
  latency_ms: number;
  checked_at: string;
  failure?: { reason: string; message: string };
}

interface Spend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  since: string;
}

/**
 * Is the assistant alive, and what has it cost this month?
 *
 * Between 2026-08-31 and 2026-09-05 the answer to the first question was "no"
 * and nobody could see it: there was no health check, no alert, no error
 * message, and no line anywhere naming the provider or the key. Six days and
 * nine unanswered messages later it was found by going looking.
 *
 * Both numbers below come from real sources — the health check makes an actual
 * provider call, and the spend figures are read out of audit_logs, which has
 * recorded every AI call with its duration since the tool registry shipped.
 *
 * Cost is deliberately shown as tokens with a rough dollar estimate clearly
 * labelled as such. A precise-looking figure derived from a hardcoded price
 * would be a worse lie than an honest approximation.
 */

/** Published gpt-4o pricing, USD per million tokens. Approximate by design. */
const RATE_INPUT_PER_MTOK = 2.5;
const RATE_OUTPUT_PER_MTOK = 10;

export function AiStatusPanel() {
  const { profile, session } = useAuth();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checking, setChecking] = useState(false);
  const [spend, setSpend] = useState<Spend | null>(null);

  const check = useCallback(async () => {
    if (!session?.access_token) return;
    setChecking(true);
    try {
      const res = await fetch("/api/ai/health", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setHealth(await res.json());
    } catch {
      setHealth({
        ok: false,
        provider: "openai",
        model: "unknown",
        key_present: false,
        latency_ms: 0,
        checked_at: new Date().toISOString(),
        failure: { reason: "network", message: "Could not reach the health check." },
      });
    } finally {
      setChecking(false);
    }
  }, [session?.access_token]);

  const loadSpend = useCallback(async () => {
    if (!profile?.company_id) return;
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("tool_name, result")
      .eq("company_id", profile.company_id)
      .eq("source", "ai")
      .gte("created_at", since.toISOString());
    if (error) {
      console.error("AI spend query failed:", error);
      return;
    }

    let calls = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCalls = 0;
    for (const row of data ?? []) {
      if (row.tool_name === "claude_chat") {
        calls += 1;
        const r = row.result as { input_tokens?: number; output_tokens?: number } | null;
        inputTokens += Number(r?.input_tokens ?? 0);
        outputTokens += Number(r?.output_tokens ?? 0);
      } else {
        toolCalls += 1;
      }
    }
    setSpend({ calls, inputTokens, outputTokens, toolCalls, since: since.toISOString().slice(0, 10) });
  }, [profile?.company_id]);

  useEffect(() => {
    loadSpend();
  }, [loadSpend]);

  const estimatedUsd =
    spend != null
      ? (spend.inputTokens / 1_000_000) * RATE_INPUT_PER_MTOK +
        (spend.outputTokens / 1_000_000) * RATE_OUTPUT_PER_MTOK
      : 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
          Assistant status
        </h3>
        <p className="mt-1 text-[11px] text-foreground-lighter">
          The assistant runs on OpenAI. This makes a real call to check it is actually
          answering — a key with no credit looks identical to a quiet day until you ask.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background px-4 py-3">
        {health ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  health.ok ? "bg-success-solid" : "bg-destructive-solid"
                )}
              />
              <span
                className={cn(
                  "text-[13px] font-medium",
                  health.ok ? "text-success" : "text-destructive"
                )}
              >
                {health.ok ? "Answering" : health.failure?.message ?? "Offline"}
              </span>
              {health.ok && (
                <span className="text-[11px] tabular-nums text-foreground-lighter">
                  {health.latency_ms}ms
                </span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {[
                ["Provider", health.provider],
                ["Model", health.model],
                ["API key", health.key_present ? "present" : "missing"],
                ["Failure reason", health.failure?.reason ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-foreground-lighter">{k}</dt>
                  <dd className="truncate tabular-nums text-foreground-light">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-[12px] text-foreground-lighter">Not checked yet.</p>
        )}

        <button
          onClick={check}
          disabled={checking}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-strong bg-surface-300 px-3 py-1.5 text-[12px] text-brand transition-colors hover:bg-surface-400 disabled:opacity-40"
        >
          {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {health ? "Check again" : "Check now"}
        </button>
      </div>

      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-foreground-lighter">
          AI this month
        </h3>
        <p className="mt-1 text-[11px] text-foreground-lighter">
          Read from the audit trail, which records every AI call with its input, result and
          duration. Since {spend?.since ?? "the 1st"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Conversations", value: spend ? String(spend.calls) : "—" },
          { label: "Tool calls", value: spend ? String(spend.toolCalls) : "—" },
          {
            label: "Tokens",
            value: spend ? (spend.inputTokens + spend.outputTokens).toLocaleString() : "—",
          },
          {
            label: "Est. spend",
            value: spend ? `~$${estimatedUsd.toFixed(2)}` : "—",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-foreground-lighter">
              {s.label}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold leading-none tabular-nums text-foreground">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-foreground-lighter">
        Spend is an estimate at published gpt-4o list pricing (${RATE_INPUT_PER_MTOK}/M input, $
        {RATE_OUTPUT_PER_MTOK}/M output) and is not a bill. Token counts before this change
        shipped were never recorded, so conversations from earlier in the month count as calls
        but contribute no tokens.
      </p>
    </div>
  );
}
