import type { CabinetPhysicalGeometry, HardwareProfileBundle, ModuleProfile, TransportScanMode } from './types.js'

export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function deriveCabinetGeometry(
  physicalWidth: number,
  physicalHeight: number,
  moduleCountX: number,
  moduleCountY: number,
): CabinetPhysicalGeometry | null {
  if (!isPositiveSafeInteger(physicalWidth) || !isPositiveSafeInteger(physicalHeight)) return null
  if (!isPositiveSafeInteger(moduleCountX) || !isPositiveSafeInteger(moduleCountY)) return null
  const width = physicalWidth * moduleCountX
  const height = physicalHeight * moduleCountY
  if (!isPositiveSafeInteger(width) || !isPositiveSafeInteger(height)) return null
  return { width, height }
}

export function findModuleProfile(
  bundle: HardwareProfileBundle,
  moduleProfileId: string,
): ModuleProfile | undefined {
  return bundle.moduleProfiles.find(profile => profile.identity.id === moduleProfileId)
}

export function rowMajorIndex(x: number, y: number, width: number): number {
  return y * width + x
}

export function columnMajorIndex(x: number, y: number, height: number): number {
  return x * height + y
}

export function transportOrderKey(
  rowMajor: number,
  width: number,
  height: number,
  scanMode: TransportScanMode,
): number {
  if (scanMode === 'ROW_MAJOR') return rowMajor
  const x = rowMajor % width
  return x * height + Math.floor(rowMajor / width)
}

export function activePixelIndices(
  bundle: HardwareProfileBundle,
  geometry: CabinetPhysicalGeometry,
): readonly number[] | null {
  const mask = bundle.pixelTransportProfile.activePixelMask
  if (mask === undefined) return null
  const { width, height } = geometry
  const indices: number[] = []
  for (const active of mask.activePixels) {
    if (active < 0 || active >= width * height) continue
    indices.push(active)
  }
  return indices
}
