import type { SelectedObject } from './project.js'

export interface SelectionState {
  readonly items: readonly SelectedObject[]
  readonly primary: SelectedObject | null
}

function itemKey(item: SelectedObject): string {
  return item.type === 'cabinet' ? `cabinet:${item.screenId}:${item.id}` : `${item.type}:${item.id}`
}

export function emptySelection(): SelectionState {
  return { items: [], primary: null }
}

export function selectSingle(item: SelectedObject): SelectionState {
  return { items: [item], primary: item }
}

export function toggleSelection(state: SelectionState, item: SelectedObject): SelectionState {
  const key = itemKey(item)
  if (!state.items.some(current => itemKey(current) === key)) {
    return { items: [...state.items, item], primary: item }
  }
  const rest = state.items.filter(current => itemKey(current) !== key)
  const primary = state.primary !== null && itemKey(state.primary) === key
    ? (rest.length > 0 ? rest[rest.length - 1]! : null)
    : state.primary
  return { items: rest, primary }
}

export function applyBoxSelection(
  state: SelectionState,
  matched: readonly SelectedObject[],
  additive: boolean,
): SelectionState {
  if (!additive) {
    return { items: matched, primary: matched.length > 0 ? matched[matched.length - 1]! : null }
  }
  const known = new Set(state.items.map(itemKey))
  const added = matched.filter(item => !known.has(itemKey(item)))
  if (added.length === 0) return state
  return { items: [...state.items, ...added], primary: added[added.length - 1]! }
}

export function repairSelection(state: SelectionState, isAlive: (item: SelectedObject) => boolean): SelectionState {
  const items = state.items.filter(isAlive)
  const primary = state.primary !== null && isAlive(state.primary)
    ? state.primary
    : (items.length > 0 ? items[items.length - 1]! : null)
  return { items, primary }
}

export function selectedScreenIds(state: SelectionState): string[] {
  const ids: string[] = []
  for (const item of state.items) {
    if (item.type === 'screen') ids.push(item.id)
  }
  return ids
}

export function isSelected(state: SelectionState, type: SelectedObject['type'], id: string): boolean {
  return state.items.some(item => item.type === type && item.id === id)
}

export function groupActionBlocker(lockedIds: readonly string[], screenIds: readonly string[]): string | null {
  return screenIds.some(id => lockedIds.includes(id)) ? 'Selection contains a locked Screen.' : null
}
