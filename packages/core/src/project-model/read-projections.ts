import {
  inspectEditableProject,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  type EditableGeometryMappingProjection,
  type EditableHardwareMappingProjection,
} from '../editor-project/index.js'
import { DomainError } from '../model/errors.js'
import type { MappingRegionId } from '../model/ids.js'
import { projectV2AsEditableReadModel } from './compatibility.js'
import type { LedMapProjectV2 } from './types.js'

export interface ProjectV2Diagnostic {
  readonly severity: 'error'
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

function contractDiagnostic(error: DomainError): ProjectV2Diagnostic {
  return Object.freeze({ severity: 'error', code: error.code, path: Object.freeze([]), message: error.message })
}

export function inspectProjectV2(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  try {
    return inspectEditableProject(projectV2AsEditableReadModel(project))
  } catch (error) {
    if (error instanceof DomainError) return Object.freeze([contractDiagnostic(error)])
    throw error
  }
}

export function projectV2GeometryMapping(project: LedMapProjectV2, regionId: MappingRegionId): EditableGeometryMappingProjection {
  return projectEditableGeometryMapping(projectV2AsEditableReadModel(project), regionId)
}

export function projectV2HardwareMapping(project: LedMapProjectV2): EditableHardwareMappingProjection {
  try {
    return projectEditableHardwareMapping(projectV2AsEditableReadModel(project))
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    return Object.freeze({
      status: 'incomplete',
      hardware: null,
      diagnostics: Object.freeze([contractDiagnostic(error)]),
    })
  }
}

export function selectHardwareReadiness(project: LedMapProjectV2): EditableHardwareMappingProjection {
  return projectV2HardwareMapping(project)
}
