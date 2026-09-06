/**
 * Fuzzy name resolution, shared by every tool that takes a name from a user.
 *
 * Jay types "felix", "Metal roof", "the laundromat". The model must not guess
 * which row that is — it resolves against the ledger, and when the answer is
 * genuinely ambiguous it says so and lists the candidates rather than picking.
 *
 * Lifted out of worker-unpaid.ts, which had the only copy.
 */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

/** 1 = exact, 0 = nothing in common. */
export function scoreMatch(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.9;
  if (c.includes(q) || q.includes(c)) return 0.8;
  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length);
  return Math.max(0, 1 - dist / maxLen);
}

export type ResolveOutcome<T> =
  | { ok: true; match: T }
  | { ok: false; error: string; candidates: { id: string; name: string }[] };

/**
 * Pick the one row a name refers to, or refuse.
 *
 * Refuses in two cases: nothing scores above the floor, and two rows score
 * near-identically without either being a strong match. Both return the
 * candidate list so the model can ask which one rather than inventing an answer
 * about the wrong job or the wrong person.
 */
export function resolveByName<T extends { id: string }>(
  query: string,
  rows: T[],
  nameOf: (row: T) => string[],
  label: string,
): ResolveOutcome<T> {
  const scored = rows
    .map((row) => ({
      row,
      name: nameOf(row)[0] ?? "",
      score: Math.max(0, ...nameOf(row).map((n) => scoreMatch(query, n))),
    }))
    .sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, 5).map((s) => ({ id: s.row.id, name: s.name }));
  const best = scored[0];

  if (!best || best.score < 0.55) {
    return { ok: false, error: `no ${label} matched "${query}"`, candidates };
  }
  if (scored[1] && scored[1].score >= best.score - 0.05 && best.score < 0.9) {
    return {
      ok: false,
      error: `ambiguous: "${query}" could match more than one ${label}`,
      candidates,
    };
  }
  return { ok: true, match: best.row };
}
