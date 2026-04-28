import { describe, it, expect, beforeEach, vi } from "vitest";
import { keywordCache, detectKeywordChanges } from "./detection";
import * as discovery from "./discovery";

function mockKeywords(map: Map<number, string>) {
  vi.spyOn(discovery, "extractCurrentKeywords").mockReturnValue(map);
  vi.spyOn(discovery, "getRealtimeLinkByRank").mockReturnValue(null);
}

beforeEach(() => {
  keywordCache.clear();
});

describe("detectKeywordChanges", () => {
  it("returns empty array on first call (cache init)", () => {
    mockKeywords(
      new Map([
        [1, "키워드A"],
        [2, "키워드B"],
      ]),
    );
    const changes = detectKeywordChanges();
    expect(changes).toHaveLength(0);
    expect(keywordCache.get(1)).toBe("키워드A");
    expect(keywordCache.get(2)).toBe("키워드B");
  });

  it("detects added keyword", () => {
    // Seed cache with rank 1 only
    keywordCache.set(1, "키워드A");
    mockKeywords(
      new Map([
        [1, "키워드A"],
        [2, "신규키워드"],
      ]),
    );

    const changes = detectKeywordChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("added");
    expect(changes[0].rank).toBe(2);
    expect(changes[0].newKeyword).toBe("신규키워드");
  });

  it("detects modified keyword", () => {
    keywordCache.set(1, "이전키워드");
    mockKeywords(new Map([[1, "변경키워드"]]));

    const changes = detectKeywordChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("modified");
    expect(changes[0].rank).toBe(1);
    expect(changes[0].oldKeyword).toBe("이전키워드");
    expect(changes[0].newKeyword).toBe("변경키워드");
  });

  it("detects removed keyword", () => {
    keywordCache.set(1, "키워드A");
    keywordCache.set(2, "사라질키워드");
    mockKeywords(new Map([[1, "키워드A"]]));

    const changes = detectKeywordChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe("removed");
    expect(changes[0].rank).toBe(2);
    expect(changes[0].oldKeyword).toBe("사라질키워드");
  });

  it("updates cache after detecting changes", () => {
    keywordCache.set(1, "이전");
    mockKeywords(
      new Map([
        [1, "이후"],
        [2, "신규"],
      ]),
    );

    detectKeywordChanges();
    expect(keywordCache.get(1)).toBe("이후");
    expect(keywordCache.get(2)).toBe("신규");
  });

  it("removed keyword has empty string newKeyword", () => {
    // Pin `newKeyword: ''` literal in the removed branch. Stryker
    // mutates `''` to "Stryker was here!" — this assertion catches it.
    keywordCache.set(1, "키워드A");
    keywordCache.set(2, "사라질");
    mockKeywords(new Map([[1, "키워드A"]]));
    const changes = detectKeywordChanges();
    expect(changes[0].type).toBe("removed");
    expect(changes[0].newKeyword).toBe(""); // exact empty string
  });

  it("attaches element from getRealtimeLinkByRank when present", () => {
    // Pin `?? undefined` on element extraction in modified + added branches.
    // Mutation `&& undefined` would return undefined when the left side
    // (an actual element) is truthy.
    const fakeAnchor = document.createElement("a");
    vi.spyOn(discovery, "getRealtimeLinkByRank").mockReturnValue(fakeAnchor);
    vi.spyOn(discovery, "extractCurrentKeywords").mockReturnValue(
      new Map([[1, "변경됨"]]),
    );
    keywordCache.set(1, "이전");
    const changes = detectKeywordChanges();
    expect(changes[0].element).toBe(fakeAnchor);
  });

  it("emits 변경 감지 log only when changes is non-empty", () => {
    // Pin `if (changes.length > 0)` — ConditionalExpression mutations
    // (true/false) and EqualityOperator (>=, <=).
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Empty change set: cache init path returns [] without 총 changes log.
    mockKeywords(new Map([[1, "k"]]));
    detectKeywordChanges();
    const logs = logSpy.mock.calls.map((c) => c.join(" "));
    expect(logs.some((l) => l.includes("변경 감지"))).toBe(false);

    // With changes: 변경 감지 log MUST fire.
    logSpy.mockClear();
    keywordCache.set(1, "이전");
    mockKeywords(new Map([[1, "이후"]]));
    detectKeywordChanges();
    const logs2 = logSpy.mock.calls.map((c) => c.join(" "));
    expect(logs2.some((l) => l.includes("변경 감지"))).toBe(true);

    logSpy.mockRestore();
  });
});
