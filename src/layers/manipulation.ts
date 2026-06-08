import {
  ARCA_BASE_URL,
  CSS_CLASS_ARCA_LINK,
  CSS_CLASS_LINKS_CONTAINER,
  DATA_ATTR_PROCESSED,
  FADE_DURATION_MS,
  LOG_PREFIX,
} from "../constants/config";
import { REALTIME_SELECTORS } from "../constants/selectors";
import { DEFAULT_TARGET_SITES } from "../constants/sites";
import type { TargetSite } from "../lib/storage";
import type { KeywordChange } from "../types/common";

// User-configured target sites, refreshed from chrome.storage each addArcaLinks run.
let activeSites: TargetSite[] = DEFAULT_TARGET_SITES;

async function refreshActiveSites(): Promise<void> {
  try {
    const sites = await new Promise<TargetSite[]>((resolve) => {
      chrome.storage.sync.get({ targetSites: DEFAULT_TARGET_SITES }, (data) => {
        resolve((data["targetSites"] as TargetSite[]) ?? DEFAULT_TARGET_SITES);
      });
    });
    activeSites = sites.length > 0 ? sites : DEFAULT_TARGET_SITES;
  } catch {
    activeSites = DEFAULT_TARGET_SITES;
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} sanitizeUrl: 잘못된 URL 형식 —`, error);
    return "";
  }
}

/**
 * Build a search URL from a site template, substituting + encoding {keyword}.
 * Returns "" when the template has no {keyword} placeholder or is not http(s),
 * so callers can skip that site.
 */
export function buildSearchUrl(template: string, keyword: string): string {
  if (!template.includes("{keyword}")) {
    return "";
  }
  const rawUrl = template.replace("{keyword}", encodeURIComponent(keyword));
  return sanitizeUrl(rawUrl);
}

/**
 * Create one anchor for a single target site, or null if the site's url
 * template has no {keyword} placeholder.
 */
export function createSiteLink(
  site: TargetSite,
  keyword: string,
): HTMLAnchorElement | null {
  const url = buildSearchUrl(site.url, keyword);
  if (!url) {
    return null;
  }
  const link = document.createElement("a");
  link.href = url;
  link.className = CSS_CLASS_ARCA_LINK;
  link.textContent = site.label ?? site.name;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `${site.name} "${keyword}" 검색`;
  link.addEventListener("click", (e) => {
    console.log(`${LOG_PREFIX} 클릭: ${keyword} → ${url}`);
    e.stopPropagation();
  });
  return link;
}

/**
 * Build the inline row of search links for a keyword across all sites.
 * Sites whose url lacks {keyword} are skipped.
 */
export function createLinksContainer(
  keyword: string,
  sites: TargetSite[],
): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = CSS_CLASS_LINKS_CONTAINER;
  for (const site of sites) {
    const link = createSiteLink(site, keyword);
    if (link) {
      container.appendChild(link);
    }
  }
  return container;
}

/**
 * Insert a new links container after the given realtime keyword element.
 */
export function addNewLink(element: HTMLElement, keyword: string): void {
  const container = createLinksContainer(keyword, activeSites);

  const parentLi = element.closest("li");
  if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
    parentLi.appendChild(container);
  } else if (
    !element.nextElementSibling ||
    !element.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER)
  ) {
    element.parentNode?.insertBefore(container, element.nextSibling);
  }

  console.log(`${LOG_PREFIX} 새 링크 추가: ${keyword}`);
}

/**
 * Replace an existing links container with a new one using fade animation.
 */
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
    console.warn(`${LOG_PREFIX} 기존 링크를 찾을 수 없음, 새 링크 추가`);
    addNewLink(element, newKeyword);
    return;
  }

  // Fade-out the old container
  existing.style.opacity = "0";
  await new Promise<void>((resolve) => setTimeout(resolve, FADE_DURATION_MS));
  existing.remove();

  // New container starts transparent
  const container = createLinksContainer(newKeyword, activeSites);
  container.style.opacity = "0";

  if (parentLi) {
    parentLi.appendChild(container);
  } else {
    element.parentNode?.insertBefore(container, element.nextSibling);
  }

  // Force reflow then fade-in
  void container.offsetWidth;
  container.style.opacity = "1";

  console.log(`${LOG_PREFIX} 링크 업데이트 완료: ${newKeyword}`);
}

/**
 * Apply a single keyword change to the DOM.
 */
export async function updateArcaLink(change: KeywordChange): Promise<void> {
  const { type, rank, oldKeyword, newKeyword, element } = change;

  if (!element) {
    console.warn(`${LOG_PREFIX} 순위 ${rank}의 요소를 찾을 수 없음`);
    return;
  }

  switch (type) {
    case "added":
      if (newKeyword === undefined) {
        console.warn(
          `${LOG_PREFIX} 순위 ${rank} 'added' 변경에 newKeyword 없음`,
        );
        break;
      }
      addNewLink(element, newKeyword);
      break;

    case "modified":
      if (newKeyword === undefined) {
        console.warn(
          `${LOG_PREFIX} 순위 ${rank} 'modified' 변경에 newKeyword 없음`,
        );
        break;
      }
      await updateExistingLink(element, oldKeyword ?? "", newKeyword);
      break;

    case "removed":
      console.log(`${LOG_PREFIX} 순위 ${rank} 검색어 삭제: ${oldKeyword}`);
      break;

    default:
      console.warn(`${LOG_PREFIX} 알 수 없는 변경 타입: ${type}`);
  }
}

/**
 * Scan the DOM and add links containers to all unprocessed realtime keyword items.
 */
export async function addArcaLinks(): Promise<void> {
  await refreshActiveSites(); // pick up the user's configured targetSites

  let realtimeItems: NodeListOf<Element> | Element[] = [];
  let usedSelector = "";

  for (const selector of REALTIME_SELECTORS) {
    const items = document.querySelectorAll(selector);
    if (items.length > 0) {
      realtimeItems = items;
      usedSelector = selector;
      console.log(
        `${LOG_PREFIX} 선택자 "${selector}"로 ${items.length}개 항목 발견`,
      );
      break;
    }
  }

  if (realtimeItems.length === 0) {
    const allSections = document.querySelectorAll(
      'section, div[class*="section"], aside',
    );
    for (const section of allSections) {
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
          console.log(
            `${LOG_PREFIX} 텍스트 기반으로 ${links.length}개 항목 발견`,
          );
          break;
        }
      }
    }
  }

  if (realtimeItems.length === 0) {
    console.log(`${LOG_PREFIX} 실시간 검색어를 찾을 수 없습니다.`);
    console.log(
      `${LOG_PREFIX} 개발자 도구(F12)로 DOM 구조를 확인하고 선택자를 업데이트해주세요.`,
    );
    return;
  }

  let addedCount = 0;

  for (const item of realtimeItems) {
    const el = item as HTMLElement;

    if (el.hasAttribute(DATA_ATTR_PROCESSED)) {
      continue;
    }

    const keyword = el.getAttribute("title") || el.textContent?.trim() || "";

    if (!keyword || keyword.length === 0) {
      continue;
    }

    if (/^\d+$/.test(keyword)) {
      continue;
    }

    el.setAttribute(DATA_ATTR_PROCESSED, "true");

    const container = createLinksContainer(keyword, activeSites);

    const parentLi = el.closest("li");
    if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_LINKS_CONTAINER}`)) {
      parentLi.appendChild(container);
      addedCount++;
    } else if (
      !el.nextElementSibling ||
      !el.nextElementSibling.classList.contains(CSS_CLASS_LINKS_CONTAINER)
    ) {
      el.parentNode?.insertBefore(container, el.nextSibling);
      addedCount++;
    }
  }

  console.log(
    `${LOG_PREFIX} ${addedCount}개 항목에 링크 추가 완료 (선택자: ${usedSelector})`,
  );
}
