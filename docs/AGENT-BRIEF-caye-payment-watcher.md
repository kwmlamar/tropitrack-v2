# Agent Brief — Caye: Payment Watcher (propose-only)

**Build location:** Caye's repo (not tropitrack-v2 — this file is here only because that repo isn't connected yet)
**Writes to:** TropiTrack / Bedrock — Supabase project `rrqpwtggiirexptnhyqy`
**Company:** ODS Construction, Eleuthera, Bahamas. All amounts BSD (1:1 USD).

---

## What this is

ODS has no record of client payments. `payments` has **zero rows**, every invoice reads `amount_paid = 0.00`, and the app therefore believes $94,178.46 is outstanding and nothing was ever collected. The money did arrive — it just never became a record.

Caye's job is to notice payment signals in email and **propose** a payment row. It is not to decide that money arrived.

## The one rule

**Caye never writes a payment. Ever.**

An email saying "wire sent" is not money in the account. Bahamian wires take days and sometimes fail. A payment recorded on the strength of an email is worse than no record at all, because a wrong number carries the authority of a right one.

Every detection ends as a row in `ai_pending_writes` — the table and the confirm gate already exist in TropiTrack — for a human to confirm against the actual bank balance. On confirm, the write lands in `payments` and `invoices.amount_paid` / `balance_due` update. On reject, it's dropped with a reason.

## Watch

Wallace's Gmail (`wallace.wcs.ghb@gmail.com` and `whelsco@gmail.com`). Signals worth proposing on:

- Bank alerts from RBC Royal Bank (Bahamas) or FirstCaribbean/CIBC — deposit or incoming-wire notifications. **Highest confidence.**
- Client messages: "wire sent", "payment issued", "transferred today", "sent the deposit", remittance advice attachments.
- Forwarded confirmations from a client's bank.

## Match, then propose

For each signal, extract: amount, date, client/sender, any reference or invoice number. Then match against open invoices in TropiTrack (`status` not in paid/void, `balance_due > 0`):

1. **Exact** — amount equals a `balance_due` and the client matches → high confidence.
2. **Partial** — amount is less than `balance_due` for a single open invoice from that client → medium.
3. **Ambiguous** — matches several invoices, or a client with more than one open → low; propose with the candidates listed, don't pick.
4. **No match** — propose an unallocated receipt and say so plainly.

Client names in TropiTrack are inconsistent ("Eric", "Sven", "Lolly & David", "Broderick"), so match on fuzzy name **and** email domain, and never silently pick one of two candidates.

Each proposal carries: proposed amount, date, invoice, confidence, and **a link or message id back to the email it came from**, so the person confirming can see the evidence without hunting.

## The monthly reconcile

Email tells you fast; it does not tell you the truth. There is no usable banking API for RBC Royal Bank (Bahamas) or CIBC Caribbean, and the accounts are in Wallace's personal name, which rules out business banking APIs regardless.

So build a second path: **statement import.** Accept a bank statement (PDF or CSV), parse the deposits, match them against open invoices with the same logic, and propose. This is the bank's own record, so it is authoritative where email is only suggestive. It also catches anything email missed.

Anything Caye proposed from email that never appears on a statement should be flagged, not quietly forgotten.

## Weekly nudge

One message, Friday: invoices over 30 days with nothing recorded against them, oldest first, with amounts. No action, just the list.

## Boundaries

- Propose only — never write to `payments`, `invoices`, or any money table directly.
- Never send email. Never reply to a client. Never chase a payment on ODS's behalf. Drafting a chase for a human to send is fine; sending is not.
- Scope company_id correctly in Caye's own code — she connects to the database directly and bypasses RLS, so the scoping guarantee has to live in the code.
- Never delete or edit an existing payment, invoice or payroll row.
- Log every proposal and its outcome to `audit_logs` (source `ai`), which already exists for this.

## Done when

- A bank alert or client payment email produces a pending proposal within the polling window, with the source email attached.
- No payment row exists in TropiTrack that a human did not confirm.
- A statement can be imported and reconciled against outstanding invoices.
- The Friday aging list arrives.
- Ambiguous matches are surfaced as ambiguous rather than guessed.
