import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDeviceToken, matchThread } from "./arca-api";
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
