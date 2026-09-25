import { resolveMapping } from '../mapping-engine/index.js'
import { resolveRemap } from '../remap-engine/index.js'
import { DomainError } from '../model/errors.js'
import { validateInputShape } from './input.js'
import type { ProjectDiagnostic, ProjectValidationCheck, ProjectValidationReport, ValidateProjectInput } from './types.js'

function report(diagnostics: readonly ProjectDiagnostic[], checks: readonly ProjectValidationCheck[]): ProjectValidationReport {
  return Object.freeze({
    valid: diagnostics.length === 0 && checks.every(check => check.status === 'passed'),
    diagnostics: Object.freeze(diagnostics.map(diagnostic => Object.freeze({ ...diagnostic, path: Object.freeze([...diagnostic.path]) }))),
    checks: Object.freeze(checks.map(check => Object.freeze({ ...check }))),
  })
}

export function validateProject(input: ValidateProjectInput): ProjectValidationReport {
  const diagnostics = validateInputShape(input)
  if (diagnostics.length > 0) return report(diagnostics, [
    { stage: 'input', status: 'failed' },
    { stage: 'mapping', status: 'blocked', blockedBy: 'input' },
    { stage: 'remap', status: 'blocked', blockedBy: 'input' },
  ])

  let mapping
  try {
    mapping = resolveMapping(input.mapping)
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    return report([{ severity: 'error', stage: 'mapping', code: error.code, message: error.message, path: ['mapping'] }], [
      { stage: 'input', status: 'passed' },
      { stage: 'mapping', status: 'failed' },
      { stage: 'remap', status: 'blocked', blockedBy: 'mapping' },
    ])
  }

  try {
    resolveRemap({ mapping, rules: input.rules })
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    return report([{
      severity: 'error', stage: 'remap', code: error.code, message: error.message,
      path: error.code === 'REMAP_UNSUPPORTED_RULE' ? ['rules'] : [],
    }], [
      { stage: 'input', status: 'passed' },
      { stage: 'mapping', status: 'passed' },
      { stage: 'remap', status: 'failed' },
    ])
  }
  return report([], [
    { stage: 'input', status: 'passed' },
    { stage: 'mapping', status: 'passed' },
    { stage: 'remap', status: 'passed' },
  ])
}
