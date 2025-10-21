/**
 * 나무위키 실검 아카라이브 링커
 * 나무위키 실시간 검색어 옆에 아카라이브 링크를 추가합니다.
 */

/**
 * 아카라이브 검색 URL 생성
 * @param {string} keyword - 검색 키워드
 * @returns {string} 아카라이브 검색 URL
 */
function getArcaSearchUrl(keyword) {
  const encodedKeyword = encodeURIComponent(keyword)
  return `https://arca.live/b/namuhotnow?target=all&keyword=${encodedKeyword}`
}

/**
 * 나무위키에서 실검 항목을 찾기 위한 선택자 배열
 * href="/Go?q=" 패턴을 가진 링크가 실검의 특징
 */
const REALTIME_SELECTORS = [
  // 가장 안정적: href 패턴 기반 (나무위키 실검은 /Go?q= 로 시작)
  'a[href^="/Go?q="]',

  // 폴백 선택자들
  '[class*="realtime"] li a',
  '[class*="trending"] li a',
  '[class*="popular"] li a',
  '[class*="ranking"] li a',
  '[class*="hot"] li a',

  // ID 기반
  '#realtime-keywords li a',
  '#trending-keywords li a',

  // 리스트 항목
  '.realtime-list li a',
  '.trending-list li a',

  // 사이드바 관련
  '[class*="sidebar"] [class*="realtime"] a',
  '[class*="sidebar"] [class*="trending"] a'
]

/**
 * 실시간 검색어 항목에 아카라이브 링크 추가
 */
async function addArcaLinks() {
  let realtimeItems = []
  let usedSelector = ''

  // 여러 선택자를 시도하여 실검 항목 찾기
  for (const selector of REALTIME_SELECTORS) {
    const items = document.querySelectorAll(selector)
    if (items.length > 0) {
      realtimeItems = items
      usedSelector = selector
      console.log(
        `[나무위키 아카링커] 선택자 "${selector}"로 ${items.length}개 항목 발견`
      )
      break
    }
  }

  // 선택자로 찾지 못한 경우, 대안 방법 시도
  if (realtimeItems.length === 0) {
    // "실시간" 텍스트가 포함된 섹션 찾기
    const allSections = document.querySelectorAll(
      'section, div[class*="section"], aside'
    )
    for (const section of allSections) {
      const heading = section.querySelector('h2, h3, h4, .title, .heading')
      if (
        heading &&
        (heading.textContent.includes('실시간') ||
          heading.textContent.includes('인기'))
      ) {
        const links = section.querySelectorAll('a')
        if (links.length > 0) {
          realtimeItems = links
          usedSelector = '텍스트 기반 검색'
          console.log(
            `[나무위키 아카링커] 텍스트 기반으로 ${links.length}개 항목 발견`
          )
          break
        }
      }
    }
  }

  if (realtimeItems.length === 0) {
    console.log('[나무위키 아카링커] 실시간 검색어를 찾을 수 없습니다.')
    console.log(
      '[나무위키 아카링커] 개발자 도구(F12)로 DOM 구조를 확인하고 선택자를 업데이트해주세요.'
    )
    return
  }

  let addedCount = 0

  // forEach 대신 for...of 사용 (async/await 지원)
  for (const item of realtimeItems) {
    // 이미 처리된 링크인지 data 속성으로 확인
    if (item.hasAttribute('data-arca-processed')) {
      continue
    }

    // 검색어 추출 (우선순위: title 속성 > textContent)
    const keyword = item.getAttribute('title') || item.textContent.trim()

    if (!keyword || keyword.length === 0) {
      continue
    }

    // 숫자만 있는 경우 (순위 표시) 스킵
    if (/^\d+$/.test(keyword)) {
      continue
    }

    // 처리 완료 표시 (중복 방지)
    item.setAttribute('data-arca-processed', 'true')

    // 아카라이브 검색 URL 생성
    const arcaUrl = getArcaSearchUrl(keyword)

    // 아카라이브 링크 생성
    const arcaLink = document.createElement('a')
    arcaLink.href = arcaUrl
    arcaLink.className = 'arca-link'
    arcaLink.textContent = '왜?'
    arcaLink.target = '_blank'
    arcaLink.title = `아카라이브 "${keyword}" 검색`

    // 클릭 이벤트 로깅
    arcaLink.addEventListener('click', e => {
      console.log(`[나무위키 아카링커] 클릭: ${keyword} → ${arcaUrl}`)
      // 이벤트 버블링 방지
      e.stopPropagation()
    })

    // 링크 삽입 위치 결정
    // 링크의 부모 요소가 li인 경우 li에 추가
    const parentLi = item.closest('li')
    if (parentLi && !parentLi.querySelector('.arca-link')) {
      parentLi.appendChild(arcaLink)
      addedCount++
    } else if (
      !item.nextElementSibling ||
      !item.nextElementSibling.classList.contains('arca-link')
    ) {
      // 그 외의 경우 링크 바로 다음에 추가 (중복 확인)
      item.parentNode.insertBefore(arcaLink, item.nextSibling)
      addedCount++
    }
  }

  console.log(
    `[나무위키 아카링커] ${addedCount}개 항목에 링크 추가 완료 (선택자: ${usedSelector})`
  )
}

/**
 * 실검 컨테이너를 찾기 위한 선택자 배열
 * /Go?q= 링크를 포함하는 ul을 찾는 것이 가장 안정적
 */
const CONTAINER_SELECTORS = [
  // 가장 안정적: /Go?q= 링크를 포함하는 ul의 부모
  'ul:has(a[href^="/Go?q="])',

  // 폴백: data-v 속성을 가진 요소 중 ul을 포함하는 div
  '[data-v-25be4e16]',

  // 폴백 선택자들
  '[class*="realtime"]',
  '[class*="trending"]',
  '[class*="popular"]',
  '[class*="ranking"]',
  '[id*="realtime"]',
  '[id*="trending"]',
  'aside',
  '[class*="sidebar"]'
]

/**
 * 동적 콘텐츠 감지를 위한 MutationObserver 설정
 */
function observeRealtimeUpdates() {
  let realtimeContainer = null

  // 여러 선택자를 시도하여 실검 컨테이너 찾기
  for (const selector of CONTAINER_SELECTORS) {
    const container = document.querySelector(selector)
    if (container) {
      realtimeContainer = container
      console.log(`[나무위키 아카링커] 컨테이너 발견: ${selector}`)
      break
    }
  }

  // 컨테이너를 못 찾은 경우 body를 감시 (폴백)
  if (!realtimeContainer) {
    console.log(
      '[나무위키 아카링커] 특정 컨테이너를 찾지 못해 document.body를 감시합니다.'
    )
    realtimeContainer = document.body
  }

  const observer = new MutationObserver(mutations => {
    let shouldUpdate = false

    mutations.forEach(mutation => {
      // 새로운 노드가 추가되었는지 확인
      if (mutation.addedNodes.length) {
        // 추가된 노드 중 실검 관련 요소가 있는지 확인
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node

            // 우리가 추가한 arca-link는 무시
            if (element.classList && element.classList.contains('arca-link')) {
              return
            }

            // /Go?q= 링크를 포함하는 요소인지 확인 (실검 업데이트)
            if (
              element.tagName === 'A' &&
              element.getAttribute('href')?.startsWith('/Go?q=')
            ) {
              shouldUpdate = true
            } else if (
              element.querySelector &&
              element.querySelector('a[href^="/Go?q="]')
            ) {
              shouldUpdate = true
            }
          }
        })
      }
    })

    if (shouldUpdate) {
      console.log('[나무위키 아카링커] 실검 업데이트 감지, 링크 추가 시도')
      // 약간의 지연을 두어 DOM이 완전히 업데이트된 후 실행
      setTimeout(addArcaLinks, 100)
    }
  })

  observer.observe(realtimeContainer, {
    childList: true,
    subtree: true
  })

  console.log('[나무위키 아카링커] MutationObserver 설정 완료')
}

/**
 * 초기화 함수
 */
function init() {
  console.log('[나무위키 아카링커] 익스텐션 시작')

  // 초기 링크 추가
  addArcaLinks()

  // 동적 업데이트 감지
  observeRealtimeUpdates()

  // 페이지 내비게이션 감지 (SPA 대응)
  if ('navigation' in window && 'addEventListener' in window.navigation) {
    window.navigation.addEventListener('navigate', () => {
      console.log('[나무위키 아카링커] 페이지 내비게이션 감지')
      setTimeout(addArcaLinks, 500)
    })
  }
}

// DOM이 완전히 로드된 후 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
