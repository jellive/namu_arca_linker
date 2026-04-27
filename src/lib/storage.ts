import { LOG_PREFIX } from "../constants/config";

export interface TargetSite {
  name: string;
  url: string;
}

export interface StorageState {
  enabled: boolean;
  targetSites: TargetSite[];
}

/**
 * Reads the extension's enabled flag (chrome.storage.local) and the user's
 * configured target sites (chrome.storage.sync). Both reads are defensive —
 * if either lookup fails (quota exceeded, runtime error, sync unavailable
 * because user is signed out of Chrome), we log a warning and fall through
 * with the default values.
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
      chrome.storage.sync.get({ targetSites: [] }, (sync) => {
        if (chrome.runtime.lastError) {
          console.warn(
            `${LOG_PREFIX} getStorageState(sync): 스토리지 읽기 실패 —`,
            chrome.runtime.lastError.message,
          );
        }
        resolve({
          enabled: local["enabled"] as boolean,
          targetSites: sync["targetSites"] as TargetSite[],
        });
      });
    });
  });
}
