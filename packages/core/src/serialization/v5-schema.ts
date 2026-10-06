import { SerializationError, type SerializationPath } from './errors.js'
import { canonicalArrayIndex, compareUtf16, isPlainRecord } from './json.js'
import { assertOwnDataProperties } from './schema.js'
import type { JsonValue } from './types.js'
import type { ProjectV5Wire } from './v5-types.js'
import type { ProjectV6Wire } from './v6-types.js'

type Scalar = 'string' | 'boolean' | 'positive' | 'nonnegative' | 'signed' | 'finite' | 'rotation'
type Spec = Scalar | { readonly enum: readonly string[] } | { readonly record: Readonly<Record<string, Spec>> }
  | { readonly array: Spec } | { readonly optional: Spec }
type Mode = 'document' | 'runtime'

const stringArray = { array: 'string' } as const
const point = { record: { x: 'nonnegative', y: 'nonnegative' } } as const
const size = { record: { width: 'positive', height: 'positive' } } as const
const idOnly = { record: { id: 'string' } } as const
const screenRectSpec = { record: { x: 'nonnegative', y: 'nonnegative', width: 'positive', height: 'positive' } } as const
const outputRectSpec = { record: { x: 'signed', y: 'signed', width: 'positive', height: 'positive' } } as const

const capacityMode = { record: { frameRateHz: 'finite', bitDepth: 'finite', linkRateGbps: 'finite' } } as const
const capacityProfile = { optional: { record: {
  name: 'string', source: { record: { kind: { enum: ['manual', 'manufacturer'] }, reference: 'string', revision: 'string' } },
  mode: capacityMode, portPixelCapacity: { optional: 'positive' }, processorPixelCapacity: { optional: 'positive' },
} } } as const
const capacityOverride = { optional: { record: { pixelCapacity: 'positive', reason: 'string', mode: capacityMode } } } as const

function projectShapeV5(version: 5 | 6 = 5): Spec { return { record: {
  metadata: { record: { name: { optional: 'string' }, description: { optional: 'string' } } },
  design: { record: {
    screens: { array: { record: {
      id: 'string', name: 'string', resolution: size,
      cabinetGridOrder: stringArray, mappingRegionOrder: stringArray,
    } } },
    cabinetGrids: { array: { record: {
      id: 'string', screenId: 'string', name: 'string', columns: 'positive', rows: 'positive',
      cabinetWidth: 'positive', cabinetHeight: 'positive', ordering: { record: {
        numbering: { enum: ['row', 'column'] },
        startCorner: { enum: ['top-left', 'top-right', 'bottom-right', 'bottom-left'] },
        direction: { enum: ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'] },
        snake: 'boolean',
      } },
    } } },
    cabinets: { array: { record: {
      id: 'string', gridId: 'string', label: 'string', column: 'nonnegative', row: 'nonnegative',
      origin: point, width: 'positive', height: 'positive', pixelWidth: 'positive', pixelHeight: 'positive',
      moduleColumns: 'positive', moduleRows: 'positive', rotation: 'signed', flipH: 'boolean', flipV: 'boolean',
    } } },
    modules: { array: { record: {
      id: 'string', cabinetId: 'string', column: 'nonnegative', row: 'nonnegative',
      width: 'positive', height: 'positive', pixelWidth: 'positive', pixelHeight: 'positive',
    } } },
    composition: { record: { placements: { array: { record: {
      screenId: 'string', x: 'signed', y: 'signed', locked: 'boolean',
    } } } } },
    stage: { optional: { record: { placements: { array: { record: {
      screenId: 'string', positionMm: { record: { x: 'finite', y: 'finite', z: 'finite' } },
    } } } } } },
  } },
  content: { record: {
    inputCanvases: { array: { record: { id: 'string', resolution: size } } },
    mappingRegions: { array: { record: {
      id: 'string', inputCanvasId: 'string', screenId: 'string', gridId: 'string',
      position: point, size,
    } } },
    mediaOutputs: { array: { record: { id: 'string', name: 'string', resolution: size, mappingOrder: stringArray } } },
    outputMappings: { array: { record: {
      id: 'string', name: 'string', enabled: 'boolean', screenId: 'string', mediaOutputId: 'string',
      screenRect: screenRectSpec, outputRect: outputRectSpec, inputRotation: 'rotation', outputRotation: 'rotation',
      flipX: 'boolean', flipY: 'boolean',
      mask: { optional: { record: { enabled: 'boolean', points: { array: { record: { x: 'finite', y: 'finite' } } } } } },
    } } },
  } },
  hardware: { record: {
    processors: { array: { record: { id: 'string', name: 'string', portCount: 'positive',
      ...(version === 6 ? { capacityProfile } : {}),
    } } },
    ports: { array: { record: {
      id: 'string', processorId: 'string', index: 'nonnegative', receiverCapacity: 'positive',
      ...(version === 6 ? { pixelCapacityOverride: capacityOverride } : {}),
    } } },
    receivers: { array: { record: {
      id: 'string', legacyIndex: 'nonnegative', processorId: 'string', portId: 'string',
      pixelCapacity: { optional: 'positive' },
    } } },
    assignments: { array: { record: {
      id: 'string', target: { record: { kind: { enum: ['cabinet'] }, cabinetId: 'string' } },
      receiverId: 'string', locked: 'boolean', origin: { optional: { enum: ['manual', 'auto'] } },
    } } },
    processorOrder: stringArray,
    receiverOrder: { array: { record: { portId: 'string', receiverIds: stringArray } } },
  } },
  operations: { record: {
    signalRoutes: { array: { record: {
      id: 'string', receiverId: 'string', orderedCabinetIds: stringArray,
    } } },
    backupRoutes: { array: idOnly },
    liveOutputTargets: { array: idOnly },
  } },
  remap: { record: { rules: { array: { record: {
    id: 'string', version: 'string', type: 'string',
  } } } } },
} } }

const projectShapeV5Value = projectShapeV5()
const projectShapeV6Value = projectShapeV5(6)

function fail(mode: Mode, path: SerializationPath, message: string): never {
  throw new SerializationError(mode === 'document' ? 'SERIALIZATION_INVALID_SCHEMA' : 'SERIALIZATION_INVALID_INPUT', message, path)
}

function checkArray(value: unknown, item: Spec, path: SerializationPath, mode: Mode): JsonValue[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(mode, path, 'a plain array')
  assertOwnDataProperties(value, path)
  const names = Object.getOwnPropertyNames(value)
  if (names.length !== value.length + 1 ||
      names.some(key => key !== 'length' && (canonicalArrayIndex(key) === null || Number(key) >= value.length))) {
    fail(mode, path, 'a dense array without extra properties')
  }
  return value.map((entry, index) => check(entry, item, [...path, index], mode))
}

function checkRecord(value: unknown, fields: Readonly<Record<string, Spec>>, path: SerializationPath, mode: Mode): Record<string, JsonValue> {
  if (!isPlainRecord(value)) fail(mode, path, 'a plain JSON object')
  assertOwnDataProperties(value, path)
  const output: Record<string, JsonValue> = {}
  for (const [name, field] of Object.entries(fields)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (descriptor === undefined || (mode === 'runtime' && descriptor.value === undefined && typeof field === 'object' && 'optional' in field)) {
      if (typeof field === 'object' && 'optional' in field) continue
      fail(mode, [...path, name], `a required ${name} field`)
    }
    const actual = typeof field === 'object' && 'optional' in field ? field.optional : field
    output[name] = check(descriptor.value, actual, [...path, name], mode)
  }
  const unknown = Object.getOwnPropertyNames(value).filter(key => !Object.hasOwn(fields, key)).sort(compareUtf16)
  if (unknown.length > 0) fail(mode, [...path, unknown[0]!], `no unknown fields; found ${unknown[0]!}`)
  return output
}

function check(value: unknown, spec: Spec, path: SerializationPath, mode: Mode): JsonValue {
  if (typeof spec === 'object') {
    if ('record' in spec) return checkRecord(value, spec.record, path, mode)
    if ('array' in spec) return checkArray(value, spec.array, path, mode)
    if ('optional' in spec) return check(value, spec.optional, path, mode)
    if (typeof value !== 'string' || !spec.enum.includes(value)) fail(mode, path, `one of: ${spec.enum.join(', ')}`)
    return value
  }
  if (spec === 'string' || spec === 'boolean') {
    if (typeof value !== spec) fail(mode, path, `a ${spec}`)
    return value as string | boolean
  }
  if (spec === 'rotation') {
    if (value !== 0 && value !== 90 && value !== 180 && value !== 270) fail(mode, path, '0, 90, 180 or 270')
    return value as number
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(mode, path, 'a finite number')
  if (spec === 'finite') return value
  if (!Number.isSafeInteger(value) || (spec === 'positive' && value < 1) || (spec === 'nonnegative' && value < 0)) {
    fail(mode, path, `${spec} safe integer`)
  }
  return value
}

export function checkProjectV5Wire(value: unknown, mode: Mode): ProjectV5Wire {
  return check(value, projectShapeV5Value, ['project'], mode) as unknown as ProjectV5Wire
}

export function checkProjectV6Wire(value: unknown, mode: Mode): ProjectV6Wire {
  return check(value, projectShapeV6Value, ['project'], mode) as unknown as ProjectV6Wire
}
