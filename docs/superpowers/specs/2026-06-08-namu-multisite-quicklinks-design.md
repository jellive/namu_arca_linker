# namu_arca_linker — 멀티사이트 퀵링크 (design)

- Date: 2026-06-08
- Status: approved (design), pending implementation plan

## 목적

나무위키 실시간 검색어 옆에 현재 **아카라이브 링크 1개**만 붙는 것을, **여러 사이트(기본 5종) 빠른검색 링크**로 확장한다. 실검(뜨는 키워드)을 봤을 때 "왜 떴나(뉴스) + 실시간 반응(커뮤/X)"을 한 클릭으로 확인하게 한다.

## 컨텍스트 (이미 존재하는 인프라)

- `TargetSite = { name, url }` (url에 `{keyword}` 치환), `targetSites`가 `chrome.storage.sync`에 저장.
- 옵션 페이지(`options.ts`/`options.html`)가 사이트 리스트 **add/remove/edit를 이미 지원**.
- `layers/manipulation.ts`가 `sites[0]`(첫 사이트)만 렌더 — `// option ①: first configured site` 주석. **이 지점이 유일한 갭.**
- 확장이 **CWS 미출시**(README "출시 예정") → 기존 유저 사실상 0 → **마이그레이션 로직 불필요**.

## 설계

### 1. 데이터 / 기본값 (`constants/sites.ts`, `lib/storage.ts`)

- `TargetSite`에 optional `label` 추가 → `{ name, url, label? }`. `label` = 인라인 표시용 짧은 이름(없으면 `name` 사용).
- `DEFAULT_TARGET_SITES` 5종 (label / url template):
  - `아카` / `https://arca.live/b/namuhotnow?target=all&keyword={keyword}` (기존)
  - `네이버` / `https://search.naver.com/search.naver?query={keyword}`
  - `구글` / `https://www.google.com/search?q={keyword}`
  - `X` / `https://x.com/search?q={keyword}&f=live`
  - `DC` / `https://search.dcinside.com/combine/q/{keyword}`
- `{keyword}` URL 인코딩은 기존 `sanitizeUrl`/encode 로직 재사용.

### 2. 렌더링 (`layers/manipulation.ts` — 핵심 변경)

- `sites[0]` 전용 로직 → **전 `targetSites` 루프**.
- 키워드마다 컨테이너 `<span class="namu-arca-links">` 생성 + 사이트당 `<a class="namu-arca-link">`(label 표시) + `·` 구분자.
- CSS: `inline-flex` + `flex-wrap` → 좁은 실검 위젯에서 **다음 줄로 graceful wrap**. 기존 다크/라이트 + fade 애니메이션 유지.
- 중복 삽입 가드: `nextElementSibling`이 컨테이너 클래스(`namu-arca-links`)인지 체크 (기존 단일 링크 가드 확장).
- 변동추적(add/change/delete)을 **컨테이너 단위**로 갱신.
- 리팩터: `createArcaLink(keyword)` → `createSiteLinksContainer(keyword, sites)`; `addNewLink`/`updateExistingLink`/`addArcaLinks`가 컨테이너를 사용.

### 3. 옵션 페이지 (`options.ts`/`options.html`)

- 사이트 항목에 `label` 입력 필드 추가 (선택 입력).
- (optional/stretch) "기본값 복원" 버튼.

### 4. 권한 / 비범위

- **권한(manifest) 변경 없음** — 타 사이트 링크는 `<a href>` 네비게이션(유저 클릭 이동)이라 host_permissions 불필요 → **CWS 권한 심사 영향 0**.
- Out of scope (별도 기능): arca.live 양방향, 실검 트렌드/히스토리, 키워드 워치리스트 알림.

### 5. 에러 처리

- `url`에 `{keyword}`가 없으면 그 사이트는 스킵.
- `targetSites`가 빈 배열이면 링크 미표시 (graceful).
- 잘못된 url은 기존 sanitize로 방어.

### 6. 테스트 (`layers/manipulation.test.ts`)

- 멀티링크 렌더(N개), 좁은 폭 wrap, idempotency(재실행 시 중복 없음), 변동갱신(멀티 사이트), 빈 리스트, `{keyword}` 없는 url 스킵.

### 7. 버전

- `1.2.0 → 1.3.0` (manifest.json + package.json).
