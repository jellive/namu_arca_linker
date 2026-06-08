import { describe, it, expect } from "vitest";
import { DEFAULT_TARGET_SITES } from "./sites";

describe("DEFAULT_TARGET_SITES", () => {
  it("ships 5 default sites", () => {
    expect(DEFAULT_TARGET_SITES).toHaveLength(5);
  });

  it("every site has name, url with {keyword}, and a short label", () => {
    for (const site of DEFAULT_TARGET_SITES) {
      expect(site.name.length).toBeGreaterThan(0);
      expect(site.url).toContain("{keyword}");
      expect(site.label && site.label.length).toBeTruthy();
    }
  });

  it("includes 아카/네이버/구글/X/DC labels", () => {
    const labels = DEFAULT_TARGET_SITES.map((s) => s.label);
    expect(labels).toEqual(["아카", "네이버", "구글", "X", "DC"]);
  });
});
