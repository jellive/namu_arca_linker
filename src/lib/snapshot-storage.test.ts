import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  writeCurrentKeywords,
  readCurrentKeywords,
  readSnapshotHistory,
  recordSnapshot,
} from "./snapshot-storage";
import {
  STORAGE_KEY_CURRENT_KEYWORDS,
  STORAGE_KEY_SNAPSHOT_HISTORY,
} from "../constants/config";
import type { KeywordSnapshot } from "../types/common";

const localGet = vi.fn();
const localSet = vi.fn();

beforeEach(() => {
  localGet.mockReset();
  localSet.mockReset();
  globalThis.chrome = {
    runtime: { lastError: undefined },
    storage: { local: { get: localGet, set: localSet } },
  } as unknown as typeof chrome;
});

describe("writeCurrentKeywords", () => {
  it("stores a snapshot of the given keywords under STORAGE_KEY_CURRENT_KEYWORDS", async () => {
    localSet.mockImplementation((_v, cb?: () => void) => cb?.());
    await writeCurrentKeywords(new Map([[1, "황승언"]]));
    expect(localSet).toHaveBeenCalledTimes(1);
    const written = localSet.mock.calls[0]![0][STORAGE_KEY_CURRENT_KEYWORDS];
    expect(written.keywords).toEqual([[1, "황승언"]]);
    expect(typeof written.t).toBe("number");
  });

  it("warns but resolves when chrome.runtime.lastError is set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (
      globalThis.chrome.runtime as unknown as { lastError: { message: string } }
    ).lastError = {
      message: "quota",
    };
    localSet.mockImplementation((_v, cb?: () => void) => cb?.());
    await expect(writeCurrentKeywords(new Map())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("readCurrentKeywords", () => {
  it("returns null when nothing stored yet", async () => {
    localGet.mockImplementation((_d, cb) =>
      cb({ [STORAGE_KEY_CURRENT_KEYWORDS]: null }),
    );
    expect(await readCurrentKeywords()).toBeNull();
  });

  it("returns the stored snapshot", async () => {
    const snap: KeywordSnapshot = { t: 123, keywords: [[1, "a"]] };
    localGet.mockImplementation((_d, cb) =>
      cb({ [STORAGE_KEY_CURRENT_KEYWORDS]: snap }),
    );
    expect(await readCurrentKeywords()).toEqual(snap);
  });
});

describe("readSnapshotHistory", () => {
  it("defaults to an empty array when nothing stored", async () => {
    localGet.mockImplementation((_d, cb) =>
      cb({ [STORAGE_KEY_SNAPSHOT_HISTORY]: [] }),
    );
    expect(await readSnapshotHistory()).toEqual([]);
  });

  it("returns the stored history", async () => {
    const hist: KeywordSnapshot[] = [{ t: 1, keywords: [] }];
    localGet.mockImplementation((_d, cb) =>
      cb({ [STORAGE_KEY_SNAPSHOT_HISTORY]: hist }),
    );
    expect(await readSnapshotHistory()).toEqual(hist);
  });
});

describe("recordSnapshot", () => {
  it("no-ops when the content script has never pushed a keyword list", async () => {
    localGet.mockImplementation((defaults, cb) => cb(defaults));
    await recordSnapshot();
    expect(localSet).not.toHaveBeenCalled();
  });

  it("appends the current snapshot to history and writes it back, capped", async () => {
    const current: KeywordSnapshot = { t: 999, keywords: [[1, "새검색어"]] };
    localGet.mockImplementation((defaults, cb) => {
      if (STORAGE_KEY_CURRENT_KEYWORDS in defaults) {
        cb({ [STORAGE_KEY_CURRENT_KEYWORDS]: current });
      } else {
        cb({ [STORAGE_KEY_SNAPSHOT_HISTORY]: [{ t: 1, keywords: [] }] });
      }
    });
    localSet.mockImplementation((_v, cb?: () => void) => cb?.());

    await recordSnapshot(48);

    expect(localSet).toHaveBeenCalledTimes(1);
    const written = localSet.mock.calls[0]![0][STORAGE_KEY_SNAPSHOT_HISTORY];
    expect(written).toHaveLength(2);
    expect(written[1]).toEqual(current);
  });

  it("prunes history down to the given cap", async () => {
    const current: KeywordSnapshot = { t: 999, keywords: [] };
    const bigHistory: KeywordSnapshot[] = Array.from({ length: 5 }, (_, i) => ({
      t: i,
      keywords: [],
    }));
    localGet.mockImplementation((defaults, cb) => {
      if (STORAGE_KEY_CURRENT_KEYWORDS in defaults) {
        cb({ [STORAGE_KEY_CURRENT_KEYWORDS]: current });
      } else {
        cb({ [STORAGE_KEY_SNAPSHOT_HISTORY]: bigHistory });
      }
    });
    localSet.mockImplementation((_v, cb?: () => void) => cb?.());

    await recordSnapshot(3);

    const written = localSet.mock.calls[0]![0][STORAGE_KEY_SNAPSHOT_HISTORY];
    expect(written).toHaveLength(3);
    expect(written[written.length - 1]).toEqual(current);
  });
});
