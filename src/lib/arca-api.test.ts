import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDeviceToken,
  matchThread,
  fetchNamuhotnowArticles,
  _resetArcaCache,
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
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
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
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
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
    expect(Object.keys(localGet.mock.calls[0]![0])).toEqual(["arcaDeviceToken"]);
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
