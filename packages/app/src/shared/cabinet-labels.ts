export type CabinetLabelMode =
  | 'row-coordinate' | 'column-coordinate' | 'coordinates'
  | 'row-sequential' | 'column-sequential'
  | 'row-snake' | 'column-snake'
  | 'row-reverse' | 'column-reverse'

export const CABINET_LABEL_MODES: readonly CabinetLabelMode[] = [
  'row-coordinate', 'column-coordinate', 'coordinates',
  'row-sequential', 'column-sequential', 'row-snake', 'column-snake', 'row-reverse', 'column-reverse',
]

export interface CabinetLabelCell {
  readonly id: string
  readonly label?: string | undefined
  readonly column: number
  readonly row: number
}

function letter(index: number): string {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + value % 26) + result
    value = Math.floor(value / 26)
  }
  return result
}

export function automaticCabinetLabel(mode: CabinetLabelMode, columns: number, rows: number, column: number, row: number): string {
  if (mode === 'row-coordinate') return `${letter(row)}${column + 1}`
  if (mode === 'column-coordinate') return `${letter(column)}${row + 1}`
  if (mode === 'coordinates') return `${column + 1},${row + 1}`
  const index = mode === 'column-sequential' ? column * rows + row + 1
    : mode === 'row-snake' ? row * columns + (row % 2 === 0 ? column + 1 : columns - column)
      : mode === 'column-snake' ? column * rows + (column % 2 === 0 ? row + 1 : rows - row)
        : mode === 'row-reverse' ? row * columns + columns - column
          : mode === 'column-reverse' ? column * rows + rows - row
            : row * columns + column + 1
  return String(index).padStart(2, '0')
}

export function physicalCabinetLabel(id: string): string {
  return id.slice(id.lastIndexOf('/') + 1)
}

export function cabinetDisplayLabel(
  mode: CabinetLabelMode, columns: number, rows: number, cabinet: CabinetLabelCell,
): string {
  const manual = cabinet.label?.trim()
  return manual && manual !== physicalCabinetLabel(cabinet.id)
    ? manual : automaticCabinetLabel(mode, columns, rows, cabinet.column, cabinet.row)
}

export function duplicateCabinetLabel(
  mode: CabinetLabelMode, columns: number, rows: number, cabinets: readonly CabinetLabelCell[],
): string | null {
  const seen = new Set<string>()
  for (const cabinet of cabinets) {
    const label = cabinetDisplayLabel(mode, columns, rows, cabinet)
    const key = label.toLocaleLowerCase()
    if (seen.has(key)) return label
    seen.add(key)
  }
  return null
}
