import type { KeywordState } from "../types/common";

export type TrendBadge = "up" | "down" | "new" | "same";

function rankOf(keyword: string, state: KeywordState): number | null {
  for (const [rank, kw] of state) {
    if (kw === keyword) return rank;
  }
  return null;
}

/**
 * Compute a trend badge per current keyword vs the previous snapshot.
 * Empty prev = baseline → everything "same" (no noisy NEW flood on first render).
 */
export function computeTrends(
  current: KeywordState,
  prev: KeywordState,
): Map<string, TrendBadge> {
  const out = new Map<string, TrendBadge>();
  const baseline = prev.size === 0;
  for (const [rank, keyword] of current) {
    if (baseline) {
      out.set(keyword, "same");
      continue;
    }
    const prevRank = rankOf(keyword, prev);
    if (prevRank === null) out.set(keyword, "new");
    else if (rank < prevRank) out.set(keyword, "up");
    else if (rank > prevRank) out.set(keyword, "down");
    else out.set(keyword, "same");
  }
  return out;
}
