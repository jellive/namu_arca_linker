import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPanel,
  renderRows,
  mountPanel,
  updatePanel,
  __resetPanelForTest,
} from "./panel";
import {
  CSS_CLASS_PANEL,
  CSS_CLASS_PANEL_ROW,
  CSS_CLASS_PANEL_BADGE,
  CSS_CLASS_LINKS_CONTAINER,
} from "../constants/config";
import type { TargetSite } from "../lib/storage";

const SITES: TargetSite[] = [
  { name: "구글", label: "구글", url: "https://g/{keyword}" },
];

describe("buildPanel", () => {
  it("builds a panel shell with header, body and toggle", () => {
    const { panel, body, toggle } = buildPanel();
    expect(panel.className).toContain(CSS_CLASS_PANEL);
    expect(body).toBeTruthy();
    expect(toggle.tagName).toBe("BUTTON");
  });
});

describe("renderRows", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders one row per keyword with rank, badge, keyword and links", () => {
    const body = document.createElement("div");
    renderRows(
      body,
      new Map([
        [1, "손흥민"],
        [2, "비트코인"],
      ]),
      new Map([
        ["손흥민", "up"],
        ["비트코인", "new"],
      ]),
      SITES,
    );
    const rows = body.querySelectorAll(`.${CSS_CLASS_PANEL_ROW}`);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("손흥민");
    expect(body.querySelector(`.${CSS_CLASS_PANEL_BADGE}`)).toBeTruthy();
    expect(body.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length).toBe(
      2,
    );
  });

  it("shows an empty state when there are no keywords", () => {
    const body = document.createElement("div");
    renderRows(body, new Map(), new Map(), SITES);
    expect(body.querySelectorAll(`.${CSS_CLASS_PANEL_ROW}`)).toHaveLength(0);
    expect(body.textContent).toContain("실시간 검색어");
  });
});

function mockChromeStorage(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  // @ts-expect-error minimal mock
  globalThis.chrome = {
    storage: {
      local: {
        get: (
          defaults: Record<string, unknown>,
          cb: (v: Record<string, unknown>) => void,
        ) => cb({ ...defaults, ...store }),
        set: (v: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, v);
          cb?.();
        },
      },
    },
  };
  return store;
}

describe("mountPanel / updatePanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockChromeStorage();
    __resetPanelForTest();
    // 실검 DOM the discovery layer will read
    document.body.innerHTML = `
      <div class="realtime"><a href="/Go?q=%EC%86%90%ED%9D%A5%EB%AF%BC">손흥민</a></div>`;
  });

  it("injects exactly one panel even if mounted twice (idempotent)", async () => {
    await mountPanel();
    await mountPanel();
    expect(document.querySelectorAll(".arca-hub").length).toBe(1);
  });

  it("updatePanel renders current keywords into the panel body", async () => {
    await mountPanel();
    await updatePanel();
    expect(document.querySelector(".arca-hub-row")?.textContent).toContain(
      "손흥민",
    );
  });
});
