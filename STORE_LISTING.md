# Chrome Web Store Listing — 나무위키 실검 아카라이브 링커

This file contains copy-paste ready content for the Chrome Web Store developer console submission.

- **Package version**: 1.5.4
- **Submittable zip**: `release/namu_arca_linker-v1.5.4.zip`
- **Manifest**: Manifest V3
- **릴리즈 성격**: 업데이트 (스토어 현재 v1.5.3, item `fhmagpkcdpcnmbihkgdcmabidcmdmpgl`)
- **요청 권한은 1.5.3 과 동일하다** — `storage`, `declarativeNetRequest` + 호스트 권한 2개.
  **새 권한이 없으므로 권한 재검토가 붙지 않는다.** (한때 `sidePanel`·`alarms` 를 추가하는
  1.6.0 이 있었으나 게시 전에 되돌렸다 — CHANGELOG 1.5.3 참조.)

---

## 1. Name (max 45 chars)

```
나무위키 실검 아카라이브 링커
```

(14 chars, safely within limit)

---

## 2. Short description (max 132 chars)

```
나무위키 실시간 검색어가 왜 떴는지, 마우스만 올리면 보입니다. 아카라이브 실검챈의 설명 글을 찾아 미리보기와 바로가기 링크를 붙여 줍니다.
```

(78자, 132자 제한 이내)

---

## 3. Category

```
생산성 (Productivity)
```

대체 후보: 접근성(Accessibility) — 주 기능이 탐색을 빠르게 도와주는 성격이므로 생산성이 더 적합.

---

## 4. Language

```
한국어 (ko)
```

---

## 5. Detailed description (max 16,000 chars)

```
나무위키 실시간 검색어에 처음 보는 이름이 떴을 때, "이거 왜 떴지?"를 클릭 한 번 없이 알려주는 확장 프로그램입니다.

## 이런 때 씁니다

나무위키는 실시간 검색어가 왜 올라왔는지 알려주지 않습니다. 이유를 알려면 검색어를 복사해 다른 곳에서 다시 찾아야 했습니다. 아카라이브에는 나무위키 실검을 하나하나 설명해 주는 채널(실검챈, namuhotnow)이 있고, 이 확장 프로그램은 실검 옆에 그 설명 글을 바로 이어 줍니다.

## 주요 기능

- 마우스만 올리면 이유가 보입니다: 💬 배지에 마우스를 올리면 실검챈 글의 본문 앞부분, 분류, 댓글 수, 작성 시각이 말풍선으로 뜹니다. (1.5.4 신규)
- 설명 글로 바로 갑니다: 검색어에 맞는 실검챈 글이 있으면 💬 배지가 붙고, 누르면 그 글이 새 탭으로 열립니다. 배지의 숫자는 댓글 수입니다.
- 글이 아직 없으면 검색으로: 맞는 글이 없을 때는 🔎 배지가 붙고, 누르면 실검챈에서 그 검색어를 검색합니다.
- 실검이 바뀌면 따라갑니다: 순위가 바뀌거나 새 검색어가 올라오면 배지도 함께 바뀝니다.
- 나무위키 화면에 맞춥니다: 라이트/다크 테마를 따라가고, 실검 목록의 모양을 건드리지 않습니다.
- 키보드로도 됩니다: Tab으로 배지에 포커스하면 미리보기가 열리고 Esc로 닫힙니다.

## 작동 방식

나무위키(namu.wiki)에서만 동작합니다. 페이지의 실시간 검색어를 읽고, 아카라이브 실검챈의 최근 글 목록을 가져와 브라우저 안에서 검색어와 맞춰 봅니다. 미리보기 본문은 배지에 마우스를 올린 순간에만 그 글 하나를 조회합니다.

## 권한 안내

- storage: 켜기/끄기 상태 등 설정을 브라우저에 저장합니다.
- namu.wiki 접근: 실시간 검색어 옆에 배지를 붙이기 위해 필요합니다.
- arca.live 접근: 실검챈 글 목록과 미리보기 본문을 조회하기 위해 필요합니다.
- declarativeNetRequest: 위 arca.live 조회 요청의 헤더(User-Agent)를 맞추는 데만 씁니다. 다른 요청을 막거나 바꾸지 않습니다.

## 개인정보

- 개인정보를 수집하지 않습니다. 개발자 서버가 없고, 광고·분석·추적 도구를 쓰지 않습니다.
- 외부 요청은 arca.live의 실검챈 글 목록·본문 조회뿐이며, 여기에 사용자 정보나 열람 기록은 실리지 않습니다.
- 설정값은 브라우저 안에만 저장됩니다.

## 문의

버그 제보와 제안은 GitHub Issues로 보내 주세요.
https://github.com/jellive/namu_arca_linker

소스 코드는 같은 저장소에 공개되어 있습니다.
```

(약 1,300자, 16,000자 제한 대비 여유 충분)

---

## 6. Privacy policy (paste in 개인정보 처리방침 섹션)

```
본 확장 프로그램(나무위키 실검 아카라이브 링커)은 사용자의 개인정보를 수집하지 않습니다. 확장 프로그램은 나무위키(namu.wiki) 페이지에서만 동작하며, 실시간 검색어를 읽어 배지를 붙이는 작업은 사용자의 브라우저 안에서 이루어집니다. 외부 요청은 아카라이브(arca.live) 실검챈 채널의 공개 글 목록 조회와, 사용자가 배지에 마우스를 올렸을 때 해당 글 하나의 본문 조회뿐입니다. 이 요청에는 글 번호와 브라우저에서 무작위로 만든 토큰만 실리며, 사용자의 개인정보·검색어·클릭 내역·페이지 내용은 전송되지 않고 제3자와 공유되지 않습니다. 설정값과 토큰은 브라우저의 chrome.storage 에만 저장됩니다. 개발자 서버, 광고, 분석 도구, 외부 추적 스크립트가 없습니다.
```

호스팅된 정책 URL이 필요할 경우 저장소의 `PRIVACY.md`를 제출 양식에 입력하십시오: `https://github.com/jellive/namu_arca_linker/blob/main/PRIVACY.md`.

---

## 7. Screenshots (need to capture)

Chrome Web Store requires 1~5 screenshots. Dimensions: **1280x800** (권장) 또는 **640x400**. PNG 또는 JPEG.

촬영본 (1280x800 PNG, `docs/store-screenshots/`):

1. `01-preview-light.png` — 라이트 테마. 실검 1위의 💬 배지에 마우스를 올려 미리보기 말풍선이 뜬 상태. (필수, 첫 장)
2. `02-preview-dark.png` — 다크 테마에서 같은 장면.

스토어에 올릴 때:

- [ ] 개발자 콘솔 → 스토어 등록정보 → 스크린샷에서 기존 이미지를 지우고 위 두 장을 순서대로 올린다
- [ ] 찍힌 실검에 민감한 키워드가 없는지 올리기 전에 한 번 본다 (다시 찍으려면 빌드 후 확장을 올린 Chrome 에서 같은 장면을 캡처)

---

## 8. Promo tile (optional but recommended)

- **Small promo tile**: 440x280 PNG/JPEG
- **Large promo tile (선택)**: 920x680 PNG/JPEG
- **Marquee promo tile (선택)**: 1400x560

Small tile 제작 가이드:

- 텍스트: "나무위키 실검 → 아카라이브 한 번에"
- 배경: 밝은 그라데이션 또는 단색
- 확장 프로그램 아이콘(icons/icon128.png) 좌측 배치
- 읽기 쉬운 굵은 한글 폰트 (예: Pretendard Bold)

저장소에 `generate-promo-image.html` 이 있으니 해당 파일을 브라우저에서 열어 기본 틀을 얻을 수 있습니다.

---

## 9. Store listing URL fields

- **Official URL**: https://github.com/jellive/namu_arca_linker
- **Homepage URL**: https://github.com/jellive/namu_arca_linker
- **Support URL**: https://github.com/jellive/namu_arca_linker/issues

---

## 10. Permissions justification (권한 소명 — required for publishing)

Chrome Web Store 심사 양식에서 각 권한의 사용 목적을 묻습니다. 아래 문장을 그대로 복사해 사용하세요.

- **storage 권한 사용 사유**

  ```
  팝업의 켜기/끄기 토글 값과 아카라이브 조회에 쓰는 임의 생성 기기 토큰을 브라우저 로컬(chrome.storage.local)에 저장해 다음 세션에도 유지되도록 하기 위해 사용합니다. 토글 값은 외부로 전송되지 않으며, 기기 토큰은 arca.live 조회 요청의 헤더로만 전달됩니다. 개발자 서버나 제3자에게는 어떤 값도 전송되지 않습니다.
  ```

- **host_permissions (namu.wiki) 사용 사유**

  ```
  나무위키 페이지의 실시간 검색어 DOM을 읽고, 각 검색어 옆에 스마트 링크(아카라이브 매칭 게시글 직링크 또는 검색 링크)와 미리보기 말풍선을 주입하기 위해 필요합니다. 그 외 용도로 사용하지 않습니다.
  ```

- **host_permissions (arca.live) 사용 사유**

  ```
  백그라운드 서비스 워커가 아카라이브 실검챈(namuhotnow) 게시글 목록을 조회해 나무위키 실시간 검색어와 매칭하고, 사용자가 배지에 마우스를 올렸을 때 해당 게시글 하나의 본문을 조회해 미리보기로 보여주기 위해 필요합니다. arca.live 페이지 DOM을 읽거나 수정하지 않으며, 실검챈의 공개 글 조회에만 사용합니다.
  ```

- **declarativeNetRequest 권한 사용 사유**

  ```
  arca.live 실검챈 글 목록·본문 조회 API 요청에 앱 User-Agent를 지정하기 위해 요청 헤더를 수정하는 데 사용합니다. 그 두 종류의 요청에만 적용되며, 요청을 차단하거나 사용자를 추적하지 않습니다.
  ```

- **원격 코드 사용 여부**

  ```
  사용하지 않습니다. 모든 스크립트는 확장 프로그램 패키지에 포함된 정적 JS 파일입니다 (Vite + Terser로 번들, Manifest V3 CSP 준수: script-src 'self').
  ```

- **데이터 사용 공시 (Data Use Disclosure)**
  - 개인 식별 정보: 수집 안 함
  - 건강 정보: 수집 안 함
  - 금융/결제 정보: 수집 안 함
  - 인증 정보: 수집 안 함
  - 개인 통신: 수집 안 함
  - 위치 정보: 수집 안 함
  - 웹 내역: 수집 안 함
  - 사용자 활동: 수집 안 함
  - 웹 사이트 콘텐츠: **읽기만 — 나무위키 실시간 검색어 목록을 로컬에서 파싱. 전송 없음.**

  선언 체크박스:
  - [x] 데이터를 승인되지 않은 용도로 판매하거나 이전하지 않습니다.
  - [x] 데이터를 승인되지 않은 용도로 사용하거나 전송하지 않습니다.
  - [x] 데이터를 신용도 평가 또는 대출 목적으로 사용하거나 전송하지 않습니다.

---

## 11. Submission checklist (for Jell)

Chrome Web Store Developer Console 에서 수행할 단계입니다. 코드/패키지 준비는 모두 끝났습니다.

⚠️ **이미 게시된 항목의 업데이트다 — "새 항목"이 아니다.** 아래 1~2번은 최초 등록 때의
잔재이며 지금은 해당하지 않는다. 기존 항목 `fhmagpkcdpcnmbihkgdcmabidcmdmpgl` 을 열어
새 패키지를 업로드한다. CLI 경로(`npm run deploy:upload && npm run deploy:publish`)를 쓰면
이 절차 대신 자동화된다.

1. ~~https://chrome.google.com/webstore/devconsole 접속~~ (최초 등록 시)
2. ~~일회성 등록비 $5 USD 결제~~ (완료됨)
3. 기존 항목 → "패키지" → `release/namu_arca_linker-v1.5.4.zip` 업로드.
4. 본 문서 1~6 항목을 해당 입력란에 복사/붙여넣기 (이름, 짧은 설명, 상세 설명, 카테고리, 언어, 개인정보 처리방침).
5. 7번 항목을 참고해 스크린샷 3~5장 촬영 후 업로드 (1280x800).
6. 8번 항목을 참고해 440x280 프로모 타일 제작 후 업로드.
7. 9번 URL 입력.
8. 10번 권한 소명 복사/붙여넣기 + Data Use Disclosure 체크.
9. 미리보기 확인 후 "검토 제출".
10. 심사 대기 (보통 1~3영업일). 반려 사유 수신 시 내용에 맞춰 수정 후 재업로드.
