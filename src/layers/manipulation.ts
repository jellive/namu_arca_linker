import {
  ARCA_BASE_URL,
  CSS_CLASS_ARCA_LINK,
  DATA_ATTR_PROCESSED,
  FADE_DURATION_MS,
  LOG_PREFIX,
} from "../constants/config";
import { REALTIME_SELECTORS } from "../constants/selectors";
import type { KeywordChange } from "../types/common";

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return `https://arca.live/b/namuhotnow?target=all&keyword=`;
    }
    return url;
  } catch (error) {
    console.warn(`${LOG_PREFIX} sanitizeUrl: 잘못된 URL 형식 —`, error);
    return `https://arca.live/b/namuhotnow?target=all&keyword=`;
  }
}

/**
 * Build the Arca Live search URL for a keyword.
 */
export function getArcaSearchUrl(keyword: string): string {
  const encodedKeyword = encodeURIComponent(keyword);
  const rawUrl = `${ARCA_BASE_URL}?target=all&keyword=${encodedKeyword}`;
  return sanitizeUrl(rawUrl);
}

/**
 * Create the "왜?" anchor element for a keyword.
 */
export function createArcaLink(keyword: string): HTMLAnchorElement {
  const arcaUrl = getArcaSearchUrl(keyword);

  const arcaLink = document.createElement("a");
  arcaLink.href = arcaUrl;
  arcaLink.className = CSS_CLASS_ARCA_LINK;
  arcaLink.textContent = "왜?";
  arcaLink.target = "_blank";
  arcaLink.rel = "noopener noreferrer";
  arcaLink.title = `아카라이브 "${keyword}" 검색`;

  arcaLink.addEventListener("click", (e) => {
    console.log(`${LOG_PREFIX} 클릭: ${keyword} → ${arcaUrl}`);
    e.stopPropagation();
  });

  return arcaLink;
}

/**
 * Insert a new arca link after the given realtime keyword element.
 */
export function addNewLink(element: HTMLElement, keyword: string): void {
  const arcaLink = createArcaLink(keyword);

  const parentLi = element.closest("li");
  if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_ARCA_LINK}`)) {
    parentLi.appendChild(arcaLink);
  } else if (
    !element.nextElementSibling ||
    !element.nextElementSibling.classList.contains(CSS_CLASS_ARCA_LINK)
  ) {
    element.parentNode?.insertBefore(arcaLink, element.nextSibling);
  }

  console.log(`${LOG_PREFIX} 새 링크 추가: ${keyword}`);
}

/**
 * Replace an existing arca link with a new one using fade animation.
 */
export async function updateExistingLink(
  element: HTMLElement,
  oldKeyword: string,
  newKeyword: string,
): Promise<void> {
  console.log(`${LOG_PREFIX} 링크 업데이트: "${oldKeyword}" → "${newKeyword}"`);

  const parentLi = element.closest("li");
  const existingLink = parentLi
    ? parentLi.querySelector<HTMLElement>(`.${CSS_CLASS_ARCA_LINK}`)
    : element.parentNode?.querySelector<HTMLElement>(`.${CSS_CLASS_ARCA_LINK}`);

  if (!existingLink) {
    console.warn(`${LOG_PREFIX} 기존 링크를 찾을 수 없음, 새 링크 추가`);
    addNewLink(element, newKeyword);
    return;
  }

  // Fade-out
  existingLink.style.opacity = "0";
  await new Promise<void>((resolve) => setTimeout(resolve, FADE_DURATION_MS));
  existingLink.remove();

  // Create new link starting transparent
  const newLink = createArcaLink(newKeyword);
  newLink.style.opacity = "0";

  if (parentLi) {
    parentLi.appendChild(newLink);
  } else {
    element.parentNode?.insertBefore(newLink, element.nextSibling);
  }

  // Force reflow then fade-in
  void newLink.offsetWidth;
  newLink.style.opacity = "1";

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
 * Scan the DOM and add arca links to all unprocessed realtime keyword items.
 */
export async function addArcaLinks(): Promise<void> {
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

    const arcaLink = createArcaLink(keyword);

    const parentLi = el.closest("li");
    if (parentLi && !parentLi.querySelector(`.${CSS_CLASS_ARCA_LINK}`)) {
      parentLi.appendChild(arcaLink);
      addedCount++;
    } else if (
      !el.nextElementSibling ||
      !el.nextElementSibling.classList.contains(CSS_CLASS_ARCA_LINK)
    ) {
      el.parentNode?.insertBefore(arcaLink, el.nextSibling);
      addedCount++;
    }
  }

  console.log(
    `${LOG_PREFIX} ${addedCount}개 항목에 링크 추가 완료 (선택자: ${usedSelector})`,
  );
}
