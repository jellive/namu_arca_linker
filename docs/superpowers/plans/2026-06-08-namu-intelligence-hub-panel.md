# Intelligence Hub Panel (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible right-dock panel to namu.wiki showing the live 실시간 검색어 ranking with trend badges (▲/▼/NEW/=) and per-keyword multi-site search links — additive (existing inline links stay, with an option to hide them).

**Architecture:** A new self-contained `src/layers/panel.ts` renders/updates the panel from `extractCurrentKeywords()` (discovery), reuses `createLinksContainer()` (manipulation) for links, and re-renders when `observer.ts` detects 실검 changes via a new `onRealtimeChange()` pub/sub. State (collapse) persists to `chrome.storage.local`; an "hide inline links" option lives in `chrome.storage.sync`. No new permissions.

**Tech Stack:** Chrome MV3, TypeScript, Vite (`vite build`), Vitest (JSDOM, `*.test.ts` colocated), npm.

**Run one test file:** `npx vitest run src/layers/panel.test.ts` • **All:** `npm run test:run` • **Build:** `npm run build`

**Existing interfaces this builds on (do NOT re-implement):**

- `extractCurrentKeywords(): KeywordState` where `KeywordState = Map<number, string>` (1-based rank → keyword) — `src/layers/discovery.ts`
- `createLinksContainer(keyword: string, sites: TargetSite[]): HTMLSpanElement` + `activeSites: TargetSite[]` + `refreshActiveSites(): Promise<void>` — `src/layers/manipulation.ts` (NOTE: `activeSites`/`refreshActiveSites` are currently module-private; Task 4 exports them)
- `observeRealtimeUpdates(): void` — `src/layers/observer.ts`
- `getStorageState()` + `TargetSite` — `src/lib/storage.ts`
- config consts in `src/constants/config.ts`; theme styles scoped under `.theseed-light-mode` / `.theseed-dark-mode` in root `styles.css`

---

## File Structure

- `src/constants/config.ts` — add panel CSS-class consts.
- `src/layers/trends.ts` (new) — pure trend-badge computation.
- `src/layers/panel.ts` (new) — panel DOM build, render, mount, toggle, update.
- `src/layers/observer.ts` — add `onRealtimeChange(cb)` pub/sub + fire it.
- `src/layers/manipulation.ts` — export `activeSites` + `refreshActiveSites` (so panel reuses them).
- `src/lib/content-init.ts` — mount panel; branch inline links on the hide option.
- `src/options.ts` — add the "인라인 링크 숨기기" toggle.
- `styles.css` — panel styles (light/dark/responsive).
- `manifest.json` + `package.json` — version 1.3.0 → 1.4.0.
- Tests: `src/layers/trends.test.ts`, `src/layers/panel.test.ts` (new).

---

### Task 1: Trend computation (pure) + panel CSS consts

**Files:** Create `src/layers/trends.ts`, `src/layers/trends.test.ts`; modify `src/constants/config.ts`.

- [ ] **Step 1: Write the failing test** — create `src/layers/trends.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTrends } from "./trends";

describe("computeTrends", () => {
  it("returns 'same' for every keyword on the baseline (empty prev)", () => {
    const cur = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const t = computeTrends(cur, new Map());
    expect(t.get("A")).toBe("same");
    expect(t.get("B")).toBe("same");
  });

  it("marks a keyword that rose in rank as 'up'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const cur = new Map([
      [1, "B"],
      [2, "A"],
    ]); // B 2→1
    expect(computeTrends(cur, prev).get("B")).toBe("up");
  });

  it("marks a keyword that fell as 'down'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const cur = new Map([
      [1, "B"],
      [2, "A"],
    ]); // A 1→2
    expect(computeTrends(cur, prev).get("A")).toBe("down");
  });

  it("marks a keyword absent from prev as 'new'", () => {
    const prev = new Map([[1, "A"]]);
    const cur = new Map([
      [1, "A"],
      [2, "C"],
    ]);
    expect(computeTrends(cur, prev).get("C")).toBe("new");
  });

  it("marks an unchanged rank as 'same'", () => {
    const prev = new Map([[1, "A"]]);
    const cur = new Map([[1, "A"]]);
    expect(computeTrends(cur, prev).get("A")).toBe("same");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/layers/trends.test.ts` → FAIL (no module).

- [ ] **Step 3: Implement** `src/layers/trends.ts`:

```ts
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
```

- [ ] **Step 4: Add panel CSS-class consts** to `src/constants/config.ts` (below the existing consts):

```ts
export const CSS_CLASS_PANEL = "arca-hub";
export const CSS_CLASS_PANEL_TOGGLE = "arca-hub-toggle";
export const CSS_CLASS_PANEL_ROW = "arca-hub-row";
export const CSS_CLASS_PANEL_BADGE = "arca-hub-badge";
export const STORAGE_KEY_HUB_COLLAPSED = "hubCollapsed";
export const STORAGE_KEY_HIDE_INLINE = "hideInlineLinks";
```

- [ ] **Step 5: Run** `npx vitest run src/layers/trends.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/layers/trends.ts src/layers/trends.test.ts src/constants/config.ts
git commit -m "feat(trends): pure trend-badge computation + panel css consts"
```

---

### Task 2: Export activeSites from manipulation (panel reuse)

The panel needs the configured sites for `createLinksContainer`. Currently `activeSites`/`refreshActiveSites` are module-private.

**Files:** Modify `src/layers/manipulation.ts`.

- [ ] **Step 1: Export them.** In `src/layers/manipulation.ts`, change the declarations to `export`:
  - `let activeSites: TargetSite[] = DEFAULT_TARGET_SITES;` → `export let activeSites: TargetSite[] = DEFAULT_TARGET_SITES;`
  - `async function refreshActiveSites()` → `export async function refreshActiveSites()`

- [ ] **Step 2: Verify nothing broke** — `npm run test:run` → all still PASS, `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/layers/manipulation.ts
git commit -m "refactor(manipulation): export activeSites/refreshActiveSites for reuse"
```

---

### Task 3: Panel DOM build + render rows

Pure-ish DOM construction (no chrome.\* yet). `buildPanel()` returns the shell; `renderRows(body, keywords, trends, sites)` fills rows.

**Files:** Create `src/layers/panel.ts`, `src/layers/panel.test.ts`.

- [ ] **Step 1: Write the failing test** — `src/layers/panel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildPanel, renderRows } from "./panel";
import {
  CSS_CLASS_PANEL,
  CSS_CLASS_PANEL_ROW,
  CSS_CLASS_PANEL_BADGE,
  CSS_CLASS_LINKS_CONTAINER,
} from "../constants/config";
import type { TargetSite } from "../lib/storage";

const SITES: TargetSite[] = [
  { name: "구글", label: "구글", url: "https://g/{keyword}" },
];

describe("buildPanel", () => {
  it("builds a panel shell with header, body and toggle", () => {
    const { panel, body, toggle } = buildPanel();
    expect(panel.className).toContain(CSS_CLASS_PANEL);
    expect(body).toBeTruthy();
    expect(toggle.tagName).toBe("BUTTON");
  });
});

describe("renderRows", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders one row per keyword with rank, badge, keyword and links", () => {
    const body = document.createElement("div");
    renderRows(
      body,
      new Map([
        [1, "손흥민"],
        [2, "비트코인"],
      ]),
      new Map([
        ["손흥민", "up"],
        ["비트코인", "new"],
      ]),
      SITES,
    );
    const rows = body.querySelectorAll(`.${CSS_CLASS_PANEL_ROW}`);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("손흥민");
    expect(body.querySelector(`.${CSS_CLASS_PANEL_BADGE}`)).toBeTruthy();
    expect(body.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length).toBe(
      2,
    );
  });

  it("shows an empty state when there are no keywords", () => {
    const body = document.createElement("div");
    renderRows(body, new Map(), new Map(), SITES);
    expect(body.querySelectorAll(`.${CSS_CLASS_PANEL_ROW}`)).toHaveLength(0);
    expect(body.textContent).toContain("실시간 검색어");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/layers/panel.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/layers/panel.ts` (this task: build + renderRows only):

```ts
import {
  CSS_CLASS_PANEL,
  CSS_CLASS_PANEL_TOGGLE,
  CSS_CLASS_PANEL_ROW,
  CSS_CLASS_PANEL_BADGE,
} from "../constants/config";
import { createLinksContainer } from "./manipulation";
import type { TrendBadge } from "./trends";
import type { KeywordState } from "../types/common";
import type { TargetSite } from "../lib/storage";

const BADGE_TEXT: Record<TrendBadge, string> = {
  up: "▲",
  down: "▼",
  new: "NEW",
  same: "",
};

export interface PanelParts {
  panel: HTMLDivElement;
  body: HTMLDivElement;
  toggle: HTMLButtonElement;
}

export function buildPanel(): PanelParts {
  const panel = document.createElement("div");
  panel.className = CSS_CLASS_PANEL;

  const header = document.createElement("div");
  header.className = `${CSS_CLASS_PANEL}-header`;
  header.textContent = "🔥 실검 허브";

  const body = document.createElement("div");
  body.className = `${CSS_CLASS_PANEL}-body`;

  panel.appendChild(header);
  panel.appendChild(body);

  const toggle = document.createElement("button");
  toggle.className = CSS_CLASS_PANEL_TOGGLE;
  toggle.type = "button";
  toggle.textContent = "🔥";
  toggle.title = "실검 허브 열기/닫기";

  return { panel, body, toggle };
}

export function renderRows(
  body: HTMLElement,
  keywords: KeywordState,
  trends: Map<string, TrendBadge>,
  sites: TargetSite[],
): void {
  body.innerHTML = "";
  if (keywords.size === 0) {
    const empty = document.createElement("div");
    empty.className = `${CSS_CLASS_PANEL}-empty`;
    empty.textContent = "실시간 검색어 없음";
    body.appendChild(empty);
    return;
  }
  for (const [rank, keyword] of keywords) {
    const row = document.createElement("div");
    row.className = CSS_CLASS_PANEL_ROW;

    const rankEl = document.createElement("span");
    rankEl.className = `${CSS_CLASS_PANEL}-rank`;
    rankEl.textContent = String(rank);

    const badge = document.createElement("span");
    const trend = trends.get(keyword) ?? "same";
    badge.className = `${CSS_CLASS_PANEL_BADGE} ${CSS_CLASS_PANEL_BADGE}-${trend}`;
    badge.textContent = BADGE_TEXT[trend];

    const kw = document.createElement("span");
    kw.className = `${CSS_CLASS_PANEL}-kw`;
    kw.textContent = keyword;

    row.append(rankEl, badge, kw);
    row.appendChild(createLinksContainer(keyword, sites));
    body.appendChild(row);
  }
}
```

- [ ] **Step 4: Run** `npx vitest run src/layers/panel.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/panel.ts src/layers/panel.test.ts
git commit -m "feat(panel): build shell + render ranking rows with trend badges"
```

---

### Task 4: observer pub/sub for live updates

**Files:** Modify `src/layers/observer.ts`; test in `src/layers/observer.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `src/layers/observer.test.ts`:

```ts
import { onRealtimeChange, emitRealtimeChange } from "./observer";

describe("onRealtimeChange pub/sub", () => {
  it("invokes registered listeners when a change is emitted", () => {
    let calls = 0;
    onRealtimeChange(() => calls++);
    emitRealtimeChange();
    expect(calls).toBe(1);
  });
});
```

> If `observer.test.ts` does not already import from `./observer`, add the import; otherwise extend the existing import line.

- [ ] **Step 2: Run** `npx vitest run src/layers/observer.test.ts -t "pub/sub"` → FAIL.

- [ ] **Step 3: Implement** in `src/layers/observer.ts` — add near the top (after imports):

```ts
const realtimeChangeListeners: Array<() => void> = [];

/** Subscribe to "realtime keywords changed" events (used by the hub panel). */
export function onRealtimeChange(cb: () => void): void {
  realtimeChangeListeners.push(cb);
}

/** Notify subscribers. Exported for tests; called internally on change. */
export function emitRealtimeChange(): void {
  for (const cb of realtimeChangeListeners) {
    try {
      cb();
    } catch (e) {
      console.warn("[나무위키 아카링커] onRealtimeChange listener error", e);
    }
  }
}
```

Then call `emitRealtimeChange();` at the END of the internal `onRealtimeSearchChanged(...)` function (after it finishes applying inline changes), so panel updates ride the same detection.

- [ ] **Step 4: Run** `npx vitest run src/layers/observer.test.ts` → PASS, then `npm run test:run` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/observer.ts src/layers/observer.test.ts
git commit -m "feat(observer): onRealtimeChange pub/sub for panel updates"
```

---

### Task 5: Panel mount/toggle/update lifecycle (chrome.storage state)

Adds the stateful glue to `panel.ts`: idempotent mount, collapse toggle persisted to `chrome.storage.local`, and `updatePanel()` that re-reads keywords + recomputes trends from an in-memory prev snapshot.

**Files:** Modify `src/layers/panel.ts`, `src/layers/panel.test.ts`.

- [ ] **Step 1: Write the failing test** — append to `src/layers/panel.test.ts`:

```ts
import { mountPanel, updatePanel, __resetPanelForTest } from "./panel";

function mockChromeStorage(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  // @ts-expect-error minimal mock
  globalThis.chrome = {
    storage: {
      local: {
        get: (
          defaults: Record<string, unknown>,
          cb: (v: Record<string, unknown>) => void,
        ) => cb({ ...defaults, ...store }),
        set: (v: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, v);
          cb?.();
        },
      },
    },
  };
  return store;
}

describe("mountPanel / updatePanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockChromeStorage();
    __resetPanelForTest();
    // 실검 DOM the discovery layer will read
    document.body.innerHTML = `
      <div class="realtime"><a href="/Go?q=%EC%86%90%ED%9D%A5%EB%AF%BC">손흥민</a></div>`;
  });

  it("injects exactly one panel even if mounted twice (idempotent)", async () => {
    await mountPanel();
    await mountPanel();
    expect(document.querySelectorAll(".arca-hub").length).toBe(1);
  });

  it("updatePanel renders current keywords into the panel body", async () => {
    await mountPanel();
    await updatePanel();
    expect(document.querySelector(".arca-hub-row")?.textContent).toContain(
      "손흥민",
    );
  });
});
```

> NOTE: the discovery layer reads `REALTIME_SELECTORS`. Confirm `.realtime a` (or whatever selector the test markup uses) matches one of `src/constants/selectors.ts`; if not, use a selector from that file so `extractCurrentKeywords()` finds the link. `__resetPanelForTest()` must clear module state (mounted flag + prev snapshot) so tests are isolated.

- [ ] **Step 2: Run** `npx vitest run src/layers/panel.test.ts -t "mountPanel"` → FAIL.

- [ ] **Step 3: Implement** — add to `src/layers/panel.ts`:

```ts
import { extractCurrentKeywords } from "./discovery";
import { activeSites, refreshActiveSites } from "./manipulation";
import { computeTrends } from "./trends";
import { STORAGE_KEY_HUB_COLLAPSED } from "../constants/config";
import type { KeywordState } from "../types/common";

let mounted = false;
let parts: PanelParts | null = null;
let prevKeywords: KeywordState = new Map();

export function __resetPanelForTest(): void {
  mounted = false;
  parts = null;
  prevKeywords = new Map();
}

function getCollapsed(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY_HUB_COLLAPSED]: false }, (v) =>
      resolve(Boolean(v[STORAGE_KEY_HUB_COLLAPSED])),
    );
  });
}

function setCollapsed(collapsed: boolean): void {
  chrome.storage.local.set({ [STORAGE_KEY_HUB_COLLAPSED]: collapsed });
}

function applyCollapsed(collapsed: boolean): void {
  if (!parts) return;
  parts.panel.style.display = collapsed ? "none" : "";
}

export async function mountPanel(): Promise<void> {
  if (mounted || document.querySelector(`.${CSS_CLASS_PANEL}`)) {
    mounted = true;
    return;
  }
  parts = buildPanel();
  parts.toggle.addEventListener("click", () => {
    const nowHidden = parts!.panel.style.display !== "none";
    applyCollapsed(nowHidden);
    setCollapsed(nowHidden);
  });
  document.body.appendChild(parts.panel);
  document.body.appendChild(parts.toggle);
  mounted = true;
  applyCollapsed(await getCollapsed());
  await updatePanel();
}

export async function updatePanel(): Promise<void> {
  if (!parts) return;
  await refreshActiveSites();
  const current = extractCurrentKeywords();
  const trends = computeTrends(current, prevKeywords);
  renderRows(parts.body, current, trends, activeSites);
  prevKeywords = current;
}
```

> Add the imports of `CSS_CLASS_PANEL` etc. already present from Task 3. `buildPanel`/`renderPanel`/`PanelParts` are defined in Task 3.

- [ ] **Step 4: Run** `npx vitest run src/layers/panel.test.ts` → PASS, then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/layers/panel.ts src/layers/panel.test.ts
git commit -m "feat(panel): mount/toggle (persisted) + live updatePanel"
```

---

### Task 6: Wire into content-init + "hide inline links" option

**Files:** Modify `src/lib/content-init.ts`, `src/options.ts`, `src/options.html`.

- [ ] **Step 1: Wire the panel + inline branch in content-init.** In `src/lib/content-init.ts`:
  - import `mountPanel, updatePanel` from `../layers/panel` and `onRealtimeChange` from `../layers/observer`, and read the hide flag.
  - In `init()`, replace the body after the `enabled` check with:

```ts
const hideInline = await new Promise<boolean>((resolve) => {
  chrome.storage.sync.get({ hideInlineLinks: false }, (v) =>
    resolve(Boolean(v["hideInlineLinks"])),
  );
});

if (!hideInline) {
  await addArcaLinks();
}
observeRealtimeUpdates();
await mountPanel();
onRealtimeChange(() => {
  if (!hideInline) void addArcaLinks();
  void updatePanel();
});

if ("navigation" in window) {
  const nav = window.navigation as EventTarget;
  nav.addEventListener("navigate", () => {
    setTimeout(() => {
      if (!hideInline) void addArcaLinks();
      void updatePanel();
    }, NAV_DELAY_MS);
  });
}
```

- [ ] **Step 2: Add the option toggle.** In `src/options.html`, add (near the existing site list section) a checkbox row:

```html
<label class="hide-inline-row">
  <input type="checkbox" id="hide-inline" />
  인라인 링크 숨기기 (실검 허브 패널만 사용)
</label>
```

In `src/options.ts`, on load read it and on change save it:

```ts
const hideInlineEl = document.getElementById("hide-inline") as HTMLInputElement;
chrome.storage.sync.get({ hideInlineLinks: false }, (v) => {
  hideInlineEl.checked = Boolean(v["hideInlineLinks"]);
});
hideInlineEl.addEventListener("change", () => {
  chrome.storage.sync.set({ hideInlineLinks: hideInlineEl.checked });
});
```

> Match the existing options.ts init pattern (it already runs a load function on DOMContentLoaded — add these lines there, don't create a second listener if one exists).

- [ ] **Step 3: Verify** — `npm run test:run` → all PASS, `npm run build` → succeeds.

- [ ] **Step 4: Manual smoke** (user, can't be automated): load `dist/` unpacked → namu.wiki → confirm the right-dock 실검 허브 renders with ranking + badges + links, 🔥 toggle collapses/persists, light/dark OK, and the "인라인 링크 숨기기" option hides inline links.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content-init.ts src/options.ts src/options.html
git commit -m "feat(panel): wire hub panel into content-init + hide-inline option"
```

---

### Task 7: Panel styles + version bump

**Files:** Modify `styles.css`, `manifest.json`, `package.json`.

- [ ] **Step 1: Add panel styles** to `styles.css`:

```css
/* ── 실검 인텔리전스 허브 패널 ── */
.arca-hub {
  position: fixed;
  top: 80px;
  right: 0;
  width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  z-index: 99999;
  border-radius: 8px 0 0 8px;
  box-shadow: -2px 2px 12px rgba(0, 0, 0, 0.18);
  font-size: 12px;
}
.arca-hub-header {
  padding: 8px 10px;
  font-weight: 600;
  position: sticky;
  top: 0;
}
.arca-hub-body {
  padding: 4px 10px 10px;
}
.arca-hub-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 5px 0;
}
.arca-hub-rank {
  width: 16px;
  text-align: right;
  opacity: 0.6;
}
.arca-hub-kw {
  font-weight: 500;
}
.arca-hub-badge {
  font-size: 10px;
  min-width: 14px;
}
.arca-hub-badge-up {
  color: #e0245e;
}
.arca-hub-badge-down {
  color: #1d9bf0;
}
.arca-hub-badge-new {
  color: #f5a623;
  font-weight: 700;
}
.arca-hub-empty {
  opacity: 0.6;
  padding: 10px 0;
}
.arca-hub-toggle {
  position: fixed;
  bottom: 24px;
  right: 16px;
  z-index: 99999;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.theseed-light-mode .arca-hub {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  color: #222;
}
.theseed-light-mode .arca-hub-header {
  background: #f5f7fa;
  border-bottom: 1px solid #e0e0e0;
}
.theseed-light-mode .arca-hub-toggle {
  background: #0275d8;
  color: #fff;
}
.theseed-dark-mode .arca-hub {
  background: #1f1f24;
  border: 1px solid #3a3a42;
  color: #ddd;
}
.theseed-dark-mode .arca-hub-header {
  background: #2a2a31;
  border-bottom: 1px solid #3a3a42;
}
.theseed-dark-mode .arca-hub-toggle {
  background: #c084fc;
  color: #1a1a1a;
}

@media (max-width: 900px) {
  .arca-hub {
    width: 200px;
    font-size: 11px;
  }
}
```

- [ ] **Step 2: Bump version** — set `"version": "1.4.0"` in both `manifest.json` and `package.json`.

- [ ] **Step 3: Verify** — `npm run test:run` → all PASS, `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add styles.css manifest.json package.json
git commit -m "feat(panel): hub panel styles + bump to 1.4.0"
```

---

## Self-Review

**Spec coverage:**

- Right-dock panel surface → Tasks 3,5,7 ✓
- 실검 ranking + trend badges (▲/▼/NEW/=, baseline=same) → Tasks 1,3 ✓
- per-keyword multi-site links (reuse createLinksContainer) → Tasks 2,3 ✓
- live update on 실검 change (observer pub/sub) → Tasks 4,6 ✓
- toggle/collapse persisted to chrome.storage → Task 5 ✓
- "hide inline links" option → Task 6 ✓
- dark/light + responsive → Task 7 ✓
- additive (inline links stay by default) → Task 6 (branch on hideInline, default false) ✓
- idempotent injection + empty state → Tasks 3,5 ✓
- no new permissions → nothing touches manifest perms ✓
- version 1.4.0 → Task 7 ✓
- tests → Tasks 1,3,4,5 ✓

**Placeholder scan:** No TBD/TODO; full code in each code step. Three `> NOTE` blocks ask the implementer to confirm an existing pattern (selectors match, options.ts init shape, observer.test import) against real files — verification asks, not missing content.

**Type consistency:** `KeywordState = Map<number,string>`, `TrendBadge`, `PanelParts {panel,body,toggle}`, `buildPanel()/renderRows()/mountPanel()/updatePanel()/__resetPanelForTest()`, `computeTrends(current,prev)`, `onRealtimeChange/emitRealtimeChange`, exported `activeSites/refreshActiveSites`, consts `CSS_CLASS_PANEL*`/`STORAGE_KEY_*` — names consistent across tasks.
