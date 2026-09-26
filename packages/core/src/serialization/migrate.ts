import { SerializationError, type SerializationPath } from './errors.js'
import { compareUtf16, deepFreeze, isPlainRecord } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload, checkProjectPayload, checkProjectPayloadV1 } from './schema.js'
import type { JsonObject, ProjectDocument, StoredProjectV1, StoredProjectV2 } from './types.js'

const rootPath: SerializationPath = []

function schemaFail(path: SerializationPath, message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

function inputFail(path: SerializationPath, message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_INPUT', message, path)
}

function readRootField(value: Record<string, unknown>, key: string): { present: boolean; value: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) return { present: false, value: undefined }
  if (!('value' in descriptor)) inputFail([key], 'own data properties only; accessors are not supported')
  return { present: true, value: descriptor.value }
}

export function migrateProjectDocument(value: unknown): ProjectDocument {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    inputFail(rootPath, 'a JSON document; functions, symbols, bigint and undefined are not representable')
  }
  if (value === null || typeof value !== 'object') schemaFail(rootPath, 'a JSON object document')
  if (Array.isArray(value)) schemaFail(rootPath, 'a JSON object document, not an array')
  if (!isPlainRecord(value)) inputFail(rootPath, 'a plain JSON object document; class instances are not supported')
  assertOwnDataProperties(value, rootPath)

  const format = readRootField(value, 'format')
  if (!format.present) schemaFail(['format'], 'a required format field')
  if (format.value === undefined) inputFail(['format'], 'a defined format value')
  if (format.value !== 'ledmap') schemaFail(['format'], 'format to equal "ledmap"')

  const versionField = readRootField(value, 'schemaVersion')
  if (!versionField.present) schemaFail(['schemaVersion'], 'a required schemaVersion field')
  const version: unknown = versionField.value
  if (version === undefined) inputFail(['schemaVersion'], 'a defined schemaVersion value')
  if (typeof version !== 'number') schemaFail(['schemaVersion'], 'a numeric schemaVersion')
  if (!Number.isFinite(version)) inputFail(['schemaVersion'], 'finite JSON numbers; NaN and Infinity are not representable')
  if (!Number.isSafeInteger(version) || version < 0) schemaFail(['schemaVersion'], 'schemaVersion to be a non-negative safe integer')
  if (version !== 1 && version !== 2) {
    throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} has no approved schema or migration path`, ['schemaVersion'])
  }

  const projectField = readRootField(value, 'project')
  if (!projectField.present) schemaFail(['project'], 'a required project field')
  if (projectField.value === undefined) inputFail(['project'], 'a defined project value')
  const project = version === 1
    ? migrateProjectV1(checkProjectPayloadV1(projectField.value, ['project'], 'document'))
    : checkProjectPayload(projectField.value, ['project'], 'document')

  const extensionsField = readRootField(value, 'extensions')
  if (!extensionsField.present) schemaFail(['extensions'], 'a required extensions field')
  if (extensionsField.value === undefined) inputFail(['extensions'], 'a defined extensions value')
  const extensions: JsonObject = checkExtensionsPayload(extensionsField.value, ['extensions'], 'document')

  const known = new Set(['format', 'schemaVersion', 'project', 'extensions'])
  const unknown = Object.getOwnPropertyNames(value).filter(key => !known.has(key)).sort(compareUtf16)
  for (const key of unknown) schemaFail([key], `no unknown fields; found ${key}`)

  return deepFreeze({ format: 'ledmap', schemaVersion: 2, project, extensions })
}

function migrateProjectV1(project: StoredProjectV1): StoredProjectV2 {
  const { position, size, ...references } = project.mapping.region
  return {
    ...project,
    mapping: {
      ...project.mapping,
      region: {
        ...references,
        inputRect: { x: position.x, y: position.y, width: size.width, height: size.height },
        screenRect: { x: 0, y: 0, width: size.width, height: size.height },
        transform: { inputRotation: 0, screenRotation: 0, flipX: false, flipY: false },
      },
    },
  }
}
