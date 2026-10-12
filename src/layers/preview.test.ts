import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  attachPreview,
  hidePreview,
  hidePreviewIfDetached,
  formatAge,
  _resetPreview,
  PREVIEW_ID,
} from "./preview";
import type { ThreadMatch } from "../lib/arca-api";

const sendMessage = vi.fn();
const NOW = new Date("2026-10-12T03:00:00.000Z");

const MATCH: ThreadMatch = {
  id: 555,
  title: "장지",
  commentCount: 23,
  category: "인방",
  createdAt: "2026-10-12T02:15:00.000Z",
};

function link(): HTMLAnchorElement {
  const a = document.createElement("a");
  a.textContent = "💬23";
  document.body.appendChild(a);
  return a;
}

function tip(): HTMLElement {
  return document.getElementById(PREVIEW_ID) as HTMLElement;
}

function part(name: string): string {
  return tip().querySelector(`.arca-preview-${name}`)!.textContent ?? "";
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = "";
  _resetPreview();
  sendMessage.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  for (const [key, value] of [
    ["innerWidth", 1024],
    ["innerHeight", 768],
  ] as const) {
    Object.defineProperty(window, key, { value, configurable: true });
  }
  globalThis.chrome = {
    runtime: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
  } as unknown as typeof chrome;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("formatAge", () => {
  it.each([
    ["2026-10-12T02:59:40.000Z", "방금"],
    ["2026-10-12T02:15:00.000Z", "45분 전"],
    ["2026-10-12T00:00:00.000Z", "3시간 전"],
    ["2026-10-10T02:00:00.000Z", "2일 전"],
  ])("%s → %s", (iso, expected) => {
    expect(formatAge(iso, NOW.getTime())).toBe(expected);
  });
  it("returns '' for a missing or unparseable date", () => {
    expect(formatAge(undefined, NOW.getTime())).toBe("");
    expect(formatAge("t1", NOW.getTime())).toBe("");
  });
});

describe("attachPreview", () => {
  it("describes the link by the shared tooltip without a native title", () => {
    const a = link();
    a.title = "old";
    attachPreview(a, MATCH);
    expect(a.hasAttribute("title")).toBe(false);
    expect(a.getAttribute("aria-describedby")).toBe(PREVIEW_ID);
    expect(document.getElementById(PREVIEW_ID)).toBeNull(); // built lazily
  });

  it("opens on hover with title and meta, then fills in the body", async () => {
    sendMessage.mockResolvedValue({ text: "해명 방송을 진행했다." });
    const a = link();
    attachPreview(a, MATCH);

    a.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tip().hasAttribute("data-open")).toBe(true);
    expect(tip().getAttribute("role")).toBe("tooltip");
    expect(part("title")).toBe("장지");
    expect(part("meta")).toBe("인방 · 댓글 23 · 45분 전");
    expect(part("body")).toBe("불러오는 중…");
    expect(sendMessage).toHaveBeenCalledWith({
      type: "articlePreview",
      id: 555,
    });

    await flush();
    expect(part("body")).toBe("해명 방송을 진행했다.");
  });

  it("leaves out meta parts the match does not carry", () => {
    sendMessage.mockResolvedValue({ text: "" });
    const a = link();
    attachPreview(a, { id: 1, title: "x" });
    a.dispatchEvent(new MouseEvent("mouseenter"));
    expect(part("meta")).toBe("");
  });

  it("opens on keyboard focus too", () => {
    sendMessage.mockResolvedValue({ text: "t" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new FocusEvent("focus"));
    expect(tip().hasAttribute("data-open")).toBe(true);
  });

  it.each(["mouseleave", "blur"])("closes on %s", (type) => {
    sendMessage.mockResolvedValue({ text: "t" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    a.dispatchEvent(new Event(type));
    expect(tip().hasAttribute("data-open")).toBe(false);
  });

  it("closes on scroll and on Escape", () => {
    sendMessage.mockResolvedValue({ text: "t" });
    const a = link();
    attachPreview(a, MATCH);

    a.dispatchEvent(new MouseEvent("mouseenter"));
    window.dispatchEvent(new Event("scroll"));
    expect(tip().hasAttribute("data-open")).toBe(false);

    a.dispatchEvent(new MouseEvent("mouseenter"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(tip().hasAttribute("data-open")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip().hasAttribute("data-open")).toBe(false);
  });

  it("hides the body line when the article has no text", async () => {
    sendMessage.mockResolvedValue({ text: "" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    const body = tip().querySelector<HTMLElement>(".arca-preview-body")!;
    expect(body.hidden).toBe(true);
    expect(body.textContent).toBe("");
  });

  it("hides the body line when the background does not answer", async () => {
    sendMessage.mockRejectedValue(new Error("no SW"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    expect(tip().querySelector<HTMLElement>(".arca-preview-body")!.hidden).toBe(
      true,
    );
  });

  it("asks once per article and reuses the text on the next hover", async () => {
    sendMessage.mockResolvedValue({ text: "본문" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    a.dispatchEvent(new Event("mouseleave"));
    a.dispatchEvent(new MouseEvent("mouseenter"));
    expect(part("body")).toBe("본문"); // no loading flash
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed lookup", async () => {
    sendMessage.mockRejectedValueOnce(new Error("no SW"));
    sendMessage.mockResolvedValueOnce({ text: "본문" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    expect(part("body")).toBe("본문");
  });

  it("ignores an answer that arrives after another link took over", async () => {
    let resolveFirst: (v: { text: string }) => void = () => {};
    sendMessage.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = r)),
    );
    sendMessage.mockResolvedValueOnce({ text: "둘째 본문" });
    const a = link();
    const b = link();
    attachPreview(a, MATCH);
    attachPreview(b, { id: 777, title: "모기" });

    a.dispatchEvent(new MouseEvent("mouseenter"));
    b.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    resolveFirst({ text: "첫째 본문" });
    await flush();

    expect(part("title")).toBe("모기");
    expect(part("body")).toBe("둘째 본문");
  });

  it("does not reopen when the answer arrives after the pointer left", async () => {
    sendMessage.mockResolvedValue({ text: "본문" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    a.dispatchEvent(new Event("mouseleave"));
    await flush();
    expect(tip().hasAttribute("data-open")).toBe(false);
  });

  // Hover once to build the tooltip, give it a size, hover again to place it.
  function placed(
    a: HTMLAnchorElement,
    rect: Partial<DOMRect>,
    viewport: [number, number],
  ): HTMLElement {
    sendMessage.mockResolvedValue({ text: "t" });
    a.getBoundingClientRect = () => rect as DOMRect;
    Object.defineProperty(window, "innerWidth", {
      value: viewport[0],
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: viewport[1],
      configurable: true,
    });
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));
    Object.defineProperty(tip(), "offsetWidth", {
      value: 300,
      configurable: true,
    });
    Object.defineProperty(tip(), "offsetHeight", {
      value: 80,
      configurable: true,
    });
    a.dispatchEvent(new MouseEvent("mouseenter"));
    return tip();
  }

  it("sits to the left of the keyword row, level with the link", () => {
    document.body.innerHTML = `<ul><li id="row"><a id="a"></a></li></ul>`;
    const a = document.getElementById("a") as HTMLAnchorElement;
    document.getElementById("row")!.getBoundingClientRect = () =>
      ({ left: 700, right: 978 }) as DOMRect;
    const t = placed(
      a,
      { left: 930, right: 970, top: 100, bottom: 120 },
      [1024, 768],
    );

    expect(t.style.left).toBe("388px"); // row.left - width - 12
    expect(t.style.top).toBe("100px");
  });

  it("goes to the right of the row when the left side has no room", () => {
    const t = placed(
      link(),
      { left: 100, right: 140, top: 700, bottom: 720 },
      [1024, 768],
    );

    expect(t.style.left).toBe("152px"); // right + 12
    expect(t.style.top).toBe("680px"); // kept 8px above the bottom edge
  });

  it("keeps the top inside the viewport when the link is scrolled above it", () => {
    const t = placed(
      link(),
      { left: 980, right: 1020, top: -40, bottom: -20 },
      [1024, 768],
    );
    expect(t.style.left).toBe("668px");
    expect(t.style.top).toBe("8px");
  });

  it("drops under the link when neither side fits", () => {
    const t = placed(
      link(),
      { left: 100, right: 140, top: 100, bottom: 120 },
      [400, 768],
    );

    expect(t.style.left).toBe("8px"); // clamped to the left gutter
    expect(t.style.top).toBe("126px");
  });

  it("flips above the link when under it would leave the viewport", () => {
    const t = placed(
      link(),
      { left: 100, right: 140, top: 700, bottom: 720 },
      [400, 768],
    );
    expect(t.style.top).toBe("614px");
  });

  it("keeps the right edge inside a narrow viewport when under the link", () => {
    const t = placed(
      link(),
      { left: 300, right: 340, top: 100, bottom: 120 },
      [330, 768],
    );
    expect(t.style.left).toBe("22px"); // viewport - width - 8
  });
});

describe("same article on two links", () => {
  it("leaves the tooltip on the second link when the first answer lands", async () => {
    let resolveFirst: (v: { text: string }) => void = () => {};
    sendMessage.mockImplementationOnce(
      () => new Promise((r) => (resolveFirst = r)),
    );
    sendMessage.mockResolvedValueOnce({ text: "본문" });
    const a = link();
    const b = link();
    a.getBoundingClientRect = () =>
      ({ left: 900, right: 940, top: 100, bottom: 120 }) as DOMRect;
    b.getBoundingClientRect = () =>
      ({ left: 900, right: 940, top: 400, bottom: 420 }) as DOMRect;
    attachPreview(a, MATCH);
    attachPreview(b, MATCH); // the 실검 list repeats its first row

    a.dispatchEvent(new MouseEvent("mouseenter"));
    a.dispatchEvent(new Event("mouseleave"));
    b.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    resolveFirst({ text: "본문" });
    await flush();

    expect(tip().style.top).toBe("400px"); // still at the second link
    expect(part("body")).toBe("본문");
  });
});

describe("failed lookups", () => {
  it("does not cache a null answer from the background", async () => {
    sendMessage.mockResolvedValueOnce({ text: null });
    sendMessage.mockResolvedValueOnce({ text: "본문" });
    const a = link();
    attachPreview(a, MATCH);

    a.dispatchEvent(new MouseEvent("mouseenter"));
    await flush();
    expect(tip().querySelector<HTMLElement>(".arca-preview-body")!.hidden).toBe(
      true,
    );

    a.dispatchEvent(new Event("mouseleave"));
    a.dispatchEvent(new MouseEvent("mouseenter"));
    expect(part("body")).toBe("불러오는 중…");
    await flush();
    expect(part("body")).toBe("본문");
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("hidePreviewIfDetached", () => {
  it("closes the tooltip once its link has left the document", () => {
    sendMessage.mockResolvedValue({ text: "t" });
    const a = link();
    attachPreview(a, MATCH);
    a.dispatchEvent(new MouseEvent("mouseenter"));

    hidePreviewIfDetached();
    expect(tip().hasAttribute("data-open")).toBe(true); // still attached

    a.remove();
    hidePreviewIfDetached();
    expect(tip().hasAttribute("data-open")).toBe(false);
  });
  it("is a no-op when nothing is open", () => {
    expect(() => hidePreviewIfDetached()).not.toThrow();
  });
});

describe("hidePreview", () => {
  it("is a no-op before any tooltip exists", () => {
    expect(() => hidePreview()).not.toThrow();
  });
});
