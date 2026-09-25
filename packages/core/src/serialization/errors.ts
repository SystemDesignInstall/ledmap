import { DomainError } from '../model/errors.js'
import type { ProjectValidationReport } from '../validation/index.js'

export type SerializationErrorCode =
  | 'SERIALIZATION_INVALID_INPUT'
  | 'SERIALIZATION_INVALID_JSON'
  | 'SERIALIZATION_DUPLICATE_KEY'
  | 'SERIALIZATION_INVALID_SCHEMA'
  | 'SERIALIZATION_UNSUPPORTED_VERSION'
  | 'SERIALIZATION_PROJECT_INVALID'

export type SerializationPath = readonly (string | number)[]

export class SerializationError extends DomainError {
  readonly path: SerializationPath
  readonly validation?: ProjectValidationReport

  constructor(code: SerializationErrorCode, message: string, path: SerializationPath, validation?: ProjectValidationReport) {
    super(code, message)
    this.name = 'SerializationError'
    this.path = Object.freeze([...path])
    if (validation !== undefined) this.validation = validation
  }
}
