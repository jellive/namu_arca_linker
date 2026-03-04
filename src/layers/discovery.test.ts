import { describe, it, expect, beforeEach } from 'vitest'
import { extractKeywordFromLink } from './discovery'

function makeAnchor(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  a.textContent = text
  return a
}

describe('extractKeywordFromLink', () => {
  it('extracts keyword from /Go?q= href', () => {
    const a = makeAnchor('https://namu.wiki/Go?q=%ED%95%9C%EA%B5%AD', '한국')
    expect(extractKeywordFromLink(a)).toBe('한국')
  })

  it('falls back to textContent when no /Go?q= in href', () => {
    const a = makeAnchor('https://namu.wiki/some-page', '검색어텍스트')
    expect(extractKeywordFromLink(a)).toBe('검색어텍스트')
  })

  it('returns null when both href and textContent are empty', () => {
    const a = document.createElement('a')
    expect(extractKeywordFromLink(a)).toBeNull()
  })

  it('decodes encoded keyword from URL', () => {
    const a = makeAnchor('https://namu.wiki/Go?q=%EC%95%84%EC%9D%B4%EC%9C%A0', '아이유')
    expect(extractKeywordFromLink(a)).toBe('아이유')
  })
})
