import { LOG_PREFIX } from "../constants/config";

export interface StorageState {
  enabled: boolean;
}

/**
 * Reads the extension's enabled flag (chrome.storage.local). The read is
 * defensive — if the lookup fails (quota exceeded, runtime error), we log a
 * warning and fall through with the value the callback provided.
 */
export function getStorageState(): Promise<StorageState> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ enabled: true }, (local) => {
      if (chrome.runtime.lastError) {
        console.warn(
          `${LOG_PREFIX} getStorageState(local): 스토리지 읽기 실패 —`,
          chrome.runtime.lastError.message,
        );
      }
      resolve({ enabled: local["enabled"] as boolean });
    });
  });
}
