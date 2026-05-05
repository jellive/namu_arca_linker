import { REALTIME_SELECTORS } from "../constants/selectors";
import { LOG_PREFIX } from "../constants/config";
import type { KeywordState } from "../types/common";

/**
 * Extract keyword from an <a> element.
 * Priority: /Go?q= URL param → textContent fallback.
 */
export function extractKeywordFromLink(link: HTMLElement): string | null {
  const anchor = link as HTMLAnchorElement;

  if (anchor.href && anchor.href.includes("/Go?q=")) {
    try {
      const url = new URL(anchor.href, window.location.origin);
      const keyword = url.searchParams.get("q");
      if (keyword) {
        return decodeURIComponent(keyword);
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} URL 파싱 실패:`, e);
    }
  }

  const text = link.textContent?.trim();
  if (text) {
    return text;
  }

  return null;
}

/**
 * Extract all realtime keywords currently visible in the DOM.
 * Returns a 1-based rank → keyword map.
 */
export function extractCurrentKeywords(): KeywordState {
  const keywords: KeywordState = new Map();

  let realtimeLinks: NodeListOf<Element> | null = null;
  for (const selector of REALTIME_SELECTORS) {
    realtimeLinks = document.querySelectorAll(selector);
    if (realtimeLinks.length > 0) {
      break;
    }
  }

  if (!realtimeLinks || realtimeLinks.length === 0) {
    console.warn(`${LOG_PREFIX} 실검 요소를 찾을 수 없음`);
    return keywords;
  }

  realtimeLinks.forEach((link, index) => {
    const keyword = extractKeywordFromLink(link as HTMLElement);
    if (keyword) {
      keywords.set(index + 1, keyword);
    }
  });

  console.log(`${LOG_PREFIX} 현재 검색어:`, Array.from(keywords.values()));
  return keywords;
}

/**
 * Find the realtime link element at a given 1-based rank.
 */
export function getRealtimeLinkByRank(rank: number): HTMLElement | null {
  let allLinks: NodeListOf<Element> | null = null;
  for (const selector of REALTIME_SELECTORS) {
    allLinks = document.querySelectorAll(selector);
    if (allLinks.length > 0) {
      break;
    }
  }

  if (!allLinks || allLinks.length === 0) {
    return null;
  }

  return (allLinks[rank - 1] as HTMLElement) ?? null;
}
