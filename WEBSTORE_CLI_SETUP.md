# Chrome Web Store CLI 배포 설정 가이드

v1.1부터 Chrome Web Store에 CLI 한 번으로 업로드 + 게시할 수 있도록 설정되어 있습니다.

```bash
npm run deploy
```

위 명령 한 줄이면 빌드 → zip 생성 → 업로드 → 게시까지 자동으로 처리합니다. 단, **처음 한 번만** 아래 OAuth 크리덴셜을 받아 `.env`에 채워 넣어야 합니다.

---

## 필요한 환경 변수 (최소 4개)

`.env.example`을 복사해서 `.env`로 저장한 뒤, 아래 4개 변수를 채웁니다. 이 4개가 전부입니다.

| 변수명          | 설명                                            |
| --------------- | ----------------------------------------------- |
| `EXTENSION_ID`  | Chrome Web Store 확장 프로그램 ID (32자 소문자) |
| `CLIENT_ID`     | Google Cloud OAuth2 Client ID                   |
| `CLIENT_SECRET` | Google Cloud OAuth2 Client Secret               |
| `REFRESH_TOKEN` | OAuth2 Refresh Token (장기 토큰)                |

> `.env`는 `.gitignore`에 이미 포함되어 있어 커밋되지 않습니다. **실제 값을 커밋하지 마세요.**

---

## 1단계 — `EXTENSION_ID` 찾기

1. [Chrome Web Store 개발자 대시보드](https://chrome.google.com/webstore/devconsole) 접속
2. 현재 게시된 `나무위키 아카라이브 링커 (v1.1)` 항목 클릭
3. 브라우저 주소창 URL 중간에 있는 32자 소문자 문자열이 `EXTENSION_ID`

   예: `https://chrome.google.com/webstore/devconsole/.../XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/...`

---

## 2단계 — Google Cloud 프로젝트 + OAuth Client 생성

### 2-1. Cloud Console 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 상단 프로젝트 선택기 → **새 프로젝트** → 이름: `namu-arca-linker-deploy` (예시)

### 2-2. Chrome Web Store API 활성화

1. 좌측 메뉴 → **API 및 서비스** → **라이브러리**
2. 검색창에 `Chrome Web Store API` → 클릭 → **사용 설정 (Enable)**

### 2-3. OAuth 동의 화면 설정

1. **API 및 서비스** → **OAuth 동의 화면**
2. User Type: **외부(External)** 선택 → 만들기
3. 앱 이름: `Namu Arca Linker Deploy`, 지원 이메일: 본인 이메일
4. 범위(Scopes) 단계: `.../auth/chromewebstore` 추가 (없으면 `Add or Remove Scopes` → 수동 입력)
5. 테스트 사용자(Test users): 본인 Google 계정 이메일 추가
6. 저장

### 2-4. OAuth Client ID 발급

1. **API 및 서비스** → **사용자 인증 정보(Credentials)**
2. **사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
3. **애플리케이션 유형: 데스크톱 앱(Desktop app)** 선택 ← 중요
4. 이름: `Chrome Webstore CLI`
5. 만들기 → 팝업에 표시되는 `Client ID`와 `Client Secret`을 복사해 `.env`에 붙여넣기

---

## 3단계 — `REFRESH_TOKEN` 발급

가장 간편한 방법은 공식 헬퍼 스크립트를 사용하는 것입니다.

```bash
npx chrome-webstore-upload-keys
```

실행하면:

1. 방금 받은 `CLIENT_ID`와 `CLIENT_SECRET`을 물어봅니다 → 붙여넣기
2. 브라우저가 자동으로 열리며 Google 로그인 → 테스트 사용자로 추가한 계정 선택
3. `chromewebstore` 권한 동의
4. 터미널에 `Refresh Token`이 출력됨 → 복사해 `.env`의 `REFRESH_TOKEN`에 붙여넣기

> 자세한 공식 가이드: https://github.com/fregante/chrome-webstore-upload-keys

---

## 4단계 — `.env` 파일 채우기

프로젝트 루트에서:

```bash
cp .env.example .env
```

그리고 에디터로 열어 아래 4개를 실제 값으로 교체:

```env
EXTENSION_ID="abcdefghijklmnopqrstuvwxyzabcdef"
CLIENT_ID="123456789012-xxxxxxxxxxxxx.apps.googleusercontent.com"
CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
REFRESH_TOKEN="1//0abcdefghijklmnopqrstuvwxyz..."
```

---

## 5단계 — 배포 실행

`manifest.json`과 `package.json`의 `version`을 새 버전으로 올린 뒤:

```bash
npm run deploy
```

내부적으로 다음이 차례로 실행됩니다:

1. `npm run release` — 테스트 + 린트 + 빌드 + `release/namu_arca_linker-v<version>.zip` 생성
2. `npm run deploy:upload` — 생성된 zip을 Web Store로 업로드 (Draft 상태)
3. `npm run deploy:publish` — Draft를 공개 게시

성공 시 Web Store 검수(Review) 큐에 들어가며, 승인되면 자동 공개됩니다.

---

## 트러블슈팅

| 증상                                             | 원인 / 해결                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `invalid_grant` 에러                             | `REFRESH_TOKEN` 만료 또는 잘못됨 → 3단계를 다시 수행                                             |
| `Chrome Web Store API has not been used`         | 2-2 단계(Chrome Web Store API 활성화)를 건너뜀                                                   |
| `Forbidden: The caller does not have permission` | OAuth 동의 화면에서 본인 계정을 **테스트 사용자**로 추가하지 않음                                |
| `Cannot find source zip`                         | `package.json`의 `version`과 `release/` 안 zip 파일명이 일치하지 않음 → `npm run release` 재실행 |
| `Item not found`                                 | `EXTENSION_ID`가 틀림 또는 해당 확장의 소유자 계정이 아님                                        |

---

## 다음 릴리즈 체크리스트

- [ ] `manifest.json`의 `version` 업데이트
- [ ] `package.json`의 `version` 업데이트 (두 값 일치 필수)
- [ ] `CHANGELOG.md`에 변경사항 추가
- [ ] `npm run deploy` 실행
- [ ] Web Store 검수 통과 확인 (보통 1~3일)
