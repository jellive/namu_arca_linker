import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchNamuhotnowArticles = vi.fn();
const matchThread = vi.fn();
const fetchArticlePreview = vi.fn();
vi.mock("./lib/arca-api", () => ({
  fetchArticlePreview: (...a: unknown[]) => fetchArticlePreview(...a),
  fetchNamuhotnowArticles: (...a: unknown[]) => fetchNamuhotnowArticles(...a),
  matchThread: (...a: unknown[]) => matchThread(...a),
}));

// chrome APIs must exist at import time.
// vi.hoisted runs before module imports, so chrome is defined when background.ts loads.
// The console.log swap captures the module's load-time announcement, which is
// otherwise unobservable (it fires once, during import).
const {
  addListener,
  onInstalledAdd,
  onStartupAdd,
  updateSessionRules,
  importLogs,
  restoreLog,
} = vi.hoisted(() => {
  const addListener = vi.fn();
  const onInstalledAdd = vi.fn();
  const onStartupAdd = vi.fn();
  const updateSessionRules = vi.fn();
  const importLogs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    importLogs.push(args.map(String).join(" "));
  };
  const restoreLog = () => {
    console.log = originalLog;
  };
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener },
      onInstalled: { addListener: onInstalledAdd },
      onStartup: { addListener: onStartupAdd },
    },
    declarativeNetRequest: {
      updateSessionRules,
    },
  } as unknown as typeof chrome;
  return {
    addListener,
    onInstalledAdd,
    onStartupAdd,
    updateSessionRules,
    importLogs,
    restoreLog,
  };
});

import { handleMatchThreads } from "./background";

// Top-level statements run after imports are evaluated, so console.log is
// only swapped for the duration of background.ts's module evaluation.
restoreLog();

const ARCA_UA = "net.umanle.arca.android.playstore/0.9.83";

type MessageListener = (
  msg: unknown,
  sender: unknown,
  sendResponse: (r: unknown) => void,
) => boolean;

/** The listener background.ts registered with chrome.runtime.onMessage. */
const messageListener = () => addListener.mock.calls[0]![0] as MessageListener;

/** Let the listener's promise chain settle (it calls sendResponse async). */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fetchNamuhotnowArticles.mockReset();
  matchThread.mockReset();
  updateSessionRules.mockReset();
});

describe("handleMatchThreads", () => {
  it("returns a keyword→match map", async () => {
    fetchNamuhotnowArticles.mockResolvedValue([
      { id: 1, title: "황승언", createdAt: "c" },
    ]);
    matchThread.mockImplementation((kw: string) =>
      kw === "황승언" ? { id: 1, title: "황승언" } : null,
    );
    const res = await handleMatchThreads(["황승언", "없음"]);
    expect(res.matches["황승언"]).toEqual({ id: 1, title: "황승언" });
    expect(res.matches["없음"]).toBeNull();
  });

  it("returns all-null matches when fetch yields nothing", async () => {
    fetchNamuhotnowArticles.mockResolvedValue([]);
    matchThread.mockReturnValue(null);
    const res = await handleMatchThreads(["a", "b"]);
    expect(res.matches).toEqual({ a: null, b: null });
  });

  it("fetches the article list once for the whole keyword batch", async () => {
    fetchNamuhotnowArticles.mockResolvedValue([]);
    matchThread.mockReturnValue(null);
    await handleMatchThreads(["a", "b", "c"]);
    expect(fetchNamuhotnowArticles).toHaveBeenCalledTimes(1);
    expect(matchThread).toHaveBeenCalledTimes(3);
  });

  it("registers a runtime.onMessage listener on import", () => {
    expect(addListener).toHaveBeenCalled();
  });

  it("announces readiness while the service worker script loads", () => {
    expect(importLogs.join("\n")).toContain("service worker 준비됨");
  });
});

describe("onMessage listener", () => {
  it("answers a matchThreads message and holds the channel open", async () => {
    fetchNamuhotnowArticles.mockResolvedValue([
      { id: 1, title: "황승언", createdAt: "c" },
    ]);
    matchThread.mockReturnValue({ id: 1, title: "황승언" });
    const sendResponse = vi.fn();

    const keepAlive = messageListener()(
      { type: "matchThreads", keywords: ["황승언"] },
      {},
      sendResponse,
    );

    // `true` is what keeps the message port open for the async reply — without
    // it Chrome closes the channel and the content script never hears back.
    expect(keepAlive).toBe(true);
    await settle();
    expect(sendResponse).toHaveBeenCalledWith({
      matches: { 황승언: { id: 1, title: "황승언" } },
    });
  });

  it("answers an articlePreview message with the article text", async () => {
    fetchArticlePreview.mockResolvedValue("해명 방송을 진행했다.");
    const sendResponse = vi.fn();

    const keepAlive = messageListener()(
      { type: "articlePreview", id: 555 },
      {},
      sendResponse,
    );

    expect(keepAlive).toBe(true);
    expect(fetchArticlePreview).toHaveBeenCalledWith(555);
    await settle();
    expect(sendResponse).toHaveBeenCalledWith({
      text: "해명 방송을 진행했다.",
    });
  });

  it("passes a failed lookup on as null so the page does not cache it", async () => {
    fetchArticlePreview.mockResolvedValue(null);
    const sendResponse = vi.fn();
    messageListener()({ type: "articlePreview", id: 2 }, {}, sendResponse);
    await settle();
    expect(sendResponse).toHaveBeenCalledWith({ text: null });
  });

  it.each([["555"], [1.5], [undefined]])(
    "declines an articlePreview message whose id is %s",
    (id) => {
      fetchArticlePreview.mockClear();
      const sendResponse = vi.fn();
      const keepAlive = messageListener()(
        { type: "articlePreview", id },
        {},
        sendResponse,
      );
      expect(keepAlive).toBe(false);
      expect(fetchArticlePreview).not.toHaveBeenCalled();
    },
  );

  it("answers with empty text when the preview lookup rejects", async () => {
    fetchArticlePreview.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sendResponse = vi.fn();

    messageListener()({ type: "articlePreview", id: 1 }, {}, sendResponse);
    await settle();

    expect(sendResponse).toHaveBeenCalledWith({ text: null });
    expect(warn.mock.calls[0]![0]).toContain("articlePreview 처리 실패");
    warn.mockRestore();
  });

  it("declines a message of a different type", () => {
    const sendResponse = vi.fn();
    expect(
      messageListener()(
        { type: "somethingElse", keywords: ["a"] },
        {},
        sendResponse,
      ),
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(fetchNamuhotnowArticles).not.toHaveBeenCalled();
  });

  it("declines a matchThreads message whose keywords are not an array", () => {
    const sendResponse = vi.fn();
    expect(
      messageListener()(
        { type: "matchThreads", keywords: "황승언" },
        {},
        sendResponse,
      ),
    ).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(fetchNamuhotnowArticles).not.toHaveBeenCalled();
  });

  it("declines a null message without throwing", () => {
    const sendResponse = vi.fn();
    expect(messageListener()(null, {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("answers with an empty match map when the handler rejects", async () => {
    fetchNamuhotnowArticles.mockRejectedValue(new Error("arca down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sendResponse = vi.fn();

    messageListener()(
      { type: "matchThreads", keywords: ["a"] },
      {},
      sendResponse,
    );
    await settle();

    expect(sendResponse).toHaveBeenCalledWith({ matches: {} });
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "matchThreads 처리 실패",
    );
    warn.mockRestore();
  });
});

describe("declarativeNetRequest User-Agent rule", () => {
  it("registers the arca app User-Agent rewrite on install", () => {
    (onInstalledAdd.mock.calls[0]![0] as () => void)();

    expect(updateSessionRules).toHaveBeenCalledTimes(1);
    const arg = updateSessionRules.mock.calls[0]![0] as {
      removeRuleIds: number[];
      addRules: Array<{
        id: number;
        priority: number;
        action: {
          type: string;
          requestHeaders: Array<{
            header: string;
            operation: string;
            value: string;
          }>;
        };
        condition: { urlFilter: string; resourceTypes: string[] };
      }>;
    };

    // The old rule must be cleared, otherwise updateSessionRules rejects on
    // the duplicate id the second time it runs.
    expect(arg.removeRuleIds).toEqual([1, 2]);
    expect(arg.addRules).toHaveLength(2);
    expect(arg.addRules.map((r) => r.id)).toEqual([1, 2]);
    expect(arg.addRules.map((r) => r.condition.urlFilter)).toEqual([
      "||arca.live/api/app/list/channel/namuhotnow",
      "||arca.live/api/app/view/article/namuhotnow/",
    ]);
    for (const r of arg.addRules) {
      expect(r.action.requestHeaders).toEqual([
        { header: "user-agent", operation: "set", value: ARCA_UA },
      ]);
      expect(r.condition.resourceTypes).toEqual(["xmlhttprequest"]);
    }

    const rule = arg.addRules[0]!;
    expect(rule.id).toBe(1);
    expect(rule.priority).toBe(1);
    expect(rule.action.type).toBe("modifyHeaders");
    expect(rule.action.requestHeaders).toEqual([
      { header: "user-agent", operation: "set", value: ARCA_UA },
    ]);
    expect(rule.condition.urlFilter).toBe(
      "||arca.live/api/app/list/channel/namuhotnow",
    );
    expect(rule.condition.resourceTypes).toEqual(["xmlhttprequest"]);
  });

  it("re-registers the same rule on browser startup", () => {
    (onStartupAdd.mock.calls[0]![0] as () => void)();

    expect(updateSessionRules).toHaveBeenCalledTimes(1);
    const arg = updateSessionRules.mock.calls[0]![0] as {
      addRules: Array<{
        action: { requestHeaders: Array<{ value: string }> };
        condition: { urlFilter: string };
      }>;
    };
    expect(arg.addRules[0]!.action.requestHeaders[0]!.value).toBe(ARCA_UA);
    expect(arg.addRules[0]!.condition.urlFilter).toContain("namuhotnow");
  });
});
