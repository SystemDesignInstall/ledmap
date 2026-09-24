import { decomposeCabinetPixel, moduleIndex } from '../cabinet-engine/index.js'
import type { Cabinet } from '../model/cabinet.js'
import type { Module } from '../model/module.js'
import type { ModuleId } from '../model/ids.js'
import { assertSafeInteger, fail, safeAdd, safeProduct } from './validation.js'

export function resolveCabinetLayout(cabinet: Cabinet, modules: readonly Module[]) {
  const label = `Cabinet ${cabinet.id}`
  for (const field of ['pixelWidth', 'pixelHeight', 'moduleColumns', 'moduleRows', 'width', 'height'] as const) {
    assertSafeInteger(`${label}.${field}`, cabinet[field], 1)
  }
  if (cabinet.rotation !== 0 || cabinet.flipH || cabinet.flipV) {
    fail('UNSUPPORTED_TRANSFORM', `${label}: rotation and flip are not supported`)
  }
  const layout = Object.freeze({
    moduleColumns: cabinet.moduleColumns,
    moduleRows: cabinet.moduleRows,
    modulePixelWidth: cabinet.pixelWidth / cabinet.moduleColumns,
    modulePixelHeight: cabinet.pixelHeight / cabinet.moduleRows,
  })
  const last = decomposeCabinetPixel(layout, { x: cabinet.pixelWidth - 1, y: cabinet.pixelHeight - 1 })
  const pixelCount = safeAdd(`${label} pixel count`, last.cabinetPixelOffset, 1)
  const count = safeProduct(`${label} module count`, layout.moduleColumns, layout.moduleRows)
  if (modules.length !== count) fail('LAYOUT_MISMATCH', `${label}: expected ${count} modules, got ${modules.length}`)
  const moduleIds: ModuleId[] = []
  const positions = new Set<number>()
  for (const module of modules) {
    const index = moduleIndex(layout, module)
    if (positions.has(index)) fail('DUPLICATE', `${label}: module position ${module.column},${module.row}`)
    positions.add(index)
    for (const field of ['width', 'height', 'pixelWidth', 'pixelHeight'] as const) {
      assertSafeInteger(`Module ${module.id}.${field}`, module[field], 1)
    }
    assertSafeInteger(`Module ${module.id}.localX`, module.localX)
    assertSafeInteger(`Module ${module.id}.localY`, module.localY)
    if (
      module.pixelWidth !== layout.modulePixelWidth || module.pixelHeight !== layout.modulePixelHeight ||
      safeProduct(`Module ${module.id} grid width`, module.width, layout.moduleColumns) !== cabinet.width ||
      safeProduct(`Module ${module.id} grid height`, module.height, layout.moduleRows) !== cabinet.height ||
      module.localX !== module.column * module.width || module.localY !== module.row * module.height
    ) fail('LAYOUT_MISMATCH', `${label}: inconsistent module ${module.id}`)
    moduleIds[index] = module.id
  }
  return Object.freeze({ layout, pixelCount, moduleIds: Object.freeze(moduleIds) })
}
