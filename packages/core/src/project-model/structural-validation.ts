import { DomainError } from '../model/errors.js'
import { validateCapacityProfile, validatePortCapacityOverride } from './capacity-profile.js'
import { assertProjectV2EditorStructure, assertProjectV2HardwareContract } from './validate.js'
import type { LedMapProjectV2 } from './types.js'

export interface ProjectV2Diagnostic {
  readonly severity: 'error' | 'warning'
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
      if (processor.capacityProfile !== undefined) validateCapacityProfile(processor.capacityProfile)
      if (!Number.isSafeInteger(processor.portCount) || processor.portCount < 1) {
        throw new DomainError('EDITOR_INVALID_NUMBER', `Processor ${processor.id} portCount must be a positive safe integer`)
      }
    }
    for (const port of project.hardware.ports) {
      if (port.pixelCapacityOverride !== undefined) validatePortCapacityOverride(port.pixelCapacityOverride)
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
