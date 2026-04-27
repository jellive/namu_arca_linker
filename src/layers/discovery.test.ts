import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractKeywordFromLink,
  extractCurrentKeywords,
  getRealtimeLinkByRank,
} from "./discovery";

function makeAnchor(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  return a;
}

describe("extractKeywordFromLink", () => {
  it("extracts keyword from /Go?q= href", () => {
    const a = makeAnchor("https://namu.wiki/Go?q=%ED%95%9C%EA%B5%AD", "한국");
    expect(extractKeywordFromLink(a)).toBe("한국");
  });

  it("falls back to textContent when no /Go?q= in href", () => {
    const a = makeAnchor("https://namu.wiki/some-page", "검색어텍스트");
    expect(extractKeywordFromLink(a)).toBe("검색어텍스트");
  });

  it("returns null when both href and textContent are empty", () => {
    const a = document.createElement("a");
    expect(extractKeywordFromLink(a)).toBeNull();
  });

  it("decodes encoded keyword from URL", () => {
    const a = makeAnchor(
      "https://namu.wiki/Go?q=%EC%95%84%EC%9D%B4%EC%9C%A0",
      "아이유",
    );
    expect(extractKeywordFromLink(a)).toBe("아이유");
  });

  it("falls back to textContent when /Go?q= URL has empty q parameter", () => {
    // Edge case: /Go?q= present but empty value → should still fall through
    // to textContent rather than returning a blank string.
    const a = makeAnchor("https://namu.wiki/Go?q=", "fallback-text");
    expect(extractKeywordFromLink(a)).toBe("fallback-text");
  });

  it("returns null for a /Go?q= URL with empty q AND no textContent", () => {
    const a = makeAnchor("https://namu.wiki/Go?q=", "");
    expect(extractKeywordFromLink(a)).toBeNull();
  });

  it("trims whitespace from textContent fallback", () => {
    const a = makeAnchor("https://namu.wiki/page", "   spaced   ");
    expect(extractKeywordFromLink(a)).toBe("spaced");
  });

  it("returns null when textContent is whitespace-only", () => {
    const a = makeAnchor("https://namu.wiki/page", "    ");
    expect(extractKeywordFromLink(a)).toBeNull();
  });

  it("warns and falls back to textContent when href contains /Go?q= but URL parser throws", () => {
    // Force `new URL()` to throw to exercise the catch branch (line 19-21).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fakeAnchor = {
      href: "https://malformed.example/Go?q=test",
      textContent: "fallback",
    } as unknown as HTMLAnchorElement;
    const origURL = globalThis.URL;
    globalThis.URL = function () {
      throw new Error("invalid url");
    } as unknown as typeof URL;
    try {
      expect(extractKeywordFromLink(fakeAnchor)).toBe("fallback");
      expect(warn).toHaveBeenCalled();
    } finally {
      globalThis.URL = origURL;
      warn.mockRestore();
    }
  });
});

describe("extractCurrentKeywords", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns empty Map when no realtime selectors match", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractCurrentKeywords();
    expect(result.size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns 1-based rank → keyword Map for /Go?q= anchors", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=%EC%95%84%EC%9D%B4%EC%9C%A0">아이유</a></li>
        <li><a href="/Go?q=%ED%95%9C%EA%B5%AD">한국</a></li>
        <li><a href="/Go?q=%EB%89%B4%EC%A7%84%EC%8A%A4">뉴진스</a></li>
      </ul>
    `;
    const result = extractCurrentKeywords();
    expect(result.size).toBe(3);
    expect(result.get(1)).toBe("아이유");
    expect(result.get(2)).toBe("한국");
    expect(result.get(3)).toBe("뉴진스");
  });

  it("uses fallback selector when primary returns nothing", () => {
    // Skip the primary 'a[href^="/Go?q="]' selector. Use a fallback class
    // selector that matches REALTIME_SELECTORS list.
    document.body.innerHTML = `
      <div class="realtime-container">
        <ul>
          <li><a href="/page">키워드A</a></li>
          <li><a href="/page">키워드B</a></li>
        </ul>
      </div>
    `;
    const result = extractCurrentKeywords();
    expect(result.size).toBe(2);
    expect(result.get(1)).toBe("키워드A");
    expect(result.get(2)).toBe("키워드B");
  });

  it("skips anchors whose keyword cannot be extracted", () => {
    // First anchor has empty content → null; should be skipped.
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q="></a></li>
        <li><a href="/Go?q=%ED%95%9C%EA%B5%AD">한국</a></li>
      </ul>
    `;
    const result = extractCurrentKeywords();
    expect(result.size).toBe(1);
    // Note: index 1 still increments based on iteration order; the empty one
    // resolved to null and was skipped, so index 2 → "한국".
    expect(result.get(2)).toBe("한국");
  });
});

describe("getRealtimeLinkByRank", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no realtime selectors match", () => {
    expect(getRealtimeLinkByRank(1)).toBeNull();
  });

  it("returns the anchor at the given 1-based rank", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=first" id="r1">first</a></li>
        <li><a href="/Go?q=second" id="r2">second</a></li>
        <li><a href="/Go?q=third" id="r3">third</a></li>
      </ul>
    `;
    expect(getRealtimeLinkByRank(1)?.id).toBe("r1");
    expect(getRealtimeLinkByRank(2)?.id).toBe("r2");
    expect(getRealtimeLinkByRank(3)?.id).toBe("r3");
  });

  it("returns null when rank is out of range (too high)", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=only">only</a></li>
      </ul>
    `;
    expect(getRealtimeLinkByRank(5)).toBeNull();
  });

  it("returns null when rank is 0 (1-based) - guards against off-by-one", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=only">only</a></li>
      </ul>
    `;
    // rank 0 → index -1 → undefined → fallback to null
    expect(getRealtimeLinkByRank(0)).toBeNull();
  });

  it("uses fallback selector when primary returns nothing", () => {
    document.body.innerHTML = `
      <div class="trending-list">
        <ul>
          <li><a href="/page" id="t1">first</a></li>
          <li><a href="/page" id="t2">second</a></li>
        </ul>
      </div>
    `;
    expect(getRealtimeLinkByRank(2)?.id).toBe("t2");
  });
});
