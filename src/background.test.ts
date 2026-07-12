import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchNamuhotnowArticles = vi.fn();
const matchThread = vi.fn();
vi.mock("./lib/arca-api", () => ({
  fetchNamuhotnowArticles: (...a: unknown[]) => fetchNamuhotnowArticles(...a),
  matchThread: (...a: unknown[]) => matchThread(...a),
}));

const recordSnapshot = vi.fn();
vi.mock("./lib/snapshot-storage", () => ({
  recordSnapshot: (...a: unknown[]) => recordSnapshot(...a),
}));

// chrome APIs must exist at import time.
// vi.hoisted runs before module imports, so chrome is defined when background.ts loads.
const { addListener, alarmsCreate, alarmsOnAlarmAdd } = vi.hoisted(() => {
  const addListener = vi.fn();
  const alarmsCreate = vi.fn();
  const alarmsOnAlarmAdd = vi.fn();
  globalThis.chrome = {
    runtime: {
      onMessage: { addListener },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    declarativeNetRequest: {
      updateSessionRules: vi.fn(),
    },
    alarms: {
      create: alarmsCreate,
      onAlarm: { addListener: alarmsOnAlarmAdd },
    },
  } as unknown as typeof chrome;
  return { addListener, alarmsCreate, alarmsOnAlarmAdd };
});

import { handleMatchThreads, handleAlarm } from "./background";
import { SNAPSHOT_ALARM_NAME, SNAPSHOT_INTERVAL_MIN } from "./constants/config";

beforeEach(() => {
  fetchNamuhotnowArticles.mockReset();
  matchThread.mockReset();
  recordSnapshot.mockReset();
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

describe("snapshot alarm", () => {
  it("registers a chrome.alarms.onAlarm listener on import", () => {
    expect(alarmsOnAlarmAdd).toHaveBeenCalledWith(handleAlarm);
  });

  it("registers the snapshot alarm on install/startup with the configured interval", () => {
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    const registerFn = (
      chrome.runtime.onInstalled.addListener as ReturnType<typeof vi.fn>
    ).mock.calls.find(([fn]) => fn.name === "registerSnapshotAlarm")?.[0] as
      | (() => void)
      | undefined;
    expect(registerFn).toBeDefined();
    registerFn?.();
    expect(alarmsCreate).toHaveBeenCalledWith(SNAPSHOT_ALARM_NAME, {
      periodInMinutes: SNAPSHOT_INTERVAL_MIN,
    });
  });

  it("calls recordSnapshot when the matching alarm fires", () => {
    handleAlarm({ name: SNAPSHOT_ALARM_NAME } as chrome.alarms.Alarm);
    expect(recordSnapshot).toHaveBeenCalledTimes(1);
  });

  it("ignores alarms with a different name", () => {
    handleAlarm({ name: "some-other-alarm" } as chrome.alarms.Alarm);
    expect(recordSnapshot).not.toHaveBeenCalled();
  });
});
