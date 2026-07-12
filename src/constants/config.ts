export const FADE_DURATION_MS = 200;
export const DEBOUNCE_DELAY_MS = 100;
export const NAV_DELAY_MS = 500;
export const DOM_READY_DELAY_MS = 100;

export const CSS_CLASS_ARCA_LINK = "arca-link";
export const CSS_CLASS_LINKS_CONTAINER = "arca-links";
export const DATA_ATTR_PROCESSED = "data-arca-processed";

export const ARCA_BASE_URL = "https://arca.live/b/namuhotnow";
export const LOG_PREFIX = "[나무위키 아카링커]";

export const DATA_ATTR_THREAD = "data-arca-thread";
export const ARCA_SEARCH_TEMPLATE = `${ARCA_BASE_URL}?target=all&keyword={keyword}`;

export const STORAGE_KEY_CURRENT_KEYWORDS = "currentKeywords";
export const STORAGE_KEY_SNAPSHOT_HISTORY = "snapshotHistory";
export const SNAPSHOT_ALARM_NAME = "namu-keyword-snapshot";
export const SNAPSHOT_INTERVAL_MIN = 5;
export const SNAPSHOT_HISTORY_CAP = 48; // 48 * 5min = 4h
