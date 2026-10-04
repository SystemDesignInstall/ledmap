import {
  cabinetOrder,
  locatePixel,
  selectV2GeometryRead,
  selectV2HardwareRead,
  unmapGeometryCabinetPixel,
  type LedMapProjectV2,
  type PortId,
  type ProcessorId,
  type ResolvedGeometryMapping,
  type ResolvedHardwareMapping,
} from '@ledmap/core'
import type { TestCabinetNode, TestScene, TestScope, TestScopeKind, TestWalkPixel } from '../shared/test-engine.js'

export interface V2TestScopeTarget {
  readonly id: string
  readonly label: string
}

interface WalkSpan {
  readonly ordinalBase: number
  readonly pixelCount: number
  readonly processor: ProcessorId
  readonly port: PortId
  readonly receiver: string
  readonly cabinet: string
  readonly dataIndexBase: number
}

export interface V2TestWalkSpace {
  readonly total: number
  readonly spans: readonly WalkSpan[]
  readonly hardware: ResolvedHardwareMapping | null
}

function screenViews(project: LedMapProjectV2) {
  return project.design.screens.flatMap(screen => {
    const grid = project.design.cabinetGrids.find(value => value.id === screen.cabinetGridOrder[0])
    const placement = project.design.composition.placements.find(value => value.screenId === screen.id)
    if (!grid || !placement) return []
    return [{ screen, grid, x: placement.x, y: placement.y,
      width: grid.columns * grid.cabinetWidth, height: grid.rows * grid.cabinetHeight }]
  })
}

function center(cabinet: TestCabinetNode) {
  return { x: cabinet.bounds.x + cabinet.bounds.width / 2, y: cabinet.bounds.y + cabinet.bounds.height / 2 }
}

function geometryMappings(project: LedMapProjectV2): Map<string, ResolvedGeometryMapping> {
  const result = new Map<string, ResolvedGeometryMapping>()
  for (const region of project.content.mappingRegions) {
    const projection = selectV2GeometryRead(project, region.id)
    if (projection.status === 'ready') result.set(region.gridId, projection.mapping)
  }
  return result
}

export function buildV2TestScene(project: LedMapProjectV2): TestScene {
  const views = screenViews(project)
  const receiverById = new Map(project.hardware.receivers.map(receiver => [receiver.id, receiver]))
  const receiverByCabinet = new Map(project.hardware.assignments.map(assignment => [assignment.target.cabinetId, receiverById.get(assignment.receiverId)]))
  const ports = new Map(project.hardware.ports.map(port => [port.id, port]))
  const processors = new Map(project.hardware.processors.map(processor => [processor.id, processor]))
  const screens = views.map(view => ({
    id: view.screen.id, name: view.screen.name,
    bounds: { x: view.x, y: view.y, width: view.width, height: view.height },
  }))
  const cabinets: TestCabinetNode[] = []
  for (const view of views) {
    const physical = project.design.cabinets.filter(value => value.gridId === view.grid.id)
      .sort((a, b) => a.row - b.row || a.column - b.column)
    const path = cabinetOrder({ columns: view.grid.columns, rows: view.grid.rows, ordering: view.grid.ordering })
    for (const cabinet of physical) {
      const receiver = receiverByCabinet.get(cabinet.id)
      const port = receiver ? ports.get(receiver.portId) : undefined
      const processor = port ? processors.get(port.processorId) : undefined
      cabinets.push({
        id: cabinet.id, screen: view.screen.id,
        logicalOrder: path.findIndex(cell => cell.column === cabinet.column && cell.row === cabinet.row) + 1,
        bounds: {
          x: view.x + cabinet.column * cabinet.pixelWidth,
          y: view.y + cabinet.row * cabinet.pixelHeight,
          width: cabinet.pixelWidth, height: cabinet.pixelHeight,
        },
        hardware: receiver && port && processor ? {
          receiver: receiver.id, port: port.id, processor: processor.id, processorName: processor.name,
        } : null,
      })
    }
  }
  const cabinetMap = new Map(cabinets.map(cabinet => [cabinet.id, cabinet]))
  const modules = project.design.modules.flatMap(module => {
    const cabinet = cabinetMap.get(module.cabinetId)
    if (!cabinet) return []
    return [{ id: module.id, cabinet: module.cabinetId, screen: cabinet.screen,
      bounds: {
        x: cabinet.bounds.x + module.column * module.pixelWidth,
        y: cabinet.bounds.y + module.row * module.pixelHeight,
        width: module.pixelWidth, height: module.pixelHeight,
      } }]
  })
  const routes = new Map(project.operations.signalRoutes.map(route => [route.receiverId, route.orderedCabinetIds]))
  const signalPaths = project.hardware.receivers.map(receiver => {
    const assigned = (routes.get(receiver.id) ?? []).map(id => cabinetMap.get(id)).filter(cabinet => cabinet !== undefined)
    return { receiver: receiver.id, port: receiver.portId, processor: receiver.processorId,
      cabinets: assigned.map(cabinet => cabinet.id), points: assigned.map(center) }
  })
  const hardware = selectV2HardwareRead(project)
  const hardwareReady = hardware.status === 'ready' && project.hardware.processors.length > 0 && hardware.hardware.pixelCount > 0
  const mappings = geometryMappings(project)
  const mappingReady = cabinets.length > 0 && cabinets.every(cabinet => {
    const source = project.design.cabinets.find(value => value.id === cabinet.id)
    return source ? mappings.has(source.gridId) : false
  })
  const left = views.length > 0 ? Math.min(...views.map(view => view.x)) : 0
  const top = views.length > 0 ? Math.min(...views.map(view => view.y)) : 0
  const right = views.length > 0 ? Math.max(...views.map(view => view.x + view.width)) : 0
  const bottom = views.length > 0 ? Math.max(...views.map(view => view.y + view.height)) : 0
  return Object.freeze({
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    screens: Object.freeze(screens), cabinets: Object.freeze(cabinets), modules: Object.freeze(modules), signalPaths: Object.freeze(signalPaths),
    hardwareReady, mappingReady,
    hardwareReason: hardwareReady ? null : hardware.diagnostics[0]?.message ?? 'Complete Cabinet assignments in Hardware before using this pattern.',
    mappingReason: mappingReady ? null : 'Every Cabinet requires a complete Mapping Region for Address Walk.',
  })
}

function uniqueTargets(values: readonly V2TestScopeTarget[]): readonly V2TestScopeTarget[] {
  const seen = new Set<string>()
  return values.filter(value => {
    if (seen.has(value.id)) return false
    seen.add(value.id)
    return true
  })
}

export function v2TestScopeTargets(scene: TestScene, kind: TestScopeKind): readonly V2TestScopeTarget[] {
  if (kind === 'composition') return []
  if (kind === 'screen') return scene.screens.map(screen => ({ id: screen.id, label: `${screen.name} · ${screen.id}` }))
  if (kind === 'cabinet') return scene.cabinets.map(cabinet => ({ id: cabinet.id, label: cabinet.id }))
  if (kind === 'module') return scene.modules.map(module => ({ id: module.id, label: module.id }))
  if (kind === 'receiver') return uniqueTargets(scene.cabinets.flatMap(cabinet => cabinet.hardware
    ? [{ id: cabinet.hardware.receiver, label: cabinet.hardware.receiver }] : []))
  return uniqueTargets(scene.cabinets.flatMap(cabinet => cabinet.hardware
    ? [{ id: cabinet.hardware.port, label: cabinet.hardware.port }] : []))
}

function scopeCabinets(scene: TestScene, scope: TestScope): Set<string> {
  if (scope.kind === 'composition') return new Set(scene.cabinets.map(cabinet => cabinet.id))
  if (scope.kind === 'screen') return new Set(scene.cabinets.filter(cabinet => cabinet.screen === scope.target).map(cabinet => cabinet.id))
  if (scope.kind === 'cabinet') return new Set(scope.target ? [scope.target] : [])
  if (scope.kind === 'module') {
    const module = scene.modules.find(value => value.id === scope.target)
    return new Set(module ? [module.cabinet] : [])
  }
  if (scope.kind === 'receiver') return new Set(scene.cabinets.filter(cabinet => cabinet.hardware?.receiver === scope.target).map(cabinet => cabinet.id))
  return new Set(scene.cabinets.filter(cabinet => cabinet.hardware?.port === scope.target).map(cabinet => cabinet.id))
}

export function buildV2TestWalkSpace(project: LedMapProjectV2, scene: TestScene, scope: TestScope): V2TestWalkSpace {
  const projection = selectV2HardwareRead(project)
  if (projection.status !== 'ready' || !scene.hardwareReady) return { total: 0, spans: [], hardware: null }
  const included = scopeCabinets(scene, scope)
  const spans: WalkSpan[] = []
  let ordinalBase = 0
  for (const port of projection.hardware.ports) {
    for (const receiver of port.receivers) {
      for (const cabinet of receiver.cabinets) {
        if (!included.has(cabinet.cabinet)) continue
        spans.push({ ordinalBase, pixelCount: cabinet.pixelCount, processor: port.processor, port: port.port,
          receiver: receiver.receiver, cabinet: cabinet.cabinet, dataIndexBase: cabinet.portBase })
        ordinalBase += cabinet.pixelCount
      }
    }
  }
  return Object.freeze({ total: ordinalBase, spans: Object.freeze(spans), hardware: projection.hardware })
}

export function v2WalkOrdinalForDataIndex(space: V2TestWalkSpace, dataIndex: number): number | null {
  if (!Number.isSafeInteger(dataIndex) || dataIndex < 0) return null
  const span = space.spans.find(value => dataIndex >= value.dataIndexBase && dataIndex < value.dataIndexBase + value.pixelCount)
  return span ? span.ordinalBase + dataIndex - span.dataIndexBase : null
}

export function resolveV2TestWalkPixel(project: LedMapProjectV2, space: V2TestWalkSpace, ordinal: number): TestWalkPixel | null {
  if (!space.hardware || space.total === 0 || !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= space.total) return null
  const span = space.spans.find(value => ordinal >= value.ordinalBase && ordinal < value.ordinalBase + value.pixelCount)
  if (!span) return null
  const dataIndex = span.dataIndexBase + ordinal - span.ordinalBase
  const located = locatePixel(space.hardware, { processor: span.processor, port: span.port, dataIndex })
  const cabinet = project.design.cabinets.find(value => value.id === located.cabinet)
  if (!cabinet) return null
  const region = project.content.mappingRegions.find(value => value.gridId === cabinet.gridId)
  if (!region) return null
  const geometry = selectV2GeometryRead(project, region.id)
  if (geometry.status !== 'ready') return null
  const mapped = unmapGeometryCabinetPixel(geometry.mapping, { cabinet: located.cabinet, coordinate: located.cabinetCoordinate })
  const screen = screenViews(project).find(value => value.screen.id === geometry.mapping.screen.id)
  if (!screen) return null
  return Object.freeze({
    ordinal, total: space.total, input: mapped.inputCoordinate, screen: screen.screen.id, screenName: screen.screen.name,
    screenCoordinate: mapped.screenCoordinate, cabinet: mapped.cabinet, cabinetCoordinate: mapped.cabinetCoordinate,
    module: mapped.module, moduleCoordinate: mapped.moduleCoordinate,
    receiver: span.receiver, port: span.port, processor: span.processor, dataIndex,
    compositionPoint: { x: screen.x + mapped.screenCoordinate.x, y: screen.y + mapped.screenCoordinate.y },
  })
}
