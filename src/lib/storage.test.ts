import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStorageState } from "./storage";

// Stub the parts of the chrome API we touch. Each callback path is
// driven by the test — we control whether runtime.lastError is set
// and what the storage returns.
const localGet = vi.fn();
const syncGet = vi.fn();
let lastError: { message: string } | undefined;

beforeEach(() => {
  localGet.mockReset();
  syncGet.mockReset();
  lastError = undefined;
  // chrome.runtime.lastError is a getter — only present during the
  // synchronous tail of a callback. Re-evaluate on every read.
  globalThis.chrome = {
    runtime: {
      get lastError() {
        return lastError;
      },
    },
    storage: {
      local: { get: localGet },
      sync: { get: syncGet },
    },
  } as unknown as typeof chrome;
});

describe("getStorageState — happy path", () => {
  it("returns enabled=true when that is what storage holds", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    const state = await getStorageState();
    expect(state).toEqual({ enabled: true });
  });

  it("returns user-saved enabled=false", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: false }));
    const state = await getStorageState();
    expect(state).toEqual({ enabled: false });
  });

  it("queries chrome.storage.local for `enabled` (default true)", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    await getStorageState();
    expect(localGet).toHaveBeenCalledTimes(1);
    expect(localGet.mock.calls[0]![0]).toEqual({ enabled: true });
  });

  it("does not read chrome.storage.sync", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    await getStorageState();
    expect(syncGet).not.toHaveBeenCalled();
  });
});

describe("getStorageState — error paths", () => {
  it("logs a warning when chrome.storage.local read sets runtime.lastError but still resolves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localGet.mockImplementation((_defaults, cb) => {
      lastError = { message: "QUOTA_BYTES_PER_ITEM exceeded" };
      cb({ enabled: true });
      lastError = undefined;
    });
    const state = await getStorageState();
    expect(state.enabled).toBe(true);
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("getStorageState(local)");
    expect(logged).toContain("QUOTA_BYTES_PER_ITEM");
    warn.mockRestore();
  });

  it("stays quiet when the read succeeds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    await getStorageState();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never throws — promise always resolves even on missing lastError details", async () => {
    localGet.mockImplementation((_defaults, cb) => {
      // lastError set but missing message — defensive read should still work.
      lastError = {} as { message: string };
      cb({ enabled: true });
      lastError = undefined;
    });
    await expect(getStorageState()).resolves.toEqual({ enabled: true });
  });
});
