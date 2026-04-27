import { describe, it, expect, beforeEach, vi } from 'vitest'
import { keywordCache, detectKeywordChanges } from './detection'
import * as discovery from './discovery'

function mockKeywords(map: Map<number, string>) {
  vi.spyOn(discovery, 'extractCurrentKeywords').mockReturnValue(map)
  vi.spyOn(discovery, 'getRealtimeLinkByRank').mockReturnValue(null)
}

beforeEach(() => {
  keywordCache.clear()
})

describe('detectKeywordChanges', () => {
  it('returns empty array on first call (cache init)', () => {
    mockKeywords(new Map([[1, '키워드A'], [2, '키워드B']]))
    const changes = detectKeywordChanges()
    expect(changes).toHaveLength(0)
    expect(keywordCache.get(1)).toBe('키워드A')
    expect(keywordCache.get(2)).toBe('키워드B')
  })

  it('detects added keyword', () => {
    // Seed cache with rank 1 only
    keywordCache.set(1, '키워드A')
    mockKeywords(new Map([[1, '키워드A'], [2, '신규키워드']]))

    const changes = detectKeywordChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('added')
    expect(changes[0].rank).toBe(2)
    expect(changes[0].newKeyword).toBe('신규키워드')
  })

  it('detects modified keyword', () => {
    keywordCache.set(1, '이전키워드')
    mockKeywords(new Map([[1, '변경키워드']]))

    const changes = detectKeywordChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('modified')
    expect(changes[0].rank).toBe(1)
    expect(changes[0].oldKeyword).toBe('이전키워드')
    expect(changes[0].newKeyword).toBe('변경키워드')
  })

  it('detects removed keyword', () => {
    keywordCache.set(1, '키워드A')
    keywordCache.set(2, '사라질키워드')
    mockKeywords(new Map([[1, '키워드A']]))

    const changes = detectKeywordChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('removed')
    expect(changes[0].rank).toBe(2)
    expect(changes[0].oldKeyword).toBe('사라질키워드')
  })

  it('updates cache after detecting changes', () => {
    keywordCache.set(1, '이전')
    mockKeywords(new Map([[1, '이후'], [2, '신규']]))

    detectKeywordChanges()
    expect(keywordCache.get(1)).toBe('이후')
    expect(keywordCache.get(2)).toBe('신규')
  })
})
