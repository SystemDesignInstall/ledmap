import { createProjectV2 } from '../project-model/create.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { cloneJsonValue, compareUtf16, deepFreeze, isPlainRecord, parseJsonText } from './json.js'
import { assertOwnDataProperties, checkExtensionsPayload } from './schema.js'
import type { JsonObject } from './types.js'
import { fromV5Wire, validateV5Structural } from './v5.js'
import { checkProjectV6Wire } from './v5-schema.js'
import type { LedMapDocumentV6 } from './v6-types.js'

export function parseProjectV6Document(text: string): LedMapDocumentV6 {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const value = parseJsonText(text)
  if (!isPlainRecord(value) || value['format'] !== 'ledmap' || value['schemaVersion'] !== 6) {
    throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', 'Expected ledmap schemaVersion 6', [])
  }
  const unknown = Object.getOwnPropertyNames(value).filter(key => !['format', 'schemaVersion', 'project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', `Unknown document field ${unknown[0]!}`, [unknown[0]!])
  const project = checkProjectV6Wire(value['project'], 'document')
  const extensions = checkExtensionsPayload(value['extensions'], ['extensions'], 'document')
  validateV5Structural(fromV5Wire(project))
  return deepFreeze({ format: 'ledmap', schemaVersion: 6, project, extensions })
}

export function loadProjectV6(text: string): { readonly project: LedMapProjectV2; readonly extensions: JsonObject; readonly sourceSchemaVersion: 6 } {
  const document = parseProjectV6Document(text)
  return Object.freeze({ project: createProjectV2(fromV5Wire(document.project)), extensions: document.extensions, sourceSchemaVersion: 6 })
}

export function serializeProjectV6(input: { readonly project: LedMapProjectV2; readonly extensions?: JsonObject }): string {
  if (!isPlainRecord(input)) throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected a plain input record', [])
  assertOwnDataProperties(input, [])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !['project', 'extensions'].includes(key)).sort(compareUtf16)
  if (unknown.length > 0) throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown input field ${unknown[0]!}`, [unknown[0]!])
  const project = checkProjectV6Wire(input.project, 'runtime')
  validateV5Structural(input.project)
  const extensions = input.extensions === undefined ? {} : checkExtensionsPayload(input.extensions, ['extensions'], 'runtime')
  return writeDocument({ format: 'ledmap', schemaVersion: 6, project,
    extensions: cloneJsonValue(extensions, ['extensions']) as JsonObject })
}
