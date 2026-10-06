import { convertEditableProjectToV2 } from '../project-model/from-editable.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { loadEditableProject } from './editor-api.js'
import { SerializationError } from './errors.js'
import { isPlainRecord, parseJsonText } from './json.js'
import type { JsonObject } from './types.js'
import { loadProjectV3 } from './v3.js'
import { loadProjectV4 } from './v4.js'
import { loadProjectV5 } from './v5.js'
import { loadProjectV6 } from './v6.js'

export interface LoadedLedMapProject {
  readonly project: LedMapProjectV2
  readonly extensions: JsonObject
  readonly sourceSchemaVersion: 1 | 2 | 3 | 4 | 5 | 6
}

export function loadLedMapProject(text: string): LoadedLedMapProject {
  if (typeof text !== 'string') throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Expected JSON text', [])
  const envelope = parseJsonText(text)
  if (!isPlainRecord(envelope)) throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', 'Expected a document object', [])
  if (envelope['format'] !== 'ledmap') throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', 'Expected ledmap format', ['format'])
  const version = envelope['schemaVersion']
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new SerializationError('SERIALIZATION_INVALID_SCHEMA', 'Expected a non-negative safe schemaVersion', ['schemaVersion'])
  }
  if (version === 3) return loadProjectV3(text)
  if (version === 4) return loadProjectV4(text)
  if (version === 5) return loadProjectV5(text)
  if (version === 6) return loadProjectV6(text)
  if (version === 1 || version === 2) {
    const loaded = loadEditableProject(text)
    return Object.freeze({
      project: convertEditableProjectToV2(loaded.project),
      extensions: loaded.extensions,
      sourceSchemaVersion: loaded.sourceSchemaVersion,
    })
  }
  throw new SerializationError('SERIALIZATION_UNSUPPORTED_VERSION', `schemaVersion ${version} is unsupported`, ['schemaVersion'])
}
