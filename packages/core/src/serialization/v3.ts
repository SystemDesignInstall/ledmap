import { createProjectV2 } from '../project-model/create.js'
import { validateProjectV2Structural } from '../project-model/read-projections.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { cloneJsonValue, compareUtf16, deepFreeze, isPlainRecord, parseJsonText } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload } from './schema.js'
import type { JsonObject } from './types.js'
import { checkProjectV3Wire } from './v3-schema.js'
import { checkProjectV5Wire } from './v5-schema.js'
import { downgradeV5WireToV3Wire, fromV5Wire, migrateLegacyWireToV5Wire, validateV5Structural } from './v5.js'
import type { LedMapDocumentV3, ProjectV3Wire } from './v3-types.js'

export interface LoadedProjectV3 {
  readonly project: LedMapProjectV2
  readonly extensions: JsonObject
  readonly sourceSchemaVersion: 3
}

function invalid(path: readonly (string | number)[], message: string): never {
  throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', message, path)
}

export function validateStructural(project: LedMapProjectV2): void {
  const diagnostic = validateProjectV2Structural(project)[0]
  if (diagnostic) {
    throw new SerializationError('SERIALIZATION_PROJECT_INVALID', `${diagnostic.code}: ${diagnostic.message}`, ['project', ...diagnostic.path])
  }
}

export function fromWire(wire: ProjectV3Wire): LedMapProjectV2 {
  return fromV5Wire(migrateLegacyWireToV5Wire(wire))
}

export function parseProjectV3Document(text: string): LedMapDocumentV3 {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const value = parseJsonText(text)
  if (!isPlainRecord(value)) invalid([], 'Expected a plain JSON document')
  assertOwnDataProperties(value, [])
  if (value['format'] !== 'ledmap') invalid(['format'], 'format must equal ledmap')
  const version = value['schemaVersion']
  if (!Number.isSafeInteger(version) || (version as number) < 0) invalid(['schemaVersion'], 'schemaVersion must be a non-negative safe integer')
  if (version !== 3) {
    throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} is unsupported by the V3 reader`, ['schemaVersion'])
  }
  const project = checkProjectV3Wire(value['project'], 'document')
  const extensions = checkExtensionsPayload(value['extensions'], ['extensions'], 'document')
  const unknown = Object.getOwnPropertyNames(value).filter(key => !['format', 'schemaVersion', 'project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) invalid([unknown[0]!], `Unknown document field ${unknown[0]!}`)
  return deepFreeze({ format: 'ledmap', schemaVersion: 3, project, extensions })
}

export function loadProjectV3(text: string): LoadedProjectV3 {
  const document = parseProjectV3Document(text)
  const v5wire = migrateLegacyWireToV5Wire(document.project)
  const checked = checkProjectV5Wire(v5wire, 'document')
  const candidate = fromV5Wire(checked)
  validateV5Structural(candidate)
  const project = createProjectV2(candidate)
  return Object.freeze({ project, extensions: document.extensions, sourceSchemaVersion: 3 })
}

export function serializeProjectV3(input: { readonly project: LedMapProjectV2; readonly extensions?: JsonObject }): string {
  if (!isPlainRecord(input)) throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected a plain input record', [])
  assertOwnDataProperties(input, [])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !['project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown input field ${unknown[0]!}`, [unknown[0]!])
  const v5wire = checkProjectV5Wire(input.project, 'runtime')
  validateV5Structural(input.project)
  const project = downgradeV5WireToV3Wire(v5wire)
  checkProjectV3Wire(project, 'runtime')
  const extensions = input.extensions === undefined ? {} : checkExtensionsPayload(input.extensions, ['extensions'], 'runtime')
  return writeDocument({ format: 'ledmap', schemaVersion: 3, project,
    extensions: cloneJsonValue(extensions, ['extensions']) as JsonObject })
}
