import { resolveMapping } from '../mapping-engine/index.js'
import { resolveRemap } from '../remap-engine/index.js'
import { DomainError } from '../model/errors.js'
import { selectV2GeometryRead, selectV2HardwareRead } from '../project-model/direct-engine-inputs.js'
import { projectHardwareDiagnostics, selectProjectHardwareLoad } from '../project-model/hardware-planning.js'
import { validateProjectV2Structural } from '../project-model/structural-validation.js'
import type { LedMapProjectV2 } from '../project-model/types.js'
import { assertEmptyRules } from '../remap-engine/validation.js'
import { validateInputShape } from './input.js'
import type { ProjectDiagnostic, ProjectValidationCheck, ProjectValidationReport, ValidateProjectInput, ValidateProjectV2Input } from './types.js'

function report(diagnostics: readonly ProjectDiagnostic[], checks: readonly ProjectValidationCheck[]): ProjectValidationReport {
  return Object.freeze({
    valid: !diagnostics.some(diagnostic => diagnostic.severity === 'error') && checks.every(check => check.status === 'passed'),
    diagnostics: Object.freeze(diagnostics.map(diagnostic => Object.freeze({ ...diagnostic, path: Object.freeze([...diagnostic.path]) }))),
    checks: Object.freeze(checks.map(check => Object.freeze({ ...check }))),
  })
}

function validateV2(project: LedMapProjectV2): ProjectValidationReport {
  const structural = validateProjectV2Structural(project)
  if (structural.length > 0) return report(structural.map(issue => ({ ...issue, stage: 'input' })), [
    { stage: 'input', status: 'failed' },
    { stage: 'hardware', status: 'blocked', blockedBy: 'input' },
    { stage: 'mapping', status: 'blocked', blockedBy: 'input' },
    { stage: 'remap', status: 'blocked', blockedBy: 'input' },
  ])
  const diagnostics: ProjectDiagnostic[] = []
  try {
    diagnostics.push(...projectHardwareDiagnostics(project, selectProjectHardwareLoad(project)))
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    diagnostics.push({ severity: 'error', stage: 'hardware', code: error.code, path: ['hardware'], message: error.message })
  }
  if (!diagnostics.some(issue => issue.stage === 'hardware' && issue.severity === 'error')) {
    const hardware = selectV2HardwareRead(project)
    diagnostics.push(...hardware.diagnostics.map(issue => ({ ...issue, stage: 'hardware' as const })))
  }
  for (const region of project.content.mappingRegions) {
    const geometry = selectV2GeometryRead(project, region.id)
    diagnostics.push(...geometry.diagnostics.map(issue => ({ ...issue, stage: 'mapping' as const })))
  }
  try {
    assertEmptyRules(project.remap.rules)
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    diagnostics.push({ severity: 'error', stage: 'remap', code: error.code, path: ['remap', 'rules'], message: error.message })
  }
  return report(diagnostics, [
    { stage: 'input', status: 'passed' },
    ...(['hardware', 'mapping', 'remap'] as const).map(stage => ({ stage,
      status: diagnostics.some(issue => issue.stage === stage && issue.severity === 'error') ? 'failed' as const : 'passed' as const })),
  ])
}

export function validateProject(input: ValidateProjectInput | ValidateProjectV2Input): ProjectValidationReport {
  if (input !== null && typeof input === 'object' && 'project' in input) return validateV2(input.project)
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
