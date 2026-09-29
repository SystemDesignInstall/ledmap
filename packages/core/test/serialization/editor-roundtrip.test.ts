import { describe, expect, it } from 'vitest'
import {
  asCabinetGridId,
  asCabinetId,
  asPortId,
  asProcessorId,
  asReceiverId,
  createEditableProject,
  loadEditableProject,
  parseEditableProjectDocument,
  parseProject,
  serializeEditableProject,
  serializeProject,
  type EditableProject,
} from '../../src/index.js'
import { assertFrozen } from '../mapping-engine/fixtures.js'
import {
  bareLayoutProject,
  fullEditableProject,
  layoutOnlyProject,
  mappingWithoutHardwareProject,
  multiScreenEditableProject,
  partialHardwareProject,
} from './editor-fixtures.js'
import { cloneDocument, expectSerializationError, minimalProject } from './fixtures.js'

function normalized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

describe('P0C editable project serialization v2', () => {
  it.each([
    ['empty project', createEditableProject()],
    ['Layout-only project', bareLayoutProject()],
    ['Layout with Cabinets', layoutOnlyProject()],
    ['Mapping without Hardware', mappingWithoutHardwareProject()],
    ['partial Hardware', partialHardwareProject()],
    ['full project', fullEditableProject()],
    ['multi-screen project', multiScreenEditableProject()],
  ])('round-trips %s', (_name, project) => {
    const text = serializeEditableProject({ project })
    const loaded = loadEditableProject(text)
    expect(loaded.sourceSchemaVersion).toBe(2)
    expect(loaded.integrityDiagnostics).toEqual([])
    expect(loaded.project).toEqual(project)
    expect(normalized(loaded.project)).toEqual(normalized(project))
    expect(serializeEditableProject({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
    assertFrozen(loaded)
  })

  it('persists signed Composition placements as first-class project data', () => {
    const project = multiScreenEditableProject()
    const text = serializeEditableProject({ project })
    const document = parseEditableProjectDocument(text)
    expect(document.schemaVersion).toBe(2)
    if (document.schemaVersion !== 2) return
    expect(document.project.editorLayout.screenPositions).toEqual([
      { screen: 'screen-a', position: { x: -640, y: 128 } },
      { screen: 'screen-b', position: { x: 320, y: -256 } },
    ])
    expect(document.extensions).toEqual({})
    expect(text.indexOf('"editorLayout"')).toBeLessThan(text.indexOf('"extensions"'))
  })

  it('writes the canonical v2 field order', () => {
    const document = parseEditableProjectDocument(serializeEditableProject({ project: fullEditableProject() }))
    expect(Object.keys(document)).toEqual(['format', 'schemaVersion', 'project', 'extensions'])
    expect(document.schemaVersion).toBe(2)
    if (document.schemaVersion !== 2) return
    expect(Object.keys(document.project)).toEqual([
      'inputCanvas', 'screens', 'cabinetGrids', 'mappingRegions', 'hardwareTopology', 'rules', 'editorLayout',
    ])
    expect(Object.keys(document.project.hardwareTopology)).toEqual([
      'processors', 'ports', 'receivers', 'cabinets', 'modules', 'processorOrder', 'receiverOrder',
    ])
    expect(Object.keys(document.project.editorLayout)).toEqual(['screenPositions'])
    expect(Object.keys(document.project.editorLayout.screenPositions[0]!)).toEqual(['screen', 'position'])
  })

  it('is deterministic for equal source and canonical across save-load-save', () => {
    const project = multiScreenEditableProject()
    const extensions = { z: { beta: 2, alpha: 1 }, a: true }
    const first = serializeEditableProject({ project, extensions })
    const second = serializeEditableProject({ project: multiScreenEditableProject(), extensions })
    expect(second).toBe(first)
    const loaded = loadEditableProject(first)
    expect(serializeEditableProject({ project: loaded.project, extensions: loaded.extensions })).toBe(first)
    expect(first.indexOf('"a"')).toBeLessThan(first.lastIndexOf('"z"'))
  })

  it('loads v1 through strict validation and migrates it to immutable editor source', () => {
    const extensions = { vendor: { profile: 'legacy', revision: 7 } }
    const v1 = serializeProject({ project: minimalProject(), extensions })
    const loaded = loadEditableProject(v1)
    expect(loaded.sourceSchemaVersion).toBe(1)
    expect(loaded.extensions).toEqual(extensions)
    expect(loaded.project.screens[0]?.id).toBe('screen')
    expect(loaded.project.cabinetGrids[0]?.id).toBe('grid')
    expect(loaded.project.mappingRegions[0]?.id).toBe('region')
    expect(loaded.project.editorLayout.screenPositions).toEqual([
      { screen: 'screen', position: { x: 0, y: 0 } },
    ])
    assertFrozen(loaded.project)

    const v2 = serializeEditableProject({ project: loaded.project, extensions: loaded.extensions })
    const document = parseEditableProjectDocument(v2)
    expect(document.schemaVersion).toBe(2)
    expect(document.extensions).toEqual(extensions)
    expect(loadEditableProject(v2).project).toEqual(loaded.project)
  })

  it('keeps legacy v1 entry points v1-only', () => {
    const text = serializeEditableProject({ project: createEditableProject() })
    expectSerializationError(() => parseProject(text), 'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'])
  })

  it('does not persist derived or runtime-only state', () => {
    const document = parseEditableProjectDocument(serializeEditableProject({ project: fullEditableProject() }))
    expect(document.schemaVersion).toBe(2)
    if (document.schemaVersion !== 2) return
    const projectText = JSON.stringify(document.project)
    for (const field of [
      'localX', 'localY', 'logicalIndex', 'signalPath', 'pixelMap', 'dataIndex', 'usedPixels',
      'remainingPixels', 'allocationProposal', 'validation', 'reverseIndex', 'selection', 'camera', 'hover',
    ]) expect(projectText).not.toContain(field)
  })

  it('persists nonempty remap source rules without running Phase 7 remap validation', () => {
    const base = createEditableProject()
    const project: EditableProject = {
      ...base,
      rules: [{ id: 'future-rule', version: '2', type: 'future-remap' }],
    }
    expect(loadEditableProject(serializeEditableProject({ project })).project.rules).toEqual(project.rules)
  })

  it('preserves source array order and stable IDs', () => {
    const project = multiScreenEditableProject()
    const reversed: EditableProject = {
      ...project,
      screens: [...project.screens].reverse(),
      cabinetGrids: [...project.cabinetGrids].reverse(),
      mappingRegions: [...project.mappingRegions].reverse(),
      hardwareTopology: {
        ...project.hardwareTopology,
        cabinets: [...project.hardwareTopology.cabinets].reverse(),
        modules: [...project.hardwareTopology.modules].reverse(),
      },
      editorLayout: { screenPositions: [...project.editorLayout.screenPositions].reverse() },
    }
    const loaded = loadEditableProject(serializeEditableProject({ project: reversed })).project
    expect(loaded.screens.map(screen => screen.id)).toEqual(['screen-b', 'screen-a'])
    expect(loaded.cabinetGrids.map(grid => grid.id)).toEqual(['grid-b', 'grid-a'])
    expect(loaded.mappingRegions.map(region => region.id)).toEqual(['region-b', 'region-a'])
    expect(loaded.hardwareTopology.cabinets.map(cabinet => cabinet.id)).toEqual(['cabinet-b', 'cabinet-a'])
    expect(loaded.editorLayout.screenPositions.map(placement => placement.screen)).toEqual(['screen-b', 'screen-a'])
  })

  it('round-trips a valid partial Receiver assignment without completing it', () => {
    const base = multiScreenEditableProject()
    const processor = { id: asProcessorId('P'), name: 'P', portCount: 1 }
    const port = { id: asPortId('P:0'), processor: processor.id, index: 0, receiverCapacity: 1 }
    const receiver = {
      id: asReceiverId('R'), processor: processor.id, port: port.id, index: 0,
      cabinets: [base.hardwareTopology.cabinets[0]!.id],
    }
    const project: EditableProject = {
      ...base,
      hardwareTopology: {
        ...base.hardwareTopology,
        processors: [processor],
        ports: [port],
        receivers: [receiver],
        processorOrder: [processor.id],
        receiverOrder: [{ port: port.id, receivers: [receiver.id] }],
      },
    }
    expect(loadEditableProject(serializeEditableProject({ project })).project).toEqual(project)
  })
})

describe('P0C v2 schema and integrity boundary', () => {
  it('rejects unsupported versions and unknown fields', () => {
    const document = JSON.parse(serializeEditableProject({ project: createEditableProject() })) as Record<string, unknown>
    document['schemaVersion'] = 3
    expectSerializationError(
      () => parseEditableProjectDocument(JSON.stringify(document)),
      'SERIALIZATION_UNSUPPORTED_VERSION', ['schemaVersion'],
    )
    const unknown = JSON.parse(serializeEditableProject({ project: createEditableProject() })) as Record<string, unknown>
    ;(unknown['project'] as Record<string, unknown>)['selection'] = []
    expectSerializationError(
      () => parseEditableProjectDocument(JSON.stringify(unknown)),
      'SERIALIZATION_INVALID_SCHEMA', ['project', 'selection'],
    )
    const rootUnknown = cloneDocument(document)
    rootUnknown['schemaVersion'] = 2
    rootUnknown['unexpected'] = true
    expectSerializationError(
      () => parseEditableProjectDocument(JSON.stringify(rootUnknown)),
      'SERIALIZATION_INVALID_SCHEMA', ['unexpected'],
    )
  })

  it.each([
    ['duplicate IDs', (project: EditableProject): EditableProject => ({ ...project, screens: [...project.screens, project.screens[0]!] })],
    ['dangling references', (project: EditableProject): EditableProject => ({
      ...project,
      screens: project.screens.map(screen => ({ ...screen, cabinetGrids: [asCabinetGridId('missing')] })),
    })],
    ['duplicate Cabinet cells', (project: EditableProject): EditableProject => ({
      ...project,
      hardwareTopology: {
        ...project.hardwareTopology,
        cabinets: [project.hardwareTopology.cabinets[0]!, { ...project.hardwareTopology.cabinets[0]!, id: asCabinetId('other') }],
      },
    })],
  ])('rejects structurally corrupt source: %s', (_name, change) => {
    const project = change(fullEditableProject())
    const error = expectSerializationError(
      () => serializeEditableProject({ project }),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.integrityDiagnostics?.length).toBeGreaterThan(0)
  })

  it('rejects one Cabinet assigned to multiple Receivers', () => {
    const project = fullEditableProject()
    const topology = project.hardwareTopology
    const receiver = topology.receivers[0]!
    const corrupt: EditableProject = {
      ...project,
      hardwareTopology: {
        ...topology,
        receivers: [...topology.receivers, { ...receiver, id: asReceiverId('R2') }],
        receiverOrder: topology.receiverOrder.map(order => ({ ...order, receivers: [...order.receivers, asReceiverId('R2')] })),
      },
    }
    const error = expectSerializationError(
      () => serializeEditableProject({ project: corrupt }),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.integrityDiagnostics?.some(diagnostic => diagnostic.code === 'EDITOR_DUPLICATE_REFERENCE')).toBe(true)
  })

  it('rejects corrupt source after parsing as well as before save', () => {
    const text = serializeEditableProject({ project: fullEditableProject() })
    const document = JSON.parse(text) as Record<string, unknown>
    const project = document['project'] as Record<string, unknown>
    const screens = project['screens'] as Record<string, unknown>[]
    screens.push({ ...screens[0] })
    const corruptText = JSON.stringify(document)
    expect(parseEditableProjectDocument(corruptText).schemaVersion).toBe(2)
    const error = expectSerializationError(
      () => loadEditableProject(corruptText),
      'SERIALIZATION_PROJECT_INVALID', ['project'],
    )
    expect(error.integrityDiagnostics?.[0]?.code).toBe('EDITOR_DUPLICATE_ID')
  })
})
