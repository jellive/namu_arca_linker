# Multi-Site Quick-Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an inline-wrapping row of quick-search links (5 default sites) next to each 나무위키 실시간 검색어, instead of the current single 아카라이브 link.

**Architecture:** The data model (`TargetSite[]` in `chrome.storage.sync`) and the options UI already support a site list; only `layers/manipulation.ts` was hardcoded to use `sites[0]`. This plan refactors the render path to loop ALL configured sites into one container `<span>`, expands the defaults to 5, adds an optional short `label`, and styles the container to wrap. No manifest permission changes (target links are plain `<a href>` navigations).

**Tech Stack:** Chrome MV3 extension, TypeScript, Vite (`vite build`), Vitest (`*.test.ts` colocated under `src/`), npm.

**Run all tests:** `npm run test:run` • **Run one file:** `npx vitest run src/layers/manipulation.test.ts` • **Build:** `npm run build`

---

## File Structure

- `src/lib/storage.ts` — add optional `label` to `TargetSite`.
- `src/constants/config.ts` — add `CSS_CLASS_LINKS_CONTAINER`.
- `src/constants/sites.ts` — expand `DEFAULT_TARGET_SITES` to 5 (with `label`).
- `src/layers/manipulation.ts` — replace single-site logic with multi-site container rendering (the core change).
- `src/layers/manipulation.test.ts` — rewrite/extend tests for the new API.
- `styles.css` — add `.arca-links` container styles (wrap, gap) for light/dark/mobile.
- `src/options.ts` — collect/render the optional `label` field per site.
- `manifest.json` + `package.json` — version bump `1.2.0 → 1.3.0`.

---

### Task 1: Data model + defaults (label field, 5 sites, container class)

**Files:**

- Modify: `src/lib/storage.ts` (TargetSite interface)
- Modify: `src/constants/config.ts` (add container class const)
- Modify: `src/constants/sites.ts` (DEFAULT_TARGET_SITES → 5)
- Test: `src/constants/sites.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/constants/sites.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/constants/sites.test.ts`
Expected: FAIL (only 1 site, no `label`).

- [ ] **Step 3: Add `label` to TargetSite**

In `src/lib/storage.ts`, change the interface:

```ts
export interface TargetSite {
  name: string;
  url: string;
  label?: string; // short inline display label; falls back to name
}
```

- [ ] **Step 4: Add the container class const**

In `src/constants/config.ts`, add below `CSS_CLASS_ARCA_LINK`:

```ts
export const CSS_CLASS_LINKS_CONTAINER = "arca-links";
```

- [ ] **Step 5: Expand the defaults**

Replace the body of `src/constants/sites.ts`:

```ts
import type { TargetSite } from "../lib/storage";

export const DEFAULT_TARGET_SITES: TargetSite[] = [
  {
    name: "아카라이브 (나무위키 핫나우)",
    label: "아카",
    url: "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
  },
  {
    name: "네이버 검색",
    label: "네이버",
    url: "https://search.naver.com/search.naver?query={keyword}",
  },
  {
    name: "구글 검색",
    label: "구글",
    url: "https://www.google.com/search?q={keyword}",
  },
  {
    name: "X (실시간)",
    label: "X",
    url: "https://x.com/search?q={keyword}&f=live",
  },
  {
    name: "DCInside 검색",
    label: "DC",
    url: "https://search.dcinside.com/combine/q/{keyword}",
  },
];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/constants/sites.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts src/constants/config.ts src/constants/sites.ts src/constants/sites.test.ts
git commit -m "feat(sites): expand defaults to 5 + add optional short label"
```

---

### Task 2: `buildSearchUrl(template, keyword)` pure helper

Generalizes the current `getArcaSearchUrl` to any site template. Returns `""` when the template has no `{keyword}` placeholder or is invalid, so callers can skip it.

**Files:**

- Modify: `src/layers/manipulation.ts`
- Test: `src/layers/manipulation.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/layers/manipulation.test.ts`, REPLACE the entire `describe("getArcaSearchUrl", ...)` block with:

```ts
describe("buildSearchUrl", () => {
  it("substitutes + URL-encodes the keyword", () => {
    const url = buildSearchUrl(
      "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
      "한국",
    );
    expect(url).toContain("keyword=%ED%95%9C%EA%B5%AD");
  });

  it("encodes special characters", () => {
    const url = buildSearchUrl("https://x.com/search?q={keyword}", "a b+c");
    expect(url).toContain("q=a%20b%2Bc");
  });

  it("returns '' when the template has no {keyword} placeholder", () => {
    expect(buildSearchUrl("https://example.com/", "x")).toBe("");
  });

  it("returns '' for a non-http(s) template", () => {
    expect(buildSearchUrl("javascript:alert(1)?q={keyword}", "x")).toBe("");
  });
});
```

Update the import at the top of the test file (replace `getArcaSearchUrl` / `createArcaLink` with the new names — full import shown in Task 3 Step 1):

```ts
import {
  buildSearchUrl,
  createSiteLink,
  createLinksContainer,
  addNewLink,
  updateArcaLink,
  addArcaLinks,
} from "./manipulation";
import {
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
} from "../constants/config";
import type { TargetSite } from "../lib/storage";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layers/manipulation.test.ts`
Expected: FAIL (`buildSearchUrl` not exported).

- [ ] **Step 3: Implement `buildSearchUrl` + tighten `sanitizeUrl`**

In `src/layers/manipulation.ts`, replace `sanitizeUrl` and `getArcaSearchUrl` (lines defining them) with:

```ts
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} sanitizeUrl: 잘못된 URL 형식 —`, error);
    return "";
  }
}

/**
 * Build a search URL from a site template, substituting + encoding {keyword}.
 * Returns "" when the template has no {keyword} placeholder or is not http(s),
 * so callers can skip that site.
 */
export function buildSearchUrl(template: string, keyword: string): string {
  if (!template.includes("{keyword}")) {
    return "";
  }
  const rawUrl = template.replace("{keyword}", encodeURIComponent(keyword));
  return sanitizeUrl(rawUrl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/layers/manipulation.test.ts -t buildSearchUrl`
Expected: PASS (4 buildSearchUrl tests). Other tests in the file will still fail until Tasks 3-6 — that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): add buildSearchUrl template helper"
```

---

### Task 3: `createSiteLink(site, keyword)` — one anchor per site

**Files:**

- Modify: `src/layers/manipulation.ts`
- Test: `src/layers/manipulation.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/layers/manipulation.test.ts`, REPLACE the `describe("createArcaLink", ...)` block with:

```ts
const SITE: TargetSite = {
  name: "구글 검색",
  label: "구글",
  url: "https://www.google.com/search?q={keyword}",
};

describe("createSiteLink", () => {
  it("creates an anchor showing the short label", () => {
    const link = createSiteLink(SITE, "아이유")!;
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("구글");
    expect(link.className).toBe(CSS_CLASS_ARCA_LINK);
    expect(link.target).toBe("_blank");
    expect(link.href).toContain("google.com/search?q=");
  });

  it("falls back to name when label is absent", () => {
    const link = createSiteLink(
      { name: "Foo", url: "https://foo/{keyword}" },
      "x",
    )!;
    expect(link.textContent).toBe("Foo");
  });

  it("sets rel=noopener noreferrer and a descriptive title", () => {
    const link = createSiteLink(SITE, "뉴진스")!;
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.title).toContain("뉴진스");
    expect(link.title).toContain("구글 검색");
  });

  it("returns null for a site whose url lacks {keyword}", () => {
    expect(createSiteLink({ name: "X", url: "https://x/" }, "k")).toBeNull();
  });

  it("click handler stops propagation", () => {
    const link = createSiteLink(SITE, "테스트")!;
    document.body.appendChild(link);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(ev, "stopPropagation");
    link.dispatchEvent(ev);
    expect(stopProp).toHaveBeenCalled();
    document.body.removeChild(link);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layers/manipulation.test.ts -t createSiteLink`
Expected: FAIL (`createSiteLink` not exported).

- [ ] **Step 3: Implement `createSiteLink`**

In `src/layers/manipulation.ts`, replace the old `createArcaLink` function with:

```ts
/**
 * Create one anchor for a single target site, or null if the site's url
 * template has no {keyword} placeholder.
 */
export function createSiteLink(
  site: TargetSite,
  keyword: string,
): HTMLAnchorElement | null {
  const url = buildSearchUrl(site.url, keyword);
  if (!url) {
    return null;
  }
  const link = document.createElement("a");
  link.href = url;
  link.className = CSS_CLASS_ARCA_LINK;
  link.textContent = site.label ?? site.name;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `${site.name} "${keyword}" 검색`;
  link.addEventListener("click", (e) => {
    console.log(`${LOG_PREFIX} 클릭: ${keyword} → ${url}`);
    e.stopPropagation();
  });
  return link;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/layers/manipulation.test.ts -t createSiteLink`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): add createSiteLink (label, per-site anchor)"
```

---

### Task 4: `createLinksContainer(keyword, sites)` — the inline row

**Files:**

- Modify: `src/layers/manipulation.ts`
- Test: `src/layers/manipulation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/layers/manipulation.test.ts`:

```ts
describe("createLinksContainer", () => {
  const sites: TargetSite[] = [
    { name: "아카", label: "아카", url: "https://arca/{keyword}" },
    { name: "구글", label: "구글", url: "https://g/{keyword}" },
    { name: "노템플릿", url: "https://no-keyword/" }, // must be skipped
  ];

  it("creates a container with one link per valid site", () => {
    const c = createLinksContainer("손흥민", sites);
    expect(c.className).toBe(CSS_CLASS_LINKS_CONTAINER);
    const links = c.querySelectorAll(`a.${CSS_CLASS_ARCA_LINK}`);
    expect(links).toHaveLength(2); // the no-{keyword} site is skipped
    expect(links[0]!.textContent).toBe("아카");
    expect(links[1]!.textContent).toBe("구글");
  });

  it("creates an empty container when given no sites", () => {
    const c = createLinksContainer("x", []);
    expect(c.querySelectorAll("a")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layers/manipulation.test.ts -t createLinksContainer`
Expected: FAIL (`createLinksContainer` not exported).

- [ ] **Step 3: Implement `createLinksContainer`**

In `src/layers/manipulation.ts`, add after `createSiteLink`:

```ts
/**
 * Build the inline row of search links for a keyword across all sites.
 * Sites whose url lacks {keyword} are skipped.
 */
export function createLinksContainer(
  keyword: string,
  sites: TargetSite[],
): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = CSS_CLASS_LINKS_CONTAINER;
  for (const site of sites) {
    const link = createSiteLink(site, keyword);
    if (link) {
      container.appendChild(link);
    }
  }
  return container;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/layers/manipulation.test.ts -t createLinksContainer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): add createLinksContainer (multi-site row)"
```

---

### Task 5: Wire the container into `addArcaLinks` + `addNewLink` (load all sites)

Replaces the `activeSiteTemplate` (single) with `activeSites` (list), and inserts a container instead of a single link. Guard switches to the container class.

**Files:**

- Modify: `src/layers/manipulation.ts`
- Test: `src/layers/manipulation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/layers/manipulation.test.ts`:

```ts
describe("addNewLink", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("appends a links container to the keyword's <li>", () => {
    document.body.innerHTML = `<ul><li><span class="kw">손흥민</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "손흥민");
    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
    expect(
      li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER} a`).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not add a second container if one already exists (idempotent)", () => {
    document.body.innerHTML = `<ul><li><span class="kw">날씨</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "날씨");
    addNewLink(el, "날씨");
    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
  });
});

describe("addArcaLinks", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a links container per realtime keyword and marks them processed", async () => {
    document.body.innerHTML = `
      <ul class="rank-list">
        <li><a class="rank-text" title="손흥민">손흥민</a></li>
        <li><a class="rank-text" title="비트코인">비트코인</a></li>
      </ul>`;
    await addArcaLinks();
    const containers = document.querySelectorAll(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    );
    expect(containers.length).toBe(2);
    document
      .querySelectorAll(".rank-text")
      .forEach((el) => expect(el.hasAttribute(DATA_ATTR_PROCESSED)).toBe(true));
  });
});
```

> NOTE: `addArcaLinks` reads `chrome.storage.sync`. The repo's vitest setup already provides a `chrome` mock (other layer tests rely on it — confirm via `src/layers/observer.test.ts`). If `chrome.storage.sync.get` is not mocked in this file, add this to the top of the `addArcaLinks` describe:
>
> ```ts
> // @ts-expect-error minimal chrome mock for storage read
> globalThis.chrome = {
>   storage: {
>     sync: {
>       get: (_d: unknown, cb: (v: { targetSites: undefined }) => void) =>
>         cb({ targetSites: undefined }),
>     },
>   },
> };
> ```
>
> With `targetSites: undefined`, `refreshActiveSites` falls back to `DEFAULT_TARGET_SITES` (5 sites). Also confirm `REALTIME_SELECTORS` matches `.rank-text` / the markup above; if not, use a selector from `src/constants/selectors.ts` in the test markup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layers/manipulation.test.ts -t addNewLink`
Expected: FAIL (still inserts single `.arca-link`, no container).

- [ ] **Step 3: Replace the single-site state + render path**

In `src/layers/manipulation.ts`:

(a) Replace the `activeSiteTemplate` block (the `let activeSiteTemplate` + `refreshActiveSite`) with:

```ts
// User-configured target sites, refreshed from chrome.storage each addArcaLinks run.
let activeSites: TargetSite[] = DEFAULT_TARGET_SITES;

async function refreshActiveSites(): Promise<void> {
  try {
    const sites = await new Promise<TargetSite[]>((resolve) => {
      chrome.storage.sync.get({ targetSites: DEFAULT_TARGET_SITES }, (data) => {
        resolve((data["targetSites"] as TargetSite[]) ?? DEFAULT_TARGET_SITES);
      });
    });
    activeSites = sites.length > 0 ? sites : DEFAULT_TARGET_SITES;
  } catch {
    activeSites = DEFAULT_TARGET_SITES;
  }
}
```

(b) Replace `addNewLink` with:

```ts
export function addNewLink(element: HTMLElement, keyword: string): void {
  const container = createLinksContainer(keyword, activeSites);

  const parentLi = element.closest("li");
  if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
    parentLi.appendChild(container);
  } else if (
    !element.nextElementSibling ||
    !element.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER)
  ) {
    element.parentNode?.insertBefore(container, element.nextSibling);
  }

  console.log(`${LOG_PREFIX} 새 링크 추가: ${keyword}`);
}
```

(c) In `addArcaLinks`, change `await refreshActiveSite();` → `await refreshActiveSites();`, and replace the per-item insertion block (the `const arcaLink = createArcaLink(keyword); ... insertBefore(arcaLink, ...)`) with:

```ts
const container = createLinksContainer(keyword, activeSites);

const parentLi = el.closest("li");
if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
  parentLi.appendChild(container);
  addedCount++;
} else if (
  !el.nextElementSibling ||
  !el.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER)
) {
  el.parentNode?.insertBefore(container, el.nextSibling);
  addedCount++;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/layers/manipulation.test.ts -t addNewLink`
Run: `npx vitest run src/layers/manipulation.test.ts -t addArcaLinks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): render multi-site container in addArcaLinks/addNewLink"
```

---

### Task 6: Update the change-tracking path (`updateExistingLink` / `updateArcaLink`)

The fade-replace logic must operate on the container, not a single link.

**Files:**

- Modify: `src/layers/manipulation.ts`
- Test: `src/layers/manipulation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/layers/manipulation.test.ts`:

```ts
describe("updateArcaLink (modified)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("replaces the container's links with the new keyword", async () => {
    document.body.innerHTML = `<ul><li><span class="kw">옛키워드</span></li></ul>`;
    const el = document.querySelector(".kw") as HTMLElement;
    addNewLink(el, "옛키워드");

    await updateArcaLink({
      type: "modified",
      rank: 1,
      oldKeyword: "옛키워드",
      newKeyword: "새키워드",
      element: el,
    });

    const li = document.querySelector("li")!;
    expect(li.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`)).toHaveLength(
      1,
    );
    const firstLink = li.querySelector(
      `.${CSS_CLASS_LINKS_CONTAINER} a`,
    ) as HTMLAnchorElement;
    expect(decodeURIComponent(firstLink.href)).toContain("새키워드");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layers/manipulation.test.ts -t "updateArcaLink (modified)"`
Expected: FAIL (queries `.arca-link` single, leaves stale container).

- [ ] **Step 3: Rewrite `updateExistingLink` for the container**

In `src/layers/manipulation.ts`, replace `updateExistingLink` with:

```ts
export async function updateExistingLink(
  element: HTMLElement,
  oldKeyword: string,
  newKeyword: string,
): Promise<void> {
  console.log(`${LOG_PREFIX} 링크 업데이트: "${oldKeyword}" → "${newKeyword}"`);

  const parentLi = element.closest("li");
  const existing = parentLi
    ? parentLi.querySelector<HTMLElement>(`.${CSS_CLASS_LINKS_CONTAINER}`)
    : element.parentNode?.querySelector<HTMLElement>(
        `.${CSS_CLASS_LINKS_CONTAINER}`,
      );

  if (!existing) {
    console.warn(`${LOG_PREFIX} 기존 링크를 찾을 수 없음, 새 링크 추가`);
    addNewLink(element, newKeyword);
    return;
  }

  // Fade-out the old container
  existing.style.opacity = "0";
  await new Promise<void>((resolve) => setTimeout(resolve, FADE_DURATION_MS));
  existing.remove();

  // New container starts transparent
  const container = createLinksContainer(newKeyword, activeSites);
  container.style.opacity = "0";

  if (parentLi) {
    parentLi.appendChild(container);
  } else {
    element.parentNode?.insertBefore(container, element.nextSibling);
  }

  // Force reflow then fade-in
  void container.offsetWidth;
  container.style.opacity = "1";

  console.log(`${LOG_PREFIX} 링크 업데이트 완료: ${newKeyword}`);
}
```

> `updateArcaLink` itself needs no change — it already delegates `modified` → `updateExistingLink` and `added` → `addNewLink`. Confirm it still compiles (it references the same names).

- [ ] **Step 4: Run the full test file**

Run: `npx vitest run src/layers/manipulation.test.ts`
Expected: PASS (all describes). Fix any remaining reference to the removed `createArcaLink` / `getArcaSearchUrl` / `activeSiteTemplate` (there should be none).

- [ ] **Step 5: Run the WHOLE suite (catch cross-file breakage)**

Run: `npm run test:run`
Expected: PASS. If `observer.test.ts` imported `createArcaLink`/`getArcaSearchUrl`, update those imports to the new API (it should only use observer functions — verify).

- [ ] **Step 6: Commit**

```bash
git add src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): update change-tracking to container fade-replace"
```

---

### Task 7: Container styles + options `label` field

**Files:**

- Modify: `styles.css`
- Modify: `src/options.ts`

- [ ] **Step 1: Add container styles**

Append to `styles.css`:

```css
/* 멀티사이트 링크 컨테이너 — 좁은 위젯에서 다음 줄로 wrap */
.arca-links {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  vertical-align: middle;
}

/* 컨테이너 안에서는 각 링크의 좌측 마진 제거 (gap이 간격을 담당) */
.arca-links .arca-link {
  margin-left: 0;
}

@media (max-width: 768px) {
  .arca-links {
    gap: 3px;
    margin-left: 4px;
  }
}
```

- [ ] **Step 2: Add the `label` input to each options site row**

In `src/options.ts`, find `renderSites` (it builds each row from a `site`). Add a label input next to the name/url inputs. Locate the row markup string (the part that creates name + url inputs) and add an input with `data-field="label"` and `value="${site.label ?? ""}"`, placeholder `"표시 라벨 (예: 구글)"`. Then in the function that reads rows back (`collectSites` / inside `loadSites`'s reader — the block that does `sites.push({ name, url })`), read the label input and include it:

```ts
const label = (
  row.querySelector('[data-field="label"]') as HTMLInputElement
)?.value.trim();
sites.push(label ? { name, url, label } : { name, url });
```

> Match the existing query pattern used for name/url in that function (e.g. if it uses `row.querySelectorAll("input")[0]/[1]`, add the label as the 3rd input and read `[2]` consistently). Keep the existing `#reset-btn` ("기본값으로") — it already resets to `DEFAULT_TARGET_SITES`, which now includes labels.

- [ ] **Step 3: Build to typecheck**

Run: `npm run build`
Expected: build succeeds (Vite + tsc), no type errors.

- [ ] **Step 4: Manual smoke (load unpacked)**

In Chrome: `chrome://extensions` → reload `dist/` → open namu.wiki → confirm each 실시간 검색어 shows a wrapping row `아카 네이버 구글 X DC`, clicks open the right searches, light/dark both look right. Open the options page → confirm the label field appears and "기본값으로" restores the 5.

- [ ] **Step 5: Commit**

```bash
git add styles.css src/options.ts
git commit -m "feat(ui): wrapping multi-link container styles + options label field"
```

---

### Task 8: Version bump 1.3.0 + final verification

**Files:**

- Modify: `manifest.json`, `package.json`

- [ ] **Step 1: Bump both versions**

Set `"version": "1.3.0"` in both `manifest.json` and `package.json` (the top-level `version` field in each).

- [ ] **Step 2: Full test + build**

Run: `npm run test:run`
Expected: PASS.
Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add manifest.json package.json
git commit -m "chore: bump version to 1.3.0 (multi-site quick links)"
```

---

## Self-Review

**Spec coverage:**

- Data model + `label` + 5 defaults → Task 1 ✓
- `manipulation.ts` sites[0] → all sites (container render) → Tasks 2-6 ✓
- inline wrap row + dark/light + responsive → Task 7 (styles) ✓
- options `label` field (+ existing reset) → Task 7 ✓
- no permission change → no manifest perms touched ✓
- version 1.3.0 → Task 8 ✓
- error handling (no-{keyword} skip, empty list, bad url) → Tasks 2/3/4 tests ✓
- tests (multi-render, wrap-able, idempotency, change-update, empty, skip) → Tasks 1-6 ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Two `> NOTE` blocks ask the implementer to confirm an existing pattern (chrome mock in tests, options row query shape) rather than guess — these are verification asks against real files, not missing content.

**Type consistency:** `TargetSite { name; url; label? }` used consistently. `buildSearchUrl(template, keyword)`, `createSiteLink(site, keyword): HTMLAnchorElement | null`, `createLinksContainer(keyword, sites): HTMLSpanElement`, `activeSites: TargetSite[]`, `refreshActiveSites()`, `CSS_CLASS_LINKS_CONTAINER` — names match across tasks. Removed symbols (`getArcaSearchUrl`, `createArcaLink`, `activeSiteTemplate`, `refreshActiveSite`) are fully replaced and their tests rewritten.
