import {
  activePixelIndices, columnMajorIndex, deriveCabinetGeometry, findModuleProfile,
  rowMajorIndex, transportOrderKey,
} from './geometry.js'
import type {
  CabinetPhysicalGeometry, HardwareProfileBundle, TransportPixelCoordinate, TransportPixelResolution,
  TransportScanMode,
} from './types.js'

const INACTIVE: TransportPixelResolution = Object.freeze({ active: false, transportIndex: null })

interface OrderedActiveSet {
  readonly geometry: CabinetPhysicalGeometry
  readonly scanMode: TransportScanMode
  readonly indices: readonly number[] | null
  readonly count: number
}

function resolveCabinetGeometry(bundle: HardwareProfileBundle): CabinetPhysicalGeometry {
  const transport = bundle.pixelTransportProfile
  const moduleProfile = findModuleProfile(bundle, transport.moduleProfileId)
  if (moduleProfile === undefined) {
    throw new TypeError(`hardware profile invariant: unknown moduleProfileId ${transport.moduleProfileId}`)
  }
  const geometry = deriveCabinetGeometry(
    moduleProfile.physicalWidth, moduleProfile.physicalHeight, moduleProfile.moduleCountX, moduleProfile.moduleCountY,
  )
  if (geometry === null) {
    throw new TypeError(`hardware profile invariant: module profile ${moduleProfile.identity.id} has invalid geometry`)
  }
  return geometry
}

function orderedActiveSet(bundle: HardwareProfileBundle): OrderedActiveSet {
  const transport = bundle.pixelTransportProfile
  const geometry = resolveCabinetGeometry(bundle)
  const indices = activePixelIndices(bundle, geometry)
  const count = indices === null ? geometry.width * geometry.height : indices.length
  return { geometry, scanMode: transport.scanMode, indices, count }
}

function transportRank(set: OrderedActiveSet, rowMajor: number): number {
  const { indices, geometry, scanMode } = set
  if (indices === null) {
    return scanMode === 'ROW_MAJOR' ? rowMajor : columnMajorIndex(rowMajor % geometry.width, Math.floor(rowMajor / geometry.width), geometry.height)
  }
  const target = transportOrderKey(rowMajor, geometry.width, geometry.height, scanMode)
  let rank = 0
  for (const index of indices) {
    if (transportOrderKey(index, geometry.width, geometry.height, scanMode) < target) rank += 1
  }
  return rank
}

export function resolveTransportPixel(
  bundle: HardwareProfileBundle,
  x: number,
  y: number,
): TransportPixelResolution {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new TypeError('resolveTransportPixel: x and y must be integers')
  }
  const set = orderedActiveSet(bundle)
  const { width, height } = set.geometry
  if (x < 0 || y < 0 || x >= width || y >= height) return INACTIVE
  const rowMajor = rowMajorIndex(x, y, width)
  if (set.indices !== null && !set.indices.includes(rowMajor)) return INACTIVE
  return Object.freeze({ active: true, transportIndex: transportRank(set, rowMajor) })
}

export function unresolveTransportPixel(
  bundle: HardwareProfileBundle,
  transportIndex: number,
): TransportPixelCoordinate | null {
  if (!Number.isInteger(transportIndex)) {
    throw new TypeError('unresolveTransportPixel: transportIndex must be an integer')
  }
  const set = orderedActiveSet(bundle)
  const { width, height } = set.geometry
  if (transportIndex < 0 || transportIndex >= bundle.pixelTransportProfile.transportPixelCountPerCabinet) return null
  if (set.indices === null) {
    const x = set.scanMode === 'ROW_MAJOR' ? transportIndex % width : Math.floor(transportIndex / height)
    const y = set.scanMode === 'ROW_MAJOR' ? Math.floor(transportIndex / width) : transportIndex % height
    return Object.freeze({ x, y })
  }
  if (transportIndex >= set.count) return null
  const ordered = [...set.indices].sort(
    (left, right) => transportOrderKey(left, width, height, set.scanMode) - transportOrderKey(right, width, height, set.scanMode),
  )
  const rowMajor = ordered[transportIndex]
  if (rowMajor === undefined) return null
  return Object.freeze({ x: rowMajor % width, y: Math.floor(rowMajor / width) })
}
