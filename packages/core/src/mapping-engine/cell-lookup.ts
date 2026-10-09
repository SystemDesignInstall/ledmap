export function physicalCellAt<T extends { readonly column: number; readonly row: number }>(
  cells: readonly T[], columns: number, column: number, row: number,
): T | undefined {
  const target = row * columns + column
  let left = 0
  let right = cells.length
  while (left < right) {
    const middle = Math.floor((left + right) / 2)
    const cell = cells[middle]!
    const index = cell.row * columns + cell.column
    if (index < target) left = middle + 1
    else right = middle
  }
  const cell = cells[left]
  return cell && cell.column === column && cell.row === row ? cell : undefined
}
