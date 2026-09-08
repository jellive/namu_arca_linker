import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildSearchUrl,
  createThreadLink,
  createLinkContainer,
  refreshThreadMatches,
  threadMatches,
  addArcaLinks,
  addNewLink,
  updateExistingLink,
  updateArcaLink,
} from "./manipulation";
import {
  ARCA_BASE_URL,
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
  DATA_ATTR_THREAD,
} from "../constants/config";
import type { ThreadMatch } from "../lib/arca-api";
import type { ChangeType } from "../types/common";

const sendMessage = vi.fn();

beforeEach(() => {
  document.body.innerHTML = "";
  sendMessage.mockReset();
  threadMatches.clear();
  globalThis.chrome = {
    runtime: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
  } as unknown as typeof chrome;
});
afterEach(() => vi.restoreAllMocks());

describe("buildSearchUrl", () => {
  it("substitutes + URL-encodes the keyword", () => {
    const url = buildSearchUrl(
      "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
      "한국",
    );
    expect(url).toContain("keyword=%ED%95%9C%EA%B5%AD");
  });
  it("returns '' when no {keyword} placeholder", () => {
    expect(buildSearchUrl("https://example.com/", "x")).toBe("");
  });
  it("returns '' for a non-http(s) template", () => {
    expect(buildSearchUrl("javascript:alert(1)?q={keyword}", "x")).toBe("");
  });
});

const MATCH: ThreadMatch = {
  id: 555,
  title: "황승언",
  commentCount: 23,
  category: "커뮤",
};

describe("createThreadLink", () => {
  it("builds a thread link (💬 + count) when matched", () => {
    const a = createThreadLink("황승언", MATCH);
    expect(a.tagName).toBe("A");
    expect(a.href).toContain("/b/namuhotnow/555");
    expect(a.textContent).toBe("💬23");
    expect(a.title).toBe("황승언");
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noopener noreferrer");
  });

  it("uses category when commentCount is absent", () => {
    const a = createThreadLink("x", { id: 1, title: "x", category: "스포츠" });
    expect(a.textContent).toBe("💬스포츠");
  });

  it("shows bare 💬 when neither count nor category present", () => {
    const a = createThreadLink("x", { id: 1, title: "x" });
    expect(a.textContent).toBe("💬");
  });

  it("falls back to a 🔎 search link when no match", () => {
    const a = createThreadLink("김치찌개", null);
    expect(a.textContent).toBe("🔎");
    expect(a.href).toContain("keyword=");
    expect(decodeURIComponent(a.href)).toContain("김치찌개");
  });

  it("click handler stops propagation", () => {
    const a = createThreadLink("x", MATCH);
    document.body.appendChild(a);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(ev, "stopPropagation");
    a.dispatchEvent(ev);
    expect(stop).toHaveBeenCalled();
  });
});

describe("createLinkContainer", () => {
  it("wraps a single thread link in a container span", () => {
    const c = createLinkContainer("황승언", MATCH);
    expect(c.className).toBe(CSS_CLASS_LINKS_CONTAINER);
    expect(c.querySelectorAll(`a.${CSS_CLASS_ARCA_LINK}`)).toHaveLength(1);
  });
});

describe("refreshThreadMatches", () => {
  it("populates threadMatches from the SW response", async () => {
    sendMessage.mockResolvedValue({ matches: { 황승언: MATCH, 날씨: null } });
    await refreshThreadMatches(["황승언", "날씨"]);
    expect(threadMatches.get("황승언")).toEqual(MATCH);
    expect(threadMatches.get("날씨")).toBeNull();
  });

  it("sets all keywords null on SW failure", async () => {
    sendMessage.mockRejectedValue(new Error("no SW"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshThreadMatches(["a", "b"]);
    expect(threadMatches.get("a")).toBeNull();
    expect(threadMatches.get("b")).toBeNull();
    warn.mockRestore();
  });
});

describe("addArcaLinks", () => {
  it("requests matches then injects one container per keyword", async () => {
    sendMessage.mockResolvedValue({
      matches: { 손흥민: MATCH, 비트코인: null },
    });
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
    // one link each (single smart link, NOT 5-site multisite)
    containers.forEach((c) => expect(c.querySelectorAll("a").length).toBe(1));
    // keyword list was sent to the SW
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["손흥민", "비트코인"],
    });
  });

  it("is idempotent — second pass adds no duplicate container", async () => {
    sendMessage.mockResolvedValue({ matches: { once: null } });
    document.body.innerHTML = `<ul><li><a href="/Go?q=once" title="once">once</a></li></ul>`;
    await addArcaLinks();
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
    expect(
      document
        .querySelector('a[href^="/Go?q="]')!
        .getAttribute(DATA_ATTR_PROCESSED),
    ).toBe("true");
  });

  it("heals a stale link when the keyword at a position changes", async () => {
    sendMessage.mockResolvedValue({ matches: { 옛키워드: null } });
    document.body.innerHTML = `<ul><li><a href="/Go?q=옛키워드" title="옛키워드">옛키워드</a></li></ul>`;
    await addArcaLinks();
    let link = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER} a.${CSS_CLASS_ARCA_LINK}`,
    ) as HTMLAnchorElement;
    expect(decodeURIComponent(link.href)).toContain("옛키워드");

    // namu rotates the keyword in place (same <a> element, new keyword)
    const a = document.querySelector('a[href^="/Go?q="]') as HTMLAnchorElement;
    a.setAttribute("href", "/Go?q=새키워드");
    a.setAttribute("title", "새키워드");
    a.textContent = "새키워드";
    sendMessage.mockResolvedValue({ matches: { 새키워드: null } });
    await addArcaLinks();

    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1); // healed in place, no duplicate
    link = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER} a.${CSS_CLASS_ARCA_LINK}`,
    ) as HTMLAnchorElement;
    expect(decodeURIComponent(link.href)).toContain("새키워드");
    expect(decodeURIComponent(link.href)).not.toContain("옛키워드");
  });

  it("logs and returns when no realtime markup present", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await addArcaLinks();
    expect(log.mock.calls.map((c) => c.join(" ")).join(" ")).toContain(
      "찾을 수 없",
    );
    log.mockRestore();
  });
});

describe("updateArcaLink", () => {
  it("does nothing when element is undefined", async () => {
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "x",
      element: undefined,
    });
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
  });

  it('injects a single thread link for "added"', async () => {
    sendMessage.mockResolvedValue({ matches: { 새키워드: MATCH } });
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "새키워드",
      element: el,
    });
    const links = document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER} a`);
    expect(links.length).toBe(1);
    expect(links[0]!.textContent).toBe("💬23");
  });

  it('"removed" only logs (no DOM mutation)', async () => {
    document.body.innerHTML = `<ul><li><a id="a">t</a></li></ul>`;
    const before = document.body.innerHTML;
    await updateArcaLink({
      type: "removed",
      rank: 1,
      oldKeyword: "x",
      element: document.getElementById("a") as HTMLElement,
    });
    expect(document.body.innerHTML).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Behaviours below were added to pin down paths that mutation testing showed
// were either uncovered or covered without being asserted on.
// ---------------------------------------------------------------------------

const logText = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((c) => c.join(" ")).join("\n");

describe("buildSearchUrl — protocol gate", () => {
  it("accepts an http:// template (only non-http(s) schemes are rejected)", () => {
    expect(
      buildSearchUrl("http://arca.live/b/namuhotnow?keyword={keyword}", "날씨"),
    ).toBe("http://arca.live/b/namuhotnow?keyword=%EB%82%A0%EC%94%A8");
  });

  it("warns and returns '' when the substituted template is unparseable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(buildSearchUrl("not-a-url/{keyword}", "x")).toBe("");
    expect(warn.mock.calls.flat().join(" ")).toContain("잘못된 URL");
  });
});

describe("createThreadLink — thread vs search markers", () => {
  it("tags a matched link with the thread data attribute and thread href", () => {
    const a = createThreadLink("황승언", MATCH);
    expect(a.getAttribute(DATA_ATTR_THREAD)).toBe("1");
    expect(a.getAttribute("href")).toBe(`${ARCA_BASE_URL}/555`);
  });

  it("leaves the search fallback untagged and titles it for the keyword", () => {
    const a = createThreadLink("김치찌개", null);
    expect(a.getAttribute(DATA_ATTR_THREAD)).toBeNull();
    expect(a.title).toBe('아카라이브 "김치찌개" 검색');
  });
});

describe("createLinkContainer — keyword bookkeeping", () => {
  it("records the keyword on the container dataset", () => {
    expect(createLinkContainer("황승언", MATCH).dataset["arcaKeyword"]).toBe(
      "황승언",
    );
  });
});

describe("refreshThreadMatches — edge cases", () => {
  it("does not contact the SW at all for an empty keyword list", async () => {
    threadMatches.set("보존", MATCH);
    await refreshThreadMatches([]);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(threadMatches.get("보존")).toEqual(MATCH); // map left untouched
  });

  it("treats an undefined SW response as 'no matches' WITHOUT warning", async () => {
    // Distinguishes the `res?.matches ?? {}` guard from letting the property
    // read throw into the catch block: both end with null matches, but only
    // the broken one logs a failure.
    sendMessage.mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshThreadMatches(["a"]);
    expect(threadMatches.get("a")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the failing step when the SW round-trip rejects", async () => {
    sendMessage.mockRejectedValue(new Error("no SW"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshThreadMatches(["a"]);
    expect(warn.mock.calls.flat().join(" ")).toContain("refreshThreadMatches");
  });
});

describe("addNewLink — sibling insertion", () => {
  it("inserts the container directly after an anchor with no <li> parent", async () => {
    sendMessage.mockResolvedValue({ matches: { 날씨: null } });
    document.body.innerHTML =
      '<div><a id="a">날씨</a><b id="tail">tail</b></div>';
    const el = document.getElementById("a") as HTMLElement;
    await addNewLink(el, "날씨");
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(el.nextElementSibling).toBe(c);
    expect(document.getElementById("tail")!.previousElementSibling).toBe(c);
  });

  it("does not duplicate when a container is already the next sibling", async () => {
    sendMessage.mockResolvedValue({ matches: { 날씨: null } });
    document.body.innerHTML = '<div><a id="a">날씨</a></div>';
    const el = document.getElementById("a") as HTMLElement;
    await addNewLink(el, "날씨");
    await addNewLink(el, "날씨");
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
  });

  it("does not duplicate when the <li> already holds a container", async () => {
    sendMessage.mockResolvedValue({ matches: { 날씨: null } });
    document.body.innerHTML = '<ul><li><a id="a">날씨</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    await addNewLink(el, "날씨");
    await addNewLink(el, "날씨");
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
  });
});

describe("addArcaLinks — keyword extraction", () => {
  it("prefers the title attribute over the anchor text", async () => {
    sendMessage.mockResolvedValue({ matches: { 제목키워드: null } });
    document.body.innerHTML =
      '<ul><li><a href="/Go?q=x" title="제목키워드">다른텍스트</a></li></ul>';
    await addArcaLinks();
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("제목키워드");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["제목키워드"],
    });
  });

  it("falls back to TRIMMED anchor text when there is no title", async () => {
    sendMessage.mockResolvedValue({ matches: { 공백키워드: null } });
    document.body.innerHTML =
      '<ul><li><a href="/Go?q=x">   공백키워드   </a></li></ul>';
    await addArcaLinks();
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("공백키워드");
  });

  it("skips pure rank numbers but keeps keywords that merely start with a digit", async () => {
    sendMessage.mockResolvedValue({ matches: { "1박2일": null } });
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=a">1</a></li>
        <li><a href="/Go?q=b">12</a></li>
        <li><a href="/Go?q=c">1박2일</a></li>
      </ul>`;
    await addArcaLinks();
    const kws = Array.from(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`),
    ).map((c) => (c as HTMLElement).dataset["arcaKeyword"]);
    expect(kws).toEqual(["1박2일"]);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["1박2일"],
    });
  });

  it("renders the 💬 badge for a matched keyword", async () => {
    sendMessage.mockResolvedValue({ matches: { 손흥민: MATCH } });
    document.body.innerHTML =
      '<ul><li><a href="/Go?q=손흥민" title="손흥민">손흥민</a></li></ul>';
    await addArcaLinks();
    expect(
      document.querySelector(`.${CSS_CLASS_LINKS_CONTAINER} a`)!.textContent,
    ).toBe("💬23");
  });

  it("reports how many links it synchronised (inside <li>)", async () => {
    sendMessage.mockResolvedValue({ matches: { 하나: null, 둘: null } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=하나" title="하나">하나</a></li>
        <li><a href="/Go?q=둘" title="둘">둘</a></li>
      </ul>`;
    await addArcaLinks();
    expect(logText(log)).toContain("] 2개 링크 동기화");
  });

  it("reports how many links it synchronised (no <li> parent)", async () => {
    sendMessage.mockResolvedValue({ matches: { 하나: null, 둘: null } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML =
      '<div><a href="/Go?q=하나" title="하나">하나</a><a href="/Go?q=둘" title="둘">둘</a></div>';
    await addArcaLinks();
    expect(logText(log)).toContain("] 2개 링크 동기화");
  });

  it("makes no second SW round-trip when every container is in sync", async () => {
    sendMessage.mockResolvedValue({ matches: { once: null } });
    document.body.innerHTML =
      '<ul><li><a href="/Go?q=once" title="once">once</a></li></ul>';
    await addArcaLinks();
    sendMessage.mockClear();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await addArcaLinks();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(logText(log)).not.toContain("링크 동기화");
  });
});

describe("addArcaLinks — heading-text fallback", () => {
  it("uses anchors under a 실시간 heading when no selector matches", async () => {
    sendMessage.mockResolvedValue({ matches: { 키워드A: null } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `
      <section>
        <h2>실시간 검색어</h2>
        <div><a href="/w/A">키워드A</a></div>
      </section>`;
    await addArcaLinks();
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c).not.toBeNull();
    expect(c.dataset["arcaKeyword"]).toBe("키워드A");
    expect(logText(log)).toContain("텍스트 기반 검색");
  });

  it("also accepts a 인기 heading", async () => {
    sendMessage.mockResolvedValue({ matches: { 키워드B: null } });
    document.body.innerHTML = `
      <aside>
        <h3>인기 문서</h3>
        <div><a href="/w/B">키워드B</a></div>
      </aside>`;
    await addArcaLinks();
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c).not.toBeNull();
    expect(c.dataset["arcaKeyword"]).toBe("키워드B");
  });

  it("ignores a section whose heading mentions neither 실시간 nor 인기", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `
      <section><h2>공지사항</h2><div><a href="/w/A">키워드A</a></div></section>`;
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
    expect(logText(log)).toContain("찾을 수 없습니다");
  });

  it("ignores a section that has no heading at all", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `
      <section><div><a href="/w/A">키워드A</a></div></section>`;
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
    expect(logText(log)).toContain("찾을 수 없습니다");
  });

  it("skips a matching section with no anchors and uses the next one", async () => {
    sendMessage.mockResolvedValue({ matches: { 키워드B: null } });
    document.body.innerHTML = `
      <section><h3>실시간 (빈 섹션)</h3></section>
      <section><h3>실시간 검색어</h3><div><a href="/w/B">키워드B</a></div></section>`;
    await addArcaLinks();
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c).not.toBeNull();
    expect(c.dataset["arcaKeyword"]).toBe("키워드B");
  });

  it("does NOT consult the heading fallback when a selector already matched", async () => {
    sendMessage.mockResolvedValue({ matches: { 정상: null } });
    document.body.innerHTML = `
      <ul><li><a href="/Go?q=정상" title="정상">정상</a></li></ul>
      <section><h2>실시간</h2><div><a href="/w/Z">가짜</a></div></section>`;
    await addArcaLinks();
    const kws = Array.from(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`),
    ).map((c) => (c as HTMLElement).dataset["arcaKeyword"]);
    expect(kws).toEqual(["정상"]);
  });
});

describe("updateExistingLink", () => {
  function seedLi(oldKeyword: string, tail = false) {
    document.body.innerHTML = `<ul><li><a id="a" title="${oldKeyword}">${oldKeyword}</a>${
      tail ? '<b id="tail">t</b>' : ""
    }</li></ul>`;
    const el = document.getElementById("a") as HTMLElement;
    const li = el.closest("li") as HTMLElement;
    li.appendChild(createLinkContainer(oldKeyword, null));
    return {
      el,
      li,
      old: li.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`) as HTMLElement,
    };
  }

  it("fades the old container out, then swaps in one for the new keyword", async () => {
    const { el, li, old } = seedLi("옛키워드", true);
    threadMatches.set("새키워드", MATCH); // no SW round needed

    const p = updateExistingLink(el, "옛키워드", "새키워드");
    // The fade starts synchronously: opacity 0 while still attached.
    expect(old.style.opacity).toBe("0");
    expect(old.isConnected).toBe(true);
    await p;

    expect(old.isConnected).toBe(false); // removed after the fade
    const cs = document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`);
    expect(cs.length).toBe(1);
    const c = cs[0] as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("새키워드");
    expect(c.querySelector("a")!.textContent).toBe("💬23");
    expect(c.style.opacity).toBe("1"); // faded back in
    expect(li.lastElementChild).toBe(c); // appended to the <li>, not spliced in
  });

  it("asks the SW for a match it has not seen before", async () => {
    sendMessage.mockResolvedValue({ matches: { 새키워드: MATCH } });
    const { el } = seedLi("옛키워드");
    await updateExistingLink(el, "옛키워드", "새키워드");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["새키워드"],
    });
    expect(
      document.querySelector(`.${CSS_CLASS_LINKS_CONTAINER} a`)!.textContent,
    ).toBe("💬23");
  });

  it("inserts next to the anchor when there is no <li> parent", async () => {
    document.body.innerHTML = '<div><a id="a" title="옛">옛</a><b id="tail">t</b></div>';
    const el = document.getElementById("a") as HTMLElement;
    el.parentNode!.insertBefore(
      createLinkContainer("옛", null),
      el.nextSibling,
    );
    threadMatches.set("새", null);
    await updateExistingLink(el, "옛", "새");
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("새");
    expect(el.nextElementSibling).toBe(c);
  });

  it("warns and adds a fresh link when there is no container to replace", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendMessage.mockResolvedValue({ matches: { 새: null } });
    document.body.innerHTML = '<ul><li><a id="a" title="옛">옛</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    await updateExistingLink(el, "옛", "새");
    expect(warn.mock.calls.flat().join(" ")).toContain("기존 링크 없음");
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("새");
  });

  it("logs the old → new transition and the completion", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { el } = seedLi("옛키워드");
    threadMatches.set("새키워드", null);
    await updateExistingLink(el, "옛키워드", "새키워드");
    const text = logText(log);
    expect(text).toContain('링크 업데이트: "옛키워드" → "새키워드"');
    expect(text).toContain("링크 업데이트 완료: 새키워드");
  });
});

describe("updateArcaLink — dispatch", () => {
  function anchorInLi() {
    document.body.innerHTML = '<ul><li><a id="a">t</a></li></ul>';
    return document.getElementById("a") as HTMLElement;
  }

  it('"added" goes through addNewLink, not the update path', async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    sendMessage.mockResolvedValue({ matches: { 새: null } });
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "새",
      element: anchorInLi(),
    });
    const text = logText(log);
    expect(text).toContain("새 링크 추가: 새");
    expect(text).not.toContain("링크 업데이트");
  });

  it('"added" without a newKeyword changes nothing', async () => {
    await updateArcaLink({ type: "added", rank: 1, element: anchorInLi() });
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('"modified" replaces the existing container', async () => {
    sendMessage.mockResolvedValue({ matches: { 새: null } });
    document.body.innerHTML = '<ul><li><a id="a" title="옛">옛</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    el.closest("li")!.appendChild(createLinkContainer("옛", null));
    await updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "옛",
      newKeyword: "새",
      element: el,
    });
    const cs = document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`);
    expect(cs.length).toBe(1);
    expect((cs[0] as HTMLElement).dataset["arcaKeyword"]).toBe("새");
  });

  it('"modified" without a newKeyword changes nothing', async () => {
    document.body.innerHTML = '<ul><li><a id="a" title="옛">옛</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    el.closest("li")!.appendChild(createLinkContainer("옛", null));
    await updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "옛",
      element: el,
    });
    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c.dataset["arcaKeyword"]).toBe("옛"); // untouched
  });

  it('"modified" with no oldKeyword logs an empty previous value', async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = '<ul><li><a id="a" title="옛">옛</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    el.closest("li")!.appendChild(createLinkContainer("옛", null));
    threadMatches.set("새", null);
    await updateArcaLink({
      type: "modified",
      rank: 1,
      newKeyword: "새",
      element: el,
    });
    expect(logText(log)).toContain('링크 업데이트: "" → "새"');
  });

  it('"removed" logs the rank and never warns', async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await updateArcaLink({
      type: "removed",
      rank: 3,
      oldKeyword: "사라짐",
      element: anchorInLi(),
    });
    expect(logText(log)).toContain("순위 3 삭제: 사라짐");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns on an unknown change type", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await updateArcaLink({
      type: "정체불명" as unknown as ChangeType,
      rank: 1,
      element: anchorInLi(),
    });
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "알 수 없는 변경 타입: 정체불명",
    );
  });

  it("names the rank when the change carries no element", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await updateArcaLink({ type: "added", rank: 7, newKeyword: "x" });
    expect(warn.mock.calls.flat().join(" ")).toContain("순위 7의 요소");
  });
});

describe("addArcaLinks — selector fallback order", () => {
  it("falls through to a later REALTIME_SELECTOR when the /Go?q= one finds nothing", async () => {
    sendMessage.mockResolvedValue({ matches: { 키워드A: null } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = `
      <div class="realtime-list">
        <ul><li><a href="/w/A" title="키워드A">키워드A</a></li></ul>
      </div>`;

    await addArcaLinks();

    const c = document.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    ) as HTMLElement;
    expect(c).not.toBeNull();
    expect(c.dataset["arcaKeyword"]).toBe("키워드A");
    expect(logText(log)).toContain('선택자: [class*="realtime"] li a');
  });

  it("skips an anchor that has neither a title nor any text", async () => {
    sendMessage.mockResolvedValue({ matches: { 진짜키워드: null } });
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=empty"></a></li>
        <li><a href="/Go?q=real" title="진짜키워드">진짜키워드</a></li>
      </ul>`;

    await addArcaLinks();

    const kws = Array.from(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`),
    ).map((c) => (c as HTMLElement).dataset["arcaKeyword"]);
    expect(kws).toEqual(["진짜키워드"]);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["진짜키워드"],
    });
  });
});

describe("addNewLink — match cache", () => {
  it("does not re-ask the SW for a keyword already in the match cache", async () => {
    threadMatches.set("황승언", MATCH);
    document.body.innerHTML = '<ul><li><a id="a">황승언</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;

    await addNewLink(el, "황승언");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      document.querySelector(`.${CSS_CLASS_LINKS_CONTAINER} a`)!.textContent,
    ).toBe("💬23");
  });
});
