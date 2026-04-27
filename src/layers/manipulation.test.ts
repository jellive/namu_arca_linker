import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getArcaSearchUrl,
  createArcaLink,
  addNewLink,
  updateArcaLink,
  addArcaLinks,
} from "./manipulation";
import { CSS_CLASS_ARCA_LINK, DATA_ATTR_PROCESSED } from "../constants/config";

describe("getArcaSearchUrl", () => {
  it("builds correct URL for ASCII keyword", () => {
    const url = getArcaSearchUrl("hello");
    expect(url).toBe("https://arca.live/b/namuhotnow?target=all&keyword=hello");
  });

  it("encodes Korean keyword", () => {
    const url = getArcaSearchUrl("한국");
    expect(url).toContain("keyword=%ED%95%9C%EA%B5%AD");
  });

  it("encodes special characters", () => {
    const url = getArcaSearchUrl("a b+c");
    expect(url).toContain("keyword=a%20b%2Bc");
  });

  it("returns a valid https URL for empty keyword", () => {
    const url = getArcaSearchUrl("");
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain("keyword=");
  });

  it("uses target=all query parameter", () => {
    const url = getArcaSearchUrl("test");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("target")).toBe("all");
  });
});

describe("createArcaLink", () => {
  it("creates anchor with correct attributes", () => {
    const link = createArcaLink("아이유");
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("왜?");
    expect(link.target).toBe("_blank");
    expect(link.className).toBe("arca-link");
    expect(link.href).toContain("arca.live");
  });

  it("sets rel to noopener noreferrer for security", () => {
    const link = createArcaLink("테스트");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("includes keyword in title attribute", () => {
    const link = createArcaLink("뉴진스");
    expect(link.title).toContain("뉴진스");
  });

  it("attached click handler stops propagation so the original anchor doesn't navigate", () => {
    const link = createArcaLink("테스트");
    document.body.appendChild(link);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(ev, "stopPropagation");
    link.dispatchEvent(ev);
    expect(stopProp).toHaveBeenCalled();
    document.body.removeChild(link);
  });
});

describe("addNewLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("appends link inside parent <li> when present", () => {
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;
    addNewLink(anchor, "키워드");
    const li = document.querySelector("li") as HTMLElement;
    expect(li.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
  });

  it("does not add duplicate link when one already exists", () => {
    document.body.innerHTML = `<ul><li><a id="a">target</a><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></li></ul>`;
    const anchor = document.getElementById("a") as HTMLElement;
    addNewLink(anchor, "키워드");
    const li = document.querySelector("li") as HTMLElement;
    expect(li.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
  });

  it("inserts link as next sibling when no parent <li>", () => {
    document.body.innerHTML = '<div><span id="s">target</span></div>';
    const span = document.getElementById("s") as HTMLElement;
    addNewLink(span, "키워드");
    expect(
      span.nextElementSibling?.classList.contains(CSS_CLASS_ARCA_LINK),
    ).toBe(true);
  });

  it("does NOT insert when next sibling is already arca-link (no <li>)", () => {
    document.body.innerHTML = `<div><span id="s">t</span><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></div>`;
    const span = document.getElementById("s") as HTMLElement;
    const beforeCount = document.querySelectorAll(
      `.${CSS_CLASS_ARCA_LINK}`,
    ).length;
    addNewLink(span, "키워드");
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(
      beforeCount,
    );
  });
});

describe("updateArcaLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when element is undefined", async () => {
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "new",
      element: undefined,
    });
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(0);
  });

  it('adds link for "added" change type', async () => {
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "새키워드",
      element: anchor,
    });
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
  });

  it('replaces link for "modified" change type via fade animation', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<ul><li><a id="a">target</a><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></li></ul>`;
    const anchor = document.getElementById("a") as HTMLElement;

    const promise = updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "old",
      newKeyword: "신규",
      element: anchor,
    });

    // Run the FADE_DURATION_MS timer + microtasks
    await vi.runAllTimersAsync();
    await promise;

    const li = document.querySelector("li") as HTMLElement;
    const arcaLinks = li.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`);
    expect(arcaLinks.length).toBe(1);
    expect((arcaLinks[0] as HTMLAnchorElement).title).toContain("신규");
  });

  it('"modified" falls back to addNewLink when no existing arca-link found', async () => {
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "old",
      newKeyword: "신규",
      element: anchor,
    });

    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('"removed" change type only logs (does not mutate DOM)', async () => {
    document.body.innerHTML = `<ul><li><a id="a">t</a><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></li></ul>`;
    const anchor = document.getElementById("a") as HTMLElement;
    const before = document.body.innerHTML;

    await updateArcaLink({
      type: "removed",
      rank: 1,
      oldKeyword: "사라짐",
      element: anchor,
    });

    expect(document.body.innerHTML).toBe(before);
  });

  it("warns and no-ops on unknown change type (default branch)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = '<ul><li><a id="a">t</a></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;

    await updateArcaLink({
      type: "future-type" as unknown as "added",
      rank: 1,
      element: anchor,
      newKeyword: "x",
    });

    expect(warn).toHaveBeenCalled();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(0);
    warn.mockRestore();
  });
});

describe("addArcaLinks — DOM scan + injection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("logs warning and returns when no realtime markup is present", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await addArcaLinks();
    // Two log lines: "찾을 수 없습니다" + "개발자 도구..."
    const flatLog = log.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(flatLog).toContain("찾을 수 없");
    log.mockRestore();
  });

  it("injects arca-link for each /Go?q= anchor in <ul>", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=first">first</a></li>
        <li><a href="/Go?q=second">second</a></li>
      </ul>
    `;
    await addArcaLinks();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(2);
  });

  it("marks processed anchors with the data attribute (idempotent)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=once">once</a></li>
      </ul>
    `;
    await addArcaLinks();
    await addArcaLinks(); // second pass should be a no-op for marked nodes

    const anchors = document.querySelectorAll('a[href^="/Go?q="]');
    anchors.forEach((a) => {
      expect((a as HTMLElement).getAttribute(DATA_ATTR_PROCESSED)).toBe("true");
    });
    // No duplicate arca-links injected on second run.
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
  });

  it("skips anchors with empty/whitespace text", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=blank">    </a></li>
      </ul>
    `;
    await addArcaLinks();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(0);
  });

  it("skips anchors whose textContent is purely numeric (rank labels)", async () => {
    // The script avoids inserting "왜?" links next to plain rank numbers
    // like "1" or "2" that namu.wiki sometimes renders separately.
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=numeric">123</a></li>
      </ul>
    `;
    await addArcaLinks();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(0);
  });

  it("uses anchor's title attribute as keyword when present (overrides text)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=foo" title="진짜키워드">foo</a></li>
      </ul>
    `;
    await addArcaLinks();
    const arca = document.querySelector(
      `.${CSS_CLASS_ARCA_LINK}`,
    ) as HTMLAnchorElement;
    expect(arca.href).toContain(encodeURIComponent("진짜키워드"));
  });

  it("falls back to text-based heuristic via heading containing '실시간'", async () => {
    document.body.innerHTML = `
      <section>
        <h2>실시간 검색어</h2>
        <a>키워드A</a>
        <a>키워드B</a>
      </section>
    `;
    await addArcaLinks();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(2);
  });

  it("falls back to text-based heuristic via heading containing '인기'", async () => {
    document.body.innerHTML = `
      <aside>
        <h3>인기 검색어 TOP</h3>
        <a>인기키워드</a>
      </aside>
    `;
    await addArcaLinks();
    expect(document.querySelectorAll(`.${CSS_CLASS_ARCA_LINK}`).length).toBe(1);
  });
});
