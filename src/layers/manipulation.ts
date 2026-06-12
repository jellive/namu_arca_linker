import {
  ARCA_BASE_URL,
  ARCA_SEARCH_TEMPLATE,
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
  DATA_ATTR_THREAD,
  FADE_DURATION_MS,
  LOG_PREFIX,
} from "../constants/config";
import { REALTIME_SELECTORS } from "../constants/selectors";
import type { ThreadMatch } from "../lib/arca-api";
import type { KeywordChange } from "../types/common";

// In-memory keyword→thread match map, refreshed from the background SW.
export let threadMatches: Map<string, ThreadMatch | null> = new Map();

interface MatchThreadsResponse {
  matches: Record<string, ThreadMatch | null>;
}

/** Ask the background SW to match the given keywords; populate threadMatches. */
export async function refreshThreadMatches(keywords: string[]): Promise<void> {
  if (keywords.length === 0) return;
  const next = new Map<string, ThreadMatch | null>();
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "matchThreads",
      keywords,
    })) as MatchThreadsResponse | undefined;
    const matches = res?.matches ?? {};
    for (const kw of keywords) next.set(kw, matches[kw] ?? null);
  } catch (e) {
    console.warn(`${LOG_PREFIX} refreshThreadMatches 실패 — 검색 폴백`, e);
    for (const kw of keywords) next.set(kw, null);
  }
  threadMatches = next;
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} sanitizeUrl: 잘못된 URL —`, error);
    return "";
  }
}

/** Build a search URL from a template, substituting + encoding {keyword}. */
export function buildSearchUrl(template: string, keyword: string): string {
  if (!template.includes("{keyword}")) return "";
  return sanitizeUrl(
    template.replace("{keyword}", encodeURIComponent(keyword)),
  );
}

function badgeText(match: ThreadMatch): string {
  if (typeof match.commentCount === "number") return `💬${match.commentCount}`;
  if (match.category) return `💬${match.category}`;
  return "💬";
}

/**
 * Single smart link for a keyword: 실검챈 thread (💬) when matched, else arca
 * search (🔎). This replaces the former 5-site multisite row.
 */
export function createThreadLink(
  keyword: string,
  match: ThreadMatch | null,
): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = CSS_CLASS_ARCA_LINK;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (match) {
    link.href = `${ARCA_BASE_URL}/${match.id}`;
    link.textContent = badgeText(match);
    link.title = match.title;
    link.setAttribute(DATA_ATTR_THREAD, "1");
  } else {
    link.href = buildSearchUrl(ARCA_SEARCH_TEMPLATE, keyword) || ARCA_BASE_URL;
    link.textContent = "🔎";
    link.title = `아카라이브 "${keyword}" 검색`;
  }
  link.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  return link;
}

/** Container span holding the single smart link for a keyword. */
export function createLinkContainer(
  keyword: string,
  match: ThreadMatch | null,
): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = CSS_CLASS_LINKS_CONTAINER;
  container.dataset["arcaKeyword"] = keyword;
  container.appendChild(createThreadLink(keyword, match));
  return container;
}

function insertContainer(
  element: HTMLElement,
  container: HTMLSpanElement,
): boolean {
  const parentLi = element.closest("li");
  if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
    parentLi.appendChild(container);
    return true;
  }
  if (
    !parentLi &&
    (!element.nextElementSibling ||
      !element.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER))
  ) {
    element.parentNode?.insertBefore(container, element.nextSibling);
    return true;
  }
  return false;
}

/** Insert a fresh container after a keyword element (refreshing its match). */
export async function addNewLink(
  element: HTMLElement,
  keyword: string,
): Promise<void> {
  if (!threadMatches.has(keyword)) await refreshThreadMatches([keyword]);
  const container = createLinkContainer(
    keyword,
    threadMatches.get(keyword) ?? null,
  );
  insertContainer(element, container);
  console.log(`${LOG_PREFIX} 새 링크 추가: ${keyword}`);
}

/** Replace an existing container with one for newKeyword (fade). */
export async function updateExistingLink(
  element: HTMLElement,
  oldKeyword: string,
  newKeyword: string,
): Promise<void> {
  console.log(`${LOG_PREFIX} 링크 업데이트: "${oldKeyword}" → "${newKeyword}"`);
  const parentLi = element.closest("li");
  const existing = parentLi
    ? parentLi.querySelector<HTMLElement>(`.${CSS_CLASS_LINKS_CONTAINER}`)
    : element.parentNode?.querySelector<HTMLElement>(
        `.${CSS_CLASS_LINKS_CONTAINER}`,
      );

  if (!existing) {
    console.warn(`${LOG_PREFIX} 기존 링크 없음 → 새로 추가`);
    await addNewLink(element, newKeyword);
    return;
  }

  if (!threadMatches.has(newKeyword)) await refreshThreadMatches([newKeyword]);

  existing.style.opacity = "0";
  await new Promise<void>((r) => setTimeout(r, FADE_DURATION_MS));
  existing.remove();

  const container = createLinkContainer(
    newKeyword,
    threadMatches.get(newKeyword) ?? null,
  );
  container.style.opacity = "0";
  if (parentLi) parentLi.appendChild(container);
  else element.parentNode?.insertBefore(container, element.nextSibling);
  void container.offsetWidth;
  container.style.opacity = "1";
  console.log(`${LOG_PREFIX} 링크 업데이트 완료: ${newKeyword}`);
}

/** Apply a single keyword change to the DOM. */
export async function updateArcaLink(change: KeywordChange): Promise<void> {
  const { type, rank, oldKeyword, newKeyword, element } = change;
  if (!element) {
    console.warn(`${LOG_PREFIX} 순위 ${rank}의 요소를 찾을 수 없음`);
    return;
  }
  switch (type) {
    case "added":
      if (newKeyword === undefined) break;
      await addNewLink(element, newKeyword);
      break;
    case "modified":
      if (newKeyword === undefined) break;
      await updateExistingLink(element, oldKeyword ?? "", newKeyword);
      break;
    case "removed":
      console.log(`${LOG_PREFIX} 순위 ${rank} 삭제: ${oldKeyword}`);
      break;
    default:
      console.warn(`${LOG_PREFIX} 알 수 없는 변경 타입: ${type}`);
  }
}

/** Scan the DOM, match all keywords via the SW, inject one smart link each. */
export async function addArcaLinks(): Promise<void> {
  let realtimeItems: NodeListOf<Element> | Element[] = [];
  let usedSelector = "";
  for (const selector of REALTIME_SELECTORS) {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      realtimeItems = items;
      usedSelector = selector;
      break;
    }
  }

  if (realtimeItems.length === 0) {
    const sections = document.querySelectorAll(
      'section, div[class*="section"], aside',
    );
    for (const section of sections) {
      const heading = section.querySelector("h2, h3, h4, .title, .heading");
      if (
        heading &&
        (heading.textContent?.includes("실시간") ||
          heading.textContent?.includes("인기"))
      ) {
        const links = section.querySelectorAll("a");
        if (links.length > 0) {
          realtimeItems = links;
          usedSelector = "텍스트 기반 검색";
          break;
        }
      }
    }
  }

  if (realtimeItems.length === 0) {
    console.log(`${LOG_PREFIX} 실시간 검색어를 찾을 수 없습니다.`);
    return;
  }

  // Collect items needing (re)injection: no container yet, OR an existing
  // container whose stored keyword differs from the anchor's CURRENT keyword
  // (namu rotated the 실검 in place → heal the stale link).
  const pending: Array<{
    el: HTMLElement;
    keyword: string;
    stale: HTMLElement | null;
  }> = [];
  for (const item of realtimeItems) {
    const el = item as HTMLElement;
    const keyword = el.getAttribute("title") || el.textContent?.trim() || "";
    if (!keyword || /^\d+$/.test(keyword)) continue;
    const parentLi = el.closest("li");
    const existing = parentLi
      ? parentLi.querySelector<HTMLElement>(`.${CSS_CLASS_LINKS_CONTAINER}`)
      : el.nextElementSibling?.classList.contains(CSS_CLASS_LINKS_CONTAINER)
        ? (el.nextElementSibling as HTMLElement)
        : null;
    if (existing && existing.dataset["arcaKeyword"] === keyword) {
      continue; // already in sync
    }
    pending.push({ el, keyword, stale: existing });
  }
  if (pending.length === 0) return;

  // One SW round for all keywords needing (re)injection, then inject.
  await refreshThreadMatches(pending.map((p) => p.keyword));

  let addedCount = 0;
  for (const { el, keyword, stale } of pending) {
    if (stale) stale.remove();
    el.setAttribute(DATA_ATTR_PROCESSED, "true");
    const container = createLinkContainer(
      keyword,
      threadMatches.get(keyword) ?? null,
    );
    if (insertContainer(el, container)) addedCount++;
  }
  console.log(
    `${LOG_PREFIX} ${addedCount}개 링크 동기화 (선택자: ${usedSelector})`,
  );
}
