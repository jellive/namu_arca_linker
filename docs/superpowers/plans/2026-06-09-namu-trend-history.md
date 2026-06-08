# Trend History + Insights (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record 실검 snapshots to chrome.storage.local on each panel update (visit-based) and show a per-keyword insight (first-seen duration, best rank, observation count, mini unicode sparkline) via an `ⓘ` toggle on each hub-panel row.

**Architecture:** New `src/layers/history.ts` owns snapshot storage (append + dedup + prune to a cap) and insight computation. The Phase 1 panel calls `recordSnapshot()` inside `updatePanel()` and renders an `ⓘ` affordance per row that toggles an inline insight block. All visit-based — no background worker, no new permissions.

**Tech Stack:** Chrome MV3, TypeScript, Vite, Vitest (JSDOM + chrome.storage mock), npm.

**Run one file:** `npx vitest run src/layers/history.test.ts` • **All:** `npm run test:run` • **Build:** `npm run build`

**Existing code this builds on:**

- `src/layers/panel.ts` — `renderRows(body, keywords, trends, sites)` builds each row as `row.append(rankEl, badge, kw)` + `row.appendChild(createLinksContainer(keyword, sites))`; `updatePanel()` does `const current = extractCurrentKeywords(); ... renderRows(...); prevKeywords = current;`
- `KeywordState = Map<number,string>` (`src/types/common.ts`)
- config consts pattern in `src/constants/config.ts` (Phase 1 added `CSS_CLASS_PANEL*`, `STORAGE_KEY_HUB_COLLAPSED`)
- chrome.storage mock pattern already used in `src/layers/panel.test.ts`

---

## File Structure

- `src/constants/config.ts` — add history storage key, cap, and insight CSS-class consts.
- `src/layers/history.ts` (new) — snapshot storage + insight + sparkline.
- `src/layers/panel.ts` — call `recordSnapshot` in `updatePanel`; add `ⓘ` + inline insight in `renderRows`.
- `styles.css` — `ⓘ`/insight/sparkline styles.
- `manifest.json` + `package.json` — 1.4.0 → 1.5.0.
- Tests: `src/layers/history.test.ts` (new), additions to `src/layers/panel.test.ts`.

---

### Task 1: history.ts snapshot storage + config consts

**Files:** Create `src/layers/history.ts`, `src/layers/history.test.ts`; modify `src/constants/config.ts`.

- [ ] **Step 1: Add config consts** to `src/constants/config.ts`:

```ts
export const STORAGE_KEY_TREND_HISTORY = "trendHistory";
export const HISTORY_CAP = 300;
export const CSS_CLASS_PANEL_INFO = "arca-hub-info";
export const CSS_CLASS_PANEL_INSIGHT = "arca-hub-insight";
```

- [ ] **Step 2: Write the failing test** — `src/layers/history.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { recordSnapshot, __loadHistoryForTest } from "./history";

function mockChromeStorage(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  // @ts-expect-error minimal mock
  globalThis.chrome = {
    storage: {
      local: {
        get: (
          d: Record<string, unknown>,
          cb: (v: Record<string, unknown>) => void,
        ) => cb({ ...d, ...store }),
        set: (v: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, v);
          cb?.();
        },
      },
    },
  };
  return store;
}

describe("recordSnapshot", () => {
  beforeEach(() => mockChromeStorage());

  it("appends a snapshot with epoch + keyword→rank map", async () => {
    await recordSnapshot(
      new Map([
        [1, "A"],
        [2, "B"],
      ]),
      1000,
    );
    const h = await __loadHistoryForTest();
    expect(h).toHaveLength(1);
    expect(h[0]).toEqual({ t: 1000, r: { A: 1, B: 2 } });
  });

  it("skips an empty keyword set", async () => {
    await recordSnapshot(new Map(), 1000);
    expect(await __loadHistoryForTest()).toHaveLength(0);
  });

  it("dedups a consecutive identical snapshot", async () => {
    await recordSnapshot(new Map([[1, "A"]]), 1000);
    await recordSnapshot(new Map([[1, "A"]]), 1001);
    expect(await __loadHistoryForTest()).toHaveLength(1);
  });

  it("appends when ranks change", async () => {
    await recordSnapshot(new Map([[1, "A"]]), 1000);
    await recordSnapshot(
      new Map([
        [1, "B"],
        [2, "A"],
      ]),
      1001,
    );
    expect(await __loadHistoryForTest()).toHaveLength(2);
  });

  it("prunes to the most recent HISTORY_CAP snapshots", async () => {
    for (let i = 0; i < 305; i++) {
      await recordSnapshot(new Map([[1, `K${i}`]]), 1000 + i);
    }
    const h = await __loadHistoryForTest();
    expect(h).toHaveLength(300);
    expect(h[0]!.t).toBe(1005); // oldest 5 dropped
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/layers/history.test.ts` → FAIL (no module).

- [ ] **Step 4: Implement** `src/layers/history.ts` (storage half — insight comes in Task 2):

```ts
import { STORAGE_KEY_TREND_HISTORY, HISTORY_CAP } from "../constants/config";
import type { KeywordState } from "../types/common";

export interface Snapshot {
  t: number; // epoch seconds
  r: Record<string, number>; // keyword -> rank
}

function loadHistory(): Promise<Snapshot[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY_TREND_HISTORY]: [] }, (v) =>
      resolve((v[STORAGE_KEY_TREND_HISTORY] as Snapshot[]) ?? []),
    );
  });
}

function saveHistory(snapshots: Snapshot[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_TREND_HISTORY]: snapshots }, () =>
      resolve(),
    );
  });
}

/** Test-only accessor. */
export function __loadHistoryForTest(): Promise<Snapshot[]> {
  return loadHistory();
}

function toRecord(keywords: KeywordState): Record<string, number> {
  const r: Record<string, number> = {};
  for (const [rank, kw] of keywords) r[kw] = rank;
  return r;
}

function sameRanks(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/**
 * Append a 실검 snapshot. Visit-based + best-effort: dedups a consecutive
 * identical snapshot, prunes to the most recent HISTORY_CAP, swallows storage
 * errors (history must never break the panel). `now` = epoch seconds.
 */
export async function recordSnapshot(
  keywords: KeywordState,
  now: number,
): Promise<void> {
  if (keywords.size === 0) return;
  try {
    const history = await loadHistory();
    const r = toRecord(keywords);
    const last = history[history.length - 1];
    if (last && sameRanks(last.r, r)) return;
    history.push({ t: now, r });
    const pruned =
      history.length > HISTORY_CAP
        ? history.slice(history.length - HISTORY_CAP)
        : history;
    await saveHistory(pruned);
  } catch {
    // best-effort; ignore
  }
}
```

- [ ] **Step 5: Run** `npx vitest run src/layers/history.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/constants/config.ts src/layers/history.ts src/layers/history.test.ts
git commit -m "feat(history): visit-based snapshot storage (dedup + prune)"
```

---

### Task 2: getKeywordInsight + sparklineBars + humanizeDuration

**Files:** Modify `src/layers/history.ts`, `src/layers/history.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `src/layers/history.test.ts`:

```ts
import { getKeywordInsight, sparklineBars, humanizeDuration } from "./history";

describe("getKeywordInsight", () => {
  beforeEach(() => mockChromeStorage());

  it("returns null when the keyword was never seen", async () => {
    await recordSnapshot(new Map([[1, "A"]]), 1000);
    expect(await getKeywordInsight("Z")).toBeNull();
  });

  it("computes firstSeen/lastSeen/observations/bestRank/sparkline", async () => {
    await recordSnapshot(new Map([[3, "A"]]), 1000);
    await recordSnapshot(new Map([[1, "A"]]), 2000);
    await recordSnapshot(new Map([[2, "A"]]), 3000);
    const ins = (await getKeywordInsight("A"))!;
    expect(ins.firstSeen).toBe(1000);
    expect(ins.lastSeen).toBe(3000);
    expect(ins.observations).toBe(3);
    expect(ins.bestRank).toBe(1);
    expect(ins.sparkline).toEqual([3, 1, 2]);
  });
});

describe("sparklineBars", () => {
  it("returns '' for empty input", () => {
    expect(sparklineBars([])).toBe("");
  });
  it("maps the best (lowest) rank to the tallest bar", () => {
    const s = sparklineBars([5, 1]); // 1 is better → taller
    expect(s).toHaveLength(2);
    expect(s.charCodeAt(1)).toBeGreaterThan(s.charCodeAt(0));
  });
  it("renders a flat mid bar when all ranks are equal", () => {
    const s = sparklineBars([2, 2, 2]);
    expect(new Set(s.split(""))).toHaveLength(1);
  });
});

describe("humanizeDuration", () => {
  it("formats seconds/minutes/hours/days", () => {
    expect(humanizeDuration(30)).toBe("방금");
    expect(humanizeDuration(120)).toBe("2분");
    expect(humanizeDuration(7200)).toBe("2시간");
    expect(humanizeDuration(172800)).toBe("2일");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/layers/history.test.ts -t "getKeywordInsight"` → FAIL.

- [ ] **Step 3: Implement** — append to `src/layers/history.ts`:

```ts
export interface KeywordInsight {
  firstSeen: number;
  lastSeen: number;
  observations: number;
  bestRank: number;
  sparkline: number[]; // recent ranks, oldest→newest
}

export async function getKeywordInsight(
  keyword: string,
): Promise<KeywordInsight | null> {
  let history: Snapshot[];
  try {
    history = await loadHistory();
  } catch {
    return null;
  }
  const seen: { t: number; rank: number }[] = [];
  for (const snap of history) {
    const rank = snap.r[keyword];
    if (rank !== undefined) seen.push({ t: snap.t, rank });
  }
  if (seen.length === 0) return null;
  return {
    firstSeen: seen[0]!.t,
    lastSeen: seen[seen.length - 1]!.t,
    observations: seen.length,
    bestRank: Math.min(...seen.map((x) => x.rank)),
    sparkline: seen.slice(-12).map((x) => x.rank),
  };
}

const SPARK_BARS = "▁▂▃▄▅▆▇";

/** Unicode sparkline; higher bar = better (lower) rank. */
export function sparklineBars(ranks: number[]): string {
  if (ranks.length === 0) return "";
  const max = Math.max(...ranks);
  const min = Math.min(...ranks);
  const span = max - min;
  return ranks
    .map((rank) => {
      const norm = span === 0 ? 0.5 : (max - rank) / span; // best rank → 1
      const idx = Math.round(norm * (SPARK_BARS.length - 1));
      return SPARK_BARS[idx];
    })
    .join("");
}

/** Korean short duration. `sec` = elapsed seconds. */
export function humanizeDuration(sec: number): string {
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  return `${Math.floor(sec / 86400)}일`;
}
```

- [ ] **Step 4: Run** `npx vitest run src/layers/history.test.ts` → PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/layers/history.ts src/layers/history.test.ts
git commit -m "feat(history): keyword insight + sparkline + duration helpers"
```

---

### Task 3: Panel integration — record snapshots + ⓘ insight toggle

**Files:** Modify `src/layers/panel.ts`, `src/layers/panel.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `src/layers/panel.test.ts` (this file already has a chrome.storage mock + `__resetPanelForTest` + 실검 DOM setup; reuse them):

```ts
import { renderInsightContent } from "./panel";
import {
  CSS_CLASS_PANEL_INFO,
  CSS_CLASS_PANEL_INSIGHT,
} from "../constants/config";

describe("renderInsightContent", () => {
  it("shows '기록 없음' when insight is null", () => {
    const el = renderInsightContent(null, 5000);
    expect(el.textContent).toContain("기록 없음");
  });
  it("shows duration, best rank, observations and a sparkline", () => {
    const el = renderInsightContent(
      {
        firstSeen: 1000,
        lastSeen: 4000,
        observations: 3,
        bestRank: 1,
        sparkline: [3, 1, 2],
      },
      4000 + 7200, // 2h after firstSeen... firstSeen=1000, now=11200 → 10200s ≈ 2시간
    );
    expect(el.textContent).toContain("시간");
    expect(el.textContent).toContain("1위");
    expect(el.textContent).toContain("3회");
  });
});

describe("renderRows insight affordance", () => {
  it("adds an ⓘ button per row", () => {
    const body = document.createElement("div");
    renderRows(body, new Map([[1, "손흥민"]]), new Map([["손흥민", "up"]]), [
      { name: "구글", label: "구글", url: "https://g/{keyword}" },
    ]);
    expect(body.querySelectorAll(`.${CSS_CLASS_PANEL_INFO}`)).toHaveLength(1);
    expect(body.querySelector(`.${CSS_CLASS_PANEL_INSIGHT}`)).toBeTruthy();
  });
});
```

> NOTE: `renderRows` is already imported at the top of panel.test.ts (Task 3 of Phase 1). Add `renderInsightContent` to that import or import separately.

- [ ] **Step 2: Run** `npx vitest run src/layers/panel.test.ts -t "insight"` → FAIL.

- [ ] **Step 3: Implement** in `src/layers/panel.ts`:

(a) Add imports at the top:

```ts
import {
  CSS_CLASS_PANEL_INFO,
  CSS_CLASS_PANEL_INSIGHT,
} from "../constants/config";
import {
  recordSnapshot,
  getKeywordInsight,
  sparklineBars,
  humanizeDuration,
  type KeywordInsight,
} from "./history";
```

(b) Add the insight renderer (exported for tests):

```ts
export function renderInsightContent(
  insight: KeywordInsight | null,
  now: number,
): HTMLElement {
  const el = document.createElement("div");
  if (!insight) {
    el.textContent = "기록 없음";
    return el;
  }
  const stats = document.createElement("div");
  const dur = humanizeDuration(Math.max(0, now - insight.firstSeen));
  stats.textContent = `처음 본 지 ${dur} · 최고 ${insight.bestRank}위 · 관찰 ${insight.observations}회`;
  const spark = document.createElement("div");
  spark.className = `${CSS_CLASS_PANEL}-spark`;
  spark.textContent = sparklineBars(insight.sparkline);
  el.append(stats, spark);
  return el;
}
```

(c) In `renderRows`, after appending the links container, add the `ⓘ` button + a hidden insight block per row. Replace the row-build tail (`row.append(rankEl, badge, kw); row.appendChild(createLinksContainer(keyword, sites)); body.appendChild(row);`) with:

```ts
const info = document.createElement("button");
info.className = CSS_CLASS_PANEL_INFO;
info.type = "button";
info.textContent = "ⓘ";
info.title = `${keyword} 트렌드 기록`;

const insightBox = document.createElement("div");
insightBox.className = CSS_CLASS_PANEL_INSIGHT;
insightBox.style.display = "none";

info.addEventListener("click", async () => {
  if (insightBox.style.display !== "none") {
    insightBox.style.display = "none";
    return;
  }
  const data = await getKeywordInsight(keyword);
  insightBox.textContent = "";
  insightBox.appendChild(
    renderInsightContent(data, Math.floor(Date.now() / 1000)),
  );
  insightBox.style.display = "";
});

row.append(rankEl, badge, kw, info);
row.appendChild(createLinksContainer(keyword, sites));
row.appendChild(insightBox);
body.appendChild(row);
```

(d) In `updatePanel`, record a snapshot of the freshly read keywords. After `const current = extractCurrentKeywords();` add:

```ts
void recordSnapshot(current, Math.floor(Date.now() / 1000));
```

- [ ] **Step 4: Run** `npx vitest run src/layers/panel.test.ts` → PASS, then `npm run test:run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/panel.ts src/layers/panel.test.ts
git commit -m "feat(panel): record snapshots + ⓘ keyword insight toggle"
```

---

### Task 4: Styles + version bump

**Files:** Modify `styles.css`, `manifest.json`, `package.json`.

- [ ] **Step 1: Add styles** to `styles.css`:

```css
/* ── 트렌드 인사이트 (Phase 2) ── */
.arca-hub-info {
  margin-left: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  opacity: 0.55;
  padding: 0 2px;
}
.arca-hub-info:hover {
  opacity: 1;
}
.arca-hub-insight {
  width: 100%;
  margin: 2px 0 4px 18px;
  font-size: 11px;
  opacity: 0.85;
  line-height: 1.5;
}
.arca-hub-spark {
  font-size: 13px;
  letter-spacing: 1px;
}
.theseed-light-mode .arca-hub-insight {
  color: #555;
}
.theseed-light-mode .arca-hub-spark {
  color: #0275d8;
}
.theseed-dark-mode .arca-hub-insight {
  color: #aaa;
}
.theseed-dark-mode .arca-hub-spark {
  color: #c084fc;
}
```

- [ ] **Step 2: Bump version** — `"version": "1.5.0"` in both `manifest.json` and `package.json`.

- [ ] **Step 3: Verify** — `npm run test:run` → all PASS, `npm run build` → succeeds.

- [ ] **Step 4: Manual smoke** (user, not automatable): load `dist/` unpacked → namu.wiki → click a keyword's `ⓘ` → inline insight (duration · best rank · observations · sparkline) appears + toggles; revisit later to confirm history accumulates.

- [ ] **Step 5: Commit**

```bash
git add styles.css manifest.json package.json
git commit -m "feat(history): insight/sparkline styles + bump to 1.5.0"
```

---

## Self-Review

**Spec coverage:**

- visit-based snapshot storage to chrome.storage.local → Task 1 ✓
- dedup consecutive + prune to cap → Task 1 ✓
- getKeywordInsight (firstSeen/lastSeen/observations/bestRank/sparkline) → Task 2 ✓
- unicode sparkline, higher bar = better rank → Task 2 ✓
- recordSnapshot hooked into updatePanel → Task 3 ✓
- ⓘ per row → inline insight toggle (not floating popover) → Task 3 ✓
- "처음 본 지 N · 최고 N위 · 관찰 N회" → Task 3 (renderInsightContent + humanizeDuration) ✓
- storage failure graceful / null insight → Tasks 1,2,3 ✓
- dark/light styles → Task 4 ✓
- no new permissions → nothing touches manifest perms ✓
- version 1.5.0 → Task 4 ✓
- OUT (no graph view / watchlist / background / AI) → none added ✓

**Placeholder scan:** No TBD/TODO; full code in each code step. One `> NOTE` is a verification ask (panel.test import) against the real file.

**Type consistency:** `Snapshot {t,r}`, `KeywordInsight {firstSeen,lastSeen,observations,bestRank,sparkline}`, `recordSnapshot(keywords, now)`, `getKeywordInsight(keyword): Promise<KeywordInsight|null>`, `sparklineBars(ranks)`, `humanizeDuration(sec)`, `renderInsightContent(insight, now)`, consts `STORAGE_KEY_TREND_HISTORY`/`HISTORY_CAP`/`CSS_CLASS_PANEL_INFO`/`CSS_CLASS_PANEL_INSIGHT` — consistent across tasks. `now` passed in (not Date inside pure fns) for deterministic tests; the panel click handler / updatePanel supply `Math.floor(Date.now()/1000)`.
