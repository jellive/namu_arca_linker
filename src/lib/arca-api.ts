import { LOG_PREFIX } from "../constants/config";

const DEVICE_TOKEN_KEY = "arcaDeviceToken";
const TOKEN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateRandomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_CHARS[bytes[i]! % TOKEN_CHARS.length];
  }
  return out;
}

/**
 * Returns a stable per-install random device token for the arca app API
 * `x-device-token` header. Generated once and persisted to storage.local.
 * The token is NOT registered with arca — any random 64-char string works.
 */
export function getDeviceToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [DEVICE_TOKEN_KEY]: undefined }, (data) => {
      const existing = data[DEVICE_TOKEN_KEY] as string | undefined;
      if (existing) {
        resolve(existing);
        return;
      }
      const token = generateRandomToken(64);
      chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: token }, () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            `${LOG_PREFIX} device-token 저장 실패 —`,
            chrome.runtime.lastError.message,
          );
        }
        resolve(token);
      });
    });
  });
}
