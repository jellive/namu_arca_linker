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
  it("returns the default enabled=true + empty targetSites when nothing stored", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    syncGet.mockImplementation((_defaults, cb) => cb({ targetSites: [] }));
    const state = await getStorageState();
    expect(state.enabled).toBe(true);
    expect(state.targetSites).toEqual([]);
  });

  it("returns user-saved enabled=false + custom sites", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: false }));
    syncGet.mockImplementation((_defaults, cb) =>
      cb({
        targetSites: [
          { name: "Custom", url: "https://example.com?q={keyword}" },
        ],
      }),
    );
    const state = await getStorageState();
    expect(state.enabled).toBe(false);
    expect(state.targetSites).toHaveLength(1);
    expect(state.targetSites[0]!.name).toBe("Custom");
  });

  it("queries chrome.storage.local for `enabled` (default true)", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    syncGet.mockImplementation((_defaults, cb) => cb({ targetSites: [] }));
    await getStorageState();
    expect(localGet).toHaveBeenCalledTimes(1);
    expect(localGet.mock.calls[0]![0]).toEqual({ enabled: true });
  });

  it("queries chrome.storage.sync for `targetSites` (default [])", async () => {
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: true }));
    syncGet.mockImplementation((_defaults, cb) => cb({ targetSites: [] }));
    await getStorageState();
    expect(syncGet).toHaveBeenCalledTimes(1);
    expect(syncGet.mock.calls[0]![0]).toEqual({ targetSites: [] });
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
    syncGet.mockImplementation((_defaults, cb) => cb({ targetSites: [] }));
    const state = await getStorageState();
    expect(state.enabled).toBe(true);
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("getStorageState(local)");
    expect(logged).toContain("QUOTA_BYTES_PER_ITEM");
    warn.mockRestore();
  });

  it("logs a warning when chrome.storage.sync read sets runtime.lastError but still resolves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localGet.mockImplementation((_defaults, cb) => cb({ enabled: false }));
    syncGet.mockImplementation((_defaults, cb) => {
      lastError = { message: "MAX_WRITE_OPERATIONS_PER_HOUR" };
      cb({ targetSites: [] });
      lastError = undefined;
    });
    const state = await getStorageState();
    expect(state.enabled).toBe(false);
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("getStorageState(sync)");
    warn.mockRestore();
  });

  it("logs warnings for BOTH layers when both fail (does not stop on first error)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localGet.mockImplementation((_defaults, cb) => {
      lastError = { message: "local-broken" };
      cb({ enabled: true });
      lastError = undefined;
    });
    syncGet.mockImplementation((_defaults, cb) => {
      lastError = { message: "sync-broken" };
      cb({ targetSites: [] });
      lastError = undefined;
    });
    await getStorageState();
    const callTexts = warn.mock.calls.map((args) => args.join(" "));
    expect(callTexts.some((t) => t.includes("local-broken"))).toBe(true);
    expect(callTexts.some((t) => t.includes("sync-broken"))).toBe(true);
    warn.mockRestore();
  });

  it("never throws — promise always resolves even on missing lastError details", async () => {
    localGet.mockImplementation((_defaults, cb) => {
      // lastError set but missing message — defensive read should still work.
      lastError = {} as { message: string };
      cb({ enabled: true });
      lastError = undefined;
    });
    syncGet.mockImplementation((_defaults, cb) => cb({ targetSites: [] }));
    await expect(getStorageState()).resolves.toBeDefined();
  });
});
