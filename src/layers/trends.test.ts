import { describe, it, expect } from "vitest";
import { computeTrends } from "./trends";

describe("computeTrends", () => {
  it("returns 'same' for every keyword on the baseline (empty prev)", () => {
    const cur = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const t = computeTrends(cur, new Map());
    expect(t.get("A")).toBe("same");
    expect(t.get("B")).toBe("same");
  });

  it("marks a keyword that rose in rank as 'up'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const cur = new Map([
      [1, "B"],
      [2, "A"],
    ]); // B 2→1
    expect(computeTrends(cur, prev).get("B")).toBe("up");
  });

  it("marks a keyword that fell as 'down'", () => {
    const prev = new Map([
      [1, "A"],
      [2, "B"],
    ]);
    const cur = new Map([
      [1, "B"],
      [2, "A"],
    ]); // A 1→2
    expect(computeTrends(cur, prev).get("A")).toBe("down");
  });

  it("marks a keyword absent from prev as 'new'", () => {
    const prev = new Map([[1, "A"]]);
    const cur = new Map([
      [1, "A"],
      [2, "C"],
    ]);
    expect(computeTrends(cur, prev).get("C")).toBe("new");
  });

  it("marks an unchanged rank as 'same'", () => {
    const prev = new Map([[1, "A"]]);
    const cur = new Map([[1, "A"]]);
    expect(computeTrends(cur, prev).get("A")).toBe("same");
  });
});
