import { LOG_PREFIX, NAV_DELAY_MS } from "../constants/config";
import { addArcaLinks } from "../layers/manipulation";
import { observeRealtimeUpdates } from "../layers/observer";
import { getStorageState } from "./storage";

/**
 * Pure boot logic for the content script. Side-effect-free at module load
 * — call `bootstrap()` from the entry point (`content.ts`). Tests can
 * import any of these functions individually without firing chrome.* /
 * DOM listeners on import.
 */

export async function init(): Promise<void> {
  const { enabled } = await getStorageState();

  if (!enabled) {
    console.log(`${LOG_PREFIX} 비활성화 상태 — 실행 건너뜀`);
    return;
  }

  console.log(`${LOG_PREFIX} 익스텐션 시작`);

  await addArcaLinks();
  observeRealtimeUpdates();

  if ("navigation" in window) {
    const nav = window.navigation as EventTarget;
    nav.addEventListener("navigate", () => {
      console.log(`${LOG_PREFIX} 페이지 내비게이션 감지`);
      setTimeout(addArcaLinks, NAV_DELAY_MS);
    });
  }
}

/**
 * Re-check enabled state when it changes via the popup toggle. Returning
 * the registered listener lets tests assert on dispatch behavior without
 * relying on chrome.* mutable globals.
 */
export function setupStorageListener(): (
  changes: { [key: string]: chrome.storage.StorageChange },
  area: chrome.storage.AreaName,
) => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: chrome.storage.AreaName,
  ) => {
    if (area === "local" && "enabled" in changes) {
      const newEnabled = changes["enabled"]?.newValue as boolean;
      if (newEnabled) {
        console.log(`${LOG_PREFIX} 활성화됨 — 링크 추가`);
        addArcaLinks();
      } else {
        console.log(`${LOG_PREFIX} 비활성화됨`);
      }
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return listener;
}

/**
 * Wires up the storage listener and triggers init() at the right
 * lifecycle moment. Called once by `content.ts` at script load.
 */
export function bootstrap(): void {
  setupStorageListener();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void init();
    });
  } else {
    void init();
  }
}
