import {
  addressPixel,
  createEmptyProjectV2,
  resolveHardware,
  selectV2HardwareEngineInput,
} from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { addMappingRegionV2, addScreenV2, setInputCanvasResolutionV2 } from '../src/renderer/v2-commands.js'
import {
  addPortV2, addProcessorV2, addReceiverV2, assignCabinetsV2,
  moveCabinetToReceiverV2, reorderSignalRouteV2,
} from '../src/renderer/v2-hardware-commands.js'
import { receiversInHardwareOrder } from '../src/renderer/v2-hardware-read.js'
import { buildV2TestScene, buildV2TestWalkSpace, resolveV2TestWalkPixel } from '../src/renderer/v2-test-project.js'
import { loadProjectSession, recoverProjectSession, serializeProjectSession, createProjectSession } from '../src/renderer/project-session.js'
import { initialDraft } from '../src/renderer/state.js'
import { genericMappingV2Rows, selectGenericMappingExportInput, serializeV2GenericMapping } from '../src/shared/v2-export-engine.js'

function readyProject() {
  let project = createEmptyProjectV2()
  project = addScreenV2(project, { ...initialDraft, columns: '3', rows: '1', modulePixelWidth: '2', modulePixelHeight: '2' })
  project = setInputCanvasResolutionV2(project, 16, 8)
  project = addMappingRegionV2(project, 'screen-1', { x: 0, y: 0 })
  project = addProcessorV2(project)
  project = addPortV2(project, 'processor-1')
  project = addReceiverV2(project, 'port-1')
  project = addReceiverV2(project, 'port-1')
  const ids = project.design.cabinets.map(cabinet => cabinet.id)
  project = assignCabinetsV2(project, 'receiver-1', ids)
  return { project, ids }
}

describe('Signal Chain integration', () => {
  it('uses exact route order for PixelAddress, Address Walk and JSON/CSV without changing geometry or membership', () => {
    const { project, ids } = readyProject()
    const reordered = reorderSignalRouteV2(project, 'receiver-1', [ids[2]!, ids[0]!, ids[1]!])
    expect(reordered.design).toBe(project.design)
    expect(reordered.hardware).toBe(project.hardware)
    expect(reordered.hardware.assignments).toBe(project.hardware.assignments)
    const before = resolveHardware(selectV2HardwareEngineInput(project))
    const after = resolveHardware(selectV2HardwareEngineInput(reordered))
    expect(ids.map(id => addressPixel(before, { cabinet: id, coordinate: { x: 0, y: 0 } }).dataIndex)).toEqual([0, 4, 8])
    expect(ids.map(id => addressPixel(after, { cabinet: id, coordinate: { x: 0, y: 0 } }).dataIndex)).toEqual([4, 8, 0])
    const scene = buildV2TestScene(reordered)
    const walk = buildV2TestWalkSpace(reordered, scene, { kind: 'composition', target: null })
    expect([0, 4, 8].map(index => resolveV2TestWalkPixel(reordered, walk, index)?.cabinet)).toEqual([ids[2], ids[0], ids[1]])
    const input = selectGenericMappingExportInput(reordered)
    const scope = { kind: 'composition' as const }
    const rows = [...genericMappingV2Rows(input, scope)]
    expect([0, 4, 8].map(index => rows[index]?.cabinet)).toEqual([ids[2], ids[0], ids[1]])
    expect([0, 4, 8].map(index => rows[index]?.dataIndex)).toEqual([0, 4, 8])
    const json = JSON.parse(serializeV2GenericMapping(input, scope, 'json')) as { rows: Array<{ cabinet: string }> }
    const csv = serializeV2GenericMapping(input, scope, 'csv').trim().split('\n')
    expect([0, 4, 8].map(index => json.rows[index]?.cabinet)).toEqual([ids[2], ids[0], ids[1]])
    expect([0, 4, 8].map(index => csv[index + 1]?.split(',')[6])).toEqual([ids[2], ids[0], ids[1]])
  })

  it('orders target Receivers by Processor, Port index and PortReceiverOrder, not entity ID or legacyIndex', () => {
    let { project } = readyProject()
    project = addPortV2(project, 'processor-1')
    project = addReceiverV2(project, 'port-2')
    project = addProcessorV2(project)
    project = addPortV2(project, 'processor-2')
    project = addReceiverV2(project, 'port-3')
    project = { ...project, hardware: { ...project.hardware,
      processorOrder: [...project.hardware.processorOrder].reverse(),
      receiverOrder: project.hardware.receiverOrder.map(value => value.portId === 'port-1'
        ? { ...value, receiverIds: [...value.receiverIds].reverse() } : value),
      receivers: project.hardware.receivers.map(value => ({ ...value, legacyIndex: 99 - Number(value.id.split('-')[1]) })),
    } }
    expect(receiversInHardwareOrder(project).map(value => value.id)).toEqual([
      'receiver-4', 'receiver-2', 'receiver-1', 'receiver-3',
    ])
  })

  it('records one history step per reorder/transfer and restores exact route and assignment state', () => {
    const { project, ids } = readyProject()
    const controller = new ProjectDocumentController(() => 'document-1')
    controller.replace({ ...createProjectSession('document-1'), project })
    controller.transactV2(source => reorderSignalRouteV2(source, 'receiver-1', [ids[2]!, ids[0]!, ids[1]!]))
    const reordered = controller.session.project
    expect(controller.historyDepth).toBe(1)
    controller.transactV2(source => moveCabinetToReceiverV2(source, ids[0]!, 'receiver-2'))
    const moved = controller.session.project
    expect(controller.historyDepth).toBe(2)
    expect(moved.operations.signalRoutes.find(value => value.receiverId === 'receiver-1')?.orderedCabinetIds).toEqual([ids[2], ids[1]])
    expect(moved.operations.signalRoutes.find(value => value.receiverId === 'receiver-2')?.orderedCabinetIds).toEqual([ids[0]])
    expect(controller.undo()).toBe(true)
    expect(controller.session.project).toEqual(reordered)
    expect(controller.undo()).toBe(true)
    expect(controller.session.project).toEqual(project)
    expect(controller.redo()).toBe(true)
    expect(controller.session.project).toEqual(reordered)
    expect(controller.redo()).toBe(true)
    expect(controller.session.project).toEqual(moved)
  })

  it('preserves route identity and order through V3 Save/Open and recovery', () => {
    const { project, ids } = readyProject()
    const reordered = reorderSignalRouteV2(project, 'receiver-1', [ids[2]!, ids[0]!, ids[1]!])
    const session = { ...createProjectSession('document-1'), project: reordered }
    const text = serializeProjectSession(session)
    expect(JSON.parse(text).schemaVersion).toBe(3)
    expect(loadProjectSession(text, 'test.ledmap', 'document-2').project.operations.signalRoutes).toEqual(reordered.operations.signalRoutes)
    expect(recoverProjectSession(text, 'document-3').project.operations.signalRoutes).toEqual(reordered.operations.signalRoutes)
  })
})
