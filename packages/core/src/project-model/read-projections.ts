import type { MappingRegionId } from '../model/ids.js'
import { validateProject } from '../validation/validate.js'
import { selectV2GeometryRead, selectV2HardwareRead } from './direct-engine-inputs.js'
import type { LedMapProjectV2 } from './types.js'
import { validateProjectV2Structural, type ProjectV2Diagnostic } from './structural-validation.js'

export { validateProjectV2Structural, type ProjectV2Diagnostic } from './structural-validation.js'

export function inspectProjectV2(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  return validateProjectV2Structural(project)
}

export function inspectProjectV2Readiness(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  return validateProject({ project }).diagnostics
}

export function projectV2GeometryMapping(project: LedMapProjectV2, regionId: MappingRegionId) {
  return selectV2GeometryRead(project, regionId)
}

export function projectV2HardwareMapping(project: LedMapProjectV2) {
  return selectV2HardwareRead(project)
}

export function selectHardwareReadiness(project: LedMapProjectV2) {
  return selectV2HardwareRead(project)
}
