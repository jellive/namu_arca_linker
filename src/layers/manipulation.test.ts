import { describe, it, expect, beforeEach } from "vitest";
import {
  getArcaSearchUrl,
  createArcaLink,
  addNewLink,
  updateArcaLink,
} from "./manipulation";
import { CSS_CLASS_ARCA_LINK } from "../constants/config";

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
});

describe("updateArcaLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
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
});
