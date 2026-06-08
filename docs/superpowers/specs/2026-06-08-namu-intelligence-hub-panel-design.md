# namu 2.0 — 실검 인텔리전스 허브 패널 (Phase 1 design)

- Date: 2026-06-08
- Status: approved (design), pending implementation plan
- Part of the namu 2.0 "실검 인텔리전스 허브" vision. **Phase 1 only** (see Roadmap).

## 목적

namu를 "실검 옆 링크 추가기"에서 **실검 인텔리전스 도구**로 도약시키는 첫 단계. namu.wiki에 **우측 사이드 도크 패널**을 추가해 실시간 검색어를 랭킹+트렌드 배지+키워드별 멀티사이트 검색으로 한 곳에 보여준다. 기존 인라인 링크는 유지(additive) — v1.x 유저를 깨지 않는다.

## 전제 / 컨텍스트

- namu는 **이미 CWS에 공개된 확장** → 공개 확장 제약 준수(민감 키 embed 금지, 데이터수집 신고). Phase 1은 로컬 데이터만 다루므로 무해. (AI는 Phase 3, 백엔드 경유 필요.)
- CWS 업데이트 게시는 만료된 `.env` REFRESH_TOKEN 재발급이 선행돼야 함(구현과 무관한 게이트).
- 기존 레이어드 아키텍처 재활용: `layers/discovery.ts`(실검 키워드+순위 추출), `layers/observer.ts`(실검 변동 감지), `layers/manipulation.ts`의 `createLinksContainer(keyword, sites)`(멀티사이트 링크 — 이미 구현됨), `lib/storage.ts`(targetSites), `constants/config.ts`.

## 설계

### 1. 아키텍처 (추가형, 기존 레이어 연장)

- 신규 `src/layers/panel.ts` — 우측 도크 패널의 DOM 생성·갱신·토글을 담당. `document.body`에 1회 주입(멱등 — 이미 있으면 재주입 안 함).
- `src/lib/content-init.ts`가 기존 인라인 링크 init **옆에** 패널 init을 추가로 호출(기존 흐름 유지).
- 데이터: `discovery`로 현재 실검 (순위 있는 keyword 리스트) 취득 → 패널 렌더. `observer`가 실검 변동 시 콜백 → 패널 재렌더.
- 패널 행의 키워드별 링크는 `createLinksContainer(keyword, activeSites)` 재활용(DRY).
- 신규 CSS 클래스 상수(`config.ts`): 예) `CSS_CLASS_PANEL = "arca-hub"` 등 패널 요소용.

### 2. 패널 내용 + 트렌드 배지

- 행 구조: `[순위] [트렌드 배지] [키워드]` + 그 아래 멀티사이트 링크 행.
- 트렌드 배지: 직전 스냅샷 대비 순위 델타로 계산.
  - `▲` 순위 상승, `▼` 하락, `NEW` 신규 진입, `=` 동일. (실검에서 빠진 키워드는 표시 안 함.)
  - 구현: in-memory `prevRanks: Map<keyword, rank>` 유지. 매 렌더 시 현재 rank vs prevRank 비교 → 배지 결정 → prevRanks 갱신. **첫 렌더는 prev 없음 → baseline(배지 없음/`=`).** 실검이 회전(수 분 주기)하면 라이브로 배지 갱신.
  - _교차 세션(새로고침 넘어 "어제도 떴던")은 Phase 2(히스토리)._

### 3. 동작

- `🔥` 토글 버튼으로 패널 표시/숨김 + 접기/펴기. **접힘/펴짐 상태를 `chrome.storage`에 저장**(다음 방문 시 기억).
- `observer` 변동 콜백 시 패널 라이브 갱신(기존 fade 톤 유지).
- 다크/라이트: 기존 `theseed-light-mode`/`theseed-dark-mode` 스코프 스타일 따름. 반응형: 좁은 화면 기본 접힘.
- **옵션 추가** (options 페이지): "인라인 링크 숨기기" 토글. 기본 off(인라인+패널 둘 다). on이면 인라인 링크 미주입(패널만) — 중복 제거용. `chrome.storage.sync`에 저장, content-init가 이 플래그로 인라인 init 분기.

### 4. 에러 처리

- 실검 미발견 → 패널에 "실시간 검색어 없음" 빈 상태.
- 패널 주입 멱등(중복 주입 방지: 이미 `.arca-hub` 있으면 skip).
- storage 읽기 실패 → 기본값(펼침, 인라인 표시)로 폴백.

### 5. 테스트 (`src/layers/panel.test.ts`, JSDOM)

- 패널 빌드(구조/클래스), 멱등 주입(2회 호출 시 1개), 랭킹 렌더(순서), 트렌드 배지(mock 현재+prevRanks → ▲/▼/NEW/= 정확), 토글·접기 + 상태 저장/복원, 빈 상태, 실검 변동 시 재렌더.

### 6. 범위 (Phase 1)

- IN: 우측 도크 패널 / 실검 랭킹 + 트렌드 배지 / 키워드별 멀티사이트 링크(기존 재활용) / 토글·접기(저장) / 인라인 숨김 옵션 / 다크라이트·반응형.
- OUT(다음 Phase): 트렌드 히스토리·그래프·워치리스트(P2), AI "왜 떴나" 요약(P3, 백엔드 경유), 수동 검색 박스(P1.5).

### 7. 버전

- `1.3.0 → 1.4.0` (기능 추가). 권한 변경 없음(namu.wiki content script + storage 기존 그대로).

## Roadmap (참고, 이 스펙은 Phase 1만)

- **Phase 1 (이 문서)**: 인-페이지 우측 도크 패널 + 실검 랭킹/트렌드/멀티검색.
- **Phase 2**: 트렌드 히스토리(시계열 저장) + 그래프 + 워치리스트 알림 (jellhub 연동 가능).
- **Phase 3**: AI "왜 떴나" 요약 — gemini-proxy를 **jell-server 백엔드 엔드포인트 경유**로(공개 확장이라 키 embed 금지) + 데이터수집 CWS 신고.
