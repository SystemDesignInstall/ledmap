import type { ResolveMappingInput } from '../mapping-engine/index.js'
import type { RemapRuleDescriptor } from '../remap-engine/index.js'

export interface ValidateProjectInput {
  readonly mapping: ResolveMappingInput
  readonly rules: readonly RemapRuleDescriptor[]
}

export type ProjectValidationStage = 'input' | 'mapping' | 'remap'

export interface ProjectDiagnostic {
  readonly severity: 'error'
  readonly stage: ProjectValidationStage
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

export type ProjectValidationCheck =
  | { readonly stage: ProjectValidationStage; readonly status: 'passed' | 'failed' }
  | { readonly stage: ProjectValidationStage; readonly status: 'blocked'; readonly blockedBy: ProjectValidationStage }

export interface ProjectValidationReport {
  readonly valid: boolean
  readonly diagnostics: readonly ProjectDiagnostic[]
  readonly checks: readonly ProjectValidationCheck[]
}
