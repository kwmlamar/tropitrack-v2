"use client";

import Link from "next/link";
import { BedrockIcon } from "@/components/icons/bedrock-icon";
import { cn } from "@/lib/utils";

/**
 * Opens the assistant on a new thread with the question already written and the
 * right skill pill selected.
 *
 * 52 of the 70 threads ever started died after a single exchange, and 13 never
 * got a reply at all. A blank box next to a screen full of context is most of
 * the reason: the user has to retype what they are already looking at. This
 * carries the ids across so the first message is a real question about a real
 * row.
 *
 * The seeded text is placed in the composer, not sent. Navigating to a page
 * should never spend money on an API call the user did not ask for — they press
 * enter, as they would on anything they typed themselves.
 */
export function AskAboutThis({
  skill,
  question,
  label = "Ask about this",
  className,
}: {
  /** Skill pill to pre-select: payroll | timesheet | receipts | job_status. */
  skill: string;
  /** First message. Include ids — the assistant resolves them against the ledger. */
  question: string;
  label?: string;
  className?: string;
}) {
  const href = `/assistant?skill=${encodeURIComponent(skill)}&ask=${encodeURIComponent(question)}`;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 text-[12px] font-medium text-foreground-lighter transition-colors hover:text-foreground-light",
        className
      )}
    >
      <BedrockIcon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </Link>
  );
}
