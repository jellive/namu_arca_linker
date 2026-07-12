import { describe, it, expect } from "vitest";
import {
  toSnapshot,
  snapshotToKeywordState,
  pruneHistory,
  appendSnapshot,
  computeSnapshotBadges,
} from "./snapshot";
import type { KeywordSnapshot } from "../types/common";

describe("toSnapshot / snapshotToKeywordState", () => {
  it("round-trips a KeywordState through a serializable snapshot", () => {
    const state = new Map([
      [1, "키워드A"],
      [2, "키워드B"],
    ]);
    const snap = toSnapshot(state, 1000);
    expect(snap.t).toBe(1000);
    expect(snap.keywords).toEqual([
      [1, "키워드A"],
      [2, "키워드B"],
    ]);
    expect(snapshotToKeywordState(snap)).toEqual(state);
  });

  it("defaults t to Date.now() when not given", () => {
    const before = Date.now();
    const snap = toSnapshot(new Map());
    const after = Date.now();
    expect(snap.t).toBeGreaterThanOrEqual(before);
    expect(snap.t).toBeLessThanOrEqual(after);
  });
});

describe("pruneHistory", () => {
  function history(n: number): KeywordSnapshot[] {
    return Array.from({ length: n }, (_, i) => ({ t: i, keywords: [] }));
  }

  it("keeps everything when under cap", () => {
    expect(pruneHistory(history(3), 48)).toHaveLength(3);
  });

  it("drops the oldest entries when over cap, keeping the most recent", () => {
    const pruned = pruneHistory(history(50), 48);
    expect(pruned).toHaveLength(48);
    expect(pruned[0]!.t).toBe(2); // oldest 2 (t=0,1) dropped
    expect(pruned[pruned.length - 1]!.t).toBe(49);
  });

  it("is a no-op at exactly the cap", () => {
    expect(pruneHistory(history(48), 48)).toHaveLength(48);
  });
});

describe("appendSnapshot", () => {
  it("appends to the end and prunes to cap", () => {
    const existing: KeywordSnapshot[] = [{ t: 1, keywords: [] }];
    const next = appendSnapshot(existing, { t: 2, keywords: [] }, 48);
    expect(next).toHaveLength(2);
    expect(next[1]!.t).toBe(2);
  });

  it("does not mutate the original history array", () => {
    const existing: KeywordSnapshot[] = [{ t: 1, keywords: [] }];
    appendSnapshot(existing, { t: 2, keywords: [] }, 48);
    expect(existing).toHaveLength(1);
  });
});

describe("computeSnapshotBadges", () => {
  it("returns no badges when there is no previous snapshot (baseline, avoids NEW flood)", () => {
    const current = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const badges = computeSnapshotBadges(current, null);
    expect(badges.size).toBe(0);
  });

  it("marks a keyword absent from the previous snapshot as 'new'", () => {
    const prev = new Map([[1, "A"]]);
    const current = new Map([
      [1, "A"],
      [2, "C"],
    ]);
    expect(computeSnapshotBadges(current, prev).get("C")).toBe("new");
  });

  it("marks a keyword that moved to a better (lower-numbered) rank as 'up'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const current = new Map([
      [1, "B"],
      [2, "A"],
    ]); // B: 2→1
    expect(computeSnapshotBadges(current, prev).get("B")).toBe("up");
  });

  it("marks a keyword that fell to a worse (higher-numbered) rank as 'down'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const current = new Map([
      [1, "B"],
      [2, "A"],
    ]); // A: 1→2
    expect(computeSnapshotBadges(current, prev).get("A")).toBe("down");
  });

  it("has no badge entry for a keyword whose rank is unchanged", () => {
    const prev = new Map([[1, "A"]]);
    const current = new Map([[1, "A"]]);
    expect(computeSnapshotBadges(current, prev).has("A")).toBe(false);
  });

  it("does not badge keywords that only exist in the previous snapshot", () => {
    const prev = new Map([
      [1, "A"],
      [2, "곧사라질것"],
    ]);
    const current = new Map([[1, "A"]]);
    const badges = computeSnapshotBadges(current, prev);
    expect(badges.has("곧사라질것")).toBe(false);
    expect(badges.size).toBe(0);
  });
});
