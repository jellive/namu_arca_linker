export type ChangeType = "added" | "removed" | "modified";

export interface KeywordChange {
  type: ChangeType;
  rank: number;
  oldKeyword?: string;
  newKeyword?: string;
  element?: HTMLElement;
}

export type KeywordState = Map<number, string>;

export type SnapshotBadge = "new" | "up" | "down";

/** JSON-serializable snapshot of a KeywordState at a point in time. */
export interface KeywordSnapshot {
  t: number; // epoch ms
  keywords: [number, string][];
}
