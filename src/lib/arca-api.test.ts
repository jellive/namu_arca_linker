import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDeviceToken } from "./arca-api";

const localGet = vi.fn();
const localSet = vi.fn();

beforeEach(() => {
  localGet.mockReset();
  localSet.mockReset();
  globalThis.chrome = {
    storage: { local: { get: localGet, set: localSet } },
  } as unknown as typeof chrome;
});

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
