import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildSearchUrl,
  createThreadLink,
  createLinkContainer,
  refreshThreadMatches,
  threadMatches,
  addArcaLinks,
  updateArcaLink,
} from "./manipulation";
import {
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
} from "../constants/config";
import type { ThreadMatch } from "../lib/arca-api";

const sendMessage = vi.fn();

beforeEach(() => {
  document.body.innerHTML = "";
  sendMessage.mockReset();
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
