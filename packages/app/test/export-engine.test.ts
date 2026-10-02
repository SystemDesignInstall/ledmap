import { describe, expect, it } from 'vitest'
import {
  genericMappingCsvRow,
  genericMappingRows,
  preflightGenericMapping,
  serializeGenericMapping,
  type GenericMappingRow,
} from '../src/shared/export-engine.js'
import {
  addPort,
  addProcessor,
  addReceiver,
  applyHardwareAllocation,
  assignCabinets,
  hardwareCabinetOrder,
  previewHardwareAllocation,
  unassignCabinets,
} from '../src/renderer/hardware-project.js'
import { addMappingRegion, setInputCanvasResolution } from '../src/renderer/mapping-project.js'
import { addScreen, createProject, type Project } from '../src/renderer/project.js'
import { initialDraft } from '../src/renderer/state.js'
import { createRef001TestProject } from './project-fixtures.js'

function miniProject(): Project {
  const draft = {
    ...initialDraft,
    columns: '1',
    rows: '1',
    moduleColumns: '1',
    moduleRows: '1',
    modulePixelWidth: '2',
    modulePixelHeight: '2',
  }
  let project = addScreen(addScreen(createProject(), draft), draft)
  project = setInputCanvasResolution(project, 16, 8)
  project = addMappingRegion(project, 'screen-1', { x: 0, y: 0 })
  project = addMappingRegion(project, 'screen-2', { x: 8, y: 0 })
  project = addProcessor(project)
  project = addPort(project, 'processor-1')
  project = addReceiver(project, 'port-1')
  project = addReceiver(project, 'port-1')
  const cabinets = hardwareCabinetOrder(project)
  project = assignCabinets(project, 'receiver-1', [cabinets[0]!])
  return assignCabinets(project, 'receiver-2', [cabinets[1]!])
}

function sharedPortProject(): Project {
  let project = createRef001TestProject()
  project = setInputCanvasResolution(project, 1920, 1080)
  project = addMappingRegion(project, 'screen-1', { x: 40, y: 20 })
  project = addMappingRegion(project, 'screen-2', { x: 700, y: 100 })
  project = addMappingRegion(project, 'screen-3', { x: 300, y: 620 })
  project = addProcessor(project)
  for (let port = 0; port < 4; port += 1) {
    project = addPort(project, 'processor-1')
    project = addReceiver(project, `port-${port + 1}`)
    project = addReceiver(project, `port-${port + 1}`)
  }
  const order = hardwareCabinetOrder(project)
  project = assignCabinets(project, 'receiver-1', order.slice(0, 2))
  project = assignCabinets(project, 'receiver-2', order.slice(12, 14))
  return applyHardwareAllocation(project, previewHardwareAllocation(project))
}

function rowValues(row: GenericMappingRow): readonly (string | number)[] {
  return [
    row.inputCanvas, row.inputX, row.inputY, row.screen, row.screenX, row.screenY,
    row.cabinet, row.cabinetX, row.cabinetY, row.module, row.moduleX, row.moduleY,
    row.processor, row.port, row.receiver, row.dataIndex,
  ]
}

describe('deterministic generic exports', () => {
  it('reports integrity, Mapping, Hardware and identity Remap independently', () => {
    const ready = miniProject()
    const preflight = preflightGenericMapping(ready.source, { kind: 'composition' })
    expect(preflight.ready).toBe(true)
    expect(preflight.pixelCount).toBe(8)
    expect(preflight.stages.map(stage => [stage.id, stage.status])).toEqual([
      ['integrity', 'ready'], ['mapping', 'ready'], ['hardware', 'ready'], ['remap', 'ready'],
    ])

    const incomplete = unassignCabinets(ready, 'receiver-2', ['screen-2/C01'])
    const hardware = preflightGenericMapping(incomplete.source, { kind: 'composition' })
    expect(hardware.stages.find(stage => stage.id === 'hardware')).toMatchObject({ status: 'blocked' })
    expect(hardware.stages.find(stage => stage.id === 'mapping')).toMatchObject({ status: 'ready' })

    const unsupported = { ...ready.source, rules: [{ id: 'future', version: '1', type: 'vendor-remap' }] }
    expect(preflightGenericMapping(unsupported, { kind: 'composition' }).stages.find(stage => stage.id === 'remap'))
      .toMatchObject({ status: 'blocked', diagnostics: [expect.objectContaining({ code: 'REMAP_UNSUPPORTED_RULE' })] })
  })

  it('produces byte-identical JSON and CSV with the same semantic rows', () => {
    const project = miniProject()
    const jsonA = serializeGenericMapping(project.source, { kind: 'composition' }, 'json')
    const jsonB = serializeGenericMapping(project.source, { kind: 'composition' }, 'json')
    const csvA = serializeGenericMapping(project.source, { kind: 'composition' }, 'csv')
    const csvB = serializeGenericMapping(project.source, { kind: 'composition' }, 'csv')
    expect(jsonB).toBe(jsonA)
    expect(csvB).toBe(csvA)
    const document = JSON.parse(jsonA) as { format: string; version: number; rows: GenericMappingRow[] }
    expect(document.format).toBe('ledmap-generic-mapping')
    expect(document.version).toBe(1)
    const jsonRows = document.rows
    const csvRows = csvA.trim().split('\n').slice(1).map(line => line.split(',').map((value, index) => {
      return [0, 3, 6, 9, 12, 13, 14].includes(index) ? value : Number(value)
    }))
    expect(csvRows).toEqual(jsonRows.map(rowValues))
  })

  it('keeps the real shared-Port 65535 to 65536 boundary and never rebases a selected Screen', () => {
    const project = sharedPortProject()
    let before: GenericMappingRow | null = null
    let after: GenericMappingRow | null = null
    for (const row of genericMappingRows(project.source, { kind: 'composition' })) {
      if (row.port === 'port-1' && row.dataIndex === 65535) before = row
      if (row.port === 'port-1' && row.dataIndex === 65536) {
        after = row
        break
      }
    }
    expect(before).toMatchObject({ screen: 'screen-1', receiver: 'receiver-1', dataIndex: 65535 })
    expect(after).toMatchObject({ screen: 'screen-2', receiver: 'receiver-2', dataIndex: 65536 })
    const selected = genericMappingRows(project.source, { kind: 'screen', screenId: 'screen-2' }).next().value
    expect(selected).toMatchObject({ screen: 'screen-2', port: 'port-1', dataIndex: 65536 })
  })

  it('escapes identifiers without changing the fixed CSV column order', () => {
    const row = genericMappingRows(miniProject().source, { kind: 'composition' }).next().value as GenericMappingRow
    expect(genericMappingCsvRow({ ...row, screen: 'Screen, "A"' })).toContain('"Screen, ""A"""')
    expect(genericMappingCsvRow(row).split(',')).toHaveLength(16)
  })
})
