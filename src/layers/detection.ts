import { LOG_PREFIX } from "../constants/config";
import { extractCurrentKeywords, getRealtimeLinkByRank } from "./discovery";
import type { KeywordChange, KeywordState } from "../types/common";

/**
 * Persistent cache of the last-known keyword state.
 * rank (1-based) → keyword string
 */
export const keywordCache: KeywordState = new Map();

/**
 * 3-pass diff: detect modified, added, and removed keywords.
 * Updates keywordCache after each call.
 * Returns an empty array on first call (cache initialisation).
 */
export function detectKeywordChanges(): KeywordChange[] {
  const currentKeywords = extractCurrentKeywords();
  const changes: KeywordChange[] = [];

  if (keywordCache.size === 0) {
    currentKeywords.forEach((keyword, rank) => {
      keywordCache.set(rank, keyword);
    });
    console.log(`${LOG_PREFIX} 검색어 캐시 초기화`);
    return [];
  }

  // Pass 1: modified (same rank, different keyword)
  currentKeywords.forEach((newKeyword, rank) => {
    const oldKeyword = keywordCache.get(rank);
    if (oldKeyword && oldKeyword !== newKeyword) {
      const element = getRealtimeLinkByRank(rank) ?? undefined;
      changes.push({ type: "modified", rank, oldKeyword, newKeyword, element });
      console.log(
        `${LOG_PREFIX} 순위 ${rank}: "${oldKeyword}" → "${newKeyword}"`,
      );
    }
  });

  // Pass 2: added (new rank)
  currentKeywords.forEach((newKeyword, rank) => {
    if (!keywordCache.has(rank)) {
      const element = getRealtimeLinkByRank(rank) ?? undefined;
      changes.push({ type: "added", rank, newKeyword, element });
      console.log(`${LOG_PREFIX} 순위 ${rank} 신규: "${newKeyword}"`);
    }
  });

  // Pass 3: removed (disappeared rank)
  keywordCache.forEach((oldKeyword, rank) => {
    if (!currentKeywords.has(rank)) {
      changes.push({ type: "removed", rank, oldKeyword, newKeyword: "" });
      console.log(`${LOG_PREFIX} 순위 ${rank} 삭제: "${oldKeyword}"`);
    }
  });

  // Update cache
  keywordCache.clear();
  currentKeywords.forEach((keyword, rank) => {
    keywordCache.set(rank, keyword);
  });

  if (changes.length > 0) {
    console.log(`${LOG_PREFIX} 총 ${changes.length}개 변경 감지`);
  }

  return changes;
}
