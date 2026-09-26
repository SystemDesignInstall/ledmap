import { SerializationError, type SerializationPath } from './errors.js'
import { canonicalArrayIndex, cloneJsonValue, compareUtf16, isPlainRecord } from './json.js'
import type { JsonObject, JsonValue, StoredProjectV1, StoredProjectV2 } from './types.js'

export type SchemaMode = 'document' | 'runtime'

interface StringField {
  readonly name: string
  readonly type: 'string'
  readonly optional?: boolean
}

interface NumberField {
  readonly name: string
  readonly type: 'number'
  readonly optional?: boolean
  readonly values?: readonly number[]
}

interface BooleanField {
  readonly name: string
  readonly type: 'boolean'
}

interface EnumField {
  readonly name: string
  readonly type: 'enum'
  readonly values: readonly string[]
}

interface RecordField {
  readonly name: string
  readonly type: 'record'
  readonly fields: readonly FieldSpec[]
  readonly optional?: boolean
}

interface ArrayField {
  readonly name: string
  readonly type: 'array'
  readonly items: ItemSpec
}

type FieldSpec = StringField | NumberField | BooleanField | EnumField | RecordField | ArrayField

type ItemSpec =
  | { readonly kind: 'string' }
  | { readonly kind: 'record'; readonly fields: readonly FieldSpec[] }
  | { readonly kind: 'module' }
  | { readonly kind: 'json' }

function fail(mode: SchemaMode, path: SerializationPath, message: string): never {
  const code = mode === 'document' ? 'SERIALIZATION_INVALID_SCHEMA' : 'SERIALIZATION_INVALID_INPUT'
  throw new SerializationError(code, message, path)
}

function boundaryFail(path: SerializationPath, message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_INPUT', message, path)
}

const sizeFields: readonly FieldSpec[] = [
  { name: 'width', type: 'number' },
  { name: 'height', type: 'number' },
]

const xyFields: readonly FieldSpec[] = [
  { name: 'x', type: 'number' },
  { name: 'y', type: 'number' },
]

const stringItems: ItemSpec = { kind: 'string' }

const inputCanvasFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'resolution', type: 'record', fields: sizeFields },
]

const screenFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'resolution', type: 'record', fields: sizeFields },
  { name: 'mappingRegions', type: 'array', items: stringItems },
  { name: 'cabinetGrids', type: 'array', items: stringItems },
]

const orderingFields: readonly FieldSpec[] = [
  { name: 'numbering', type: 'enum', values: ['row', 'column'] },
  { name: 'startCorner', type: 'enum', values: ['top-left', 'top-right', 'bottom-right', 'bottom-left'] },
  { name: 'direction', type: 'enum', values: ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top'] },
  { name: 'snake', type: 'boolean' },
]

const gridFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'screen', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'columns', type: 'number' },
  { name: 'rows', type: 'number' },
  { name: 'cabinetWidth', type: 'number' },
  { name: 'cabinetHeight', type: 'number' },
  { name: 'ordering', type: 'record', fields: orderingFields },
]

const regionFieldsV1: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'inputCanvas', type: 'string' },
  { name: 'screen', type: 'string' },
  { name: 'grid', type: 'string' },
  { name: 'position', type: 'record', fields: xyFields },
  { name: 'size', type: 'record', fields: sizeFields },
]

const rectFields: readonly FieldSpec[] = [...xyFields, ...sizeFields]

const maskFields: readonly FieldSpec[] = [
  { name: 'enabled', type: 'boolean' },
  { name: 'points', type: 'array', items: { kind: 'record', fields: xyFields } },
]

const transformFields: readonly FieldSpec[] = [
  { name: 'inputRotation', type: 'number', values: [0, 90, 180, 270] },
  { name: 'screenRotation', type: 'number', values: [0, 90, 180, 270] },
  { name: 'flipX', type: 'boolean' },
  { name: 'flipY', type: 'boolean' },
  { name: 'mask', type: 'record', fields: maskFields, optional: true },
]

const regionFieldsV2: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'inputCanvas', type: 'string' },
  { name: 'screen', type: 'string' },
  { name: 'grid', type: 'string' },
  { name: 'inputRect', type: 'record', fields: rectFields },
  { name: 'screenRect', type: 'record', fields: rectFields },
  { name: 'transform', type: 'record', fields: transformFields },
]

const processorFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'portCount', type: 'number' },
]

const portFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'processor', type: 'string' },
  { name: 'index', type: 'number' },
  { name: 'receiverCapacity', type: 'number' },
]

const receiverFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'processor', type: 'string' },
  { name: 'port', type: 'string' },
  { name: 'index', type: 'number' },
  { name: 'cabinets', type: 'array', items: stringItems },
  { name: 'pixelCapacity', type: 'number', optional: true },
]

const cabinetFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'grid', type: 'string' },
  { name: 'column', type: 'number' },
  { name: 'row', type: 'number' },
  { name: 'origin', type: 'record', fields: xyFields },
  { name: 'width', type: 'number' },
  { name: 'height', type: 'number' },
  { name: 'pixelWidth', type: 'number' },
  { name: 'pixelHeight', type: 'number' },
  { name: 'moduleColumns', type: 'number' },
  { name: 'moduleRows', type: 'number' },
  { name: 'rotation', type: 'number' },
  { name: 'flipH', type: 'boolean' },
  { name: 'flipV', type: 'boolean' },
]

const storedModuleFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'cabinet', type: 'string' },
  { name: 'column', type: 'number' },
  { name: 'row', type: 'number' },
  { name: 'width', type: 'number' },
  { name: 'height', type: 'number' },
  { name: 'pixelWidth', type: 'number' },
  { name: 'pixelHeight', type: 'number' },
]

const runtimeModuleFields: readonly FieldSpec[] = [
  { name: 'id', type: 'string' },
  { name: 'cabinet', type: 'string' },
  { name: 'column', type: 'number' },
  { name: 'row', type: 'number' },
  { name: 'localX', type: 'number' },
  { name: 'localY', type: 'number' },
  { name: 'width', type: 'number' },
  { name: 'height', type: 'number' },
  { name: 'pixelWidth', type: 'number' },
  { name: 'pixelHeight', type: 'number' },
]

const receiverOrderFields: readonly FieldSpec[] = [
  { name: 'port', type: 'string' },
  { name: 'receivers', type: 'array', items: stringItems },
]

const topologyFields: readonly FieldSpec[] = [
  { name: 'processors', type: 'array', items: { kind: 'record', fields: processorFields } },
  { name: 'ports', type: 'array', items: { kind: 'record', fields: portFields } },
  { name: 'receivers', type: 'array', items: { kind: 'record', fields: receiverFields } },
  { name: 'cabinets', type: 'array', items: { kind: 'record', fields: cabinetFields } },
  { name: 'modules', type: 'array', items: { kind: 'module' } },
  { name: 'processorOrder', type: 'array', items: stringItems },
  { name: 'receiverOrder', type: 'array', items: { kind: 'record', fields: receiverOrderFields } },
]

const mappingFieldsV1: readonly FieldSpec[] = [
  { name: 'inputCanvas', type: 'record', fields: inputCanvasFields },
  { name: 'screen', type: 'record', fields: screenFields },
  { name: 'grid', type: 'record', fields: gridFields },
  { name: 'region', type: 'record', fields: regionFieldsV1 },
  { name: 'hardwareTopology', type: 'record', fields: topologyFields },
]

const mappingFieldsV2: readonly FieldSpec[] = [
  { name: 'inputCanvas', type: 'record', fields: inputCanvasFields },
  { name: 'screen', type: 'record', fields: screenFields },
  { name: 'grid', type: 'record', fields: gridFields },
  { name: 'region', type: 'record', fields: regionFieldsV2 },
  { name: 'hardwareTopology', type: 'record', fields: topologyFields },
]

const projectFieldsV1: readonly FieldSpec[] = [
  { name: 'mapping', type: 'record', fields: mappingFieldsV1 },
  { name: 'rules', type: 'array', items: { kind: 'json' } },
]

const projectFieldsV2: readonly FieldSpec[] = [
  { name: 'mapping', type: 'record', fields: mappingFieldsV2 },
  { name: 'rules', type: 'array', items: { kind: 'json' } },
]

export function assertOwnDataProperties(value: object, path: SerializationPath): void {
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!('value' in descriptor)) boundaryFail([...path, key], 'own data properties only; accessors are not supported')
  }
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    boundaryFail([...path, symbol.description ?? 'symbol'], 'values without symbol keys')
  }
}

function checkDenseArray(value: unknown, path: SerializationPath, mode: SchemaMode): readonly unknown[] {
  if (!Array.isArray(value)) fail(mode, path, 'an array')
  if (Object.getPrototypeOf(value) !== Array.prototype) boundaryFail(path, 'a plain array; subclasses are not supported')
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    boundaryFail([...path, symbol.description ?? 'symbol'], 'arrays without symbol keys')
  }
  const length = (Object.getOwnPropertyDescriptor(value, 'length') as { value: number }).value
  let indexCount = 0
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue
    const index = canonicalArrayIndex(key)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (index === null || index >= length) boundaryFail([...path, key], 'a plain array without extra own properties')
    if (!('value' in descriptor)) boundaryFail([...path, key], 'own data properties only; accessors are not supported')
    indexCount += 1
  }
  if (indexCount !== length) boundaryFail(path, 'a dense array without holes')
  return value
}

function checkNumber(value: unknown, path: SerializationPath, mode: SchemaMode): number {
  if (typeof value !== 'number') fail(mode, path, 'a finite JSON number')
  if (!Number.isFinite(value)) boundaryFail(path, 'finite JSON numbers; NaN and Infinity are not representable')
  return value
}

function checkItem(items: ItemSpec, value: unknown, path: SerializationPath, mode: SchemaMode): JsonValue {
  if (items.kind === 'string') {
    if (typeof value !== 'string') fail(mode, path, 'a string')
    return value
  }
  if (items.kind === 'json') return cloneJsonValue(value, path)
  if (items.kind === 'module') {
    const checked = checkRecordFields(value, mode === 'runtime' ? runtimeModuleFields : storedModuleFields, path, mode)
    if (mode === 'runtime') {
      delete checked['localX']
      delete checked['localY']
    }
    return checked as JsonValue
  }
  return checkRecordFields(value, items.fields, path, mode) as JsonValue
}

function checkFieldValue(field: FieldSpec, value: unknown, path: SerializationPath, mode: SchemaMode): JsonValue {
  if (field.type === 'string') {
    if (typeof value !== 'string') fail(mode, path, 'a string')
    return value
  }
  if (field.type === 'number') {
    const checked = checkNumber(value, path, mode)
    if (field.values !== undefined && !field.values.includes(checked)) fail(mode, path, `one of: ${field.values.join(', ')}`)
    return checked
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') fail(mode, path, 'a boolean')
    return value
  }
  if (field.type === 'enum') {
    if (typeof value !== 'string' || !field.values.includes(value)) fail(mode, path, `one of: ${field.values.join(', ')}`)
    return value
  }
  if (field.type === 'record') return checkRecordFields(value, field.fields, path, mode) as JsonValue
  const array = checkDenseArray(value, path, mode)
  return array.map((item, index) => checkItem(field.items, item, [...path, index], mode))
}

function checkRecordFields(value: unknown, fields: readonly FieldSpec[], path: SerializationPath, mode: SchemaMode): Record<string, JsonValue> {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    boundaryFail(path, 'a plain JSON object; functions, symbols, bigint and undefined are not representable')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(mode, path, 'a plain JSON object')
  if (!isPlainRecord(value)) boundaryFail(path, 'a plain JSON object; class instances are not supported')
  assertOwnDataProperties(value, path)
  const output: Record<string, JsonValue> = {}
  const known = new Set<string>()
  for (const field of fields) {
    known.add(field.name)
    const fieldPath: SerializationPath = [...path, field.name]
    const descriptor = Object.getOwnPropertyDescriptor(value, field.name)
    if (descriptor === undefined) {
      if ('optional' in field && field.optional) continue
      fail(mode, fieldPath, `a required ${field.name} field`)
    }
    if (!('value' in descriptor)) boundaryFail(fieldPath, 'own data properties only; accessors are not supported')
    const fieldValue: unknown = descriptor.value
    if (fieldValue === undefined) {
      if ('optional' in field && field.optional && mode === 'runtime') continue
      boundaryFail(fieldPath, 'a defined value; undefined is only allowed for optional fields at save')
    }
    output[field.name] = checkFieldValue(field, fieldValue, fieldPath, mode)
  }
  const unknown = Object.getOwnPropertyNames(value).filter(key => !known.has(key)).sort(compareUtf16)
  for (const key of unknown) fail(mode, [...path, key], `no unknown fields; found ${key}`)
  return output
}

export function checkProjectPayloadV1(value: unknown, path: SerializationPath, mode: SchemaMode): StoredProjectV1 {
  return checkRecordFields(value, projectFieldsV1, path, mode) as unknown as StoredProjectV1
}

export function checkProjectPayload(value: unknown, path: SerializationPath, mode: SchemaMode): StoredProjectV2 {
  return checkRecordFields(value, projectFieldsV2, path, mode) as unknown as StoredProjectV2
}

export function checkExtensionsPayload(value: unknown, path: SerializationPath, mode: SchemaMode): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(mode, path, 'a JSON object for extensions')
  if (!isPlainRecord(value)) boundaryFail(path, 'a plain JSON object; class instances are not supported')
  return cloneJsonValue(value, path) as JsonObject
}
