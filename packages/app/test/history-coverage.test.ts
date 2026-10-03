import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, serializeProjectV3 } from '@ledmap/core'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { loadProjectSession, serializeProjectSession } from '../src/renderer/project-session.js'
import {
  addMappingRegionV2, addScreenV2, deleteScreensV2, resizeScreenGridV2,
  setInputCanvasResolutionV2, updateMappingRegionV2, updateScreenCabinetConfigV2,
} from '../src/renderer/v2-commands.js'
import {
  applyHardwareAllocationV2, moveReceiverV2, previewHardwareAllocationV2, unassignCabinetsV2,
} from '../src/renderer/v2-hardware-commands.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

function controller(): ProjectDocumentController {
  return new ProjectDocumentController(() => 'coverage-document')
}

function exactStep(document: ProjectDocumentController, command: Parameters<ProjectDocumentController['transactV2']>[0]): void {
  const before = serializeProjectSession(document.session)
  const depth = document.historyDepth
  document.transactV2(command)
  const after = serializeProjectSession(document.session)
  expect(after).not.toBe(before)
  expect(document.historyDepth).toBe(depth + 1)
  expect(document.undo()).toBe(true)
  expect(serializeProjectSession(document.session)).toBe(before)
  expect(document.redo()).toBe(true)
  expect(serializeProjectSession(document.session)).toBe(after)
}

describe('History across canonical V2 commands', () => {
  it('restores exact Cabinet and Module IDs after resize, config change and Delete', () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    exactStep(document, project => resizeScreenGridV2(project, 'screen-1', 5, 3))
    exactStep(document, project => updateScreenCabinetConfigV2(project, 'screen-1', { moduleColumns: 2 }))
    exactStep(document, project => deleteScreensV2(project, ['screen-1']))
    expect(document.session.project.design.screens).toHaveLength(0)
    document.undo()
    expect(document.session.project.design.cabinets.map(cabinet => cabinet.id)).toHaveLength(15)
    expect(document.session.project.design.modules.map(module => module.id)).toHaveLength(30)
  })

  it('restores exact Mapping Region state through create and update', () => {
    const document = controller()
    document.transactV2(project => addScreenV2(project))
    document.transactV2(project => setInputCanvasResolutionV2(project, 2048, 2048))
    exactStep(document, project => addMappingRegionV2(project, 'screen-1'))
    const regionId = document.session.project.content.mappingRegions[0]!.id
    exactStep(document, project => updateMappingRegionV2(project, regionId, { x: 10, y: 20 }))
  })

  it('restores Receiver ordering, assignments and signal routes exactly', () => {
    const document = controller()
    const project = convertEditableProjectToV2(compactReadyProject().source)
    document.replace(loadProjectSession(serializeProjectV3({ project, extensions: {} }), 'ready.ledmap', 'ready'))
    exactStep(document, source => moveReceiverV2(source, 'receiver-1', 1))
    const cabinetId = document.session.project.operations.signalRoutes
      .find(route => route.receiverId === 'receiver-1')!.orderedCabinetIds[0]!
    exactStep(document, source => unassignCabinetsV2(source, 'receiver-1', [cabinetId]))
  })

  it('commits Auto Allocation Apply as exactly one Undo step', () => {
    const document = controller()
    const project = convertEditableProjectToV2(compactReadyProject().source)
    document.replace(loadProjectSession(serializeProjectV3({ project, extensions: {} }), 'ready.ledmap', 'ready'))
    document.transactV2(source => unassignCabinetsV2(source, 'receiver-1',
      source.operations.signalRoutes.find(route => route.receiverId === 'receiver-1')!.orderedCabinetIds))
    const proposal = previewHardwareAllocationV2(document.session.project)
    exactStep(document, source => applyHardwareAllocationV2(source, proposal))
  })
})
