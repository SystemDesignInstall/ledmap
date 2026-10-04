import { describe, expect, it } from 'vitest'
import {
  asMappingRegionId,
  asReceiverId,
  convertEditableProjectToV2,
  createProjectV2,
  editableProjectFromValidatedProject,
  inspectEditableProject,
  inspectProjectV2,
  mapGeometryInputPixel,
  projectEditableGeometryMapping,
  projectEditableHardwareMapping,
  projectV2AsEditableReadModel,
  projectV2GeometryMapping,
  selectAssignmentForCabinet,
  selectCabinetGridsForScreen,
  selectCabinetsForGrid,
  selectCompositionPlacement,
  selectHardwareReadiness,
  selectInputCanvasForMappingRegion,
  selectMappingRegionsForScreen,
  selectPortReceiverOrder,
  selectPortsForProcessor,
  selectProcessors,
  selectProjectScreen,
  selectProjectScreens,
  selectReceiverCabinetChain,
  selectReceiversForPort,
  selectSignalRouteForReceiver,
  type LedMapProjectV2,
} from '../../src/index.js'
import { multiScreenEditableProject } from '../serialization/editor-fixtures.js'
import { multiProcessorProject } from '../serialization/fixtures.js'
import { referenceMapping } from '../mapping-engine/fixtures.js'

function assertDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) assertDeepFrozen(child)
  }
}

describe('Project Model v2 pure selectors and compatibility read model', () => {
  it('selects ordered Screens, placements, Grids, Cabinets, Regions and Input Canvas', () => {
    const source = multiScreenEditableProject()
    const project = convertEditableProjectToV2(source)
    const screens = selectProjectScreens(project)
    expect(screens.map(screen => screen.id)).toEqual(source.screens.map(screen => screen.id))
    for (const screen of screens) {
      expect(selectProjectScreen(project, screen.id)).toEqual(screen)
      expect(selectCompositionPlacement(project, screen.id)).toMatchObject({ screenId: screen.id })
      expect(selectCabinetGridsForScreen(project, screen.id).map(grid => grid.id)).toEqual(
        source.screens.find(value => value.id === screen.id)!.cabinetGrids,
      )
      expect(selectMappingRegionsForScreen(project, screen.id).map(region => region.id)).toEqual(
        source.screens.find(value => value.id === screen.id)!.mappingRegions,
      )
      for (const grid of selectCabinetGridsForScreen(project, screen.id)) {
        expect(selectCabinetsForGrid(project, grid.id).map(cabinet => cabinet.id)).toEqual(
          source.hardwareTopology.cabinets.filter(cabinet => cabinet.grid === grid.id).map(cabinet => cabinet.id),
        )
      }
      for (const region of selectMappingRegionsForScreen(project, screen.id)) {
        expect(selectInputCanvasForMappingRegion(project, region.id)).toEqual(source.inputCanvas)
      }
    }
    expect(Object.isFrozen(screens)).toBe(true)
    expect(projectV2AsEditableReadModel(project)).toEqual(source)
  })

  it('selects Processor, Port, Receiver, assignments and routes by explicit orders', () => {
    const source = editableProjectFromValidatedProject(multiProcessorProject())
    const project = convertEditableProjectToV2(source)
    expect(selectProcessors(project).map(value => value.id)).toEqual(source.hardwareTopology.processorOrder)
    for (const processor of selectProcessors(project)) {
      const ports = selectPortsForProcessor(project, processor.id)
      expect(ports.map(port => port.index)).toEqual([...ports.map(port => port.index)].sort((a, b) => a - b))
      for (const port of ports) {
        const order = source.hardwareTopology.receiverOrder.find(value => value.port === port.id)!
        expect(selectPortReceiverOrder(project, port.id)?.receiverIds).toEqual(order.receivers)
        expect(selectReceiversForPort(project, port.id).map(receiver => receiver.id)).toEqual(order.receivers)
        for (const receiver of selectReceiversForPort(project, port.id)) {
          const old = source.hardwareTopology.receivers.find(value => value.id === receiver.id)!
          expect(receiver.legacyIndex).toBe(old.index)
          expect(selectSignalRouteForReceiver(project, receiver.id)?.orderedCabinetIds ?? []).toEqual(old.cabinets)
          expect(selectReceiverCabinetChain(project, receiver.id).map(cabinet => cabinet.id)).toEqual(old.cabinets)
          for (const cabinetId of old.cabinets) {
            expect(selectAssignmentForCabinet(project, cabinetId)?.receiverId).toBe(receiver.id)
          }
        }
      }
    }
    expect(projectV2AsEditableReadModel(project)).toEqual(source)
  })

  it('does not depend on entity collection order where explicit order exists', () => {
    const project = convertEditableProjectToV2(editableProjectFromValidatedProject(multiProcessorProject()))
    const shuffled = createProjectV2({
      ...project,
      hardware: {
        ...project.hardware,
        processors: [...project.hardware.processors].reverse(),
        ports: [...project.hardware.ports].reverse(),
        receivers: [...project.hardware.receivers].reverse(),
        assignments: [...project.hardware.assignments].reverse(),
      },
      operations: { ...project.operations, signalRoutes: [...project.operations.signalRoutes].reverse() },
    })
    expect(selectProcessors(shuffled).map(value => value.id)).toEqual(selectProcessors(project).map(value => value.id))
    for (const order of project.hardware.receiverOrder) {
      expect(selectReceiversForPort(shuffled, order.portId).map(value => value.id)).toEqual(order.receiverIds)
      for (const receiverId of order.receiverIds) {
        expect(selectReceiverCabinetChain(shuffled, receiverId).map(value => value.id)).toEqual(
          selectReceiverCabinetChain(project, receiverId).map(value => value.id),
        )
      }
    }
  })

  it('returns detached frozen compatibility values without mutating the canonical project', () => {
    const project = convertEditableProjectToV2(multiScreenEditableProject())
    const before = JSON.stringify(project)
    const first = projectV2AsEditableReadModel(project)
    const second = projectV2AsEditableReadModel(project)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.screens[0]).not.toBe(project.design.screens[0])
    assertDeepFrozen(first)
    expect(() => { (first.screens as unknown[]).push({}) }).toThrow(TypeError)
    expect(JSON.stringify(project)).toBe(before)
  })

  it('rejects assignment/route mismatch rather than producing a plausible Receiver cabinet list', () => {
    const project = convertEditableProjectToV2(editableProjectFromValidatedProject(multiProcessorProject()))
    const broken: LedMapProjectV2 = {
      ...project,
      operations: { ...project.operations, signalRoutes: project.operations.signalRoutes.map(route => ({
        ...route, orderedCabinetIds: [],
      })) },
    }
    expect(() => projectV2AsEditableReadModel(broken)).toThrow(/PROJECT_ROUTE_ASSIGNMENT_MISMATCH/)
    expect(() => selectReceiverCabinetChain(broken, asReceiverId('RB'))).toThrow(/PROJECT_ROUTE_ASSIGNMENT_MISMATCH/)
    expect(selectHardwareReadiness(broken)).toMatchObject({ status: 'incomplete', hardware: null })
    expect(inspectProjectV2(broken)[0]?.code).toBe('PROJECT_ROUTE_ASSIGNMENT_MISMATCH')
  })

  it.each([false, true])('matches normal and offset REF-001 Mapping at edges, offset=%s', offset => {
    const source = editableProjectFromValidatedProject({ mapping: referenceMapping(offset), rules: [] })
    const project = convertEditableProjectToV2(source)
    const regionId = source.mappingRegions[0]!.id
    const oldProjection = projectEditableGeometryMapping(source, regionId)
    const newProjection = projectV2GeometryMapping(project, regionId)
    expect(newProjection).toEqual(oldProjection)
    if (oldProjection.status !== 'ready' || newProjection.status !== 'ready') throw new Error('Expected ready geometry')
    const xOffset = offset ? 100 : 0
    const yOffset = offset ? 50 : 0
    for (const [x, y] of [[0, 0], [511, 0], [0, 383], [511, 383], [128, 128], [383, 255]] as const) {
      const input = { inputCanvas: source.inputCanvas!.id, inputCoordinate: { x: x + xOffset, y: y + yOffset } }
      expect(mapGeometryInputPixel(newProjection.mapping, input)).toEqual(mapGeometryInputPixel(oldProjection.mapping, input))
    }
  })

  it('matches multiple Screens and Regions at their coordinate edges', () => {
    const source = multiScreenEditableProject()
    const project = convertEditableProjectToV2(source)
    for (const region of source.mappingRegions) {
      const oldProjection = projectEditableGeometryMapping(source, region.id)
      const newProjection = projectV2GeometryMapping(project, region.id)
      expect(newProjection).toEqual(oldProjection)
      if (oldProjection.status !== 'ready' || newProjection.status !== 'ready') throw new Error('Expected ready geometry')
      for (const x of [region.position.x, region.position.x + region.size.width - 1]) {
        for (const y of [region.position.y, region.position.y + region.size.height - 1]) {
          const input = { inputCanvas: source.inputCanvas!.id, inputCoordinate: { x, y } }
          expect(mapGeometryInputPixel(newProjection.mapping, input)).toEqual(
            mapGeometryInputPixel(oldProjection.mapping, input),
          )
        }
      }
    }
  })

  it('keeps independent Mapping Regions on one Screen at offset boundaries', () => {
    const base = multiScreenEditableProject()
    const extra = { ...base.mappingRegions[0]!, id: asMappingRegionId('region-extra'), position: { x: 2, y: 0 } }
    const source = {
      ...base,
      inputCanvas: { ...base.inputCanvas!, resolution: { width: 6, height: 3 } },
      screens: base.screens.map((screen, index) => index === 0
        ? { ...screen, mappingRegions: [...screen.mappingRegions, extra.id] }
        : screen),
      mappingRegions: [...base.mappingRegions.map((region, index) => index === 1
        ? { ...region, position: { x: 4, y: 0 } }
        : region), extra],
    }
    const project = convertEditableProjectToV2(source)
    expect(selectMappingRegionsForScreen(project, source.screens[0]!.id).map(region => region.id)).toEqual(
      source.screens[0]!.mappingRegions,
    )
    for (const region of source.mappingRegions) {
      const oldProjection = projectEditableGeometryMapping(source, region.id)
      const newProjection = projectV2GeometryMapping(project, region.id)
      expect(newProjection).toEqual(oldProjection)
      if (oldProjection.status !== 'ready' || newProjection.status !== 'ready') throw new Error('Expected ready geometry')
      for (const x of [region.position.x, region.position.x + region.size.width - 1]) {
        for (const y of [region.position.y, region.position.y + region.size.height - 1]) {
          const input = { inputCanvas: source.inputCanvas.id, inputCoordinate: { x, y } }
          expect(mapGeometryInputPixel(newProjection.mapping, input)).toEqual(
            mapGeometryInputPixel(oldProjection.mapping, input),
          )
        }
      }
    }
  })

  it('keeps old integrity and Hardware readiness diagnostics on a partial source', () => {
    const source = multiScreenEditableProject()
    const project = convertEditableProjectToV2(source)
    expect(inspectEditableProject(source)).toEqual([])
    expect(inspectProjectV2(project)).toEqual([])
    expect(selectHardwareReadiness(project)).toEqual(projectEditableHardwareMapping(source))
  })
})
