import { createProjectV2 } from '../project-model/create.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { cloneJsonValue, compareUtf16, deepFreeze, isPlainRecord, parseJsonText } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload } from './schema.js'
import type { JsonObject } from './types.js'
import { checkProjectV4Wire } from './v3-schema.js'
import { checkProjectV5Wire } from './v5-schema.js'
import { downgradeV5WireToV4Wire, fromV5Wire, migrateLegacyWireToV5Wire, validateV5Structural } from './v5.js'
import type { LedMapDocumentV4 } from './v4-types.js'

export interface LoadedProjectV4 {
  readonly project: LedMapProjectV2
  readonly extensions: JsonObject
  readonly sourceSchemaVersion: 4
}

function invalid(path: readonly (string | number)[], message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

export function parseProjectV4Document(text: string): LedMapDocumentV4 {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const value = parseJsonText(text)
  if (!isPlainRecord(value)) invalid([], 'Expected a plain JSON document')
  assertOwnDataProperties(value, [])
  if (value['format'] !== 'ledmap') invalid(['format'], 'format must equal ledmap')
  const version = value['schemaVersion']
  if (!Number.isSafeInteger(version) || (version as number) < 0) invalid(['schemaVersion'], 'schemaVersion must be a non-negative safe integer')
  if (version !== 4) {
    throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} is unsupported by the V4 reader`, ['schemaVersion'])
  }
  const project = checkProjectV4Wire(value['project'], 'document')
  const extensions = checkExtensionsPayload(value['extensions'], ['extensions'], 'document')
  const unknown = Object.getOwnPropertyNames(value).filter(key => !['format', 'schemaVersion', 'project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) invalid([unknown[0]!], `Unknown document field ${unknown[0]!}`)
  return deepFreeze({ format: 'ledmap', schemaVersion: 4, project, extensions })
}

export function loadProjectV4(text: string): LoadedProjectV4 {
  const document = parseProjectV4Document(text)
  const v5wire = migrateLegacyWireToV5Wire(document.project)
  const checked = checkProjectV5Wire(v5wire, 'document')
  const candidate = fromV5Wire(checked)
  validateV5Structural(candidate)
  return Object.freeze({ project: createProjectV2(candidate), extensions: document.extensions, sourceSchemaVersion: 4 })
}

export function serializeProjectV4(input: { readonly project: LedMapProjectV2; readonly extensions?: JsonObject }): string {
  if (!isPlainRecord(input)) throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected a plain input record', [])
  assertOwnDataProperties(input, [])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !['project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown input field ${unknown[0]!}`, [unknown[0]!])
  const v5wire = checkProjectV5Wire(input.project, 'runtime')
  validateV5Structural(input.project)
  const v4wire = downgradeV5WireToV4Wire(v5wire)
  checkProjectV4Wire(v4wire, 'runtime')
  const extensions = input.extensions === undefined ? {} : checkExtensionsPayload(input.extensions, ['extensions'], 'runtime')
  return writeDocument({ format: 'ledmap', schemaVersion: 4, project: v4wire,
    extensions: cloneJsonValue(extensions, ['extensions']) as JsonObject })
}
