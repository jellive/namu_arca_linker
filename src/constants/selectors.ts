export const REALTIME_SELECTORS: string[] = [
  // Most stable: href pattern based (namu wiki realtime search starts with /Go?q=)
  'a[href^="/Go?q="]',

  // Fallback selectors
  '[class*="realtime"] li a',
  '[class*="trending"] li a',
  '[class*="popular"] li a',
  '[class*="ranking"] li a',
  '[class*="hot"] li a',

  // ID based
  '#realtime-keywords li a',
  '#trending-keywords li a',

  // List items
  '.realtime-list li a',
  '.trending-list li a',

  // Sidebar related
  '[class*="sidebar"] [class*="realtime"] a',
  '[class*="sidebar"] [class*="trending"] a'
]

export const CONTAINER_SELECTORS: string[] = [
  // Most stable: parent of ul containing /Go?q= links
  'ul:has(a[href^="/Go?q="])',

  // Fallback: div with data-v attribute containing ul
  '[data-v-25be4e16]',

  // Fallback selectors
  '[class*="realtime"]',
  '[class*="trending"]',
  '[class*="popular"]',
  '[class*="ranking"]',
  '[id*="realtime"]',
  '[id*="trending"]',
  'aside',
  '[class*="sidebar"]'
]
