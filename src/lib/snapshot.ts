import type {
  KeywordSnapshot,
  KeywordState,
  SnapshotBadge,
} from "../types/common";

/** Serialize a live KeywordState into a JSON-storable snapshot. */
export function toSnapshot(
  keywords: KeywordState,
  t: number = Date.now(),
): KeywordSnapshot {
  return { t, keywords: Array.from(keywords.entries()) };
}

/** Inverse of toSnapshot — rebuild a KeywordState from a stored snapshot. */
export function snapshotToKeywordState(
  snapshot: KeywordSnapshot,
): KeywordState {
  return new Map(snapshot.keywords);
}

/** Keep only the most recent `cap` entries (oldest dropped first). */
export function pruneHistory(
  history: KeywordSnapshot[],
  cap: number,
): KeywordSnapshot[] {
  if (history.length <= cap) return history;
  return history.slice(history.length - cap);
}

/** Append a snapshot to history without mutating the input, then prune to cap. */
export function appendSnapshot(
  history: KeywordSnapshot[],
  snapshot: KeywordSnapshot,
  cap: number,
): KeywordSnapshot[] {
  return pruneHistory([...history, snapshot], cap);
}

function rankOf(keyword: string, state: KeywordState): number | null {
  for (const [rank, kw] of state) {
    if (kw === keyword) return rank;
  }
  return null;
}

/**
 * Compute a NEW/▲/▼ badge per current keyword vs the previous snapshot.
 * No previous snapshot (baseline) → no badges, to avoid a noisy all-NEW
 * flood on the very first render. Unchanged rank → no map entry (absence
 * = no badge, same convention as trends.ts).
 */
export function computeSnapshotBadges(
  current: KeywordState,
  previous: KeywordState | null,
): Map<string, SnapshotBadge> {
  const badges = new Map<string, SnapshotBadge>();
  if (!previous) return badges;
  for (const [rank, keyword] of current) {
    const prevRank = rankOf(keyword, previous);
    if (prevRank === null) badges.set(keyword, "new");
    else if (rank < prevRank) badges.set(keyword, "up");
    else if (rank > prevRank) badges.set(keyword, "down");
  }
  return badges;
}
