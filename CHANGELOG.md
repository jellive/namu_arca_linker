# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
