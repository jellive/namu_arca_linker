import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { observeRealtimeUpdates } from "./observer";

/**
 * Tests for the MutationObserver wrapper that watches namu.wiki's realtime
 * search container. JSDOM doesn't fire real MutationObservers, so we mock
 * the global to capture how observeRealtimeUpdates wires it up.
 */

describe("observer.ts — observeRealtimeUpdates", () => {
  let observerInstances: Array<{
    callback: MutationCallback;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }>;

  beforeEach(() => {
    document.body.innerHTML = "";
    observerInstances = [];

    // Replace global MutationObserver so we can inspect the registration.
    (globalThis as unknown as { MutationObserver: unknown }).MutationObserver =
      class MockObserver {
        observe = vi.fn();
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
        constructor(public callback: MutationCallback) {
          observerInstances.push(
            this as unknown as (typeof observerInstances)[number],
          );
        }
      };

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("attaches observer immediately when container already in DOM", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=keyword1">키워드1</a></li>
      </ul>
    `;

    observeRealtimeUpdates();

    expect(observerInstances.length).toBe(1);
    const obs = observerInstances[0]!;
    expect(obs.observe).toHaveBeenCalledTimes(1);
    const [target, opts] = obs.observe.mock.calls[0]!;
    expect(target).toBeTruthy();
    // Observer should subscribe to childList + attribute changes on href, with subtree
    expect(opts).toMatchObject({
      childList: true,
      attributes: true,
      subtree: true,
    });
    expect(opts.attributeFilter).toContain("href");
  });

  it("retries up to 5 times when container is missing, then gives up", () => {
    // Empty DOM — no container found on first try
    observeRealtimeUpdates();
    expect(observerInstances.length).toBe(0);

    // Each retry interval is 500ms; 5 retries = 5 × 500ms
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500);
    }

    // Still no observer because container never appeared
    expect(observerInstances.length).toBe(0);

    // After max retries exhausted, advancing more time should NOT spawn new
    // observers (interval was cleared)
    vi.advanceTimersByTime(5000);
    expect(observerInstances.length).toBe(0);
  });

  it("attaches observer mid-retry when container appears", () => {
    observeRealtimeUpdates();
    expect(observerInstances.length).toBe(0);

    // After 2 retries, simulate container appearing in DOM
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);

    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=lateAppear">늦게 나타난 키워드</a></li>
      </ul>
    `;

    // Next retry should pick up the new container
    vi.advanceTimersByTime(500);

    expect(observerInstances.length).toBe(1);
  });

  it("ignores arca-link mutations to avoid feedback loop", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=key">키워드</a></li>
      </ul>
    `;

    observeRealtimeUpdates();
    expect(observerInstances.length).toBe(1);

    const obs = observerInstances[0]!;
    const callback = obs.callback;

    // Simulate the observer firing with an "arca-link" being added (which is
    // what we ourselves inject — it must not retrigger another addArcaLinks
    // pass and create an infinite loop).
    const arcaLink = document.createElement("a");
    arcaLink.classList.add("arca-link");

    const fakeMutations = [
      {
        type: "childList" as MutationRecordType,
        addedNodes: [arcaLink] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target: document.body,
        previousSibling: null,
        nextSibling: null,
        attributeName: null,
        attributeNamespace: null,
        oldValue: null,
      } as MutationRecord,
    ];

    // No throw + the body of the callback's `shouldUpdate` branch should
    // skip arca-link nodes. We just assert the callback runs cleanly.
    expect(() =>
      callback(fakeMutations, obs as unknown as MutationObserver),
    ).not.toThrow();
  });
});
