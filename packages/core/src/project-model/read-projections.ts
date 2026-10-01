import { DomainError } from '../model/errors.js'
import type { MappingRegionId } from '../model/ids.js'
import { selectV2GeometryRead, selectV2HardwareRead } from './direct-engine-inputs.js'
import { assertProjectV2EditorStructure, assertProjectV2HardwareContract } from './validate.js'
import type { LedMapProjectV2 } from './types.js'

export interface ProjectV2Diagnostic {
  readonly severity: 'error'
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

function contractDiagnostic(error: DomainError): ProjectV2Diagnostic {
  const code = ({
    PROJECT_INVALID_GEOMETRY: 'EDITOR_INVALID_NUMBER',
    PROJECT_CABINET_OUT_OF_RANGE: 'EDITOR_OUT_OF_RANGE',
    PROJECT_MODULE_OUT_OF_RANGE: 'EDITOR_OUT_OF_RANGE',
    PROJECT_DUPLICATE_CELL: 'EDITOR_DUPLICATE_CELL',
    PROJECT_DUPLICATE_COMPOSITION_PLACEMENT: 'EDITOR_DUPLICATE_PLACEMENT',
    PROJECT_MISSING_PLACEMENT: 'EDITOR_MISSING_PLACEMENT',
  } as Record<string, string>)[error.code] ?? error.code
  return Object.freeze({ severity: 'error', code, path: Object.freeze([]), message: error.message })
}

export function validateProjectV2Structural(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  try {
    assertProjectV2EditorStructure(project)
    assertProjectV2HardwareContract(project)
    for (const processor of project.hardware.processors) {
      if (!Number.isSafeInteger(processor.portCount) || processor.portCount < 1) {
        throw new DomainError('EDITOR_INVALID_NUMBER', `Processor ${processor.id} portCount must be a positive safe integer`)
      }
    }
    for (const port of project.hardware.ports) {
      const processor = project.hardware.processors.find(value => value.id === port.processorId)!
      if (!Number.isSafeInteger(port.index) || port.index < 0 || !Number.isSafeInteger(port.receiverCapacity) || port.receiverCapacity < 1) {
        throw new DomainError('EDITOR_INVALID_NUMBER', `Port ${port.id} index and capacity must be valid safe integers`)
      }
      if (port.index >= processor.portCount) throw new DomainError('EDITOR_OUT_OF_RANGE', `Port ${port.id} exceeds Processor ${processor.id}.portCount`)
      if (project.hardware.ports.some(other => other !== port && other.processorId === port.processorId && other.index === port.index)) {
        throw new DomainError('EDITOR_DUPLICATE_CELL', `Processor ${processor.id} port index ${port.index} is used more than once`)
      }
    }
    for (const receiver of project.hardware.receivers) {
      if (receiver.pixelCapacity !== undefined && (!Number.isSafeInteger(receiver.pixelCapacity) || receiver.pixelCapacity < 1)) {
        throw new DomainError('EDITOR_INVALID_NUMBER', `Receiver ${receiver.id} pixelCapacity must be a positive safe integer`)
      }
    }
    return Object.freeze([])
  } catch (error) {
    if (error instanceof DomainError) return Object.freeze([contractDiagnostic(error)])
    throw error
  }
}

export function inspectProjectV2(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  return validateProjectV2Structural(project)
}

export function inspectProjectV2Readiness(project: LedMapProjectV2): readonly ProjectV2Diagnostic[] {
  const diagnostics: ProjectV2Diagnostic[] = []
  for (const region of project.content.mappingRegions) {
    const read = selectV2GeometryRead(project, region.id)
    if (read.status === 'incomplete') diagnostics.push(...read.diagnostics)
  }
  const hardware = selectV2HardwareRead(project)
  if (hardware.status === 'incomplete') diagnostics.push(...hardware.diagnostics)
  return Object.freeze(diagnostics)
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
