import { validateProject } from '../validation/index.js'
import type { ValidateProjectInput } from '../validation/index.js'
import { SerializationError } from './errors.js'
import { writeDocument } from './canonical.js'
import { compareUtf16, isPlainRecord, parseJsonText } from './json.js'
import { migrateProjectDocument } from './migrate.js'
import { reconstructProject } from './reconstruct.js'
import { assertOwnDataProperties, checkExtensionsPayload, checkProjectPayload } from './schema.js'
import type { JsonObject, LoadedProject, ProjectDocumentV1, SerializeProjectInput } from './types.js'

export function parseProject(text: string): ProjectDocumentV1 {
  if (typeof text !== 'string') {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'parseProject requires JSON text as a string', [])
  }
  return migrateProjectDocument(parseJsonText(text))
}

export function loadProject(text: string): LoadedProject {
  const document = parseProject(text)
  const project = reconstructProject(document)
  const validation = validateProject(project)
  if (!validation.valid) {
    throw new SerializationError('SERIALIZATION_PROJECT_INVALID', 'Loaded project failed validation', ['project'], validation)
  }
  return Object.freeze({ project, extensions: document.extensions, validation })
}

export function serializeProject(input: SerializeProjectInput): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'serializeProject requires an input record', [])
  }
  if (!isPlainRecord(input)) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'serializeProject requires a plain input record; class instances are not supported', [])
  }
  assertOwnDataProperties(input, [])

  const projectDescriptor = Object.getOwnPropertyDescriptor(input, 'project')
  if (projectDescriptor === undefined) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Missing required project', ['project'])
  }
  const projectValue: unknown = projectDescriptor.value
  if (projectValue === undefined) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'Project must be defined', ['project'])
  }
  const storedProject = checkProjectPayload(projectValue, ['project'], 'runtime')

  const extensionsDescriptor = Object.getOwnPropertyDescriptor(input, 'extensions')
  let extensions: JsonObject = {}
  if (extensionsDescriptor !== undefined && extensionsDescriptor.value !== undefined) {
    extensions = checkExtensionsPayload(extensionsDescriptor.value, ['extensions'], 'runtime')
  }

  const known = new Set(['project', 'extensions'])
  const unknown = Object.getOwnPropertyNames(input).filter(key => !known.has(key)).sort(compareUtf16)
  if (unknown.length > 0) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', `Unknown wrapper field ${unknown[0]!}`, [unknown[0]!])
  }

  const validation = validateProject(projectValue as ValidateProjectInput)
  if (!validation.valid) {
    throw new SerializationError('SERIALIZATION_PROJECT_INVALID', 'Project failed validation before save', ['project'], validation)
  }
  return writeDocument({ format: 'ledmap', schemaVersion: 1, project: storedProject, extensions })
}
