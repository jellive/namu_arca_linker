import { LOG_PREFIX, NAV_DELAY_MS } from "../constants/config";
import {
  addArcaLinks,
  removeArcaLinks,
  setLinksEnabled,
} from "../layers/manipulation";
import { onRealtimeChange, observeRealtimeUpdates } from "../layers/observer";
import { getStorageState } from "./storage";

/**
 * Pure boot logic for the content script. Side-effect-free at module load
 * — call `bootstrap()` from the entry point (`content.ts`). Tests can
 * import any of these functions individually without firing chrome.* /
 * DOM listeners on import.
 */

// Whether the observer and listeners are up. A page opened while disabled
// starts them only when the popup turns the extension ON.
let watching = false;

function startWatching(): void {
  watching = true;
  observeRealtimeUpdates();
  onRealtimeChange(() => {
    void addArcaLinks();
  });

  if ("navigation" in window) {
    const nav = window.navigation as EventTarget;
    nav.addEventListener("navigate", () => {
      setTimeout(() => {
        void addArcaLinks();
      }, NAV_DELAY_MS);
    });
  }
}

export async function init(): Promise<void> {
  const { enabled } = await getStorageState();

  if (!enabled) {
    setLinksEnabled(false);
    console.log(`${LOG_PREFIX} 비활성화 상태 — 실행 건너뜀`);
    return;
  }

  console.log(`${LOG_PREFIX} 익스텐션 시작`);

  await addArcaLinks();
  startWatching();
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
        setLinksEnabled(true);
        void addArcaLinks();
        if (!watching) startWatching();
      } else {
        console.log(`${LOG_PREFIX} 비활성화됨`);
        setLinksEnabled(false);
        removeArcaLinks();
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
