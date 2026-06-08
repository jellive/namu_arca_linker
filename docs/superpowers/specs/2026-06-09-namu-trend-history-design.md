# namu 2.0 — 실검 트렌드 히스토리 + 키워드 인사이트 (Phase 2 design)

- Date: 2026-06-09
- Status: approved (design), pending implementation plan
- namu 2.0 인텔리전스 허브 **Phase 2** (lean). Phase 1(허브 패널) 완료 위에 추가형. **AI 미도입**([[feedback_namu_no_ai]]).

## 목적

Phase 1 허브 패널에 **실검 트렌드 히스토리**를 더한다. namu.wiki를 볼 때마다 실검 스냅샷을 로컬에 쌓아, 키워드별로 "처음 본 지 얼마나 됐나 / 최고 순위 / 관찰 횟수 / 순위 흐름"을 보여준다. **방문 기반(visit-based)** — 백그라운드 워커 없이 namu를 볼 때만 샘플링하므로 데이터는 sparse하다. 그 성격에 맞춰 본격 그래프가 아닌 **가벼운 인사이트**로 스코프를 한정한다.

## 전제

- 방문 기반 캡처(사용자 결정) → 백그라운드 service worker 없음, 새 권한 0.
- 데이터 sparse → 정직하게 "내가 namu를 볼 때 관찰한 기록" 성격. 본격 순위 그래프는 범위 외.
- 기존 재활용: Phase 1 `layers/panel.ts`의 `updatePanel`(실검 읽는 지점), `discovery.extractCurrentKeywords(): KeywordState = Map<number,string>`, `chrome.storage` 헬퍼 패턴.

## 설계

### 1. 히스토리 저장 (`src/layers/history.ts` 신규)

- `recordSnapshot(keywords: KeywordState): void` — `{ t: epochSec, r: { [keyword]: rank } }` 형태 스냅샷을 `chrome.storage.local`의 `trendHistory` 배열에 append. 패널 `updatePanel`에서 실검 읽을 때마다 호출.
- **프루닝**: 최근 N(=300) 스냅샷 캡(초과 시 오래된 것부터 제거). chrome.storage.local 쿼터 ~5MB — 컴팩트 스냅샷이라 충분, `unlimitedStorage` 등 새 권한 불필요.
- **디바운스/중복 방지**: 동일 실검 셋이 연속이면 너무 잦은 append 피하려 직전 스냅샷과 동일하면 스킵(또는 최소 간격). (구현 시 단순화 가능 — 매 update 1 append + 캡으로도 무방.)

### 2. 키워드 인사이트 (`history.ts`)

- `getKeywordInsight(keyword: string): KeywordInsight | null` — 저장된 스냅샷을 스캔해서 계산:
  - `firstSeen`, `lastSeen` (epochSec) — 그 키워드가 든 가장 이른/늦은 스냅샷.
  - `observations` — 그 키워드가 든 스냅샷 수.
  - `bestRank` — 전 스냅샷 중 최소(최상위) 순위.
  - `sparkline: number[]` — 최근 K(=12) 관찰의 순위 시퀀스(스파크라인용).
  - 스냅샷이 없으면 `null`.
- `firstSeen` 기준 "처음 본 지 Nh/Nm"는 표시 시점에 `Date.now()`로 계산(확장 코드라 Date 사용 가능).

### 3. UI (Phase 1 패널 행에 추가형)

- 각 패널 행에 작은 `ⓘ` 어포던스 추가. 클릭 시 그 행 **아래에 인사이트 인라인 펼침**(floating popover 아님 → 위치계산 불필요, 테스트 쉬움). 다시 클릭하면 접힘.
- 인라인 내용: `처음 본 지 3시간 · 최고 1위 · 관찰 12회` + 미니 스파크라인.
- **스파크라인 = 유니코드 블록바**(`▁▂▃▄▅▆▇`). 순위를 바 높이로 매핑하되 **상위 순위 = 높은 바**(예: `height ∝ (maxRank - rank + 1)`). SVG 없이 경량.
- 다크/라이트는 기존 theseed-mode 스코프 따름.

### 4. 범위

- IN: 히스토리 저장(캡/프루닝) · 키워드 인사이트(firstSeen 지속·bestRank·observations·미니 스파크라인) · 패널 행 인라인 토글.
- OUT: 본격 순위 그래프 뷰, 워치리스트/알림, 백그라운드 캡처, jellhub 연동, AI.

### 5. 에러 처리

- `chrome.storage.local` 읽기/쓰기 실패 → graceful(히스토리 없이 패널 정상 동작). `getKeywordInsight`는 데이터 없으면 `null` → UI는 "기록 없음" 또는 ⓘ 비활성.
- 캡으로 무한 증식 방지.

### 6. 테스트 (`src/layers/history.test.ts`, JSDOM + chrome.storage mock)

- `recordSnapshot` append, 프루닝 캡(N 초과 시 오래된 것 제거), `getKeywordInsight` 통계(firstSeen/lastSeen/observations/bestRank/sparkline), 빈 데이터 → null, 스파크라인 순위→바 매핑(상위=높음).
- 패널: ⓘ 토글 시 인사이트 인라인 렌더/접힘.

### 7. 버전

- `1.4.0 → 1.5.0`. 권한 변경 없음.

## Roadmap 위치

- Phase 1(허브 패널) ✅ 완료(v1.4.0). **Phase 2(이 문서, 트렌드 히스토리)**. 워치리스트/알림(백그라운드 필요)은 명시적 범위 외 — 필요 시 별도. AI는 미도입.
