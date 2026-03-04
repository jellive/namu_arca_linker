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
 * 검색어 캐시 (이전 상태 저장)
 * Map<number, string> - rank → keyword
 * @type {Map<number, string>}
 */
const keywordCache = new Map()

/**
 * 검색어 변경 내역 타입
 * @typedef {Object} KeywordChange
 * @property {'added'|'removed'|'modified'} type - 변경 타입
 * @property {number} rank - 검색어 순위 (1-based)
 * @property {string} [oldKeyword] - 이전 검색어 (modified/removed인 경우)
 * @property {string} newKeyword - 새 검색어
 * @property {HTMLElement} [element] - 해당 링크 요소
 */

/**
 * <a> 태그에서 검색어 추출
 * @param {HTMLElement} link - 링크 요소
 * @returns {string|null} 검색어 또는 null
 */
function extractKeywordFromLink(link) {
  // 방법 1: href에서 q 파라미터 추출 (우선)
  if (link.href && link.href.includes('/Go?q=')) {
    try {
      const url = new URL(link.href, window.location.origin)
      const keyword = url.searchParams.get('q')
      if (keyword) {
        return decodeURIComponent(keyword)
      }
    } catch (e) {
      console.warn('[나무위키 아카링커] URL 파싱 실패:', e)
    }
  }

  // 방법 2: textContent에서 추출 (폴백)
  const text = link.textContent?.trim()
  if (text) {
    return text
  }

  return null
}

/**
 * 현재 DOM에서 실시간 검색어 추출
 * @returns {Map<number, string>} Map { rank: keyword } (1-based rank)
 */
function extractCurrentKeywords() {
  const keywords = new Map()

  // REALTIME_SELECTORS로 실검 링크 찾기
  let realtimeLinks = null
  for (const selector of REALTIME_SELECTORS) {
    realtimeLinks = document.querySelectorAll(selector)
    if (realtimeLinks.length > 0) {
      break
    }
  }

  if (!realtimeLinks || realtimeLinks.length === 0) {
    console.warn('[나무위키 아카링커] 실검 요소를 찾을 수 없음')
    return keywords
  }

  // 각 링크에서 검색어 추출
  realtimeLinks.forEach((link, index) => {
    const keyword = extractKeywordFromLink(link)
    if (keyword) {
      keywords.set(index + 1, keyword) // 1-based rank
    }
  })

  console.log(
    '[나무위키 아카링커] 현재 검색어:',
    Array.from(keywords.values())
  )
  return keywords
}

/**
 * 순위로 실검 링크 요소 찾기
 * @param {number} rank - 검색어 순위 (1-based)
 * @returns {HTMLElement|null} 링크 요소 또는 null
 */
function getRealtimeLinkByRank(rank) {
  // REALTIME_SELECTORS로 실검 링크 찾기
  let allLinks = null
  for (const selector of REALTIME_SELECTORS) {
    allLinks = document.querySelectorAll(selector)
    if (allLinks.length > 0) {
      break
    }
  }

  if (!allLinks || allLinks.length === 0) {
    return null
  }

  // rank는 1-based이므로 인덱스는 rank - 1
  return allLinks[rank - 1] || null
}

/**
 * 검색어 변경 감지 및 Diff 계산
 * @returns {KeywordChange[]} 변경 내역 배열
 */
function detectKeywordChanges() {
  const currentKeywords = extractCurrentKeywords()
  const changes = []

  // 캐시가 비어있으면 초기화 (첫 실행)
  if (keywordCache.size === 0) {
    currentKeywords.forEach((keyword, rank) => {
      keywordCache.set(rank, keyword)
    })
    console.log('[나무위키 아카링커] 검색어 캐시 초기화')
    return [] // 첫 실행이므로 변경 없음
  }

  // 1. 수정 감지 (같은 순위, 다른 검색어)
  currentKeywords.forEach((newKeyword, rank) => {
    const oldKeyword = keywordCache.get(rank)

    if (oldKeyword && oldKeyword !== newKeyword) {
      const element = getRealtimeLinkByRank(rank)

      changes.push({
        type: 'modified',
        rank,
        oldKeyword,
        newKeyword,
        element
      })

      console.log(
        `[나무위키 아카링커] 순위 ${rank}: "${oldKeyword}" → "${newKeyword}"`
      )
    }
  })

  // 2. 추가 감지 (새 순위)
  currentKeywords.forEach((newKeyword, rank) => {
    if (!keywordCache.has(rank)) {
      const element = getRealtimeLinkByRank(rank)

      changes.push({
        type: 'added',
        rank,
        newKeyword,
        element
      })

      console.log(`[나무위키 아카링커] 순위 ${rank} 신규: "${newKeyword}"`)
    }
  })

  // 3. 삭제 감지 (사라진 순위)
  keywordCache.forEach((oldKeyword, rank) => {
    if (!currentKeywords.has(rank)) {
      changes.push({
        type: 'removed',
        rank,
        oldKeyword,
        newKeyword: '' // removed는 newKeyword 없음
      })

      console.log(`[나무위키 아카링커] 순위 ${rank} 삭제: "${oldKeyword}"`)
    }
  })

  // 4. 캐시 업데이트
  keywordCache.clear()
  currentKeywords.forEach((keyword, rank) => {
    keywordCache.set(rank, keyword)
  })

  if (changes.length > 0) {
    console.log(`[나무위키 아카링커] 총 ${changes.length}개 변경 감지`)
  }

  return changes
}

/**
 * 아카라이브 링크 DOM 요소 생성
 * @param {string} keyword - 검색 키워드
 * @returns {HTMLElement} 아카라이브 링크 요소
 */
function createArcaLink(keyword) {
  const arcaUrl = getArcaSearchUrl(keyword)

  const arcaLink = document.createElement('a')
  arcaLink.href = arcaUrl
  arcaLink.className = 'arca-link'
  arcaLink.textContent = '왜?'
  arcaLink.target = '_blank'
  arcaLink.title = `아카라이브 "${keyword}" 검색`

  // 클릭 이벤트 로깅
  arcaLink.addEventListener('click', e => {
    console.log(`[나무위키 아카링커] 클릭: ${keyword} → ${arcaUrl}`)
    e.stopPropagation()
  })

  return arcaLink
}

/**
 * 새 아카라이브 링크를 DOM에 추가
 * @param {HTMLElement} element - 실검 링크 요소
 * @param {string} keyword - 검색 키워드
 */
function addNewLink(element, keyword) {
  const arcaLink = createArcaLink(keyword)

  // 링크 삽입 위치 결정
  const parentLi = element.closest('li')
  if (parentLi && !parentLi.querySelector('.arca-link')) {
    // li 요소 내부에 추가
    parentLi.appendChild(arcaLink)
  } else if (
    !element.nextElementSibling ||
    !element.nextElementSibling.classList.contains('arca-link')
  ) {
    // 링크 바로 다음에 추가
    element.parentNode.insertBefore(arcaLink, element.nextSibling)
  }

  console.log(`[나무위키 아카링커] 새 링크 추가: ${keyword}`)
}

/**
 * 기존 아카라이브 링크를 업데이트 (Fade 애니메이션 포함)
 * @param {HTMLElement} element - 실검 링크 요소
 * @param {string} oldKeyword - 이전 검색어
 * @param {string} newKeyword - 새 검색어
 * @returns {Promise<void>} 애니메이션 완료 Promise
 */
async function updateExistingLink(element, oldKeyword, newKeyword) {
  console.log(
    `[나무위키 아카링커] 링크 업데이트: "${oldKeyword}" → "${newKeyword}"`
  )

  // 1. 기존 아카라이브 링크 찾기
  const parentLi = element.closest('li')
  const existingLink = parentLi
    ? parentLi.querySelector('.arca-link')
    : element.parentNode?.querySelector('.arca-link')

  if (!existingLink) {
    console.warn('[나무위키 아카링커] 기존 링크를 찾을 수 없음, 새 링크 추가')
    addNewLink(element, newKeyword)
    return
  }

  // 2. Fade-out 애니메이션 (200ms)
  existingLink.style.opacity = '0'

  await new Promise(resolve => setTimeout(resolve, 200))

  // 3. 기존 링크 제거
  existingLink.remove()

  // 4. 새 링크 생성
  const newLink = createArcaLink(newKeyword)

  // 5. 새 링크를 투명하게 시작
  newLink.style.opacity = '0'

  // 6. 새 링크 삽입
  if (parentLi) {
    parentLi.appendChild(newLink)
  } else {
    element.parentNode.insertBefore(newLink, element.nextSibling)
  }

  // 7. Reflow 강제 (애니메이션이 제대로 작동하도록)
  void newLink.offsetWidth

  // 8. Fade-in 애니메이션 (200ms)
  newLink.style.opacity = '1'

  console.log(`[나무위키 아카링커] 링크 업데이트 완료: ${newKeyword}`)
}

/**
 * 검색어 변경에 따라 아카라이브 링크 업데이트 (메인 코디네이터)
 * @param {KeywordChange} change - 검색어 변경 내역
 * @returns {Promise<void>} 업데이트 완료 Promise
 */
async function updateArcaLink(change) {
  const { type, rank, oldKeyword, newKeyword, element } = change

  if (!element) {
    console.warn(
      `[나무위키 아카링커] 순위 ${rank}의 요소를 찾을 수 없음`
    )
    return
  }

  switch (type) {
    case 'added':
      // 새 검색어 추가 → 새 링크 추가
      addNewLink(element, newKeyword)
      break

    case 'modified':
      // 검색어 변경 → 기존 링크 업데이트 (Fade 애니메이션)
      await updateExistingLink(element, oldKeyword, newKeyword)
      break

    case 'removed':
      // 검색어 삭제 → 링크 제거 (이미 DOM에서 사라진 경우가 많음)
      console.log(`[나무위키 아카링커] 순위 ${rank} 검색어 삭제: ${oldKeyword}`)
      break

    default:
      console.warn(`[나무위키 아카링커] 알 수 없는 변경 타입: ${type}`)
  }
}

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

    // 아카라이브 링크 생성
    const arcaLink = createArcaLink(keyword)

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

  /**
   * 속성 변경 이벤트 핸들러
   * @param {MutationRecord[]} mutations
   */
  function handleAttributeChanges(mutations) {
    console.log('[나무위키 아카링커] 속성 변경 감지:', mutations.length)

    // href 속성이 변경된 노드들만 필터링
    const hrefChangedNodes = mutations
      .filter(m => m.type === 'attributes' && m.attributeName === 'href')
      .map(m => m.target)
      .filter(node => node.href && node.href.includes('/Go?q=')) // 실검 링크만

    if (hrefChangedNodes.length > 0) {
      console.log(
        '[나무위키 아카링커] 실검 링크 변경 감지:',
        hrefChangedNodes.length
      )

      // Debounce 적용 (100ms)
      clearTimeout(handleAttributeChanges.timeout)
      handleAttributeChanges.timeout = setTimeout(() => {
        onRealtimeSearchChanged(hrefChangedNodes)
      }, 100)
    }
  }

  /**
   * 실검 변경 이벤트 핸들러
   * @param {HTMLElement[]} changedNodes
   */
  async function onRealtimeSearchChanged(changedNodes) {
    console.log('[나무위키 아카링커] 실검 갱신 처리 시작')

    // 변경 내역 감지
    const changes = detectKeywordChanges()

    if (changes.length > 0) {
      // 각 변경 내역에 대해 updateArcaLink() 호출
      for (const change of changes) {
        await updateArcaLink(change)
      }

      console.log('[나무위키 아카링커] 실검 갱신 처리 완료')
    } else {
      console.log('[나무위키 아카링커] 변경 내역 없음')
    }
  }

  const observer = new MutationObserver(mutations => {
    // 변경 타입별 체크
    const hasChildListMutation = mutations.some(m => m.type === 'childList')
    const hasAttributeMutation = mutations.some(m => m.type === 'attributes')

    // childList 변경 처리 (기존 로직)
    if (hasChildListMutation) {
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
    }

    // attributes 변경 처리 (NEW!)
    if (hasAttributeMutation) {
      handleAttributeChanges(mutations)
    }
  })

  observer.observe(realtimeContainer, {
    childList: true,
    attributes: true,        // NEW: href 속성 변경 감지
    attributeFilter: ['href'], // NEW: 성능 최적화 - href만 감시
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
