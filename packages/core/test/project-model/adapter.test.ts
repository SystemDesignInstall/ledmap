import { describe, expect, it } from 'vitest'
import {
  allocateHardware,
  asCabinetGridId,
  asMappingRegionId,
  convertEditableProjectToV2,
  createProjectV2,
  editableProjectFromValidatedProject,
  loadEditableProject,
  resolveHardware,
  serializeEditableProject,
  serializeProject,
} from '../../src/index.js'
import { fullEditableProject, layoutOnlyProject, multiScreenEditableProject } from '../serialization/editor-fixtures.js'
import { minimalProject, multiProcessorProject } from '../serialization/fixtures.js'
import { smallMapping } from '../mapping-engine/fixtures.js'

describe('EditableProject to Project Model v2 adapter', () => {
  it('preserves layout, mapping, cabinet geometry and identity in a partial editor project', () => {
    const source = multiScreenEditableProject()
    const before = serializeEditableProject({ project: source })
    const project = convertEditableProjectToV2(source)

    expect(project.design.screens.map(screen => screen.id)).toEqual(source.screens.map(screen => screen.id))
    expect(project.design.screens.map(screen => [screen.cabinetGridOrder, screen.mappingRegionOrder])).toEqual(
      source.screens.map(screen => [screen.cabinetGrids, screen.mappingRegions]),
    )
    expect(project.design.cabinetGrids.map(grid => [grid.id, grid.screenId, grid.ordering])).toEqual(
      source.cabinetGrids.map(grid => [grid.id, grid.screen, grid.ordering]),
    )
    expect(project.design.cabinets.map(cabinet => [cabinet.id, cabinet.gridId, cabinet.origin])).toEqual(
      source.hardwareTopology.cabinets.map(cabinet => [cabinet.id, cabinet.grid, cabinet.origin]),
    )
    expect(project.design.modules.map(module => [module.id, module.cabinetId, module.column, module.row])).toEqual(
      source.hardwareTopology.modules.map(module => [module.id, module.cabinet, module.column, module.row]),
    )
    expect(project.design.composition.placements.map(value => [value.screenId, value.x, value.y, value.locked])).toEqual(
      source.editorLayout.screenPositions.map(value => [value.screen, value.position.x, value.position.y, false]),
    )
    expect(project.content.inputCanvases).toEqual([source.inputCanvas])
    expect(project.content.mappingRegions.map(region => [region.id, region.inputCanvasId, region.screenId, region.gridId])).toEqual(
      source.mappingRegions.map(region => [region.id, region.inputCanvas, region.screen, region.grid]),
    )
    expect(project.hardware.assignments).toEqual([])
    expect(project.operations.signalRoutes).toEqual([])
    expect(serializeEditableProject({ project: source })).toBe(before)
  })

  it('keeps Screen Grid and Region order even when global entity arrays have another order', () => {
    const source = fullEditableProject()
    const screen = source.screens[0]!
    const grid = source.cabinetGrids[0]!
    const region = source.mappingRegions[0]!
    const secondGrid = { ...grid, id: asCabinetGridId('grid-second') }
    const secondRegion = { ...region, id: asMappingRegionId('region-second'), grid: secondGrid.id }
    const reordered = {
      ...source,
      screens: [{
        ...screen,
        cabinetGrids: [secondGrid.id, grid.id],
        mappingRegions: [secondRegion.id, region.id],
      }],
      cabinetGrids: [grid, secondGrid],
      mappingRegions: [region, secondRegion],
    }
    const project = convertEditableProjectToV2(reordered)
    expect(project.design.cabinetGrids.map(value => value.id)).toEqual([grid.id, secondGrid.id])
    expect(project.design.screens[0]?.cabinetGridOrder).toEqual([secondGrid.id, grid.id])
    expect(project.content.mappingRegions.map(value => value.id)).toEqual([region.id, secondRegion.id])
    expect(project.design.screens[0]?.mappingRegionOrder).toEqual([secondRegion.id, region.id])
    expect(serializeEditableProject({ project: reordered })).toContain('"schemaVersion": 2')
  })

  it('keeps a Layout-only document incomplete without inventing Mapping or Hardware', () => {
    const project = convertEditableProjectToV2(layoutOnlyProject())
    expect(project.content.inputCanvases).toEqual([])
    expect(project.content.mappingRegions).toEqual([])
    expect(project.hardware.receivers).toEqual([])
    expect(project.hardware.assignments).toEqual([])
    expect(project.design.composition.placements[0]).toMatchObject({ x: -20, y: 30, locked: false })
  })

  it('separates membership, Cabinet route and Receiver order without using legacyIndex as chain position', () => {
    const source = editableProjectFromValidatedProject(multiProcessorProject())
    const project = convertEditableProjectToV2(source)
    const hardware = resolveHardware(source.hardwareTopology)

    expect(project.hardware.receivers.map(receiver => receiver.legacyIndex)).toEqual([5, 0])
    expect(project.hardware.receiverOrder.map(order => [order.portId, [...order.receiverIds]])).toEqual([
      ['P02:01', ['RB']], ['P01:01', ['RA']],
    ])
    expect(project.hardware.assignments.map(assignment => [
      assignment.target.cabinetId, assignment.receiverId, assignment.locked, assignment.origin,
    ])).toEqual([['C02', 'RB', true, undefined], ['C01', 'RA', true, undefined]])
    expect(project.operations.signalRoutes.map(route => [route.receiverId, [...route.orderedCabinetIds]])).toEqual([
      ['RB', ['C02']], ['RA', ['C01']],
    ])
    expect(hardware.ports.map(port => [port.port, port.receivers.map(receiver => receiver.receiver)])).toEqual([
      ['P02:01', ['RB']], ['P01:01', ['RA']],
    ])
  })

  it('preserves a nontrivial Cabinet signal chain independently of assignment membership', () => {
    const original = editableProjectFromValidatedProject({ mapping: smallMapping(2, 2), rules: [] })
    const receiver = original.hardwareTopology.receivers[0]!
    const reversed = [...receiver.cabinets].reverse()
    const source = {
      ...original,
      hardwareTopology: {
        ...original.hardwareTopology,
        receivers: [{ ...receiver, cabinets: reversed }],
      },
    }
    const project = convertEditableProjectToV2(source)
    const route = project.operations.signalRoutes[0]!
    const resolved = resolveHardware(source.hardwareTopology)

    expect(route.orderedCabinetIds).toEqual(reversed)
    expect(new Set(project.hardware.assignments.map(value => value.target.cabinetId))).toEqual(new Set(reversed))
    expect(resolved.ports[0]!.receivers[0]!.cabinets.map(value => value.cabinet)).toEqual(route.orderedCabinetIds)
    expect(serializeEditableProject({ project: source })).not.toBe(serializeEditableProject({ project: original }))
  })

  it('generates stable assignment and route IDs and ignores assignment array order', () => {
    const source = editableProjectFromValidatedProject(multiProcessorProject())
    const first = convertEditableProjectToV2(source)
    const second = convertEditableProjectToV2(source)
    expect(first.hardware.assignments.map(value => value.id)).toEqual(second.hardware.assignments.map(value => value.id))
    expect(first.operations.signalRoutes.map(value => value.id)).toEqual(second.operations.signalRoutes.map(value => value.id))
    expect(() => createProjectV2({
      ...first,
      hardware: { ...first.hardware, assignments: [...first.hardware.assignments].reverse() },
    })).not.toThrow()
  })

  it('imports existing v1 and v2 documents without changing their bytes or semantics', () => {
    const v1 = serializeProject({ project: minimalProject() })
    const v1Loaded = loadEditableProject(v1)
    expect(v1Loaded.sourceSchemaVersion).toBe(1)
    expect(convertEditableProjectToV2(v1Loaded.project).hardware.assignments).toHaveLength(1)

    const source = fullEditableProject(-120, 80)
    const v2 = serializeEditableProject({ project: source, extensions: { marker: 'keep' } })
    const v2Loaded = loadEditableProject(v2)
    const canonical = convertEditableProjectToV2(v2Loaded.project)
    expect(canonical.hardware.assignments[0]).toMatchObject({ locked: true, receiverId: source.hardwareTopology.receivers[0]!.id })
    expect(canonical.hardware.assignments[0]).not.toHaveProperty('origin')
    expect(serializeEditableProject({ project: v2Loaded.project, extensions: v2Loaded.extensions })).toBe(v2)
  })

  it('preserves fixed legacy assignments under the existing allocator contract', () => {
    const source = fullEditableProject()
    const canonical = convertEditableProjectToV2(source)
    const topology = source.hardwareTopology
    const allocated = allocateHardware({ ...topology, cabinetOrder: [] })
    expect(canonical.hardware.assignments.every(assignment => assignment.locked && assignment.origin === undefined)).toBe(true)
    expect(allocated.topology.receivers.map(receiver => receiver.cabinets)).toEqual(topology.receivers.map(receiver => receiver.cabinets))
  })
})
