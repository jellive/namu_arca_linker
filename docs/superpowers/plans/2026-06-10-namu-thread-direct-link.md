# namu 2.0 Phase 1 — 실검 → 실검챈 토론글 직링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** namu.wiki 실시간검색어 각 키워드를 매칭되는 실검챈(arca.live/b/namuhotnow) 토론글로 직링크하고(💬댓글수 뱃지), 매칭이 없으면 기존 arca 검색으로 폴백한다.

**Architecture:** content script가 현재 키워드 목록을 background service worker에 보내면, SW가 arca 앱 API(`/api/app/list/channel/namuhotnow`)를 fetch·캐시(~3분)하고 키워드→토론글을 매칭해 돌려준다. content script는 키워드당 단일 스마트 링크(토론글 or 검색)를 주입한다. 기존 멀티사이트 5링크 주입과 우측 도크 패널은 제거한다.

**Tech Stack:** Chrome MV3, TypeScript, Vite(IIFE per-entry build), Vitest+jsdom, npm. 기존 레이어 구조(`src/layers`, `src/lib`, `src/constants`).

**Spec:** `docs/superpowers/specs/2026-06-10-namu-thread-direct-link-design.md`

**선행 사실 (반드시 인지):**

- 현재 `main`의 빌드는 **깨져 있다** (`vite.config.ts`가 `format:"es"` 멀티엔트리 → content/popup/options 전부 ESM → MV3 classic script 로드 실패). **Task 0**이 이걸 고치지 않으면 확장이 전혀 안 뜬다.
- `manifest.json` host_permissions에 `https://arca.live/*`가 **이미 있다** → arca API fetch에 새 권한 불필요.
- 매칭/뱃지 사양에 미확정 2개가 있어 **Task 1 (spike)**로 먼저 확정한다: (a) 브라우저 User-Agent로 200 OK 나오나(아니면 declarativeNetRequest 필요 → Task 10), (b) 응답에 `commentCount` 있나(없으면 카테고리 뱃지로 폴백).
- 테스트 실행: 단일 `npx vitest run <file>`, 전체 `npm run test:run`, 빌드 `npm run build`, 린트 `npm run lint`.
- commit 컨벤션: `type(scope): imperative` + 본문. 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| 파일                                                               | 동작            | 책임                                                                                                                                         |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`                                                   | Modify          | 엔트리별 IIFE 빌드 (`BUILD_ONE`) — content/popup/options/**background**                                                                      |
| `package.json`                                                     | Modify          | build 스크립트 4-pass, version (Task 11에서 1.5.0)                                                                                           |
| `manifest.json`                                                    | Modify          | `background.service_worker` 추가, version (Task 11)                                                                                          |
| `src/background.ts`                                                | Create          | service worker 엔트리 — `matchThreads` 메시지 핸들러                                                                                         |
| `src/lib/arca-api.ts`                                              | Create          | `getDeviceToken` / `fetchNamuhotnowArticles`(+캐시) / `matchThread` / 타입                                                                   |
| `src/lib/arca-api.test.ts`                                         | Create          | 위 3함수 단위 테스트                                                                                                                         |
| `src/background.test.ts`                                           | Create          | `handleMatchThreads` 단위 테스트                                                                                                             |
| `src/layers/manipulation.ts`                                       | Modify          | 멀티사이트 제거 → `createThreadLink`/`createLinkContainer`/`threadMatches`/`refreshThreadMatches`; `addArcaLinks`/`updateArcaLink` 내부 교체 |
| `src/layers/manipulation.test.ts`                                  | Modify(rewrite) | 단일 스마트 링크 + sendMessage mock 기준                                                                                                     |
| `src/lib/content-init.ts`                                          | Modify          | 패널 wiring 제거                                                                                                                             |
| `src/lib/content-init.test.ts`                                     | Modify          | 패널 mock 제거                                                                                                                               |
| `src/constants/config.ts`                                          | Modify          | 패널 상수 제거, 뱃지/스레드 상수 추가                                                                                                        |
| `src/layers/panel.ts` `panel.test.ts` `trends.ts` `trends.test.ts` | Delete          | 우측 도크 패널 제거                                                                                                                          |
| `styles.css`                                                       | Modify          | 💬/🔎 뱃지 스타일 (theseed light/dark, nowrap)                                                                                               |
| `scripts/arca-spike.mjs`                                           | Create          | Task 1 일회성 검증 스크립트                                                                                                                  |

---

## Task 0: 빌드 수정 + background 스캐폴드 + manifest 등록

빌드를 IIFE per-entry로 바꾸고(깨진 ESM 빌드 복구), background 엔트리를 추가한다. 이게 안 되면 이후 모든 작업이 브라우저에서 검증 불가.

**Files:**

- Modify: `vite.config.ts` (전체 교체)
- Modify: `package.json:6-7` (build 스크립트)
- Create: `src/background.ts` (스텁 — Task 5에서 채움)
- Modify: `manifest.json:13-20` (background 추가)

- [ ] **Step 1: `vite.config.ts`를 IIFE per-entry 빌드로 전체 교체**

```ts
import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

// Chrome MV3 content scripts run as CLASSIC scripts and CANNOT use ESM `import`.
// popup.html/options.html also load their JS as classic <script src> tags, and
// the background service worker is registered as a classic worker (no type:module).
// A single multi-entry ES build code-splits shared modules into a chunk that every
// entry `import`s — which makes all bundles ESM and silently breaks them on load
// (SyntaxError). So we build each entry as its own self-contained IIFE bundle:
// one vite pass per entry, selected via BUILD_ONE. package.json `build` runs the
// passes in order (content first wipes dist).
const entry = process.env.BUILD_ONE ?? "content";

export default defineConfig({
  build: {
    // First pass (content) clears dist; later passes append to it.
    emptyOutDir: entry === "content",
    outDir: "dist",
    minify: "terser",
    terserOptions: {
      // KEEP_CONSOLE=1 retains console.* for debugging the built extension.
      compress: { drop_console: !process.env.KEEP_CONSOLE },
    },
    rollupOptions: {
      input: { [entry]: resolve(__dirname, `src/${entry}.ts`) },
      output: {
        format: "iife",
        entryFileNames: "[name].js",
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    {
      name: "copy-html",
      closeBundle() {
        if (entry === "popup") {
          copyFileSync(
            resolve(__dirname, "src/popup.html"),
            resolve(__dirname, "dist/popup.html"),
          );
        }
        if (entry === "options") {
          copyFileSync(
            resolve(__dirname, "src/options.html"),
            resolve(__dirname, "dist/options.html"),
          );
        }
      },
    },
  ],
});
```

- [ ] **Step 2: `package.json` build 스크립트를 4-pass로 교체**

`"build"` 라인을 다음으로 교체 (background 패스 추가):

```json
    "build": "BUILD_ONE=content vite build && BUILD_ONE=popup vite build && BUILD_ONE=options vite build && BUILD_ONE=background vite build",
```

- [ ] **Step 3: `src/background.ts` 스텁 생성**

```ts
// Background service worker entry. Real message handling is added in Task 5.
console.log("[나무위키 아카링커] service worker 로드됨");
```

- [ ] **Step 4: `manifest.json`에 background 등록**

`"content_scripts"` 블록 바로 위(또는 `options_page` 다음)에 추가. `type: "module"`은 IIFE 빌드와 충돌하므로 넣지 않는다(classic worker):

```json
  "background": {
    "service_worker": "dist/background.js"
  },
```

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: 4개 패스 모두 성공. 확인:

- `head -c 40 dist/content.js` → `import`로 시작하지 **않음** (IIFE `(function(){...` 또는 `!function`).
- `ls dist/background.js dist/popup.html dist/options.html` → 모두 존재.

- [ ] **Step 6: 기존 테스트가 여전히 통과하는지 확인**

Run: `npm run test:run`
Expected: 빌드 설정 변경은 런타임 코드에 영향 없음 → 기존 스위트 전부 PASS.

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts package.json manifest.json src/background.ts
git commit -m "build: per-entry IIFE build + background service worker scaffold

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 1: 🔬 Spike — arca 앱 API 실측 검증 (가정 금지)

구현 본격화 전, arca API를 실제로 한 번 때려서 미확정 2개를 확정한다. **이 태스크 결과가 Task 4(뱃지 필드)와 Task 10(UA 위장 필요 여부)을 결정한다.**

**Files:**

- Create: `scripts/arca-spike.mjs`

- [ ] **Step 1: 검증 스크립트 작성**

```js
// 일회성 검증 스크립트. `node scripts/arca-spike.mjs`로 실행.
// curl/wget이 아니라 node 전역 fetch를 쓴다 (환경 훅이 curl/wget만 차단).
const ENDPOINT = "https://arca.live/api/app/list/channel/namuhotnow?limit=50";
const TOKEN = Array.from(
  { length: 64 },
  () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
).join("");
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const APP_UA = "net.umanle.arca.android.playstore/0.9.83";

async function hit(label, ua) {
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "User-Agent": ua, "x-device-token": TOKEN },
    });
    console.log(`\n[${label}] status=${res.status}`);
    if (res.status !== 200) return null;
    const data = await res.json();
    const arts = data.articles ?? [];
    console.log(`  articles=${arts.length}`);
    if (arts[0]) {
      console.log(`  first article keys: ${Object.keys(arts[0]).join(", ")}`);
      console.log(`  commentCount field present: ${"commentCount" in arts[0]}`);
      console.log(
        `  sample: id=${arts[0].id} title=${JSON.stringify(arts[0].title)} cat=${JSON.stringify(arts[0].categoryDisplayName)} comments=${arts[0].commentCount}`,
      );
    }
    return data;
  } catch (e) {
    console.log(`\n[${label}] ERROR ${e.message}`);
    return null;
  }
}

console.log("device-token:", TOKEN);
await hit("APP_UA (경쟁확장과 동일, baseline)", APP_UA);
await hit("CHROME_UA (SW가 보낼 UA 시뮬레이션)", CHROME_UA);
```

- [ ] **Step 2: 실행 + 결과 기록**

Run: `node scripts/arca-spike.mjs`
관찰할 것:

1. `CHROME_UA` 패스가 `status=200`인가? → **YES면 declarativeNetRequest 불필요(Task 10 SKIP)**, NO(403 등)면 **Task 10 수행**.
2. `commentCount field present` 가 `true`인가? → **YES면 뱃지=💬<count>**, NO면 **뱃지=💬<categoryDisplayName>**(없으면 💬 단독).

이 두 결과를 이 태스크 commit 메시지 본문에 **명시적으로 기록**한다 (다음 태스크들이 참조).

- [ ] **Step 3: Commit**

```bash
git add scripts/arca-spike.mjs
git commit -m "chore: arca app-API spike script + findings

Findings:
- CHROME_UA 200 OK: <YES/NO>  -> declarativeNetRequest <불필요/필요>
- commentCount present: <YES/NO> -> badge <💬count / 💬category>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **이후 태스크의 분기 규칙:**
>
> - 뱃지 필드: 아래 `matchThread`/`createThreadLink`는 `commentCount`가 있으면 그것을, 없으면 `category`를 쓰도록 **이미 양쪽을 처리**한다 → spike 결과와 무관하게 코드는 동일, 실제 표시만 달라진다.
> - UA: spike (1)이 NO일 때만 Task 10을 수행한다.

---

## Task 2: `arca-api.ts` — `getDeviceToken()`

랜덤 64자 토큰을 1회 생성해 `chrome.storage.local`에 저장하고 이후 동일값을 반환한다.

**Files:**

- Create: `src/lib/arca-api.ts`
- Create: `src/lib/arca-api.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/arca-api.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: FAIL — `getDeviceToken` not exported / module missing.

- [ ] **Step 3: 최소 구현** — `src/lib/arca-api.ts`

```ts
import { LOG_PREFIX } from "../constants/config";

const DEVICE_TOKEN_KEY = "arcaDeviceToken";
const TOKEN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateRandomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_CHARS[bytes[i]! % TOKEN_CHARS.length];
  }
  return out;
}

/**
 * Returns a stable per-install random device token for the arca app API
 * `x-device-token` header. Generated once and persisted to storage.local.
 * The token is NOT registered with arca — any random 64-char string works.
 */
export function getDeviceToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [DEVICE_TOKEN_KEY]: undefined }, (data) => {
      const existing = data[DEVICE_TOKEN_KEY] as string | undefined;
      if (existing) {
        resolve(existing);
        return;
      }
      const token = generateRandomToken(64);
      chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: token }, () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            `${LOG_PREFIX} device-token 저장 실패 —`,
            chrome.runtime.lastError.message,
          );
        }
        resolve(token);
      });
    });
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arca-api.ts src/lib/arca-api.test.ts
git commit -m "feat(arca-api): stable per-install device token

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `arca-api.ts` — `matchThread()` (순수 함수)

키워드를 articles 목록에 매칭한다: 정확 일치(소문자) → 부분 일치(`<b>` 제거 후) → null.

**Files:**

- Modify: `src/lib/arca-api.ts` (타입 + 함수 추가)
- Modify: `src/lib/arca-api.test.ts` (테스트 추가)

- [ ] **Step 1: 실패 테스트 추가** — `src/lib/arca-api.test.ts` 상단 import에 `matchThread`, 타입 추가하고 describe 블록 추가

```ts
import { getDeviceToken, matchThread } from "./arca-api";
import type { ArcaArticle } from "./arca-api";

const ARTS: ArcaArticle[] = [
  {
    id: 101,
    title: "황승언",
    categoryDisplayName: "커뮤",
    createdAt: "t1",
    commentCount: 23,
  },
  {
    id: 102,
    title: "LCK 결승",
    categoryDisplayName: "스포츠",
    createdAt: "t2",
    commentCount: 5,
  },
  {
    id: 103,
    title: "<b>손흥민</b> 골",
    categoryDisplayName: "스포츠",
    createdAt: "t3",
  },
];

describe("matchThread", () => {
  it("matches exactly (case-insensitive) first", () => {
    const m = matchThread("황승언", ARTS)!;
    expect(m.id).toBe(101);
    expect(m.commentCount).toBe(23);
    expect(m.category).toBe("커뮤");
  });

  it("matches as substring when no exact match", () => {
    expect(matchThread("LCK", ARTS)!.id).toBe(102);
  });

  it("strips <b> highlight tags before substring matching", () => {
    expect(matchThread("손흥민", ARTS)!.id).toBe(103);
  });

  it("is case-insensitive", () => {
    expect(matchThread("lck", ARTS)!.id).toBe(102);
  });

  it("returns null when nothing matches", () => {
    expect(matchThread("존재하지않는키워드", ARTS)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: FAIL — `matchThread` / `ArcaArticle` not exported.

- [ ] **Step 3: 구현** — `src/lib/arca-api.ts`에 타입과 함수 추가 (파일 상단 import 아래)

```ts
export interface ArcaArticle {
  id: number;
  title: string;
  categoryDisplayName?: string;
  createdAt: string;
  commentCount?: number;
}

export interface ThreadMatch {
  id: number;
  title: string;
  commentCount?: number;
  category?: string;
}

function stripHighlight(title: string): string {
  return title.replace(/<\/?b[^>]*>/g, "");
}

function toMatch(a: ArcaArticle): ThreadMatch {
  return {
    id: a.id,
    title: stripHighlight(a.title),
    commentCount: a.commentCount,
    category: a.categoryDisplayName,
  };
}

/**
 * Match a namu realtime keyword to a 실검챈 article.
 * 1) exact title match (case-insensitive), then 2) substring (after <b> strip).
 */
export function matchThread(
  keyword: string,
  articles: ArcaArticle[],
): ThreadMatch | null {
  const kw = keyword.toLowerCase();
  for (const a of articles) {
    if (stripHighlight(a.title).toLowerCase() === kw) return toMatch(a);
  }
  for (const a of articles) {
    if (stripHighlight(a.title).toLowerCase().includes(kw)) return toMatch(a);
  }
  return null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: PASS (이전 2 + 신규 5 = 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arca-api.ts src/lib/arca-api.test.ts
git commit -m "feat(arca-api): keyword→thread matching (exact then substring)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `arca-api.ts` — `fetchNamuhotnowArticles()` + 캐시

arca 앱 API에서 1~2페이지를 가져와 합치고, ~3분 메모리 캐시로 재요청을 막는다.

**Files:**

- Modify: `src/lib/arca-api.ts`
- Modify: `src/lib/arca-api.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `src/lib/arca-api.test.ts`

```ts
import {
  getDeviceToken,
  matchThread,
  fetchNamuhotnowArticles,
  _resetArcaCache,
} from "./arca-api";

describe("fetchNamuhotnowArticles", () => {
  beforeEach(() => {
    _resetArcaCache();
    localGet.mockImplementation((_d, cb) =>
      cb({ arcaDeviceToken: "t".repeat(64) }),
    );
  });

  it("fetches and merges page 1 + page 2 articles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [{ id: 1, title: "a", createdAt: "c1" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          articles: [{ id: 2, title: "b", createdAt: "c2" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const arts = await fetchNamuhotnowArticles();
    expect(arts.map((a) => a.id)).toEqual([1, 2]);
    // page-2 request uses last createdAt of page 1 as `before`
    expect(fetchMock.mock.calls[1]![0]).toContain("before=c1");
    vi.unstubAllGlobals();
  });

  it("serves from cache within TTL (no second network round)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [{ id: 1, title: "a", createdAt: "c1" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchNamuhotnowArticles();
    const callsAfterFirst = fetchMock.mock.calls.length;
    await fetchNamuhotnowArticles(); // cached
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    vi.unstubAllGlobals();
  });

  it("returns [] on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const arts = await fetchNamuhotnowArticles();
    expect(arts).toEqual([]);
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it("sends the x-device-token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ articles: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchNamuhotnowArticles();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)["x-device-token"],
    ).toHaveLength(64);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: FAIL — `fetchNamuhotnowArticles` / `_resetArcaCache` not exported.

- [ ] **Step 3: 구현** — `src/lib/arca-api.ts`에 추가

```ts
const ARCA_API_BASE = "https://arca.live/api/app/list/channel/namuhotnow";
const CACHE_TTL_MS = 3 * 60 * 1000;

interface ArcaCache {
  articles: ArcaArticle[];
  fetchedAt: number;
}
let _cache: ArcaCache | null = null;

/** Test helper: clear the in-memory article cache. */
export function _resetArcaCache(): void {
  _cache = null;
}

async function fetchPage(
  token: string,
  before?: string,
  limit = 50,
): Promise<ArcaArticle[]> {
  // NOTE: User-Agent is a forbidden fetch header in a service worker. If the
  // spike (Task 1) showed the API rejects browser UAs, Task 10 adds a
  // declarativeNetRequest rule to spoof it; we never set it here.
  let url = `${ARCA_API_BASE}?limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}&offset=1`;
  const res = await fetch(url, {
    headers: { "x-device-token": token },
  });
  if (!res.ok) throw new Error(`arca API ${res.status}`);
  const data = (await res.json()) as { articles?: ArcaArticle[] };
  return data.articles ?? [];
}

/**
 * Fetch 실검챈 recent articles (pages 1~2 merged), cached ~3min.
 * Returns [] on any failure so callers fall back to search links.
 */
export async function fetchNamuhotnowArticles(
  limit = 50,
): Promise<ArcaArticle[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.articles;
  }
  try {
    const token = await getDeviceToken();
    const page1 = await fetchPage(token, undefined, limit);
    let merged = page1;
    const last = page1[page1.length - 1];
    if (last) {
      const page2 = await fetchPage(token, last.createdAt, limit);
      const seen = new Set(page1.map((a) => a.id));
      merged = page1.concat(page2.filter((a) => !seen.has(a.id)));
    }
    _cache = { articles: merged, fetchedAt: Date.now() };
    return merged;
  } catch (e) {
    console.warn(`${LOG_PREFIX} arca API fetch 실패 — 검색 폴백`, e);
    return [];
  }
}
```

> **주의:** 테스트에서 `Date.now()`는 실제로 흐르므로 TTL 테스트는 동일 tick 내 캐시 적중을 검증한다(문제없음). `crypto.getRandomValues`는 jsdom/node 환경에 존재.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/arca-api.test.ts`
Expected: PASS (7 + 4 = 11).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arca-api.ts src/lib/arca-api.test.ts
git commit -m "feat(arca-api): fetch 실검챈 articles with pagination + 3min cache

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `background.ts` — `matchThreads` 메시지 핸들러

content script가 보낸 키워드 목록을 받아 토론글 매칭 맵을 돌려준다.

**Files:**

- Modify: `src/background.ts` (스텁 → 실제 핸들러)
- Create: `src/background.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/background.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchNamuhotnowArticles = vi.fn();
const matchThread = vi.fn();
vi.mock("./lib/arca-api", () => ({
  fetchNamuhotnowArticles: (...a: unknown[]) => fetchNamuhotnowArticles(...a),
  matchThread: (...a: unknown[]) => matchThread(...a),
}));

// chrome.runtime.onMessage must exist at import time.
const addListener = vi.fn();
globalThis.chrome = {
  runtime: { onMessage: { addListener } },
} as unknown as typeof chrome;

import { handleMatchThreads } from "./background";

beforeEach(() => {
  fetchNamuhotnowArticles.mockReset();
  matchThread.mockReset();
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/background.test.ts`
Expected: FAIL — `handleMatchThreads` not exported.

- [ ] **Step 3: 구현** — `src/background.ts` 전체 교체

```ts
import { LOG_PREFIX } from "./constants/config";
import {
  fetchNamuhotnowArticles,
  matchThread,
  type ThreadMatch,
} from "./lib/arca-api";

export interface MatchThreadsResponse {
  matches: Record<string, ThreadMatch | null>;
}

/** Fetch articles once and match every keyword against them. */
export async function handleMatchThreads(
  keywords: string[],
): Promise<MatchThreadsResponse> {
  const articles = await fetchNamuhotnowArticles();
  const matches: Record<string, ThreadMatch | null> = {};
  for (const kw of keywords) {
    matches[kw] = matchThread(kw, articles);
  }
  return { matches };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (
    msg &&
    msg.type === "matchThreads" &&
    Array.isArray((msg as { keywords?: unknown }).keywords)
  ) {
    handleMatchThreads((msg as { keywords: string[] }).keywords)
      .then(sendResponse)
      .catch((e) => {
        console.warn(`${LOG_PREFIX} matchThreads 처리 실패`, e);
        sendResponse({ matches: {} });
      });
    return true; // async sendResponse — keep the channel open
  }
  return false;
});

console.log(`${LOG_PREFIX} service worker 준비됨`);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/background.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/background.ts src/background.test.ts
git commit -m "feat(background): matchThreads message handler

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `manipulation.ts` — 단일 스마트 링크로 교체 (멀티사이트 제거)

키워드당 5사이트 링크를 **토론글/검색 단일 링크**로 바꾼다. observer/detection이 호출하는 `addArcaLinks`/`updateArcaLink` 시그니처는 유지하고 내부만 교체 → observer.ts/detection.ts 무수정.

**Files:**

- Modify: `src/constants/config.ts` (뱃지 상수 추가)
- Modify: `src/layers/manipulation.ts` (전체 교체)
- Modify: `src/layers/manipulation.test.ts` (전체 재작성)

- [ ] **Step 1: `config.ts`에 스레드 상수 추가** (패널 상수는 Task 8에서 제거)

`config.ts` 끝에 추가:

```ts
export const DATA_ATTR_THREAD = "data-arca-thread";
export const ARCA_SEARCH_TEMPLATE = `${ARCA_BASE_URL}?target=all&keyword={keyword}`;
```

- [ ] **Step 2: `manipulation.test.ts` 전체 재작성 (실패 테스트)** — `src/layers/manipulation.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildSearchUrl,
  createThreadLink,
  createLinkContainer,
  refreshThreadMatches,
  threadMatches,
  addArcaLinks,
  updateArcaLink,
} from "./manipulation";
import {
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
} from "../constants/config";
import type { ThreadMatch } from "../lib/arca-api";

const sendMessage = vi.fn();

beforeEach(() => {
  document.body.innerHTML = "";
  sendMessage.mockReset();
  globalThis.chrome = {
    runtime: { sendMessage: (...a: unknown[]) => sendMessage(...a) },
  } as unknown as typeof chrome;
});
afterEach(() => vi.restoreAllMocks());

describe("buildSearchUrl", () => {
  it("substitutes + URL-encodes the keyword", () => {
    const url = buildSearchUrl(
      "https://arca.live/b/namuhotnow?target=all&keyword={keyword}",
      "한국",
    );
    expect(url).toContain("keyword=%ED%95%9C%EA%B5%AD");
  });
  it("returns '' when no {keyword} placeholder", () => {
    expect(buildSearchUrl("https://example.com/", "x")).toBe("");
  });
  it("returns '' for a non-http(s) template", () => {
    expect(buildSearchUrl("javascript:alert(1)?q={keyword}", "x")).toBe("");
  });
});

const MATCH: ThreadMatch = {
  id: 555,
  title: "황승언",
  commentCount: 23,
  category: "커뮤",
};

describe("createThreadLink", () => {
  it("builds a thread link (💬 + count) when matched", () => {
    const a = createThreadLink("황승언", MATCH);
    expect(a.tagName).toBe("A");
    expect(a.href).toContain("/b/namuhotnow/555");
    expect(a.textContent).toBe("💬23");
    expect(a.title).toBe("황승언");
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noopener noreferrer");
  });

  it("uses category when commentCount is absent", () => {
    const a = createThreadLink("x", { id: 1, title: "x", category: "스포츠" });
    expect(a.textContent).toBe("💬스포츠");
  });

  it("shows bare 💬 when neither count nor category present", () => {
    const a = createThreadLink("x", { id: 1, title: "x" });
    expect(a.textContent).toBe("💬");
  });

  it("falls back to a 🔎 search link when no match", () => {
    const a = createThreadLink("김치찌개", null);
    expect(a.textContent).toBe("🔎");
    expect(a.href).toContain("keyword=");
    expect(decodeURIComponent(a.href)).toContain("김치찌개");
  });

  it("click handler stops propagation", () => {
    const a = createThreadLink("x", MATCH);
    document.body.appendChild(a);
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const stop = vi.spyOn(ev, "stopPropagation");
    a.dispatchEvent(ev);
    expect(stop).toHaveBeenCalled();
  });
});

describe("createLinkContainer", () => {
  it("wraps a single thread link in a container span", () => {
    const c = createLinkContainer("황승언", MATCH);
    expect(c.className).toBe(CSS_CLASS_LINKS_CONTAINER);
    expect(c.querySelectorAll(`a.${CSS_CLASS_ARCA_LINK}`)).toHaveLength(1);
  });
});

describe("refreshThreadMatches", () => {
  it("populates threadMatches from the SW response", async () => {
    sendMessage.mockResolvedValue({ matches: { 황승언: MATCH, 날씨: null } });
    await refreshThreadMatches(["황승언", "날씨"]);
    expect(threadMatches.get("황승언")).toEqual(MATCH);
    expect(threadMatches.get("날씨")).toBeNull();
  });

  it("sets all keywords null on SW failure", async () => {
    sendMessage.mockRejectedValue(new Error("no SW"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await refreshThreadMatches(["a", "b"]);
    expect(threadMatches.get("a")).toBeNull();
    expect(threadMatches.get("b")).toBeNull();
    warn.mockRestore();
  });
});

describe("addArcaLinks", () => {
  it("requests matches then injects one container per keyword", async () => {
    sendMessage.mockResolvedValue({
      matches: { 손흥민: MATCH, 비트코인: null },
    });
    document.body.innerHTML = `
      <ul>
        <li><a href="/Go?q=손흥민" title="손흥민">손흥민</a></li>
        <li><a href="/Go?q=비트코인" title="비트코인">비트코인</a></li>
      </ul>`;
    await addArcaLinks();
    const containers = document.querySelectorAll(
      `.${CSS_CLASS_LINKS_CONTAINER}`,
    );
    expect(containers.length).toBe(2);
    // one link each (single smart link, NOT 5-site multisite)
    containers.forEach((c) => expect(c.querySelectorAll("a").length).toBe(1));
    // keyword list was sent to the SW
    expect(sendMessage).toHaveBeenCalledWith({
      type: "matchThreads",
      keywords: ["손흥민", "비트코인"],
    });
  });

  it("is idempotent — second pass adds no duplicate container", async () => {
    sendMessage.mockResolvedValue({ matches: { once: null } });
    document.body.innerHTML = `<ul><li><a href="/Go?q=once" title="once">once</a></li></ul>`;
    await addArcaLinks();
    await addArcaLinks();
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(1);
    expect(
      document
        .querySelector('a[href^="/Go?q="]')!
        .getAttribute(DATA_ATTR_PROCESSED),
    ).toBe("true");
  });

  it("logs and returns when no realtime markup present", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await addArcaLinks();
    expect(log.mock.calls.map((c) => c.join(" ")).join(" ")).toContain(
      "찾을 수 없",
    );
    log.mockRestore();
  });
});

describe("updateArcaLink", () => {
  it("does nothing when element is undefined", async () => {
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "x",
      element: undefined,
    });
    expect(
      document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER}`).length,
    ).toBe(0);
  });

  it('injects a single thread link for "added"', async () => {
    sendMessage.mockResolvedValue({ matches: { 새키워드: MATCH } });
    document.body.innerHTML = '<ul><li><a id="a">target</a></li></ul>';
    const el = document.getElementById("a") as HTMLElement;
    await updateArcaLink({
      type: "added",
      rank: 1,
      newKeyword: "새키워드",
      element: el,
    });
    const links = document.querySelectorAll(`.${CSS_CLASS_LINKS_CONTAINER} a`);
    expect(links.length).toBe(1);
    expect(links[0]!.textContent).toBe("💬23");
  });

  it('"removed" only logs (no DOM mutation)', async () => {
    document.body.innerHTML = `<ul><li><a id="a">t</a></li></ul>`;
    const before = document.body.innerHTML;
    await updateArcaLink({
      type: "removed",
      rank: 1,
      oldKeyword: "x",
      element: document.getElementById("a") as HTMLElement,
    });
    expect(document.body.innerHTML).toBe(before);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/layers/manipulation.test.ts`
Expected: FAIL — `createThreadLink`/`createLinkContainer`/`refreshThreadMatches`/`threadMatches` not exported.

- [ ] **Step 4: `manipulation.ts` 전체 교체 (구현)** — `src/layers/manipulation.ts`

```ts
import {
  ARCA_BASE_URL,
  ARCA_SEARCH_TEMPLATE,
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
  DATA_ATTR_THREAD,
  FADE_DURATION_MS,
  LOG_PREFIX,
} from "../constants/config";
import { REALTIME_SELECTORS } from "../constants/selectors";
import type { ThreadMatch } from "../lib/arca-api";
import type { KeywordChange } from "../types/common";

// In-memory keyword→thread match map, refreshed from the background SW.
export let threadMatches: Map<string, ThreadMatch | null> = new Map();

interface MatchThreadsResponse {
  matches: Record<string, ThreadMatch | null>;
}

/** Ask the background SW to match the given keywords; populate threadMatches. */
export async function refreshThreadMatches(keywords: string[]): Promise<void> {
  if (keywords.length === 0) return;
  const next = new Map<string, ThreadMatch | null>();
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "matchThreads",
      keywords,
    })) as MatchThreadsResponse | undefined;
    const matches = res?.matches ?? {};
    for (const kw of keywords) next.set(kw, matches[kw] ?? null);
  } catch (e) {
    console.warn(`${LOG_PREFIX} refreshThreadMatches 실패 — 검색 폴백`, e);
    for (const kw of keywords) next.set(kw, null);
  }
  threadMatches = next;
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} sanitizeUrl: 잘못된 URL —`, error);
    return "";
  }
}

/** Build a search URL from a template, substituting + encoding {keyword}. */
export function buildSearchUrl(template: string, keyword: string): string {
  if (!template.includes("{keyword}")) return "";
  return sanitizeUrl(
    template.replace("{keyword}", encodeURIComponent(keyword)),
  );
}

function badgeText(match: ThreadMatch): string {
  if (typeof match.commentCount === "number") return `💬${match.commentCount}`;
  if (match.category) return `💬${match.category}`;
  return "💬";
}

/**
 * Single smart link for a keyword: 실검챈 thread (💬) when matched, else arca
 * search (🔎). This replaces the former 5-site multisite row.
 */
export function createThreadLink(
  keyword: string,
  match: ThreadMatch | null,
): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = CSS_CLASS_ARCA_LINK;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (match) {
    link.href = `${ARCA_BASE_URL}/${match.id}`;
    link.textContent = badgeText(match);
    link.title = match.title;
    link.setAttribute(DATA_ATTR_THREAD, "1");
  } else {
    link.href = buildSearchUrl(ARCA_SEARCH_TEMPLATE, keyword) || ARCA_BASE_URL;
    link.textContent = "🔎";
    link.title = `아카라이브 "${keyword}" 검색`;
  }
  link.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  return link;
}

/** Container span holding the single smart link for a keyword. */
export function createLinkContainer(
  keyword: string,
  match: ThreadMatch | null,
): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = CSS_CLASS_LINKS_CONTAINER;
  container.appendChild(createThreadLink(keyword, match));
  return container;
}

function insertContainer(
  element: HTMLElement,
  container: HTMLSpanElement,
): boolean {
  const parentLi = element.closest("li");
  if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
    parentLi.appendChild(container);
    return true;
  }
  if (
    !parentLi &&
    (!element.nextElementSibling ||
      !element.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER))
  ) {
    element.parentNode?.insertBefore(container, element.nextSibling);
    return true;
  }
  return false;
}

/** Insert a fresh container after a keyword element (refreshing its match). */
export async function addNewLink(
  element: HTMLElement,
  keyword: string,
): Promise<void> {
  if (!threadMatches.has(keyword)) await refreshThreadMatches([keyword]);
  const container = createLinkContainer(
    keyword,
    threadMatches.get(keyword) ?? null,
  );
  insertContainer(element, container);
  console.log(`${LOG_PREFIX} 새 링크 추가: ${keyword}`);
}

/** Replace an existing container with one for newKeyword (fade). */
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
    console.warn(`${LOG_PREFIX} 기존 링크 없음 → 새로 추가`);
    await addNewLink(element, newKeyword);
    return;
  }

  if (!threadMatches.has(newKeyword)) await refreshThreadMatches([newKeyword]);

  existing.style.opacity = "0";
  await new Promise<void>((r) => setTimeout(r, FADE_DURATION_MS));
  existing.remove();

  const container = createLinkContainer(
    newKeyword,
    threadMatches.get(newKeyword) ?? null,
  );
  container.style.opacity = "0";
  if (parentLi) parentLi.appendChild(container);
  else element.parentNode?.insertBefore(container, element.nextSibling);
  void container.offsetWidth;
  container.style.opacity = "1";
  console.log(`${LOG_PREFIX} 링크 업데이트 완료: ${newKeyword}`);
}

/** Apply a single keyword change to the DOM. */
export async function updateArcaLink(change: KeywordChange): Promise<void> {
  const { type, rank, oldKeyword, newKeyword, element } = change;
  if (!element) {
    console.warn(`${LOG_PREFIX} 순위 ${rank}의 요소를 찾을 수 없음`);
    return;
  }
  switch (type) {
    case "added":
      if (newKeyword === undefined) break;
      await addNewLink(element, newKeyword);
      break;
    case "modified":
      if (newKeyword === undefined) break;
      await updateExistingLink(element, oldKeyword ?? "", newKeyword);
      break;
    case "removed":
      console.log(`${LOG_PREFIX} 순위 ${rank} 삭제: ${oldKeyword}`);
      break;
    default:
      console.warn(`${LOG_PREFIX} 알 수 없는 변경 타입: ${type}`);
  }
}

/** Scan the DOM, match all keywords via the SW, inject one smart link each. */
export async function addArcaLinks(): Promise<void> {
  let realtimeItems: NodeListOf<Element> | Element[] = [];
  let usedSelector = "";
  for (const selector of REALTIME_SELECTORS) {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      realtimeItems = items;
      usedSelector = selector;
      break;
    }
  }

  if (realtimeItems.length === 0) {
    const sections = document.querySelectorAll(
      'section, div[class*="section"], aside',
    );
    for (const section of sections) {
      const heading = section.querySelector("h2, h3, h4, .title, .heading");
      if (
        heading &&
        (heading.textContent?.includes("실시간") ||
          heading.textContent?.includes("인기"))
      ) {
        const links = section.querySelectorAll("a");
        if (links.length > 0) {
          realtimeItems = links;
          usedSelector = "텍스트 기반 검색";
          break;
        }
      }
    }
  }

  if (realtimeItems.length === 0) {
    console.log(`${LOG_PREFIX} 실시간 검색어를 찾을 수 없습니다.`);
    return;
  }

  // First pass: collect (element, keyword) for unprocessed, valid items.
  const pending: Array<{ el: HTMLElement; keyword: string }> = [];
  for (const item of realtimeItems) {
    const el = item as HTMLElement;
    if (el.hasAttribute(DATA_ATTR_PROCESSED)) continue;
    const keyword = el.getAttribute("title") || el.textContent?.trim() || "";
    if (!keyword || /^\d+$/.test(keyword)) continue;
    pending.push({ el, keyword });
  }
  if (pending.length === 0) return;

  // One SW round for all keywords, then inject.
  await refreshThreadMatches(pending.map((p) => p.keyword));

  let addedCount = 0;
  for (const { el, keyword } of pending) {
    el.setAttribute(DATA_ATTR_PROCESSED, "true");
    const container = createLinkContainer(
      keyword,
      threadMatches.get(keyword) ?? null,
    );
    if (insertContainer(el, container)) addedCount++;
  }
  console.log(
    `${LOG_PREFIX} ${addedCount}개 항목에 링크 추가 완료 (선택자: ${usedSelector})`,
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/layers/manipulation.test.ts`
Expected: PASS (전부 그린).

- [ ] **Step 6: Commit**

```bash
git add src/constants/config.ts src/layers/manipulation.ts src/layers/manipulation.test.ts
git commit -m "feat(manipulation): single smart thread/search link via background SW

Replaces the 5-site multisite row with one per-keyword link: 실검챈 thread
(💬) when matched, arca search (🔎) fallback otherwise.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `content-init.ts` — 패널 wiring 제거

패널(`mountPanel`/`updatePanel`) 호출을 제거하고 인라인 스레드 링크 흐름만 남긴다.

**Files:**

- Modify: `src/lib/content-init.ts`
- Modify: `src/lib/content-init.test.ts`

- [ ] **Step 1: 테스트에서 패널 mock 제거 (실패 테스트)** — `src/lib/content-init.test.ts`

다음을 삭제:

- `const mountPanel = ...` / `const updatePanel = ...` 선언 (line 9-10)
- `vi.mock("../layers/panel", ...)` 블록 (line 21-24)
- `beforeEach`의 `mountPanel.mockClear()` / `updatePanel.mockClear()` (line 37-38)

그리고 패널이 호출되지 않음을 보장하는 테스트를 `describe("init — enabled gate")`에 추가:

```ts
it("does not import or call any panel code (panel removed)", async () => {
  getStorageState.mockResolvedValue({ enabled: true, targetSites: [] });
  await init();
  // addArcaLinks is the only DOM-mutating call now
  expect(addArcaLinks).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/content-init.test.ts`
Expected: FAIL — `vi.mock("../layers/panel")` 제거로 `content-init.ts`의 `import ... panel` 이 실제 모듈을 로드하려다 깨지거나, mountPanel 참조 에러.

- [ ] **Step 3: `content-init.ts` 구현 수정**

(a) panel import 삭제 (line 4): `import { mountPanel, updatePanel } from "../layers/panel";` 제거.

(b) `init()` 본문에서 패널 호출 제거 — line 33-38 영역을 다음으로 교체:

```ts
observeRealtimeUpdates();
onRealtimeChange(() => {
  if (!hideInline) void addArcaLinks();
});
```

(c) navigation 리스너의 `void updatePanel();` 제거 — line 40-48 영역을 다음으로 교체:

```ts
if ("navigation" in window) {
  const nav = window.navigation as EventTarget;
  nav.addEventListener("navigate", () => {
    setTimeout(() => {
      if (!hideInline) void addArcaLinks();
    }, NAV_DELAY_MS);
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/content-init.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content-init.ts src/lib/content-init.test.ts
git commit -m "refactor(content-init): drop right-dock panel wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 패널 파일 삭제 + config 패널 상수 정리

`panel.ts`/`trends.ts`(+tests)를 지우고 더 이상 참조되지 않는 패널 상수를 제거한다.

**Files:**

- Delete: `src/layers/panel.ts`, `src/layers/panel.test.ts`, `src/layers/trends.ts`, `src/layers/trends.test.ts`
- Modify: `src/constants/config.ts` (패널 상수 제거)

- [ ] **Step 1: 파일 삭제 + 잔여 참조 확인**

```bash
git rm src/layers/panel.ts src/layers/panel.test.ts src/layers/trends.ts src/layers/trends.test.ts
grep -rn "panel\|trends\|CSS_CLASS_PANEL\|HUB_COLLAPSED" src --include=*.ts
```

Expected: 위 grep 결과에 `panel`/`trends`로의 import나 사용이 **남아있지 않아야** 한다 (있으면 그 파일을 수정). `STORAGE_KEY_HIDE_INLINE`만 정상적으로 남는다.

- [ ] **Step 2: `config.ts`에서 패널 상수 제거**

다음 라인 삭제 (Task 6에서 추가한 `DATA_ATTR_THREAD`/`ARCA_SEARCH_TEMPLATE`는 유지):

```ts
export const CSS_CLASS_PANEL = "arca-hub";
export const CSS_CLASS_PANEL_TOGGLE = "arca-hub-toggle";
export const CSS_CLASS_PANEL_ROW = "arca-hub-row";
export const CSS_CLASS_PANEL_BADGE = "arca-hub-badge";
export const STORAGE_KEY_HUB_COLLAPSED = "hubCollapsed";
```

`STORAGE_KEY_HIDE_INLINE`는 남긴다 (options의 hide-inline 토글이 사용).

- [ ] **Step 3: 전체 스위트 + 빌드 그린 확인**

Run: `npm run test:run`
Expected: 전체 PASS (panel/trends 테스트는 사라졌고 나머지 그린).

Run: `npm run build`
Expected: 4-pass 성공 (background 포함). `head -c 40 dist/content.js`가 `import`로 시작하지 않음.

Run: `npm run lint`
Expected: 에러 0 (미사용 import 없음).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove right-dock panel (panel.ts/trends.ts + panel consts)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `styles.css` — 💬/🔎 뱃지 스타일

좁은 실검 위젯(~278px)에서 단일 뱃지가 한 줄로 보이도록 컴팩트 스타일. 기존 theseed light/dark 스코핑 패턴을 따른다.

**Files:**

- Modify: `styles.css`

- [ ] **Step 1: 기존 `.arca-link`/`.arca-links` 규칙 확인**

```bash
grep -n "arca-link\|arca-links\|theseed" styles.css
```

기존 규칙을 읽어 색/패딩 변수를 파악한다 (그대로 확장).

- [ ] **Step 2: 단일 뱃지용 규칙 추가/조정** — `styles.css`

`.arca-links`가 한 줄 유지되고 뱃지가 컴팩트하도록 (기존 멀티링크용 간격 규칙이 있으면 단일 뱃지에 맞게 조정):

```css
.arca-links {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  white-space: nowrap;
}

.arca-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  line-height: 1;
  padding: 0.12rem 0.32rem;
  border-radius: 4px;
  text-decoration: none;
  white-space: nowrap;
}

/* thread links (💬) get a subtle emphasis vs search fallback (🔎) */
.arca-link[data-arca-thread] {
  font-weight: 600;
}

.theseed-light-mode .arca-link {
  color: #1a1a1a;
  background: rgba(0, 0, 0, 0.05);
}
.theseed-dark-mode .arca-link {
  color: #e8e8e8;
  background: rgba(255, 255, 255, 0.08);
}
```

> 기존 styles.css에 이미 `.theseed-*-mode .arca-link`가 있으면 중복 추가하지 말고 위 속성으로 **병합**한다(색은 기존 값 유지).

- [ ] **Step 3: 빌드 확인** (CSS 단위 테스트 없음 — 시각 검증은 Task 12)

Run: `npm run build`
Expected: 성공. `styles.css`는 manifest content_scripts.css로 그대로 로드됨.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: compact single-badge styling for 💬/🔎 links

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: (조건부) declarativeNetRequest로 User-Agent 위장

**Task 1 spike에서 `CHROME_UA` 패스가 200이 아니었을 때만 수행.** 200이었으면 이 태스크는 SKIP하고 commit 메시지로 "spike: CHROME_UA 200 → DNR 불필요, Task 10 skip" 한 줄만 남긴다.

**Files:**

- Modify: `manifest.json` (permissions)
- Modify: `src/background.ts` (세션 룰 등록)

- [ ] **Step 1: manifest 권한 추가**

`"permissions"`에 추가: `["storage", "declarativeNetRequest"]`.

- [ ] **Step 2: background에서 arca API 요청 UA를 앱 UA로 덮는 세션 룰 등록** — `src/background.ts` 상단(리스너 등록 전)에 추가

```ts
// arca app API gates on the official-app User-Agent. fetch() cannot set
// User-Agent from a service worker, so rewrite it via declarativeNetRequest.
const ARCA_UA = "net.umanle.arca.android.playstore/0.9.83";
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "user-agent", operation: "set", value: ARCA_UA },
          ],
        },
        condition: {
          urlFilter: "||arca.live/api/app/list/channel/namuhotnow",
          resourceTypes: ["xmlhttprequest"],
        },
      },
    ],
  });
});
```

> 세션 룰은 SW 재시작 시에도 유지되나 onInstalled 외에 SW 콜드스타트마다 재보장하려면 `chrome.runtime.onStartup`에도 동일 호출을 추가한다.

- [ ] **Step 3: 빌드 + 실기기 확인**

Run: `npm run build`
그리고 Task 12의 Playwright 로드로 토론글 매칭이 실제로 동작하는지 확인 (UA 룰 적용 여부는 매칭 성공/실패로 드러남).

- [ ] **Step 4: Commit**

```bash
git add manifest.json src/background.ts
git commit -m "fix(background): spoof arca app User-Agent via declarativeNetRequest

Spike showed the arca app API rejects browser UAs; DNR session rule rewrites
the UA only for the namuhotnow list endpoint.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: 버전 범프 1.5.0 + 최종 검증

**Files:**

- Modify: `package.json` (version)
- Modify: `manifest.json` (version)

- [ ] **Step 1: 버전 1.5.0으로**

`package.json` `"version": "1.4.0"` → `"1.5.0"`.
`manifest.json` `"version": "1.4.0"` → `"1.5.0"`.

- [ ] **Step 2: 전체 게이트**

Run: `npm run test:run` → 전체 PASS (skip/only 없음).
Run: `npm run lint` → 에러 0.
Run: `npm run build` → 4-pass 성공. `ls dist/{content,popup,options,background}.js dist/{popup,options}.html` 모두 존재. `head -c 40 dist/content.js`가 `import` 아님.

- [ ] **Step 3: Commit**

```bash
git add package.json manifest.json
git commit -m "chore: bump to 1.5.0 (namu 2.0 Phase 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: 실기기(Playwright) 시각 검증

JSDOM은 namu의 Vue 실검 렌더링·실제 arca fetch를 재현하지 못한다. 실제 확장을 로드해 토론글 매칭/폴백/뱃지를 눈으로 확인한다.

**Files:**

- (검증 전용 — 코드 변경 없음. 필요 시 `release/` 아래 일회성 스크립트 사용, gitignore됨)

- [ ] **Step 1: 빌드 + 언팩 폴더 준비**

```bash
npm run build
# manifest + dist + styles.css + icons 가 로드 가능한 폴더에 모이도록 release/unpacked 갱신
```

(기존 `release/unpacked` 사용 — manifest가 `dist/*`, `styles.css`, `icons/`를 루트 기준 참조함을 확인.)

- [ ] **Step 2: Playwright chromium으로 확장 로드 후 namu.wiki 열기**

> Chrome 137+는 `--load-extension` CLI 스위치를 막으므로 **Playwright의 chromium**(확장 로드 허용)을 쓴다. `chromium.launchPersistentContext(dir, {headless:false, args:['--disable-extensions-except=EXT','--load-extension=EXT']})`로 띄우고 `https://namu.wiki/`에서 다음을 `page.evaluate`로 확인:
>
> - 실검 키워드마다 `.arca-links` 1개, 그 안 `a.arca-link` 1개
> - 토론글 매칭된 키워드: `a[data-arca-thread]` 존재 + `href`가 `/b/namuhotnow/<id>` + 텍스트 `💬...`
> - 미매칭 키워드: 텍스트 `🔎`, 검색 URL
> - 콘솔에 SyntaxError 없음 (IIFE 빌드 정상 로드)

- [ ] **Step 3: 확인 결과 기록**

토론글 매칭 N건 / 검색 폴백 M건 / 뱃지에 표시된 값(💬count vs 💬category)을 적는다. spike 결과와 일치하는지 대조.

- [ ] **Step 4: (선택) release zip**

이상 없으면 `npm run release`로 CWS 업로드용 zip 생성 가능. 업로드/게시는 사용자 확인 후.

---

## Self-Review

**1. Spec coverage:**

- §2 토론글 매칭+단일 링크 → Task 6. ✅
- §2 background SW → Task 0(스캐폴드)+Task 5. ✅
- §2 댓글수 뱃지(폴백 카테고리) → Task 6 `badgeText` (commentCount→category→💬). ✅
- §2 패널/멀티사이트 제거 → Task 7+8(패널), Task 6(멀티사이트). ✅
- §3 arca API 해독(엔드포인트/헤더/매칭) → Task 4 fetch, Task 3 match. ✅
- §5.1 manifest background/version, host 권한 기존 → Task 0/11. ✅
- §5.5 빌드 IIFE → Task 0. ✅
- §6 spike (a)(b) → Task 1, 분기 → Task 10(UA), Task 6(badge 양쪽 처리). ✅
- §7 테스트 → 각 Task TDD. ✅
- §8 버전 1.5.0/권한 → Task 11/0/10. ✅
- §10 Playwright 검증 → Task 12. ✅

**2. Placeholder scan:** 모든 코드 블록은 완전한 구현. spike 결과 의존부(badge 값, Task 10 수행 여부)는 코드가 양쪽을 처리하거나 명시적 조건부 태스크로 분리됨 — "TODO/나중에" 없음.

**3. Type consistency:** `ThreadMatch`(arca-api.ts 정의) → background.ts/manipulation.ts에서 import 일관. `ArcaArticle` 동일. `MatchThreadsResponse.matches: Record<string, ThreadMatch|null>` ↔ `refreshThreadMatches`/`handleMatchThreads` 일치. `createThreadLink(keyword, match)`/`createLinkContainer(keyword, match)`/`refreshThreadMatches(keywords)`/`threadMatches` 시그니처가 test와 구현에서 동일. observer.ts가 부르는 `addArcaLinks()`/`updateArcaLink(change)` 시그니처 불변 → observer/detection 무수정.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-10-namu-thread-direct-link.md`.

> **선행 주의:** Task 0(빌드 수정)을 **반드시 먼저** 실행. 그 전엔 확장이 브라우저에서 안 뜬다. Task 1(spike) 결과가 Task 4 뱃지 표시값과 Task 10 수행 여부를 가른다.
