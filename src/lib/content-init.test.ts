import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock the heavy DOM-touching layers BEFORE importing content-init so
// the real modules never load. addArcaLinks() walks the live DOM in
// production; we only care that it gets dispatched at the right times.
const addArcaLinks = vi.fn().mockResolvedValue(undefined);
const observeRealtimeUpdates = vi.fn();
const onRealtimeChange = vi.fn();
const getStorageState = vi.fn();

vi.mock("../layers/manipulation", () => ({
  addArcaLinks: (...args: unknown[]) => addArcaLinks(...args),
}));
vi.mock("../layers/observer", () => ({
  observeRealtimeUpdates: (...args: unknown[]) =>
    observeRealtimeUpdates(...args),
  onRealtimeChange: (...args: unknown[]) => onRealtimeChange(...args),
}));
vi.mock("./storage", () => ({
  getStorageState: () => getStorageState(),
}));

import { init, setupStorageListener, bootstrap } from "./content-init";

const onChangedAdd = vi.fn();

beforeEach(() => {
  addArcaLinks.mockClear();
  observeRealtimeUpdates.mockClear();
  onRealtimeChange.mockClear();
  getStorageState.mockReset();
  onChangedAdd.mockClear();
  globalThis.chrome = {
    storage: {
      onChanged: { addListener: onChangedAdd },
      sync: {
        get: (
          _defaults: Record<string, unknown>,
          cb: (v: Record<string, unknown>) => void,
        ) => cb({ hideInlineLinks: false }),
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  // Clean up window.navigation overrides between tests.
  delete (window as unknown as { navigation?: unknown }).navigation;
});

describe("init — enabled gate", () => {
  it("early-returns without touching the DOM when storage says disabled", async () => {
    getStorageState.mockResolvedValue({ enabled: false, targetSites: [] });
    await init();
    expect(addArcaLinks).not.toHaveBeenCalled();
    expect(observeRealtimeUpdates).not.toHaveBeenCalled();
  });

  it("runs addArcaLinks + observeRealtimeUpdates when enabled", async () => {
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
    await init();
    expect(addArcaLinks).toHaveBeenCalledTimes(1);
    expect(observeRealtimeUpdates).toHaveBeenCalledTimes(1);
  });

  it("does not import or call any panel code (panel removed)", async () => {
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
    await init();
    // addArcaLinks is the only DOM-mutating call now
    expect(addArcaLinks).toHaveBeenCalledTimes(1);
  });

  it("calls addArcaLinks BEFORE observeRealtimeUpdates (initial paint then watch)", async () => {
    const callOrder: string[] = [];
    addArcaLinks.mockImplementation(async () => {
      callOrder.push("addArcaLinks");
    });
    observeRealtimeUpdates.mockImplementation(() => {
      callOrder.push("observeRealtimeUpdates");
    });
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
    await init();
    expect(callOrder).toEqual(["addArcaLinks", "observeRealtimeUpdates"]);
  });
});

describe("init — SPA navigation listener", () => {
  it("registers a 'navigate' listener when window.navigation API is present", async () => {
    const navAdd = vi.fn();
    (window as unknown as { navigation: EventTarget }).navigation = {
      addEventListener: navAdd,
    } as unknown as EventTarget;
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });

    await init();

    expect(navAdd).toHaveBeenCalledTimes(1);
    expect(navAdd.mock.calls[0]![0]).toBe("navigate");
  });

  it("does NOT register a navigation listener when window.navigation is absent", async () => {
    // Default: window.navigation is unset (afterEach hooked).
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
    await init();
    // No assertion needed beyond not throwing — guard is defensive.
    expect(addArcaLinks).toHaveBeenCalledTimes(1);
  });

  it("debounces navigation re-runs via setTimeout (does not fire addArcaLinks synchronously)", async () => {
    vi.useFakeTimers();
    const handlers: Record<string, EventListener> = {};
    (window as unknown as { navigation: EventTarget }).navigation = {
      addEventListener: ((evt: string, h: EventListener) => {
        handlers[evt] = h;
      }) as EventTarget["addEventListener"],
    } as unknown as EventTarget;

    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
    await init();
    addArcaLinks.mockClear();

    handlers["navigate"]!(new Event("navigate"));
    expect(addArcaLinks).not.toHaveBeenCalled(); // still debounced
    vi.runAllTimers();
    expect(addArcaLinks).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe("setupStorageListener", () => {
  it("registers a chrome.storage.onChanged listener and returns it", () => {
    const listener = setupStorageListener();
    expect(onChangedAdd).toHaveBeenCalledTimes(1);
    expect(onChangedAdd.mock.calls[0]![0]).toBe(listener);
  });

  it("calls addArcaLinks when local.enabled flips to true", () => {
    const listener = setupStorageListener();
    listener({ enabled: { newValue: true, oldValue: false } }, "local");
    expect(addArcaLinks).toHaveBeenCalledTimes(1);
  });

  it("does NOT call addArcaLinks when local.enabled flips to false", () => {
    const listener = setupStorageListener();
    listener({ enabled: { newValue: false, oldValue: true } }, "local");
    expect(addArcaLinks).not.toHaveBeenCalled();
  });

  it("ignores changes from areas other than 'local'", () => {
    const listener = setupStorageListener();
    listener({ enabled: { newValue: true, oldValue: false } }, "sync");
    listener({ enabled: { newValue: true, oldValue: false } }, "managed");
    expect(addArcaLinks).not.toHaveBeenCalled();
  });

  it("ignores changes that don't include the 'enabled' key", () => {
    const listener = setupStorageListener();
    listener(
      { targetSites: { newValue: [], oldValue: [{ name: "x", url: "y" }] } },
      "local",
    );
    expect(addArcaLinks).not.toHaveBeenCalled();
  });
});

describe("bootstrap — readyState dispatch", () => {
  let docAdd: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    docAdd = vi.spyOn(document, "addEventListener");
  });

  afterEach(() => {
    docAdd.mockRestore();
  });

  it("attaches a DOMContentLoaded listener when document is still loading", () => {
    Object.defineProperty(document, "readyState", {
      value: "loading",
      configurable: true,
    });
    getStorageState.mockResolvedValue({ enabled: false, targetSites: [] });

    bootstrap();

    expect(onChangedAdd).toHaveBeenCalledTimes(1); // setupStorageListener
    expect(docAdd).toHaveBeenCalledWith(
      "DOMContentLoaded",
      expect.any(Function),
    );
  });

  it("calls init() immediately when document is already interactive/complete", async () => {
    Object.defineProperty(document, "readyState", {
      value: "complete",
      configurable: true,
    });
    getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });

    bootstrap();
    // Wait the next microtask so init()'s promise chain runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(addArcaLinks).toHaveBeenCalled();
  });
});
