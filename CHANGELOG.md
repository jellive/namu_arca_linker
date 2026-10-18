# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **옵션 페이지와 "대상 사이트 목록".** 1.5.0 에서 사이트별 링크 여러 개를 아카라이브 글 하나로
  바로 가는 스마트 링크로 바꾼 뒤로, 옵션에서 저장한 사이트 목록을 읽는 코드가 없었다 — 고쳐
  저장해도 아무 일도 일어나지 않는 설정 화면이었다. 옵션 페이지, 팝업의 "설정 (사이트 커스텀)"
  버튼, `chrome.storage.sync` 읽기를 걷어냈다. 예전에 저장된 `targetSites` 값은 지우지 않고 그대로
  두며 더 이상 읽지 않는다.
- 팝업의 "감지된 검색어" 숫자. 그 값을 저장하는 코드가 없어서 항상 0 이었다.
- `styles.css` 의 "실검 인텔리전스 허브" 패널 스타일(`.arca-hub*`). 1.5.0 에서 패널을 걷어낸 뒤
  남아 있던 규칙이다.

### Fixed

- **팝업에서 끄면 배지가 사라진다.** 전에는 꺼도 붙어 있던 배지가 그대로 남았고, 실검이 바뀌면
  계속 새로 붙었다. 이제 끄는 즉시 배지를 걷어내고, 꺼진 동안에는 아카라이브 조회도 하지 않는다.
- **꺼진 채로 연 페이지에서 켜면 실검 변화도 따라간다.** 전에는 켤 때 배지만 한 번 붙고 감시가
  시작되지 않아, 그 뒤 바뀐 검색어에는 배지가 붙지 않았다.
- `package.json` 의 license 표기를 LICENSE 파일과 같은 MIT 로 맞췄다(ISC 로 적혀 있었다).

### Security

- 개발 의존성 권고 반영(brace-expansion, qs, fast-uri, source-map-js). 락파일만 바뀌었고 배포되는
  확장 코드에는 들어가지 않는 패키지들이다.

## [1.5.4] - 2026-10-12

### Added

- **토론글 미리보기.** 💬 배지에 마우스를 올리거나 키보드로 포커스하면, 매칭된 실검챈 글의
  분류·댓글 수·작성 시각과 **본문 앞부분(최대 140자)** 을 말풍선으로 보여준다. 실검챈 글의
  제목은 키워드 나열이고 "왜 떴는지"는 본문에 있어서, 클릭하지 않고도 이유를 읽을 수 있다.
  본문은 올린 순간에만 조회하고(글마다 1회, 메모리 캐시) 스포일러 표시 글은 본문 대신 안내
  문구를 보여준다. 요청 권한은 그대로다(`storage`·`declarativeNetRequest`).

### Fixed

- 실검이 바뀌는 순간 같은 줄에 링크 배지가 **두 개** 붙는 경우가 있었다. 기존 배지를 200ms
  동안 흐리게 하는 사이 전체 재동기화가 같은 줄을 먼저 고치면 새 배지가 하나 더 붙었다.
  이제 새 배지를 붙이기 직전에 그 줄의 배지를 정리한다.

## [1.5.3] - 2026-08-24

### Removed

- **사이드 패널과 실검 스냅샷 기능을 되돌렸다** (구 1.6.0, 게시된 적 없음). 사이드 패널
  (`chrome.sidePanel`), 5분 주기 스냅샷 알람(`chrome.alarms`), NEW/▲/▼ 변화 배지가 여기
  해당한다. 코드는 `backup/pre-1.6.0-revert-20260824` 브랜치에 남아 있다.

  **이유:** 이 확장이 하는 일은 "실검 옆에 링크를 붙인다"이고, 표면 하나를 통째로 더하고
  백그라운드 알람과 스냅샷 이력을 적립하며 권한 2개(`sidePanel`·`alarms`)를 더 받는 것은
  그 범위를 벗어난다는 판단이다. 결과적으로 요청 권한은 `storage`·`declarativeNetRequest`
  두 개로 되돌아왔다.

### Changed

- 개발 의존성 보안 패치: `@babel/core`·`qs`·`js-yaml`·`nanoid`·`brace-expansion`(eslint /
  stryker / typescript-eslint 하위)·`fast-uri` override 적용. **전부 빌드 도구 한정이며
  런타임 영향 없음.**

## [1.5.2] - 2026-07-12

### Fixed

- 빈 catch 블록 제거: `sanitizeUrl` (manipulation.ts), `isAllowedUrl` (options.ts)에 의미 있는 `console.warn` 로깅 추가
- `chrome.storage` 콜백에 `chrome.runtime.lastError` 체크 추가 (content.ts, popup.ts, options.ts)
- `saveSites` 저장 실패 시 사용자에게 오류 메시지 표시

### Changed

- 개발 의존성 보안 패치: `vite` ^7.3.5, `undici`/`esbuild` override 적용 (Dependabot 알림 대응, 빌드 도구 한정으로 런타임 영향 없음)

## [1.5.1] - 2026-06-12

### Fixed

- 나무위키 실검 순위가 바뀔 때 갱신되지 않고 남아있던 stale 링크 self-heal: 컨테이너에 키워드를 저장해두고 anchor의 현재 키워드와 다르면 교체하도록 변경

### Removed

- 우측 독 패널 제거에 따라 obsolete해진 `hideInlineLinks` 옵션 제거

## [1.5.0] - 2026-06-10

**namu 2.0 Phase 1**

### Added

- 백그라운드 서비스 워커(`dist/background.js`) 도입 (MV3)
- 아카라이브 앱 API 연동으로 실검 키워드 ↔ 실검챈(`namuhotnow`) 게시글 스마트 매칭 — 💬 토론글 직링크 / 🔎 검색 링크
- `declarativeNetRequest`로 arca.live API 요청에 앱 User-Agent 스푸핑

### Removed

- 우측 독 패널(`panel.ts`/`trends.ts`) 제거 — 1.4.0에서 추가됐던 실험 기능 회수

## [1.4.0] - 2026-06-09

### Added

- 우측 독 패널(hub panel) 프로토타입 — 실검 랭킹 + 트렌드 배지 표시 (1.5.0에서 제거됨, 아래 참고)

## [1.3.0] - 2026-06-08

### Added

- 멀티 사이트 퀵링크: 기본 대상 사이트 5개로 확장, 사이트별 짧은 라벨(short label) 옵션 추가
- 여러 사이트 링크를 함께 감싸는(wrapping) 멀티링크 컨테이너 스타일

## [1.2.0] - 2025-12-01

### Added

- TypeScript + Vite 빌드 시스템으로 전면 마이그레이션
- Popup UI (토글 스위치, 활성화 상태, 검색어 카운트 표시)
- Options UI (대상 사이트 목록 관리, 추가/삭제/저장/초기화)
- 20개 이상 단위 테스트 (manipulation, DOM 라우팅 커버)
- `chrome-webstore-upload-cli` 기반 원커맨드 배포 스크립트
- 레이어 분리: `layers/manipulation.ts`, `layers/detection.ts`, `layers/discovery.ts`, `layers/observer.ts`
- `constants/config.ts`, `constants/selectors.ts` — 상수 중앙화

### Changed

- 스토리지 권한 최적화: 미사용 `storage` 권한 제거
- 코드베이스 전체 TypeScript strict 모드 적용

## [1.1.0] - 2025-11-10

### Added

- **실시간 검색어 변경 추적 기능**
  - MutationObserver에 attributes 감지 추가 (href 속성 변경 감지)
  - 검색어 추가/변경/삭제 자동 감지 (Diff 알고리즘)
  - keywordCache Map을 사용한 이전 상태 저장
  - 검색어 변경 타입 분류: added, modified, removed

- **링크 업데이트 시스템**
  - Fade 애니메이션 (200ms) 적용
  - 변경된 검색어만 선택적으로 업데이트
  - createArcaLink() 함수 분리로 재사용성 향상
  - updateExistingLink() 함수로 부드러운 전환 효과

### Changed

- onRealtimeSearchChanged() 함수를 async로 변경
- 전체 링크 재생성 방식에서 변경된 항목만 업데이트하는 방식으로 개선
- CSS transition 시간을 0.15s → 0.2s로 변경

### Technical Details

- 함수 추가:
  - `extractKeywordFromLink()` - 링크에서 검색어 추출
  - `extractCurrentKeywords()` - 현재 DOM의 모든 검색어 추출
  - `getRealtimeLinkByRank()` - 순위로 링크 요소 찾기
  - `detectKeywordChanges()` - Diff 계산 및 변경 감지
  - `createArcaLink()` - 링크 DOM 요소 생성
  - `addNewLink()` - 새 링크 추가
  - `updateExistingLink()` - 기존 링크 업데이트 (Fade 애니메이션)
  - `updateArcaLink()` - 메인 코디네이터

- JSDoc 타입 정의:
  - `KeywordChange` typedef (type, rank, oldKeyword, newKeyword, element)

## [1.0.0] - 2025-10-08

### Added

- 나무위키 실시간 검색어 자동 감지
- 각 검색어 옆에 아카라이브 링크 추가 ("왜?")
- 아카라이브 나무위키 실검 채널 (`/b/namuhotnow`) 검색 연동
- MutationObserver를 통한 실검 갱신 감지
- 다크모드/라이트모드 자동 테마 지원
- 반응형 디자인 (모바일 지원)
- Chrome Extension Manifest V3 기반

### Technical Details

- 다중 CSS 선택자 폴백 시스템
- data-arca-processed 속성으로 중복 방지
- Reflow 최적화된 DOM 조작
- 접근성 고려 (포커스 상태, outline)
