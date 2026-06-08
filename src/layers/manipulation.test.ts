import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildSearchUrl,
  createSiteLink,
  createLinksContainer,
  addNewLink,
  updateArcaLink,
  addArcaLinks,
} from "./manipulation";
import {
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
} from "../constants/config";
import type { TargetSite } from "../lib/storage";

describe("buildSearchUrl", () => {
  it("substitutes + URL-encodes the keyword", () => {
    const url = buildSearchUrl(
      "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
      "한국",
    );
    expect(url).toContain("keyword=%ED%95%9C%EA%B5%AD");
  });

  it("encodes special characters", () => {
    const url = buildSearchUrl("https://x.com/search?q={keyword}", "a b+c");
    expect(url).toContain("q=a%20b%2Bc");
  });

  it("returns '' when the template has no {keyword} placeholder", () => {
    expect(buildSearchUrl("https://example.com/", "x")).toBe("");
  });

  it("returns '' for a non-http(s) template", () => {
    expect(buildSearchUrl("javascript:alert(1)?q={keyword}", "x")).toBe("");
  });
});

const SITE: TargetSite = {
  name: "구글 검색",
  label: "구글",
  url: "https://www.google.com/search?q={keyword}",
};

describe("createSiteLink", () => {
  it("creates an anchor showing the short label", () => {
    const link = createSiteLink(SITE, "아이유")!;
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("구글");
    expect(link.className).toBe(CSS_CLASS_ARCA_LINK);
    expect(link.target).toBe("_blank");
    expect(link.href).toContain("google.com/search?q=");
  });

  it("falls back to name when label is absent", () => {
    const link = createSiteLink(
      { name: "Foo", url: "https://foo/{keyword}" },
      "x",
    )!;
    expect(link.textContent).toBe("Foo");
  });

  it("sets rel=noopener noreferrer and a descriptive title", () => {
    const link = createSiteLink(SITE, "뉴진스")!;
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.title).toContain("뉴진스");
    expect(link.title).toContain("구글 검색");
  });

  it("returns null for a site whose url lacks {keyword}", () => {
    expect(createSiteLink({ name: "X", url: "https://x/" }, "k")).toBeNull();
  });

  it("click handler stops propagation", () => {
    const link = createSiteLink(SITE, "테스트")!;
    document.body.appendChild(link);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(ev, "stopPropagation");
    link.dispatchEvent(ev);
    expect(stopProp).toHaveBeenCalled();
    document.body.removeChild(link);
  });
});

describe("createLinksContainer", () => {
  const sites: TargetSite[] = [
    { name: "아카", label: "아카", url: "https://arca/{keyword}" },
    { name: "구글", label: "구글", url: "https://g/{keyword}" },
    { name: "노템플릿", url: "https://no-keyword/" }, // must be skipped
  ];

  it("creates a container with one link per valid site", () => {
    const c = createLinksContainer("손흥민", sites);
    expect(c.className).toBe(CSS_CLASS_LINKS_CONTAINER);
    const links = c.querySelectorAll(`a.${CSS_CLASS_ARCA_LINK}`);
    expect(links).toHaveLength(2); // the no-{keyword} site is skipped
    expect(links[0]!.textContent).toBe("아카");
    expect(links[1]!.textContent).toBe("구글");
  });

  it("creates an empty container when given no sites", () => {
    const c = createLinksContainer("x", []);
    expect(c.querySelectorAll("a")).toHaveLength(0);
  });
});

describe("addNewLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("appends a links container to the keyword's <li>", () => {
    document.body.innerHTML = `<ul><li><span class="kw">손흥민</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "손흥민");
    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
    expect(
      li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER} a`).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not add a second container if one already exists (idempotent)", () => {
    document.body.innerHTML = `<ul><li><span class="kw">날씨</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "날씨");
    addNewLink(el, "날씨");
    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
  });

  it("inserts container as next sibling when no parent <li>", () => {
    document.body.innerHTML = '<div><span id="s">target</span></div>';
    const span = document.getElementById("s") as HTMLElement;
    addNewLink(span, "키워드");
    expect(
      span.nextElementSibling?.classList.contains(CSS_CLASS_LINKS_CONTAINER),
    ).toBe(true);
  });

  it("does NOT insert when next sibling is already a links container (no <li>)", () => {
    document.body.innerHTML = `<div><span id="s">t</span><span class="${CSS_CLASS_LINKS_CONTAINER}"></span></div>`;
    const span = document.getElementById("s") as HTMLElement;
    const beforeCount = document.querySelectorAll(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ).length;
    addNewLink(span, "키워드");
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(beforeCount);
  });
});

describe("addArcaLinks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // @ts-expect-error minimal chrome mock for storage read
    globalThis.chrome = {
      storage: {
        sync: {
          get: (_d: unknown, cb: (v: { targetSites: undefined }) => void) =>
            cb({ targetSites: undefined }),
        },
      },
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a links container per realtime keyword and marks them processed", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=손흥민" title="손흥민">손흥민</a></li>
        <li><a href="/Go?q=비트코인" title="비트코인">비트코인</a></li>
      </ul>`;
    await addArcaLinks();
    const containers = document.querySelectorAll(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    );
    expect(containers.length).toBe(2);
    document
      .querySelectorAll('a[href^="/Go?q="]')
      .forEach((el) =>
        expect((el as HTMLElement).hasAttribute(DATA_ATTR_PROCESSED)).toBe(
          true,
        ),
      );
  });

  it("logs warning and returns when no realtime markup is present", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await addArcaLinks();
    const flatLog = log.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(flatLog).toContain("찾을 수 없");
    log.mockRestore();
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
    // No duplicate containers injected on second run.
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
  });

  it("skips anchors with empty/whitespace text", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=blank">    </a></li>
      </ul>
    `;
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
  });

  it("skips anchors whose textContent is purely numeric (rank labels)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=numeric">123</a></li>
      </ul>
    `;
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
  });

  it("uses anchor's title attribute as keyword when present (overrides text)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=foo" title="진짜키워드">foo</a></li>
      </ul>
    `;
    await addArcaLinks();
    const container = document.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`);
    expect(container).not.toBeNull();
    const firstLink = container!.querySelector("a") as HTMLAnchorElement;
    expect(firstLink.href).toContain(encodeURIComponent("진짜키워드"));
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
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(2);
  });

  it("falls back to text-based heuristic via heading containing '인기'", async () => {
    document.body.innerHTML = `
      <aside>
        <h3>인기 검색어 TOP</h3>
        <a>인기키워드</a>
      </aside>
    `;
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
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
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
  });

  it('adds container for "added" change type', async () => {
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "새키워드",
      element: anchor,
    });
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
  });

  it('replaces container for "modified" change type via fade animation', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<ul><li><a id="a">target</a><span class="${CSS_CLASS_LINKS_CONTAINER}"><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></span></li></ul>`;
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
    const containers = li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`);
    expect(containers.length).toBe(1);
    const firstLink = containers[0]!.querySelector("a") as HTMLAnchorElement;
    expect(decodeURIComponent(firstLink.href)).toContain("신규");
  });

  it('"modified" falls back to addNewLink when no existing container found', async () => {
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

    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('"removed" change type only logs (does not mutate DOM)', async () => {
    document.body.innerHTML = `<ul><li><a id="a">t</a><span class="${CSS_CLASS_LINKS_CONTAINER}"><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></span></li></ul>`;
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
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
    warn.mockRestore();
  });
});

describe("updateArcaLink (modified)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces the container's links with the new keyword", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<ul><li><span class="kw">옛키워드</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "옛키워드");

    const promise = updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "옛키워드",
      newKeyword: "새키워드",
      element: el,
    });
    await vi.runAllTimersAsync();
    await promise;

    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
    const firstLink = li.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER} a`,
    ) as HTMLAnchorElement;
    expect(decodeURIComponent(firstLink.href)).toContain("새키워드");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("updateExistingLink — element outside <li> (parentNode fallback)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses parentNode.querySelector when element has no <li> ancestor", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="container">
        <a id="target">target</a>
        <span class="${CSS_CLASS_LINKS_CONTAINER}"><a class="${CSS_CLASS_ARCA_LINK}">왜?</a></span>
      </div>
    `;
    const anchor = document.getElementById("target") as HTMLElement;

    const promise = updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "old",
      newKeyword: "신규아카",
      element: anchor,
    });
    await vi.runAllTimersAsync();
    await promise;

    const container = document.getElementById("container") as HTMLElement;
    const containers = container.querySelectorAll(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    );
    expect(containers.length).toBe(1);
    const firstLink = containers[0]!.querySelector("a") as HTMLAnchorElement;
    expect(decodeURIComponent(firstLink.href)).toContain("신규아카");
    expect((containers[0] as HTMLElement).parentElement?.id).toBe("container");
  });

  it("addNewLink uses parentLi.appendChild (link goes to end of <li>, after siblings)", async () => {
    document.body.innerHTML =
      '<ul><li><a id="a">target</a><span id="after">after</span></li></ul>';
    const anchor = document.getElementById("a") as HTMLElement;
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "키워드",
      element: anchor,
    });
    const li = document.querySelector("li") as HTMLElement;
    expect(
      li.lastElementChild?.classList.contains(CSS_CLASS_LINKS_CONTAINER),
    ).toBe(true);
  });

  it("warns and falls back to addNewLink when element has no <li> AND no existing container sibling", async () => {
    document.body.innerHTML = `
      <div id="container">
        <a id="target">target</a>
      </div>
    `;
    const anchor = document.getElementById("target") as HTMLElement;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "old",
      newKeyword: "fresh",
      element: anchor,
    });

    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
