import {
  STORAGE_KEY_CURRENT_KEYWORDS,
  STORAGE_KEY_SNAPSHOT_HISTORY,
} from "./constants/config";
import {
  readCurrentKeywords,
  readSnapshotHistory,
} from "./lib/snapshot-storage";
import { computeSnapshotBadges, snapshotToKeywordState } from "./lib/snapshot";
import type { ThreadMatch } from "./lib/arca-api";
import {
  createLinkContainer,
  refreshThreadMatches,
  threadMatches,
} from "./layers/manipulation";
import type { SnapshotBadge } from "./types/common";

/**
 * Side panel: lists the CURRENT namu.wiki realtime keywords (pushed by the
 * content script — this context cannot read the namu.wiki DOM itself) with
 * the same 💬/🔎 smart links as the content script, plus NEW/▲/▼ badges vs
 * the most recent chrome.alarms snapshot.
 */

const BADGE_LABEL: Record<SnapshotBadge, string> = {
  new: "NEW",
  up: "▲",
  down: "▼",
};

/** Pure-ish DOM builder — reuses createLinkContainer, does not duplicate matching/link logic. */
export function buildKeywordRow(
  rank: number,
  keyword: string,
  match: ThreadMatch | null,
  badge: SnapshotBadge | undefined,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "kw-row";

  const rankEl = document.createElement("span");
  rankEl.className = "kw-rank";
  rankEl.textContent = String(rank);
  row.appendChild(rankEl);

  const nameEl = document.createElement("span");
  nameEl.className = "kw-name";
  nameEl.textContent = keyword;
  row.appendChild(nameEl);

  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = `kw-badge kw-badge-${badge}`;
    badgeEl.textContent = BADGE_LABEL[badge];
    row.appendChild(badgeEl);
  }

  row.appendChild(createLinkContainer(keyword, match));
  return row;
}

export async function render(): Promise<void> {
  const listEl = document.getElementById("kw-list") as HTMLElement;
  const emptyEl = document.getElementById("empty-state") as HTMLElement;

  const current = await readCurrentKeywords();
  if (!current || current.keywords.length === 0) {
    listEl.textContent = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  const currentState = snapshotToKeywordState(current);
  const history = await readSnapshotHistory();
  const previousSnapshot = history[history.length - 1] ?? null;
  const previousState = previousSnapshot
    ? snapshotToKeywordState(previousSnapshot)
    : null;
  const badges = computeSnapshotBadges(currentState, previousState);

  const ranked = Array.from(currentState.entries()).sort((a, b) => a[0] - b[0]);
  await refreshThreadMatches(ranked.map(([, keyword]) => keyword));

  listEl.textContent = "";
  for (const [rank, keyword] of ranked) {
    listEl.appendChild(
      buildKeywordRow(
        rank,
        keyword,
        threadMatches.get(keyword) ?? null,
        badges.get(keyword),
      ),
    );
  }
}

export function init(): void {
  void render();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (STORAGE_KEY_CURRENT_KEYWORDS in changes ||
        STORAGE_KEY_SNAPSHOT_HISTORY in changes)
    ) {
      void render();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
