import {
  LOG_PREFIX,
  SNAPSHOT_HISTORY_CAP,
  STORAGE_KEY_CURRENT_KEYWORDS,
  STORAGE_KEY_SNAPSHOT_HISTORY,
} from "../constants/config";
import { appendSnapshot, toSnapshot } from "./snapshot";
import type { KeywordSnapshot, KeywordState } from "../types/common";

/**
 * chrome.storage.local I/O around the snapshot feature. Pure diff/prune
 * logic lives in `snapshot.ts` — this file only talks to chrome.storage.
 */

/** Called by the content script whenever it observes the current keyword list. */
export function writeCurrentKeywords(keywords: KeywordState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [STORAGE_KEY_CURRENT_KEYWORDS]: toSnapshot(keywords) },
      () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            `${LOG_PREFIX} writeCurrentKeywords 저장 실패 —`,
            chrome.runtime.lastError.message,
          );
        }
        resolve();
      },
    );
  });
}

/** The latest keyword list pushed by any namu.wiki content script, or null if none yet. */
export function readCurrentKeywords(): Promise<KeywordSnapshot | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { [STORAGE_KEY_CURRENT_KEYWORDS]: null },
      (data) => {
        resolve(
          (data[STORAGE_KEY_CURRENT_KEYWORDS] as KeywordSnapshot | null) ??
            null,
        );
      },
    );
  });
}

/** Capped history of periodic snapshots, oldest first. */
export function readSnapshotHistory(): Promise<KeywordSnapshot[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY_SNAPSHOT_HISTORY]: [] }, (data) => {
      resolve((data[STORAGE_KEY_SNAPSHOT_HISTORY] as KeywordSnapshot[]) ?? []);
    });
  });
}

/**
 * chrome.alarms handler body: snapshot whatever keyword list the content
 * script most recently pushed. No-op if no namu.wiki tab has pushed one yet.
 */
export async function recordSnapshot(
  cap: number = SNAPSHOT_HISTORY_CAP,
): Promise<void> {
  const current = await readCurrentKeywords();
  if (!current) {
    console.log(
      `${LOG_PREFIX} 스냅샷 건너뜀 — 아직 나무위키 탭에서 수신된 검색어 없음`,
    );
    return;
  }
  const history = await readSnapshotHistory();
  const next = appendSnapshot(history, current, cap);
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_SNAPSHOT_HISTORY]: next }, () => {
      if (chrome.runtime?.lastError) {
        console.warn(
          `${LOG_PREFIX} recordSnapshot 저장 실패 —`,
          chrome.runtime.lastError.message,
        );
      }
      resolve();
    });
  });
}
