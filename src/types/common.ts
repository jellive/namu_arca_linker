export type ChangeType = 'added' | 'removed' | 'modified'

export interface KeywordChange {
  type: ChangeType
  rank: number
  oldKeyword?: string
  newKeyword: string
  element?: HTMLElement
}

export type KeywordState = Map<number, string>
