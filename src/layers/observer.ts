import {
  DEBOUNCE_DELAY_MS,
  DOM_READY_DELAY_MS,
  LOG_PREFIX,
} from "../constants/config";
import { CONTAINER_SELECTORS } from "../constants/selectors";
import { detectKeywordChanges } from "./detection";
import { addArcaLinks, updateArcaLink } from "./manipulation";

const realtimeChangeListeners: Array<() => void> = [];

/** Subscribe to "realtime keywords changed" events (used by the hub panel). */
export function onRealtimeChange(cb: () => void): void {
  realtimeChangeListeners.push(cb);
}

/** Notify subscribers. Exported for tests; called internally on change. */
export function emitRealtimeChange(): void {
  for (const cb of realtimeChangeListeners) {
    try {
      cb();
    } catch (e) {
      console.warn("[나무위키 아카링커] onRealtimeChange listener error", e);
    }
  }
}

/**
 * Handle href attribute changes on realtime search links.
 * Debounced to 100ms to batch rapid DOM updates.
 */
let attributeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function handleAttributeChanges(mutations: MutationRecord[]): void {
  console.log(`${LOG_PREFIX} 속성 변경 감지:`, mutations.length);

  const hrefChangedNodes = mutations
    .filter((m) => m.type === "attributes" && m.attributeName === "href")
    .map((m) => m.target as HTMLElement)
    .filter((node) => {
      const anchor = node as HTMLAnchorElement;
      return anchor.href && anchor.href.includes("/Go?q=");
    });

  if (hrefChangedNodes.length > 0) {
    console.log(`${LOG_PREFIX} 실검 링크 변경 감지:`, hrefChangedNodes.length);

    if (attributeDebounceTimer !== null) {
      clearTimeout(attributeDebounceTimer);
    }
    attributeDebounceTimer = setTimeout(() => {
      onRealtimeSearchChanged(hrefChangedNodes);
    }, DEBOUNCE_DELAY_MS);
  }
}

async function onRealtimeSearchChanged(
  _changedNodes: HTMLElement[],
): Promise<void> {
  console.log(`${LOG_PREFIX} 실검 갱신 처리 시작`);

  const changes = detectKeywordChanges();

  if (changes.length > 0) {
    for (const change of changes) {
      await updateArcaLink(change);
    }
    console.log(`${LOG_PREFIX} 실검 갱신 처리 완료`);
  } else {
    console.log(`${LOG_PREFIX} 변경 내역 없음`);
  }
  emitRealtimeChange();
}

function setupObserver(realtimeContainer: Element): void {
  const observer = new MutationObserver((mutations) => {
    const hasChildListMutation = mutations.some((m) => m.type === "childList");
    const hasAttributeMutation = mutations.some((m) => m.type === "attributes");

    if (hasChildListMutation) {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;

              if (
                element.classList &&
                element.classList.contains("arca-link")
              ) {
                return;
              }

              if (
                element.tagName === "A" &&
                (element as HTMLAnchorElement)
                  .getAttribute("href")
                  ?.startsWith("/Go?q=")
              ) {
                shouldUpdate = true;
              } else if (element.querySelector?.('a[href^="/Go?q="]')) {
                shouldUpdate = true;
              }
            }
          });
        }
      });

      if (shouldUpdate) {
        console.log(`${LOG_PREFIX} 실검 업데이트 감지, 링크 추가 시도`);
        setTimeout(addArcaLinks, DOM_READY_DELAY_MS);
      }
    }

    if (hasAttributeMutation) {
      handleAttributeChanges(mutations);
    }
  });

  observer.observe(realtimeContainer, {
    childList: true,
    attributes: true,
    attributeFilter: ["href"],
    subtree: true,
  });

  console.log(`${LOG_PREFIX} MutationObserver 설정 완료`);

  // Process any keyword anchors that were already in the container by the
  // time the observer attached. MutationObserver only fires for FUTURE
  // mutations, so without this call we silently miss the initial render —
  // which is exactly what happens on namu.wiki today (script runs at
  // document_end before the realtime list is populated, then the list
  // appears with no further childList mutations on the container itself).
  setTimeout(addArcaLinks, DOM_READY_DELAY_MS);
}

/**
 * Set up MutationObserver on the realtime keyword container.
 * Retries up to 5 times (500ms apart) if the container is not yet in the DOM.
 * Does not fall back to document.body.
 */
export function observeRealtimeUpdates(): void {
  for (const selector of CONTAINER_SELECTORS) {
    const container = document.querySelector(selector);
    if (container) {
      console.log(`${LOG_PREFIX} 컨테이너 발견: ${selector}`);
      setupObserver(container);
      return;
    }
  }

  const MAX_RETRIES = 5;
  const RETRY_INTERVAL_MS = 500;
  let retryCount = 0;

  const retryTimer = setInterval(() => {
    retryCount++;
    for (const selector of CONTAINER_SELECTORS) {
      const container = document.querySelector(selector);
      if (container) {
        clearInterval(retryTimer);
        console.log(
          `${LOG_PREFIX} 컨테이너 발견 (재시도 ${retryCount}): ${selector}`,
        );
        setupObserver(container);
        return;
      }
    }
    if (retryCount >= MAX_RETRIES) {
      clearInterval(retryTimer);
      console.log(
        `${LOG_PREFIX} 컨테이너를 찾지 못해 감시를 시작하지 않습니다.`,
      );
    }
  }, RETRY_INTERVAL_MS);
}
