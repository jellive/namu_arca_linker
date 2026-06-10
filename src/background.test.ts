import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchNamuhotnowArticles = vi.fn();
const matchThread = vi.fn();
vi.mock("./lib/arca-api", () => ({
  fetchNamuhotnowArticles: (...a: unknown[]) => fetchNamuhotnowArticles(...a),
  matchThread: (...a: unknown[]) => matchThread(...a),
}));

// chrome APIs must exist at import time.
// vi.hoisted runs before module imports, so chrome is defined when background.ts loads.
const { addListener } = vi.hoisted(() => {
  const addListener = vi.fn();
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    declarativeNetRequest: {
      updateSessionRules: vi.fn(),
    },
  } as unknown as typeof chrome;
  return { addListener };
});

import { handleMatchThreads } from "./background";

beforeEach(() => {
  fetchNamuhotnowArticles.mockReset();
  matchThread.mockReset();
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

  it("registers a runtime.onMessage listener on import", () => {
    expect(addListener).toHaveBeenCalled();
  });
});
