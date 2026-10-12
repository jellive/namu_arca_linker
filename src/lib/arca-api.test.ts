import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDeviceToken,
  matchThread,
  fetchNamuhotnowArticles,
  fetchArticlePreview,
  htmlToText,
  _resetArcaCache,
  _resetPreviewCache,
} from "./arca-api";
import type { ArcaArticle } from "./arca-api";

const localGet = vi.fn();
const localSet = vi.fn();

beforeEach(() => {
  localGet.mockReset();
  localSet.mockReset();
  globalThis.chrome = {
    storage: { local: { get: localGet, set: localSet } },
  } as unknown as typeof chrome;
});

const ARTS: ArcaArticle[] = [
  {
    id: 101,
    title: "황승언",
    categoryDisplayName: "커뮤",
    createdAt: "t1",
    commentCount: 23,
  },
  {
    id: 102,
    title: "LCK 결승",
    categoryDisplayName: "스포츠",
    createdAt: "t2",
    commentCount: 5,
  },
  {
    id: 103,
    title: "<b>손흥민</b> 골",
    categoryDisplayName: "스포츠",
    createdAt: "t3",
  },
];

describe("getDeviceToken", () => {
  it("generates a 64-char token and persists it when none stored", async () => {
    localGet.mockImplementation((_d, cb) => cb({ arcaDeviceToken: undefined }));
    localSet.mockImplementation((_v, cb?: () => void) => cb?.());
    const token = await getDeviceToken();
    expect(token).toHaveLength(64);
    expect(localSet).toHaveBeenCalledTimes(1);
    expect(localSet.mock.calls[0]![0]).toEqual({ arcaDeviceToken: token });
  });

  it("returns the stored token without regenerating", async () => {
    const stored = "x".repeat(64);
    localGet.mockImplementation((_d, cb) => cb({ arcaDeviceToken: stored }));
    const token = await getDeviceToken();
    expect(token).toBe(stored);
    expect(localSet).not.toHaveBeenCalled();
  });
});

describe("matchThread", () => {
  it("matches exactly (case-insensitive) first", () => {
    const m = matchThread("황승언", ARTS)!;
    expect(m.id).toBe(101);
    expect(m.commentCount).toBe(23);
    expect(m.category).toBe("커뮤");
  });

  it("matches as substring when no exact match", () => {
    expect(matchThread("LCK", ARTS)!.id).toBe(102);
  });

  it("strips <b> highlight tags before substring matching", () => {
    expect(matchThread("손흥민", ARTS)!.id).toBe(103);
  });

  it("is case-insensitive", () => {
    expect(matchThread("lck", ARTS)!.id).toBe(102);
  });

  it("returns null when nothing matches", () => {
    expect(matchThread("존재하지않는키워드", ARTS)).toBeNull();
  });
});

describe("fetchNamuhotnowArticles", () => {
  beforeEach(() => {
    _resetArcaCache();
    localGet.mockImplementation((_d, cb) =>
      cb({ arcaDeviceToken: "t".repeat(64) }),
    );
  });

  it("fetches and merges page 1 + page 2 articles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [{ id: 1, title: "a", createdAt: "c1" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [{ id: 2, title: "b", createdAt: "c2" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const arts = await fetchNamuhotnowArticles();
    expect(arts.map((a) => a.id)).toEqual([1, 2]);
    // page-2 request uses last createdAt of page 1 as `before`
    expect(fetchMock.mock.calls[1]![0]).toContain("before=c1");
    vi.unstubAllGlobals();
  });

  it("serves from cache within TTL (no second network round)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [{ id: 1, title: "a", createdAt: "c1" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchNamuhotnowArticles();
    const callsAfterFirst = fetchMock.mock.calls.length;
    await fetchNamuhotnowArticles(); // cached
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    vi.unstubAllGlobals();
  });

  it("returns [] on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const arts = await fetchNamuhotnowArticles();
    expect(arts).toEqual([]);
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("sends the x-device-token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ articles: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchNamuhotnowArticles();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)["x-device-token"],
    ).toHaveLength(64);
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Behaviours below pin paths that mutation testing showed were exercised but
// never asserted on (paging, dedup, cache expiry, HTTP failure).
// ---------------------------------------------------------------------------

const warnText = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.flat().map(String).join(" ");

describe("stripHighlight (via matchThread)", () => {
  it("strips both halves of a <b> pair, attributes included", () => {
    const arts: ArcaArticle[] = [
      { id: 7, title: '<b class="hl">손흥민</b> 결승골', createdAt: "t" },
    ];
    expect(matchThread("손흥민", arts)!.title).toBe("손흥민 결승골");
  });
});

describe("matchThread — exact beats substring", () => {
  it("prefers an exact title match over an EARLIER substring match", () => {
    const arts: ArcaArticle[] = [
      { id: 1, title: "실시간 LCK 결승 이야기", createdAt: "t1" },
      { id: 2, title: "LCK", createdAt: "t2" },
    ];
    expect(matchThread("lck", arts)!.id).toBe(2);
  });
});

describe("fetchNamuhotnowArticles — request shape", () => {
  beforeEach(() => {
    _resetArcaCache();
    localGet.mockImplementation((_d, cb) =>
      cb({ arcaDeviceToken: "t".repeat(64) }),
    );
  });

  it("requests the namuhotnow channel list with the given limit and no `before`", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ articles: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await fetchNamuhotnowArticles(30);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://arca.live/api/app/list/channel/namuhotnow?limit=30",
    );
    vi.unstubAllGlobals();
  });

  it("does not request a second page when the first page is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ articles: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await fetchNamuhotnowArticles()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled(); // no crash swallowed by the catch

    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("drops page-2 articles that already appeared on page 1", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [
            { id: 1, title: "a", createdAt: "c1" },
            { id: 2, title: "b", createdAt: "c2" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [
            { id: 2, title: "b", createdAt: "c2" },
            { id: 3, title: "c", createdAt: "c3" },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const arts = await fetchNamuhotnowArticles();
    expect(arts.map((a) => a.id)).toEqual([1, 2, 3]);
    vi.unstubAllGlobals();
  });

  it("treats a response without an `articles` key as an empty page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await fetchNamuhotnowArticles()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("returns [] and names the status when the API answers non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await fetchNamuhotnowArticles()).toEqual([]);
    expect(warnText(warn)).toContain("arca API 503");
    expect(warnText(warn)).toContain("검색 폴백");

    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("re-fetches once the 3-minute cache TTL has elapsed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ articles: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(1_000_000);
    await fetchNamuhotnowArticles();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 60_000); // 1 min later — still fresh
    await fetchNamuhotnowArticles();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + 200_000); // past 3 min — stale
    await fetchNamuhotnowArticles();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    now.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("getDeviceToken — storage contract", () => {
  it("asks chrome.storage.local for the device-token key by name", async () => {
    localGet.mockImplementation((_d, cb) =>
      cb({ arcaDeviceToken: "z".repeat(64) }),
    );
    await getDeviceToken();
    expect(Object.keys(localGet.mock.calls[0]![0])).toEqual([
      "arcaDeviceToken",
    ]);
  });

  it("still resolves with the token when persisting it fails", async () => {
    localGet.mockImplementation((_d, cb) => cb({ arcaDeviceToken: undefined }));
    localSet.mockImplementation((_v: unknown, cb?: () => void) => {
      (
        globalThis.chrome as unknown as {
          runtime: { lastError?: { message: string } };
        }
      ).runtime = { lastError: { message: "QUOTA_BYTES exceeded" } };
      cb?.();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const token = await getDeviceToken();

    expect(token).toHaveLength(64);
    expect(warnText(warn)).toContain("device-token 저장 실패");
    expect(warnText(warn)).toContain("QUOTA_BYTES exceeded");

    warn.mockRestore();
  });
});

describe("htmlToText", () => {
  it("drops tags and collapses whitespace to one line", () => {
    expect(
      htmlToText("<p>가을 모기가</p>\n<p>  기승을 <b>부리며</b></p>"),
    ).toBe("가을 모기가 기승을 부리며");
  });
  it("decodes named and numeric entities", () => {
    expect(
      htmlToText(
        "A&nbsp;&amp;&nbsp;B &lt;tag&gt; &quot;q&quot; &#39;s&#x27; &#44032;",
      ),
    ).toBe("A & B <tag> \"q\" 's' 가");
  });
  it("does not double-decode an escaped entity", () => {
    expect(htmlToText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });
  it("leaves unknown or out-of-range references as written", () => {
    expect(htmlToText("&bogus; &#0; &#x110000;")).toBe(
      "&bogus; &#0; &#x110000;",
    );
  });
  it("drops embedded media together with its fallback text", () => {
    expect(
      htmlToText(
        '<p>볼넷으로 출루</p><VIDEO controls src="a.mp4">Your browser does not support HTML5 video.</video><p>배트를 던졌다</p><style>p{color:red}</style>',
      ),
    ).toBe("볼넷으로 출루 배트를 던졌다");
  });
  it("returns '' for a body with only markup", () => {
    expect(htmlToText('<p><img src="x"></p>')).toBe("");
  });
});

describe("fetchArticlePreview", () => {
  beforeEach(() => {
    _resetPreviewCache();
    localGet.mockImplementation((_d, cb) =>
      cb({ arcaDeviceToken: "t".repeat(64) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(body: unknown, ok = true, status = 200) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("requests the article view with the device token and returns its text", async () => {
    const fetchMock = stubFetch({ content: "<p>해명 방송을 진행했다.</p>" });

    expect(await fetchArticlePreview(555)).toBe("해명 방송을 진행했다.");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://arca.live/api/app/view/article/namuhotnow/555",
      { headers: { "x-device-token": "t".repeat(64) } },
    );
  });

  it("cuts a long body at 140 characters with an ellipsis", async () => {
    stubFetch({ content: "가".repeat(139) + " 나다라" });
    const text = await fetchArticlePreview(1);
    expect(text).toBe("가".repeat(139) + "…");
  });

  it("keeps a body of exactly 140 characters whole", async () => {
    stubFetch({ content: "가".repeat(140) });
    expect(await fetchArticlePreview(1)).toBe("가".repeat(140));
  });

  it("counts by character, not UTF-16 unit, when cutting", async () => {
    stubFetch({ content: "😀".repeat(141) });
    expect(await fetchArticlePreview(1)).toBe("😀".repeat(140) + "…");
  });

  it("shows a notice instead of the body for a spoiler article", async () => {
    stubFetch({ content: "<p>범인은</p>", isSpoilerAlert: true });
    expect(await fetchArticlePreview(1)).toBe("스포일러 주의 글입니다.");
  });

  it("returns '' when the article has no content field", async () => {
    stubFetch({});
    expect(await fetchArticlePreview(1)).toBe("");
  });

  it("serves a repeated id from cache, including an empty result", async () => {
    const fetchMock = stubFetch({ content: "" });
    await fetchArticlePreview(7);
    await fetchArticlePreview(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on a non-OK answer, names the status, and retries next time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = stubFetch({}, false, 403);

    expect(await fetchArticlePreview(9)).toBeNull();
    expect(String(warn.mock.calls[0]![1])).toContain("arca API 403");
    await fetchArticlePreview(9);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("returns null when the network call throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchArticlePreview(3)).toBeNull();
    expect(warn.mock.calls[0]![0]).toContain("arca 글 미리보기 실패");
    warn.mockRestore();
  });
});
