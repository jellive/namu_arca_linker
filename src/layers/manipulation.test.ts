import { describe, it, expect } from 'vitest'
import { getArcaSearchUrl, createArcaLink } from './manipulation'

describe('getArcaSearchUrl', () => {
  it('builds correct URL for ASCII keyword', () => {
    const url = getArcaSearchUrl('hello')
    expect(url).toBe('https://arca.live/b/namuhotnow?target=all&keyword=hello')
  })

  it('encodes Korean keyword', () => {
    const url = getArcaSearchUrl('한국')
    expect(url).toContain('keyword=%ED%95%9C%EA%B5%AD')
  })

  it('encodes special characters', () => {
    const url = getArcaSearchUrl('a b+c')
    expect(url).toContain('keyword=a%20b%2Bc')
  })
})

describe('createArcaLink', () => {
  it('creates anchor with correct attributes', () => {
    const link = createArcaLink('아이유')
    expect(link.tagName).toBe('A')
    expect(link.textContent).toBe('왜?')
    expect(link.target).toBe('_blank')
    expect(link.className).toBe('arca-link')
    expect(link.href).toContain('arca.live')
  })
})
