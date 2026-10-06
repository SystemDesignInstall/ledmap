import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2, createProjectV2, selectProjectHardwareLoad, type HardwareCapacityProfile } from '@ledmap/core'
import { createRef001TestProject } from './project-fixtures.js'
import { ProjectDocumentController } from '../src/renderer/document.js'
import { createProjectSession, loadProjectSession, serializeProjectSession, sessionDirty } from '../src/renderer/project-session.js'
import { setCapacityProfileV2, setPortCapacityOverrideV2 } from '../src/renderer/v2-capacity-commands.js'
import { addProcessorV2, addPortV2, addReceiverV2, assignCabinetsV2, moveCabinetToReceiverV2,
  setProcessorPortCountV2, updatePortV2 } from '../src/renderer/v2-hardware-commands.js'
import { selectGenericMappingExportInput, preflightV2GenericMapping } from '../src/shared/v2-export-engine.js'

const profile: HardwareCapacityProfile = { name: 'Operator test mode', source: { kind: 'manual', reference: 'Synthetic fixture', revision: '1' },
  mode: { frameRateHz: 60, bitDepth: 8, linkRateGbps: 1 }, portPixelCapacity: 32768, processorPixelCapacity: 49152 }

function base() {
  let project = convertEditableProjectToV2(createRef001TestProject().source)
  project = addProcessorV2(project)
  project = addPortV2(project, 'processor-1')
  project = addReceiverV2(project, 'port-1')
  project = addPortV2(project, 'processor-1')
  project = addReceiverV2(project, 'port-2')
  return setCapacityProfileV2(project, 'processor-1', profile)
}

describe('capacity profile app transactions', () => {
  it('publishes one Undo step, saves v6 intent and preserves all other domains', () => {
    const project = base()
    const document = new ProjectDocumentController(() => 'capacity')
    document.replace({ ...createProjectSession('capacity'), project })
    const before = document.session
    document.transactV2(value => setPortCapacityOverrideV2(value, 'port-1', { pixelCapacity: 20000, reason: 'Reservation', mode: profile.mode }))
    expect(document.session.revision).toBe(before.revision + 1)
    const text = serializeProjectSession(document.session)
    expect(JSON.parse(text).schemaVersion).toBe(6)
    expect(loadProjectSession(text, 'profile.ledmap', 'reopened').project).toEqual(document.session.project)
    expect(document.session.project.design).toEqual(before.project.design)
    expect(document.session.project.content).toEqual(before.project.content)
    expect(document.session.project.operations).toEqual(before.project.operations)
    document.undo()
    expect(document.session.project).toBe(before.project)
    document.redo()
    expect(serializeProjectSession(document.session)).toBe(text)
  })

  it('rejects a whole invalid profile command without creating history', () => {
    const document = new ProjectDocumentController(() => 'capacity')
    document.replace({ ...createProjectSession('capacity'), project: base() })
    const before = document.session
    expect(() => document.transactV2(value => setCapacityProfileV2(value, 'processor-1', {
      ...profile, name: 'Attempted rename', mode: { ...profile.mode, bitDepth: 9 as 8 },
    }))).toThrow()
    expect(document.session).toBe(before)
    expect(document.canUndo).toBe(false)
  })

  it('checks cumulative Port and Processor limits on final assignment state', () => {
    let project = base()
    const ids = project.design.cabinets.slice(0, 4).map(value => value.id)
    project = assignCabinetsV2(project, 'receiver-1', ids.slice(0, 2))
    expect(() => assignCabinetsV2(project, 'receiver-1', [ids[2]!])).toThrow(/Port/)
    project = assignCabinetsV2(project, 'receiver-2', [ids[2]!])
    expect(() => assignCabinetsV2(project, 'receiver-2', [ids[3]!])).toThrow(/Processor/)
    const moved = moveCabinetToReceiverV2(project, ids[0]!, 'receiver-2')
    expect(selectProjectHardwareLoad(moved).ports.map(value => value.used)).toEqual([16384, 32768])
    expect(selectProjectHardwareLoad(moved).processors[0]!.used).toBe(49152)
    expect(() => moveCabinetToReceiverV2(moved, ids[1]!, 'receiver-2')).toThrow(/Port/)
  })

  it('retains overrides across profile mode changes, clear and topology edits', () => {
    let project = setPortCapacityOverrideV2(base(), 'port-1', { pixelCapacity: 20000, reason: 'Reserved', mode: profile.mode })
    const intent = project.hardware.ports[0]!.pixelCapacityOverride
    project = updatePortV2(project, 'port-1', { index: 2 })
    project = setProcessorPortCountV2(project, 'processor-1', 5)
    expect(project.hardware.ports[0]!.pixelCapacityOverride).toEqual(intent)
    expect(project.hardware.processors[0]!.capacityProfile).toEqual(profile)
    project = setCapacityProfileV2(project, 'processor-1', { ...profile, mode: { ...profile.mode, frameRateHz: 50 } })
    expect(selectProjectHardwareLoad(project).ports[0]!.capacity).toBe(32768)
    project = setCapacityProfileV2(project, 'processor-1', null)
    expect(project.hardware.ports[0]!.pixelCapacityOverride).toEqual(intent)
    expect(selectProjectHardwareLoad(project).ports[0]!.capacity).toBeNull()
    project = setPortCapacityOverrideV2(project, 'port-1', null)
    expect(JSON.parse(serializeProjectSession({ ...createProjectSession('cleared'), project })).schemaVersion).toBe(5)
  })

  it('blocks mapping export for declared overload without changing assignments', () => {
    const original = base()
    const assigned = assignCabinetsV2(original, 'receiver-1', [original.design.cabinets[0]!.id])
    const overloaded = setCapacityProfileV2(assigned, 'processor-1', { ...profile, portPixelCapacity: 1 })
    const report = preflightV2GenericMapping(selectGenericMappingExportInput(overloaded), { kind: 'composition' })
    expect(report.ready).toBe(false)
    expect(report.stages.find(stage => stage.id === 'hardware')!.diagnostics).toContainEqual(expect.objectContaining({ code: 'HARDWARE_PORT_PIXEL_OVER_CAPACITY' }))
    expect(overloaded.hardware.assignments).toEqual(assigned.hardware.assignments)
  })

  it('requires upgrade choice and preserves the original v5 file when Save As is chosen', async () => {
    const project = base()
    const document = new ProjectDocumentController(() => 'capacity')
    document.replace({ ...createProjectSession('capacity'), project, currentFilePath: 'original.ledmap' })
    let request: unknown
    const write = async (value: unknown) => { request = value; return { canceled: false, filePath: 'new.ledmap' } }
    await expect(document.save(false, write)).rejects.toThrow(/confirmation/)
    expect(request).toBeUndefined()
    expect(await document.save(false, write, async () => 'cancel')).toBe(false)
    expect(await document.save(false, write, async () => 'save-as')).toBe(true)
    expect(request).toMatchObject({ saveAs: true, preserveOriginal: true, currentFilePath: 'original.ledmap' })
    expect(document.session.sourceSchemaVersion).toBe(6)
  })

  it('marks the actual saved snapshot version when profile intent changes during I/O', async () => {
    const project = base()
    const document = new ProjectDocumentController(() => 'capacity')
    document.replace({ ...createProjectSession('capacity'), project })
    await document.save(true, async () => {
      document.transactV2(value => setCapacityProfileV2(value, 'processor-1', null))
      return { canceled: false, filePath: 'saved-v6.ledmap' }
    })
    expect(document.session.sourceSchemaVersion).toBe(6)
    expect(sessionDirty(document.session)).toBe(true)
    expect(document.session.project.hardware.processors[0]!.capacityProfile).toBeUndefined()
    expect(JSON.parse(serializeProjectSession(document.session)).schemaVersion).toBe(5)
  })

  it('rejects unknown targets and invalid overrides without mutating caller data', () => {
    const original = base()
    const before = JSON.stringify(original)
    expect(() => setCapacityProfileV2(original, 'missing', profile)).toThrow(/Unknown/)
    expect(() => setPortCapacityOverrideV2(original, 'missing', null)).toThrow(/Unknown/)
    expect(() => setPortCapacityOverrideV2(original, 'port-1', { pixelCapacity: 0, reason: 'Bad', mode: profile.mode })).toThrow()
    expect(JSON.stringify(original)).toBe(before)
    expect(Object.isFrozen(profile.mode)).toBe(false)
    expect(createProjectV2(original)).toEqual(original)
  })
})
