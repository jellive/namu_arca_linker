# namu 2.0 Phase 1 — 실검 → 실검챈 토론글 직링크 (Design Spec)

- **작성일**: 2026-06-10
- **상태**: 승인됨 (구현 플랜 작성 대기)
- **트랙**: namu 2.0 "namu↔arca 풀 통합" 의 Phase 1 (3-phase 중 첫 단독 출시 단위)
- **선행 결정**: AI 기능 미도입(2026-06-09), 다른 사이트로 확장 안 함(namu↔arca 심화만)

---

## 1. 배경 & 목표

현재 확장(1.x core)은 namu.wiki 실시간검색어 옆에 **arca 검색 링크**(및 한때 5사이트 멀티사이트)를 단다. 한 단계 위 가치는 **검색이 아니라 "그 키워드의 실시간 토론 스레드"로 바로 보내는 것** — "이게 왜 실검이지?"를 클릭 한 번에 해소.

레퍼런스 경쟁 확장: KEMOMIMI의 Tampermonkey 유저스크립트 **"Namu Hot Now"** (greasyfork id 486316, v0.9.7.1). 우리는 **정식 CWS 확장**이라 원클릭 설치·dev모드 불필요·모바일 대응의 배포 우위가 있다. 유저스크립트는 dev모드+cross-origin 허용+모바일 삽질을 요구.

**Phase 1 목표**: namu 실검 키워드 각각을, 매칭되는 실검챈(arca.live/b/namuhotnow) 토론글로 직링크하고, 매칭이 없으면 기존 arca 검색으로 폴백한다. 단독으로 CWS 출시 가능해야 한다.

---

## 2. 스코프

### In scope (Phase 1)

- 실검챈 토론글 매칭 + 키워드당 **스마트 링크 1개** 주입 (토론글 or 검색 폴백)
- arca 앱 API fetch용 **background service worker** 신설
- 토론글 강도 뱃지 (💬댓글수 — spike로 가용성 확정, 불가 시 카테고리 폴백)
- **실패 실험 제거**: 우측 도크 패널(`panel.ts`/`trends.ts`/허브 관련 config), 5사이트 멀티사이트 주입

### Out of scope (다음 페이즈, 별도 spec)

- Phase 2: arca 페이지에 namu 실검 재현(사이드바 + 글목록 순위 뱃지) — arca.live content script 신규 주입
- Phase 3: 실검챈 QoL(분류 탭 / 글제목 full / \*댓글 보호는 커뮤정책 특화라 드롭 후보)
- AI 요약 등 일체 (영구 제외)

---

## 3. 경쟁 확장에서 해독한 arca 앱 API (하드-원 지식 — 보존)

> greasyfork 원본 소스에서 직접 추출. 구현 플랜의 근거.

- **엔드포인트**: `GET https://arca.live/api/app/list/channel/namuhotnow?limit=50`
  - 2페이지: `&before=<직전 응답 마지막 article.createdAt>&offset=1`
- **요청 헤더**:
  - `x-device-token: <랜덤 64자 문자열>` — 클라이언트가 1회 생성·저장해 재사용. **arca 서버 등록 불필요** (그냥 랜덤). 경쟁 확장 `getUniqueId()`가 `generateRandomString(64)` 후 저장.
  - `User-Agent: net.umanle.arca.android.playstore/0.9.83` — 공식 안드로이드 앱 위장.
  - `Accept-Encoding: gzip`
- **응답**: `{ articles: [ { id, title, categoryDisplayName, createdAt, ... } ] }`
  - 토론글 URL = `https://arca.live/b/namuhotnow/<article.id>`
  - 경쟁 확장의 뱃지 = `article.categoryDisplayName || '이왜실?'` → **commentCount를 안 씀**. 응답에 댓글수 필드가 있는지는 **미확인** (→ spike).
- **매칭 알고리즘** (경쟁 `findLinkByPartialMatch`):
  1. 정확 일치: `title.toLowerCase() === keyword.toLowerCase()`
  2. 부분 일치: title에서 `<b>`/`</b>`(검색 하이라이트) 제거 후 `title.toLowerCase().includes(keyword.toLowerCase())`
  3. 둘 다 없으면 null
  - 중복 제거: 같은 link(id)는 한 번만.
- **이력상 함정** (경쟁 업데이트 로그):
  - HTML 직접 파싱 → **캡챠로 차단** → 앱 API로 전환 (25/03)
  - 특정 환경에서 **API 응답 캐싱**되어 옛 실검 표시 → `nocache: true` 사용 (25/10)

---

## 4. 동작 사양

키워드 1개당 컴팩트 요소 **1개**만 (지난 5링크 겹침 교훈).

```
실시간 검색어
─────────────────
1  황승언      💬23     → https://arca.live/b/namuhotnow/<id>   (토론글)
2  손흥민      💬5      → 토론글
3  LCK         💬112    → 토론글
4  김치찌개    🔎       → https://arca.live/b/namuhotnow?...keyword=김치찌개  (검색 폴백)
5  날씨        🔎       → 검색 폴백
```

- **토론글 매칭 O**: `https://arca.live/b/namuhotnow/<id>` 링크, 라벨 `💬<commentCount>` (없으면 `💬` 단독 또는 `💬<category>`), `title`=글 제목, `target="_blank"`, `rel="noopener noreferrer"`.
- **토론글 매칭 X**: 기존 arca 검색 링크 유지 (`https://arca.live/b/namuhotnow?target=all&keyword=<enc(keyword)>`), 라벨 `🔎`.
- 대소문자 무시 매칭. 정확 일치 우선, 없으면 부분 일치.

---

## 5. 아키텍처

### 5.1 manifest 변경

- `background.service_worker = "dist/background.js"` 추가 (`"type": "module"`은 IIFE 빌드와 충돌하므로 **미사용** — classic worker).
- `host_permissions`: `https://arca.live/*` **이미 존재** → 신규 권한 없음.
- (조건부) spike에서 UA 위장이 필요하다고 판명되면 `permissions`에 `declarativeNetRequest` 추가 + arca API 요청에 `User-Agent` 덮는 동적/세션 룰. 불필요하면 추가 안 함.
- `version`: `1.4.0 → 1.5.0`.

### 5.2 신규 모듈 `src/lib/arca-api.ts` (SW에서 실행, 순수 로직은 테스트 가능)

```ts
// 의사 시그니처 (플랜에서 확정)
export async function getDeviceToken(): Promise<string>; // storage.local 'arcaDeviceToken', 없으면 랜덤 64자 생성·저장
export interface ArcaArticle {
  id: number;
  title: string;
  categoryDisplayName?: string;
  createdAt: string;
  commentCount?: number;
}
export async function fetchNamuhotnowArticles(
  limit?: number,
): Promise<ArcaArticle[]>; // 1~2페이지, nocache
export interface ThreadMatch {
  id: number;
  title: string;
  commentCount?: number;
  category?: string;
}
export function matchThread(
  keyword: string,
  articles: ArcaArticle[],
): ThreadMatch | null; // 정확→부분, 소문자
```

- **캐시**: SW 메모리에 `{articles, fetchedAt}` 보관, TTL ~3분. TTL 내 재요청은 캐시 사용 → 실검 틱마다 재fetch 방지, 1회 fetch로 전 키워드 매칭.
- `matchThread`는 순수 함수(네트워크 무관) → 단위 테스트 용이.

### 5.3 신규 엔트리 `src/background.ts` (service worker)

- `chrome.runtime.onMessage`: `{ type: "matchThreads", keywords: string[] }` 수신 → `fetchNamuhotnowArticles()`(캐시) → 각 키워드 `matchThread` → 응답 `{ [keyword]: ThreadMatch | null }`.
- fetch 실패/타임아웃 시 전부 null 반환 (content script가 검색 폴백).

### 5.4 content script 변경

- `manipulation.ts`: 키워드당 주입을 **단일 스마트 링크**로 교체.
  - 새 함수: `createThreadLink(keyword, match | null)` → match 있으면 토론글 앵커(💬), 없으면 검색 앵커(🔎). 기존 `buildSearchUrl`/`sanitizeUrl` 재사용.
  - `addArcaLinks()`/`updateExistingLink()`는 SW 매칭 맵을 받아 주입하도록 시그니처/흐름 조정. 멀티사이트 루프(`activeSites` 5개) 제거.
- `content-init.ts`:
  - 패널 wiring 제거 (`mountPanel`/`updatePanel` import·호출 삭제).
  - init/onRealtimeChange 시: 현재 키워드 목록 추출 → `chrome.runtime.sendMessage({type:"matchThreads", keywords})` → 응답으로 주입.
  - `hideInlineLinks` 옵션 분기는 유지(전체 끄기).
- 삭제 대상 파일: `src/layers/panel.ts`, `src/layers/trends.ts`(+ 각 `.test.ts`). `config.ts`의 패널/허브 상수(`CSS_CLASS_PANEL*`, `STORAGE_KEY_HUB_COLLAPSED`) 제거. `STORAGE_KEY_HIDE_INLINE`는 유지.

### 5.5 빌드 (Task 0 — 선행 필수)

- main의 현재 `vite.config.ts`는 `output.format:"es"` 멀티엔트리 → 코드분할로 **content/popup/options 전부 ESM** → MV3 classic script가 로드 실패 = **확장 통째로 죽어있음**.
- `feat/trend-history`의 IIFE 빌드 수정(commit `0073cf6`)을 가져온다: 엔트리별 self-contained IIFE를 `BUILD_ONE` env로 다중 패스 빌드.
- **확장**: 이제 엔트리가 4개(content/popup/options/**background**)이므로 빌드 패스에 background 추가. `package.json` build 스크립트도 4-pass로.
- background는 `inlineDynamicImports:true` + `format:"iife"`로 단일 파일.

### 5.6 CSS (styles.css)

- 💬/🔎 뱃지용 컴팩트 스타일. 기존 `arca-link`/`arca-links` 클래스 + theseed-light-mode/theseed-dark-mode 스코핑 패턴 재사용. 좁은 실검 위젯(~278px)에서 한 줄 유지(`white-space:nowrap`, 작은 padding).

---

## 6. 🔬 Spike 게이트 (Task 1 — 가정 금지, investigation-first)

구현 본격화 전 실제 fetch로 확정:

- **(a) 인증/UA**: 브라우저 User-Agent + 랜덤 `x-device-token`만으로 `200 OK`가 오는가?
  - YES → SW fetch에 `x-device-token`만 세팅. `declarativeNetRequest` 불필요.
  - NO (403 등) → UA 위장 필요 → `declarativeNetRequest` 권한 + 세션 룰로 arca API 요청 `User-Agent` 덮기. (manifest/플랜에 반영)
- **(b) 댓글수**: 응답 `articles[]`에 `commentCount`(혹은 유사 필드)가 있는가?
  - YES → 뱃지 `💬<count>`.
  - NO → 뱃지 `💬`(단독) 또는 `💬<categoryDisplayName>` 폴백. (사양 §4 라벨 확정)
- spike는 일회성 검증 스크립트(또는 SW 임시 로깅)로 수행, 결과를 플랜 §에 기록.

---

## 7. 테스트 전략 (vitest + jsdom, TDD)

- `arca-api.test.ts`:
  - `matchThread`: 정확 일치 / 부분 일치 / 대소문자 무시 / 무매칭 null / `<b>` 태그 제거.
  - `getDeviceToken`: 최초 생성·저장, 재호출 시 동일값 반환 (chrome.storage mock).
  - `fetchNamuhotnowArticles`: fetch mock으로 1~2페이지 병합, 캐시 TTL 동작, 실패 시 빈 배열.
- `manipulation.test.ts`(개정): `createThreadLink` 토론글/검색 분기, 주입 idempotency(중복 주입 방지), 멀티사이트 제거 회귀.
- `content-init.test.ts`(개정): 패널 wiring 제거, sendMessage 호출/응답 주입 흐름(runtime mock).
- 전체: `npm run test:run` 그린. 신규 코드 100% 커버리지 목표.
- 실행: 단일 `npx vitest run <file>`, 전체 `npm run test:run`, 빌드 `npm run build`.

---

## 8. 버전 / 권한 요약

| 항목                  | 값                                                     |
| --------------------- | ------------------------------------------------------ |
| version               | 1.4.0 → **1.5.0**                                      |
| 신규 user-facing 권한 | **없음** (arca.live host 기존 보유; storage 기존 보유) |
| 조건부 권한           | `declarativeNetRequest` — spike (a)가 NO일 때만        |
| 신규 컴포넌트         | background service worker                              |

---

## 9. 리스크 & 완화

- **비공식 앱 API 의존**: arca가 엔드포인트/인증을 바꾸면 토론글 매칭이 깨짐 → 그 경우에도 **검색 폴백이 항상 동작**하므로 코어 기능은 유지(graceful degradation). 경쟁 확장도 캡챠·캐싱으로 수차례 당함 → `nocache:true` + 캐시 TTL로 완화.
- **UA 위장 필요 시 CWS 심사**: `declarativeNetRequest`는 정당 사유(특정 API 헤더 보정) 기재. user-facing 권한 프롬프트는 없음.
- **rate**: 3분 캐시로 단일 fetch/주기 → 부담 없음.
- **DOM 셀렉터 취약성**: namu 실검은 client-rendered(Vue) — 기존 `REALTIME_SELECTORS`/`a[href^="/Go?q="]` 그대로 사용(검증된 경로). 변경 없음.

---

## 10. 검증/배포 노트

- namu 실검은 headless/bot 브라우저에 안 보일 수 있음(`/Go?q=` 0). 시각 검증은 **Playwright chromium**으로 확장 로드(`--load-extension`) — Chrome 137+는 CLI 스위치 차단하므로 Playwright 경로 필수. (참조: parked memory)
- 출시 전 실제 namu.wiki에서 토론글 매칭/폴백/뱃지 시각 확인.
