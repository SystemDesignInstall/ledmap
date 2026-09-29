import {
  editableProjectFromValidatedProject,
  inspectEditableProject,
  type EditableProject,
  type EditableProjectDiagnostic,
} from '../editor-project/index.js'
import { validateProject } from '../validation/index.js'
import { writeDocument } from './canonical.js'
import { SerializationError } from './errors.js'
import { reconstructEditableProject } from './editor-reconstruct.js'
import { compareUtf16, isPlainRecord, parseJsonText } from './json.js'
import { migrateEditableProjectDocument } from './migrate.js'
import { reconstructProject } from './reconstruct.js'
import { assertOwnDataProperties, checkEditableProjectPayload, checkExtensionsPayload } from './schema.js'
import type {
  EditableProjectDocument,
  JsonObject,
  LoadedEditableProject,
  ProjectDocumentV2,
  SerializeEditableProjectInput,
} from './types.js'

function projectInvalid(diagnostics: readonly EditableProjectDiagnostic[]): never {
  throw new SerializationError(
    'SERIALIZATION_PROJECT_INVALID',
    'Editable project failed integrity checks',
    ['project'],
    undefined,
    diagnostics,
  )
}

export function parseEditableProjectDocument(text: string): EditableProjectDocument {
  if (typeof text !== 'string') {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'parseEditableProjectDocument requires JSON text as a string', [])
  }
  return migrateEditableProjectDocument(parseJsonText(text))
}

export function loadEditableProject(text: string): LoadedEditableProject {
  const document = parseEditableProjectDocument(text)
  if (document.schemaVersion === 1) {
    const validatedProject = reconstructProject(document)
    const validation = validateProject(validatedProject)
    if (!validation.valid) {
      throw new SerializationError('SERIALIZATION_PROJECT_INVALID', 'Loaded v1 project failed validation', ['project'], validation)
    }
    return Object.freeze({
      project: editableProjectFromValidatedProject(validatedProject),
      extensions: document.extensions,
      sourceSchemaVersion: 1,
      integrityDiagnostics: Object.freeze([]),
    })
  }
  const project = reconstructEditableProject(document)
  const diagnostics = inspectEditableProject(project)
  if (diagnostics.length > 0) projectInvalid(diagnostics)
  return Object.freeze({
    project,
    extensions: document.extensions,
    sourceSchemaVersion: 2,
    integrityDiagnostics: diagnostics,
  })
}

export function serializeEditableProject(input: SerializeEditableProjectInput): string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'serializeEditableProject requires an input record', [])
  }
  if (!isPlainRecord(input)) {
    throw new SerializationError('SERIALIZATION_INVALID_INPUT', 'serializeEditableProject requires a plain input record; class instances are not supported', [])
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
  const storedProject = checkEditableProjectPayload(projectValue, ['project'], 'runtime')

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

  const diagnostics = inspectEditableProject(projectValue as EditableProject)
  if (diagnostics.length > 0) projectInvalid(diagnostics)
  const document: ProjectDocumentV2 = { format: 'ledmap', schemaVersion: 2, project: storedProject, extensions }
  return writeDocument(document)
}
