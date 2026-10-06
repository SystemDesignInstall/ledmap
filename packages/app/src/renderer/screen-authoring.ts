import type { Draft } from './state.js'
import type { ScreenView } from './v2-view-model.js'

export function screenCreationDraft(
  columns: string,
  rows: string,
  geometry: { readonly mode: 'basic'; readonly width: string; readonly height: string } | {
    readonly mode: 'advanced'
    readonly moduleColumns: string
    readonly moduleRows: string
    readonly moduleWidth: string
    readonly moduleHeight: string
  },
  ordering: Draft['ordering'],
): Draft {
  return {
    columns, rows,
    moduleColumns: geometry.mode === 'basic' ? '1' : geometry.moduleColumns,
    moduleRows: geometry.mode === 'basic' ? '1' : geometry.moduleRows,
    modulePixelWidth: geometry.mode === 'basic' ? geometry.width : geometry.moduleWidth,
    modulePixelHeight: geometry.mode === 'basic' ? geometry.height : geometry.moduleHeight,
    ordering,
  }
}

export function nextScreenPosition(screens: readonly Pick<ScreenView, 'x' | 'y' | 'grid'>[]): { x: number; y: number } {
  if (screens.length === 0) return { x: 0, y: 0 }
  const right = Math.max(...screens.map(screen => screen.x + screen.grid.columns * screen.grid.cabinetWidth))
  if (!Number.isSafeInteger(right + 64)) throw new Error('No safe position remains for another Screen.')
  return { x: right + 64, y: 0 }
}

export function manualScreenPosition(x: string, y: string): { x: number; y: number } {
  const position = { x: Number(x), y: Number(y) }
  if (!x.trim() || !y.trim() || !Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y) ||
      position.x < 0 || position.y < 0) {
    throw new Error('Screen position must use non-negative whole numbers.')
  }
  return position
}
