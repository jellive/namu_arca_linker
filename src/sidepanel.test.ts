import { describe, it, expect, beforeEach, vi } from "vitest";
import type { KeywordSnapshot } from "./types/common";

const readCurrentKeywords = vi.fn();
const readSnapshotHistory = vi.fn();
vi.mock("./lib/snapshot-storage", () => ({
  readCurrentKeywords: () => readCurrentKeywords(),
  readSnapshotHistory: () => readSnapshotHistory(),
}));

// manipulation.ts (createLinkContainer/refreshThreadMatches) is imported
// for REAL — it's the exact logic the content script uses and must not be
// duplicated. Only chrome.runtime.sendMessage (its one chrome dependency)
// is stubbed, same as manipulation.test.ts does.
const sendMessage = vi.fn();
const onChangedAdd = vi.fn();

import { buildKeywordRow, render, init } from "./sidepanel";
import { threadMatches } from "./layers/manipulation";
import {
  CSS_CLASS_LINKS_CONTAINER,
  STORAGE_KEY_CURRENT_KEYWORDS,
  STORAGE_KEY_SNAPSHOT_HISTORY,
} from "./constants/config";

beforeEach(() => {
  document.body.innerHTML = `
    <div id="empty-state"></div>
    <div id="kw-list"></div>
  `;
  readCurrentKeywords.mockReset();
  readSnapshotHistory.mockReset().mockResolvedValue([]);
  sendMessage.mockReset().mockResolvedValue({ matches: {} });
  onChangedAdd.mockReset();
  threadMatches.clear();
  globalThis.chrome = {
    runtime: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
    storage: { onChanged: { addListener: onChangedAdd } },
  } as unknown as typeof chrome;
});

describe("buildKeywordRow", () => {
  it("renders rank, keyword text, and the smart link container, with no badge by default", () => {
    const row = buildKeywordRow(3, "황승언", null, undefined);
    expect(row.querySelector(".kw-rank")?.textContent).toBe("3");
    expect(row.querySelector(".kw-name")?.textContent).toBe("황승언");
    expect(row.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)).not.toBeNull();
    expect(row.querySelector(".kw-badge")).toBeNull();
  });

  it.each([
    ["new", "NEW"],
    ["up", "▲"],
    ["down", "▼"],
  ] as const)("renders a '%s' badge as %s", (badge, label) => {
    const row = buildKeywordRow(1, "x", null, badge);
    const badgeEl = row.querySelector(".kw-badge");
    expect(badgeEl?.textContent).toBe(label);
    expect(badgeEl?.className).toContain(`kw-badge-${badge}`);
  });

  it("passes the match through to the reused createLinkContainer (💬 link)", () => {
    const row = buildKeywordRow(
      1,
      "황승언",
      { id: 5, title: "황승언" },
      undefined,
    );
    const link = row.querySelector("a");
    expect(link?.textContent).toBe("💬");
    expect(link?.href).toContain("/5");
  });
});

describe("render — empty state (no namu.wiki tab has pushed keywords yet)", () => {
  it("shows the empty-state message and no rows when nothing stored", async () => {
    readCurrentKeywords.mockResolvedValue(null);
    await render();
    expect(
      (document.getElementById("empty-state") as HTMLElement).style.display,
    ).toBe("block");
    expect(document.getElementById("kw-list")!.children).toHaveLength(0);
  });
});

describe("render — populated", () => {
  const CURRENT: KeywordSnapshot = {
    t: 2000,
    keywords: [
      [1, "B"],
      [2, "A"],
      [3, "C"],
    ],
  };
  const PREVIOUS: KeywordSnapshot = {
    t: 1000,
    keywords: [
      [1, "A"],
      [2, "B"],
    ],
  }; // A 1→2 (down), B 2→1 (up), C is new

  it("hides the empty state and renders one row per keyword, ordered by rank", async () => {
    readCurrentKeywords.mockResolvedValue(CURRENT);
    readSnapshotHistory.mockResolvedValue([PREVIOUS]);

    await render();

    expect(
      (document.getElementById("empty-state") as HTMLElement).style.display,
    ).toBe("none");
    const rows = document.querySelectorAll("#kw-list .kw-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.querySelector(".kw-name")?.textContent).toBe("B");
    expect(rows[1]!.querySelector(".kw-name")?.textContent).toBe("A");
    expect(rows[2]!.querySelector(".kw-name")?.textContent).toBe("C");
  });

  it("attaches NEW/▲/▼ badges computed against the most recent snapshot in history", async () => {
    readCurrentKeywords.mockResolvedValue(CURRENT);
    readSnapshotHistory.mockResolvedValue([PREVIOUS]);

    await render();

    const rows = Array.from(document.querySelectorAll("#kw-list .kw-row"));
    const badgeFor = (name: string) =>
      rows
        .find((r) => r.querySelector(".kw-name")?.textContent === name)
        ?.querySelector(".kw-badge")?.textContent;
    expect(badgeFor("B")).toBe("▲");
    expect(badgeFor("A")).toBe("▼");
    expect(badgeFor("C")).toBe("NEW");
  });

  it("shows no badges on the very first snapshot (empty history)", async () => {
    readCurrentKeywords.mockResolvedValue(CURRENT);
    readSnapshotHistory.mockResolvedValue([]);

    await render();

    expect(document.querySelectorAll("#kw-list .kw-badge")).toHaveLength(0);
  });

  it("requests thread matches for the current keywords via the background SW", async () => {
    readCurrentKeywords.mockResolvedValue(CURRENT);
    readSnapshotHistory.mockResolvedValue([]);
    sendMessage.mockResolvedValue({ matches: { B: { id: 9, title: "B" } } });

    await render();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "matchThreads" }),
    );
    const rows = Array.from(document.querySelectorAll("#kw-list .kw-row"));
    const bRow = rows.find(
      (r) => r.querySelector(".kw-name")?.textContent === "B",
    );
    expect(bRow?.querySelector("a")?.textContent).toBe("💬");
  });
});

describe("init", () => {
  it("renders once on load and subscribes to storage changes", async () => {
    readCurrentKeywords.mockResolvedValue(null);
    init();
    await Promise.resolve();
    await Promise.resolve();
    expect(onChangedAdd).toHaveBeenCalledTimes(1);
  });

  it("re-renders when currentKeywords or snapshotHistory changes in storage.local", async () => {
    readCurrentKeywords.mockResolvedValue(null);
    init();
    await Promise.resolve();
    readCurrentKeywords.mockClear();

    const listener = onChangedAdd.mock.calls[0]![0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void;
    listener({ [STORAGE_KEY_CURRENT_KEYWORDS]: {} }, "local");
    await Promise.resolve();
    expect(readCurrentKeywords).toHaveBeenCalled();

    readCurrentKeywords.mockClear();
    listener({ [STORAGE_KEY_SNAPSHOT_HISTORY]: {} }, "local");
    await Promise.resolve();
    expect(readCurrentKeywords).toHaveBeenCalled();
  });

  it("ignores unrelated storage changes / other areas", async () => {
    readCurrentKeywords.mockResolvedValue(null);
    init();
    await Promise.resolve();
    readCurrentKeywords.mockClear();

    const listener = onChangedAdd.mock.calls[0]![0] as (
      changes: Record<string, unknown>,
      area: string,
    ) => void;
    listener({ [STORAGE_KEY_CURRENT_KEYWORDS]: {} }, "sync");
    listener({ someOtherKey: {} }, "local");
    await Promise.resolve();
    expect(readCurrentKeywords).not.toHaveBeenCalled();
  });
});
