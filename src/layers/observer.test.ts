import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock detection so we can assert how observer wires it up. Must come
// before importing observer.ts so the mock is captured at module load.
const detectKeywordChangesMock = vi.fn();
vi.mock("./detection", () => ({
  detectKeywordChanges: () => detectKeywordChangesMock(),
}));

import { observeRealtimeUpdates } from "./observer";

/**
 * Tests for the MutationObserver wrapper that watches namu.wiki's realtime
 * search container. JSDOM doesn't fire real MutationObservers, so we mock
 * the global to capture how observeRealtimeUpdates wires it up.
 */

interface MockObserverInstance {
  callback: MutationCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

describe("observer.ts — observeRealtimeUpdates", () => {
  let observerInstances: MockObserverInstance[];

  beforeEach(() => {
    document.body.innerHTML = "";
    observerInstances = [];
    detectKeywordChangesMock.mockReset();

    // @ts-expect-error minimal chrome mock for storage read (needed by addArcaLinks → refreshActiveSites)
    globalThis.chrome = {
      storage: {
        sync: {
          get: (_d: unknown, cb: (v: { targetSites: undefined }) => void) =>
            cb({ targetSites: undefined }),
        },
      },
    };

    (globalThis as unknown as { MutationObserver: unknown }).MutationObserver =
      class MockObserver {
        observe = vi.fn();
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
        constructor(public callback: MutationCallback) {
          observerInstances.push(this as unknown as MockObserverInstance);
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
    expect(opts).toMatchObject({
      childList: true,
      attributes: true,
      subtree: true,
    });
    expect(opts.attributeFilter).toContain("href");
  });

  it("processes pre-existing keywords after attach (closes initial-render race)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=북토끼">북토끼</a></li>
        <li><a href="/Go?q=키워드2">키워드2</a></li>
      </ul>
    `;

    observeRealtimeUpdates();
    await vi.runAllTimersAsync();

    // Now renders one container per keyword (each with 5 site links)
    const containers = document.querySelectorAll("span.arca-links");
    expect(containers.length).toBe(2);
  });

  it("retries up to 5 times when container is missing, then gives up", () => {
    observeRealtimeUpdates();
    expect(observerInstances.length).toBe(0);

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500);
    }
    expect(observerInstances.length).toBe(0);

    vi.advanceTimersByTime(5000);
    expect(observerInstances.length).toBe(0);
  });

  it("attaches observer mid-retry when container appears", () => {
    observeRealtimeUpdates();
    expect(observerInstances.length).toBe(0);

    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);

    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=lateAppear">늦게 나타난 키워드</a></li>
      </ul>
    `;

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

    expect(() =>
      callback(fakeMutations, obs as unknown as MutationObserver),
    ).not.toThrow();
  });

  it("triggers addArcaLinks when childList mutation adds a /Go?q= anchor directly", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=existing">existing</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    await vi.runAllTimersAsync(); // initial post-attach pass
    const initialCount = document.querySelectorAll("a.arca-link").length;

    const obs = observerInstances[0]!;
    // Append a new realtime anchor and dispatch a synthetic mutation.
    const ul = document.querySelector("ul")!;
    const newLi = document.createElement("li");
    newLi.innerHTML = '<a href="/Go?q=new">new</a>';
    ul.appendChild(newLi);

    obs.callback(
      [
        {
          type: "childList" as MutationRecordType,
          addedNodes: [newLi] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: ul,
          previousSibling: null,
          nextSibling: null,
          attributeName: null,
          attributeNamespace: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );
    await vi.runAllTimersAsync();

    expect(document.querySelectorAll("a.arca-link").length).toBeGreaterThan(
      initialCount,
    );
  });

  it("triggers addArcaLinks when added node IS the /Go?q= anchor itself (not nested)", async () => {
    // Pin observer.ts:79-83 — the branch that checks
    // `element.tagName === "A" && (...)?.getAttribute("href")?.startsWith("/Go?q=")`.
    // Existing childList tests add wrapper elements (<li>, <div>) which
    // hit the else-branch via querySelector. Without this test the
    // direct-anchor branch has zero coverage and Stryker reports
    // 6 NoCoverage mutants on lines 79-83 (MethodExpression on startsWith,
    // OptionalChaining on getAttribute(...)?, two StringLiterals, the
    // BlockStatement, and the BooleanLiteral assigning shouldUpdate).
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=existing">existing</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    await vi.runAllTimersAsync();
    const baseline = document.querySelectorAll("a.arca-link").length;

    const obs = observerInstances[0]!;
    // Build a bare <a href="/Go?q=..."> and pass it AS the addedNode.
    const ul = document.querySelector("ul")!;
    const directAnchor = document.createElement("a");
    directAnchor.setAttribute("href", "/Go?q=direct");
    directAnchor.textContent = "direct";
    ul.appendChild(directAnchor);

    obs.callback(
      [
        {
          type: "childList" as MutationRecordType,
          addedNodes: [directAnchor] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: ul,
          previousSibling: null,
          nextSibling: null,
          attributeName: null,
          attributeNamespace: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );
    await vi.runAllTimersAsync();

    expect(document.querySelectorAll("a.arca-link").length).toBeGreaterThan(
      baseline,
    );
  });

  it("triggers addArcaLinks when childList mutation adds a node CONTAINING a /Go?q= anchor (nested)", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=existing">existing</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    await vi.runAllTimersAsync();
    const baseline = document.querySelectorAll("a.arca-link").length;

    const obs = observerInstances[0]!;
    // Wrapper <div> is the addedNode; the realtime anchor is a descendant.
    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<ul><li><a href="/Go?q=nested">nested</a></li></ul>';
    document.body.appendChild(wrapper);

    obs.callback(
      [
        {
          type: "childList" as MutationRecordType,
          addedNodes: [wrapper] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: document.body,
          previousSibling: null,
          nextSibling: null,
          attributeName: null,
          attributeNamespace: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );
    await vi.runAllTimersAsync();

    expect(document.querySelectorAll("a.arca-link").length).toBeGreaterThan(
      baseline,
    );
  });

  it("debounces attribute mutations and calls detectKeywordChanges after delay", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=k1" id="anchor1">k1</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    vi.advanceTimersByTime(200);
    detectKeywordChangesMock.mockReset();
    detectKeywordChangesMock.mockReturnValue([]);

    const obs = observerInstances[0]!;
    const anchor = document.getElementById("anchor1")!;

    // Two rapid href changes — the debounce should coalesce them into ONE
    // call to detectKeywordChanges.
    const mut = (target: HTMLElement): MutationRecord =>
      ({
        type: "attributes" as MutationRecordType,
        attributeName: "href",
        attributeNamespace: null,
        addedNodes: [] as unknown as NodeList,
        removedNodes: [] as unknown as NodeList,
        target,
        previousSibling: null,
        nextSibling: null,
        oldValue: null,
      }) as MutationRecord;

    obs.callback([mut(anchor)], obs as unknown as MutationObserver);
    obs.callback([mut(anchor)], obs as unknown as MutationObserver);
    expect(detectKeywordChangesMock).not.toHaveBeenCalled(); // still inside debounce

    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();
    expect(detectKeywordChangesMock).toHaveBeenCalledTimes(1);
  });

  it("ignores attribute mutations on anchors that do NOT match /Go?q=", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/page" id="other">other</a><a href="/Go?q=ok" id="ok">ok</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    vi.advanceTimersByTime(200);
    detectKeywordChangesMock.mockReset();

    const obs = observerInstances[0]!;
    const other = document.getElementById("other")!;

    obs.callback(
      [
        {
          type: "attributes" as MutationRecordType,
          attributeName: "href",
          attributeNamespace: null,
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: other,
          previousSibling: null,
          nextSibling: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );
    vi.advanceTimersByTime(500);

    expect(detectKeywordChangesMock).not.toHaveBeenCalled();
  });

  it("dispatches updateArcaLink for each detected change when href update fires", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=k1" id="a1">k1</a><a class="arca-link" id="old-arca">왜?</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    vi.advanceTimersByTime(200);
    detectKeywordChangesMock.mockReset();

    const anchorEl = document.getElementById("a1")!;
    detectKeywordChangesMock.mockReturnValue([
      {
        type: "added",
        rank: 1,
        newKeyword: "새것",
        element: anchorEl,
      },
    ]);

    const obs = observerInstances[0]!;
    obs.callback(
      [
        {
          type: "attributes" as MutationRecordType,
          attributeName: "href",
          attributeNamespace: null,
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: anchorEl,
          previousSibling: null,
          nextSibling: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    expect(detectKeywordChangesMock).toHaveBeenCalledTimes(1);
    // The pre-existing arca-link is preserved + may now have a sibling for
    // the "added" change. We assert at minimum the dispatch happened and the
    // DOM has at least one arca-link still.
    expect(document.querySelectorAll(".arca-link").length).toBeGreaterThan(0);
  });

  it("logs '변경 내역 없음' branch when detection returns empty list", async () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=k1" id="a1">k1</a></li>
      </ul>
    `;
    observeRealtimeUpdates();
    vi.advanceTimersByTime(200);
    detectKeywordChangesMock.mockReset();
    detectKeywordChangesMock.mockReturnValue([]);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const obs = observerInstances[0]!;
    const a1 = document.getElementById("a1")!;

    obs.callback(
      [
        {
          type: "attributes" as MutationRecordType,
          attributeName: "href",
          attributeNamespace: null,
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          target: a1,
          previousSibling: null,
          nextSibling: null,
          oldValue: null,
        } as MutationRecord,
      ],
      obs as unknown as MutationObserver,
    );

    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();

    const flat = log.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(flat).toContain("변경 내역 없음");
    log.mockRestore();
  });
});
