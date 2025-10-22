# 나무위키 실검 아카라이브 링커

나무위키 실시간 검색어 옆에 아카라이브 링크를 자동으로 추가해주는 Chrome Extension입니다.

## 📋 프로젝트 개요

- **타입**: Chrome Extension (Manifest V3)
- **목적**: 나무위키 실시간 검색어에서 아카라이브로 빠르게 이동

## 🎯 주요 기능

- ✅ 나무위키 실시간 검색어 자동 감지
- ✅ 각 검색어 옆에 아카라이브 링크 추가 (왜?)
- ✅ **아카라이브 나무위키 실검 채널** (`/b/namuhotnow`)에서 해당 키워드 검색
- ✅ 실검 갱신 시 자동으로 링크 업데이트
- ✅ 다크모드/라이트모드 지원
- ✅ 반응형 디자인

## 📦 설치 방법

### Chrome 웹스토어에서 설치 (출시 예정)

**현재 Chrome 웹스토어 제출 준비 중입니다!**

출시 후 링크가 추가될 예정입니다.

### 로컬에서 개발자 모드로 설치

1. 이 저장소를 클론하거나 다운로드합니다.

   ```bash
   git clone https://github.com/[username]/namu_arca.git
   cd namu_arca
   ```

2. Chrome 브라우저를 엽니다.

3. 주소창에 `chrome://extensions/` 를 입력합니다.

4. 우측 상단의 **"개발자 모드"** 를 활성화합니다.

5. **"압축 해제된 확장 프로그램 로드"** 버튼을 클릭합니다.

6. 다운로드한 프로젝트 폴더를 선택합니다.

7. 익스텐션이 설치되었습니다! 🎉

### 2. 아이콘 추가 (선택사항)

`icons/` 폴더에 다음 크기의 아이콘을 추가하세요:

- `icon16.png` - 16x16 픽셀
- `icon48.png` - 48x48 픽셀
- `icon128.png` - 128x128 픽셀

아이콘 없이도 익스텐션은 정상 작동합니다.

## 🚀 사용 방법

1. [나무위키](https://namu.wiki) 메인 페이지에 접속합니다.

2. 실시간 검색어 섹션을 확인합니다.

3. 각 검색어 옆에 **왜?** 링크가 자동으로 추가됩니다.

4. 링크를 클릭하면 아카라이브 나무위키 실검 채널(`/b/namuhotnow`)의 해당 키워드 검색 결과로 이동합니다.

## 🛠️ 기술 스택

- **JavaScript** (Vanilla)
- **Chrome Extension API**
  - Content Scripts
  - MutationObserver
- **CSS** (다크모드 지원)
- **Manifest V3**

## 📁 프로젝트 구조

```
namu_arca/
├── manifest.json          # Chrome Extension 설정
├── content.js            # 메인 로직 (DOM 조작, 링크 추가)
├── styles.css            # 링크 스타일링
├── icons/                # 아이콘 이미지 폴더
│   └── README.md         # 아이콘 추가 안내
└── README.md             # 프로젝트 설명
```

## 🔍 작동 원리

### 1. 실검 감지

여러 CSS 선택자를 시도하여 나무위키의 실시간 검색어를 찾습니다:

```javascript
const REALTIME_SELECTORS = [
  '[class*="realtime"] li a',
  '[class*="trending"] li a',
  '[class*="popular"] li a'
  // ... 더 많은 선택자
]
```

### 2. 아카라이브 링크 생성

각 검색어에 대해 아카라이브 `/b/namuhotnow` 채널 검색 URL을 생성합니다:

```javascript
function getArcaSearchUrl(keyword) {
  const encodedKeyword = encodeURIComponent(keyword)
  return `https://arca.live/b/namuhotnow?target=all&keyword=${encodedKeyword}`
}
```

### 3. 동적 감지

MutationObserver를 사용하여 실검 업데이트를 자동으로 감지합니다:

```javascript
const observer = new MutationObserver(mutations => {
  // 실검이 업데이트되면 링크 재생성
  addArcaLinks()
})
```

## 🧪 디버깅 및 테스트

### 콘솔 로그 확인

1. 나무위키 페이지에서 `F12`를 눌러 개발자 도구를 엽니다.

2. **Console** 탭을 확인합니다.

3. 다음과 같은 로그를 확인할 수 있습니다:
   ```
   [나무위키 아카링커] 익스텐션 시작
   [나무위키 아카링커] 선택자 "..." 로 N개 항목 발견
   [나무위키 아카링커] N개 항목에 링크 추가 완료
   ```

### 실검을 찾지 못하는 경우

로그에 "실시간 검색어를 찾을 수 없습니다"가 표시되는 경우:

1. 개발자 도구(F12)에서 **Elements** 탭을 엽니다.

2. 실시간 검색어 섹션을 찾아 HTML 구조를 확인합니다.

3. 정확한 클래스명이나 ID를 파악합니다.

4. `content.js`의 `REALTIME_SELECTORS` 배열에 해당 선택자를 추가합니다:

   ```javascript
   const REALTIME_SELECTORS = [
     // 기존 선택자들...
     '.your-new-selector' // 여기에 추가
   ]
   ```

5. 익스텐션을 새로고침합니다 (`chrome://extensions/`에서 🔄 버튼 클릭).

## 🎨 커스터마이징

### 링크 텍스트 변경

`content.js`에서 링크 텍스트를 변경할 수 있습니다:

```javascript
arcaLink.textContent = '왜?' // 원하는 텍스트로 변경
```

### 스타일 변경

`styles.css`에서 링크의 색상, 크기, 모양 등을 변경할 수 있습니다:

```css
.arca-link {
  color: #0066cc; /* 색상 변경 */
  font-size: 11px; /* 크기 변경 */
  border-radius: 3px; /* 둥근 모서리 */
  /* ... */
}
```

### 아카라이브 채널 변경

기본적으로 나무위키 실검 채널(`/b/namuhotnow`)로 연결됩니다.
다른 채널로 변경하려면 `content.js`의 `getArcaSearchUrl` 함수를 수정하세요:

```javascript
function getArcaSearchUrl(keyword) {
  const encodedKeyword = encodeURIComponent(keyword)
  return `https://arca.live/b/your-channel?target=all&keyword=${encodedKeyword}` // 채널 변경
}
```

## 🐛 알려진 이슈

1. **실검을 찾지 못하는 경우**

   - 나무위키 구조가 변경되었을 수 있습니다.
   - 위의 "디버깅 및 테스트" 섹션을 참고하세요.

2. **링크가 중복 생성되는 경우**
   - 페이지를 새로고침하면 해결됩니다.
   - 지속되는 경우 이슈를 제보해주세요.

## 🤝 기여하기

버그 제보, 기능 제안, Pull Request 모두 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 문의

프로젝트 링크: [https://github.com/jellive/namu_arca_linker](https://github.com/jellive/namu_arca_linker)

## 🎉 감사의 말

- [나무위키](https://namu.wiki) - 실시간 검색어 데이터 제공
- [아카라이브](https://arca.live) - 커뮤니티 플랫폼

---

#chrome-extension #side-project #namuwiki #arca-live #Jell
