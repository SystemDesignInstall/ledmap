import {
  addressGeometryPixel,
  selectV2GeometryRead,
  selectV2HardwareRead,
  unmapGeometryCabinetPixel,
  validateProject,
  type ProjectHardwarePlan,
  type ProjectValidationReport,
  type GeometryMappedPixel,
  type LedMapProjectV2,
  type MappedPixel,
} from '@ledmap/core'
import { fitCamera, toProject, zoomAt, type Camera, type Point } from './canvas.js'
import {
  drawHardwareCanvas,
  hardwareCabinetCenter,
  hardwareCanvasBounds,
  hitHardwareCabinet,
  type HardwareOverlays,
  type HardwareSelection,
} from './hardware-canvas.js'
import {
  findPort,
  findProcessor,
  findReceiver,
  receiversInHardwareOrder,
  receiverPixelUsage,
  unassignedCabinetIds,
  receiverCabinetIds,
  projectHardwareLoadV2,
} from './v2-hardware-read.js'
import {
  addPortV2, addProcessorV2, addReceiverV2, applyHardwareAllocationV2,
  assignCabinetsV2, deletePortV2, deleteProcessorV2, deleteReceiverV2,
  moveCabinetToReceiverV2, moveProcessorV2, moveReceiverV2, orderedSelectedCabinetsV2,
  previewHardwareAllocationV2, renameProcessorV2, requireCurrentHardwarePreview, setProcessorPortCountV2,
  reorderSignalRouteV2, unassignCabinetsV2, updatePortV2, updateReceiverV2,
} from './v2-hardware-commands.js'
import type { Project } from './v2-view-model.js'
import { capacityModeText, portCapacityEditor, processorCapacityEditor } from './hardware-capacity-editor.js'

interface HardwareWorkspaceOptions {
  readonly getProject: () => Project
  readonly getProjectV2: () => LedMapProjectV2
  readonly getDocumentStamp: () => { readonly documentId: string; readonly revision: number }
  readonly runCommand: (command: (project: LedMapProjectV2) => LedMapProjectV2) => void
  readonly showError: (error: unknown, fallback: string) => void
  readonly clearError: () => void
}

export interface HardwareWorkspace {
  activate(): void
  deactivate(): void
  projectChanged(): void
}

interface HardwareInspection {
  readonly geometry: GeometryMappedPixel
  readonly mapped: MappedPixel | null
  readonly hardwareStatus: 'ready' | 'incomplete'
}

interface HardwareDump {
  readonly processors: ReadonlyArray<{ readonly id: string; readonly name: string; readonly portCount: number }>
  readonly ports: ReadonlyArray<{ readonly id: string; readonly processor: string; readonly index: number; readonly receiverCapacity: number }>
  readonly receivers: ReadonlyArray<{
    readonly id: string
    readonly processor: string
    readonly port: string
    readonly index: number
    readonly pixelCapacity: number | null
    readonly cabinets: readonly string[]
  }>
  readonly processorOrder: readonly string[]
  readonly receiverOrder: ReadonlyArray<{ readonly port: string; readonly receivers: readonly string[] }>
  readonly unassigned: readonly string[]
}

interface HardwareTestHook {
  dump(): HardwareDump
  camera(): Camera
  cabinetCenterPx(cabinetId: string): Point | null
  inspectCabinet(cabinetId: string, x: number, y: number): ReturnType<typeof inspectionDump>
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

function row(label: string, value: HTMLElement | string): HTMLDivElement {
  const result = document.createElement('div')
  result.className = 'property'
  const name = document.createElement('label')
  name.textContent = label
  const content = typeof value === 'string' ? document.createElement('span') : value
  if (typeof value === 'string') {
    content.className = 'value'
    content.textContent = value
  }
  result.append(name, content)
  return result
}

function group(title: string, ...children: HTMLElement[]): HTMLDivElement {
  const result = document.createElement('div')
  result.className = 'property-group'
  const heading = document.createElement('h3')
  heading.textContent = title
  result.append(heading, ...children)
  return result
}

function action(label: string, run: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  button.addEventListener('click', run)
  return button
}

function textInput(value: string, label: string, commit: (value: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => commit(input.value))
  return input
}

function numberInput(value: number, label: string, commit: (value: number) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '0'
  input.step = '1'
  input.value = String(value)
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => commit(Number(input.value)))
  return input
}

function format(value: number): string {
  return value.toLocaleString('en-US')
}

function cabinetCountLabel(count: number): string {
  return `${count} Cabinet${count === 1 ? '' : 's'}`
}

function inspectionDump(inspection: HardwareInspection): {
  readonly input: Point
  readonly screen: Point
  readonly cabinet: string
  readonly module: string
  readonly receiver: string | null
  readonly port: string | null
  readonly processor: string | null
  readonly dataIndex: number | null
} {
  return {
    input: inspection.geometry.inputCoordinate,
    screen: inspection.geometry.screenCoordinate,
    cabinet: inspection.geometry.cabinet,
    module: inspection.geometry.module,
    receiver: inspection.mapped?.address.hardware.receiver ?? null,
    port: inspection.mapped?.address.hardware.port ?? null,
    processor: inspection.mapped?.address.hardware.processor ?? null,
    dataIndex: inspection.mapped?.address.dataIndex ?? null,
  }
}

export function createHardwareWorkspace(options: HardwareWorkspaceOptions): HardwareWorkspace {
  const canvas = element<HTMLCanvasElement>('hardware-canvas')
  const tree = element<HTMLDivElement>('hardware-tree')
  const diagnostics = element<HTMLDivElement>('hardware-diagnostics')
  const properties = element<HTMLDivElement>('hardware-properties')
  const inspectorTitle = element<HTMLHeadingElement>('hardware-inspector-title')
  const selectionChip = element<HTMLSpanElement>('hardware-selection-chip')
  const addProcessorButton = element<HTMLButtonElement>('hardware-add-processor')
  const addPortButton = element<HTMLButtonElement>('hardware-add-port')
  const addReceiverButton = element<HTMLButtonElement>('hardware-add-receiver')
  const deleteButton = element<HTMLButtonElement>('hardware-delete')
  const orderUpButton = element<HTMLButtonElement>('hardware-order-up')
  const orderDownButton = element<HTMLButtonElement>('hardware-order-down')
  const assignButton = element<HTMLButtonElement>('hardware-assign')
  const unassignButton = element<HTMLButtonElement>('hardware-unassign')
  const allocateButton = element<HTMLButtonElement>('hardware-auto-allocate')
  const fitButton = element<HTMLButtonElement>('hardware-fit')
  const actualButton = element<HTMLButtonElement>('hardware-actual-size')
  const zoomInButton = element<HTMLButtonElement>('hardware-zoom-in')
  const zoomOutButton = element<HTMLButtonElement>('hardware-zoom-out')
  const cursorStatus = element<HTMLSpanElement>('hardware-cursor-status')
  const zoomStatus = element<HTMLSpanElement>('hardware-zoom-indicator')
  const healthStatus = element<HTMLSpanElement>('hardware-health-status')
  const previewDialog = element<HTMLDialogElement>('allocation-preview-dialog')
  const previewBody = element<HTMLDivElement>('allocation-preview-body')
  const applyPreviewButton = element<HTMLButtonElement>('allocation-apply')
  const cancelPreviewButton = element<HTMLButtonElement>('allocation-cancel')

  let active = false
  let selection: HardwareSelection | null = null
  let selectedCabinetIds: readonly string[] = []
  let inspectedCabinet: { readonly id: string; readonly coordinate: Point } | null = null
  let reportProject: LedMapProjectV2 | null = null
  let cachedReport: ProjectValidationReport | null = null
  let camera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 }
  let overlays: HardwareOverlays = { receiver: true, port: false, processor: false, dataFlow: true }
  let allocationPreview: {
    readonly proposal: ProjectHardwarePlan
    readonly documentId: string
    readonly revision: number
  } | null = null
  let spaceDown = false
  let pan: { readonly x: number; readonly y: number } | null = null

  function project(): Project {
    return options.getProject()
  }

  function model(): LedMapProjectV2 {
    return options.getProjectV2()
  }

  function validationReport(source = model()): ProjectValidationReport {
    if (reportProject !== source) {
      reportProject = source
      cachedReport = validateProject({ project: source })
    }
    return cachedReport!
  }

  function mutate(run: (project: LedMapProjectV2) => LedMapProjectV2, fallback: string, after?: () => void): void {
    options.clearError()
    try {
      options.runCommand(run)
      after?.()
      render()
    } catch (error) {
      options.showError(error, fallback)
    }
  }

  function selectedProcessorId(): string | null {
    if (selection?.type === 'processor') return selection.id
    if (selection?.type === 'port') return findPort(model(), selection.id)?.processorId ?? null
    if (selection?.type === 'receiver') return findReceiver(model(), selection.id)?.processorId ?? null
    return null
  }

  function selectedPortId(): string | null {
    if (selection?.type === 'port') return selection.id
    if (selection?.type === 'receiver') return findReceiver(model(), selection.id)?.portId ?? null
    return null
  }

  function selectEntity(next: HardwareSelection): void {
    selection = next
    render()
  }

  function fit(): void {
    const rect = canvas.getBoundingClientRect()
    const bounds = hardwareCanvasBounds(project())
    camera = fitCamera(bounds, rect.width, rect.height)
    draw()
  }

  function draw(): void {
    if (!active) return
    drawHardwareCanvas(canvas, project(), { selection, selectedCabinetIds, overlays }, camera)
    zoomStatus.textContent = `${Math.round(camera.zoom * 100)}%`
  }

  function capacityText(used: number, capacity: number): string {
    return `${format(used)} / ${format(capacity)}`
  }

  function entityButton(type: HardwareSelection['type'], id: string, label: string, detail: string, depth: number): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `hardware-tree-node depth-${depth}`
    button.dataset['hardwareType'] = type
    button.dataset['hardwareId'] = id
    button.setAttribute('aria-pressed', String(selection?.type === type && selection.id === id))
    const name = document.createElement('span')
    name.textContent = label
    const meta = document.createElement('small')
    meta.textContent = detail
    button.append(name, meta)
    button.addEventListener('click', () => selectEntity({ type, id }))
    return button
  }

  function cabinetButton(cabinetId: string, receiverId: string | null): HTMLButtonElement {
    const cabinet = model().design.cabinets.find(value => value.id === cabinetId)
    const screen = project().screens.find(value => value.grid.id === cabinet?.gridId)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'hardware-tree-cabinet'
    button.dataset['cabinetId'] = cabinetId
    button.setAttribute('aria-pressed', String(selectedCabinetIds.includes(cabinetId)))
    button.textContent = `${screen?.screen.name ?? cabinet?.gridId ?? 'Cabinet'} · ${cabinetId.split('/').at(-1)}`
    button.addEventListener('click', event => {
      const additive = event.ctrlKey || event.metaKey || event.shiftKey
      selectedCabinetIds = additive
        ? selectedCabinetIds.includes(cabinetId)
          ? selectedCabinetIds.filter(id => id !== cabinetId)
          : [...selectedCabinetIds, cabinetId]
        : [cabinetId]
      if (receiverId) selection = { type: 'receiver', id: receiverId }
      inspectedCabinet = { id: cabinetId, coordinate: { x: 0, y: 0 } }
      render()
    })
    return button
  }

  function renderTree(): void {
    tree.replaceChildren()
    const source = model().hardware
    if (source.processors.length === 0) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Add a Processor to start Generic Hardware topology.'
      tree.append(hint)
    }
    for (const processorId of source.processorOrder) {
      const processor = source.processors.find(value => value.id === processorId)
      if (!processor) continue
      const ports = source.ports.filter(port => port.processorId === processor.id).sort((a, b) => a.index - b.index)
      tree.append(entityButton('processor', processor.id, processor.name, `Ports ${ports.length}/${processor.portCount}`, 0))
      for (const port of ports) {
        const order = source.receiverOrder.find(value => value.portId === port.id)
        const receiverIds = order?.receiverIds ?? []
        tree.append(entityButton('port', port.id, `Port ${port.index + 1}`, `Receivers ${receiverIds.length}/${port.receiverCapacity}`, 1))
        for (const receiverId of receiverIds) {
          const receiver = source.receivers.find(value => value.id === receiverId)
          if (!receiver) continue
          const usage = receiverPixelUsage(model(), receiver.id)
          tree.append(entityButton(
            'receiver',
            receiver.id,
            receiver.id,
            usage.capacity === null ? `${format(usage.used)} px` : `${capacityText(usage.used, usage.capacity)} px`,
            2,
          ))
          for (const cabinet of receiverCabinetIds(model(), receiver.id)) tree.append(cabinetButton(cabinet, receiver.id))
        }
      }
    }
    const unassigned = unassignedCabinetIds(model())
    if (unassigned.length > 0) {
      const heading = document.createElement('div')
      heading.className = 'hardware-unassigned-heading'
      heading.textContent = `Unassigned Cabinets · ${unassigned.length}`
      tree.append(heading)
      for (const cabinet of unassigned) tree.append(cabinetButton(cabinet, null))
    }
  }

  function renderDiagnostics(): void {
    diagnostics.replaceChildren()
    const unassigned = unassignedCabinetIds(model())
    if (unassigned.length > 0) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'mapping-diagnostic status-incomplete'
      item.textContent = `${unassigned.length} Cabinets are not assigned`
      item.addEventListener('click', () => {
        selectedCabinetIds = unassigned
        render()
      })
      diagnostics.append(item)
    }
    const report = validationReport()
    const issues = report.diagnostics.filter(issue => issue.stage === 'input' || issue.stage === 'hardware')
    for (const issue of issues.filter(issue => issue.code !== 'HARDWARE_UNPATCHED')) {
      const item = document.createElement('p')
      item.className = `mapping-diagnostic ${issue.severity === 'error' ? 'status-invalid' : 'status-incomplete'}`
      item.textContent = issue.message
      diagnostics.append(item)
    }
    if (unassigned.length === 0 && !issues.some(issue => issue.severity === 'error')) {
      const healthy = document.createElement('p')
      const unknown = issues.some(issue => issue.code === 'HARDWARE_CAPACITY_UNKNOWN' || issue.code === 'HARDWARE_TRANSPORT_CAPACITY_UNKNOWN')
      healthy.className = issues.some(issue => issue.severity === 'warning') ? 'mapping-diagnostic status-incomplete' : 'mapping-diagnostic-ok'
      const hardware = selectV2HardwareRead(model())
      healthy.textContent = `Assignments complete · ${format(hardware.hardware?.pixelCount ?? 0)} pixels${unknown ? ' · capacity limits unknown' : ''}`
      diagnostics.append(healthy)
    }
  }

  function commit(run: (project: LedMapProjectV2) => LedMapProjectV2, fallback: string): void {
    mutate(run, fallback)
  }

  function inspectionFor(cabinetId: string, coordinate: Point): HardwareInspection {
    const cabinet = model().design.cabinets.find(value => value.id === cabinetId)
    if (!cabinet) throw new Error(`Unknown Cabinet: ${cabinetId}`)
    const region = model().content.mappingRegions.find(value => value.gridId === cabinet.gridId)
    if (!region) throw new Error(`Cabinet ${cabinetId} has no Mapping Region.`)
    const geometry = selectV2GeometryRead(model(), region.id)
    if (geometry.status !== 'ready') throw new Error(geometry.diagnostics[0]?.message ?? 'Mapping geometry is incomplete.')
    const pixel = unmapGeometryCabinetPixel(geometry.mapping, { cabinet: cabinet.id, coordinate })
    const hardware = selectV2HardwareRead(model())
    return {
      geometry: pixel,
      mapped: hardware.status === 'ready' ? addressGeometryPixel(hardware.hardware, pixel) : null,
      hardwareStatus: hardware.status,
    }
  }

  function renderPixelInspector(): HTMLElement {
    const container = document.createElement('div')
    if (!inspectedCabinet) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Select a Cabinet on the canvas to inspect its full pixel path.'
      container.append(hint)
      return container
    }
    const cabinet = model().design.cabinets.find(value => value.id === inspectedCabinet?.id)
    if (!cabinet) return container
    const coordinates = document.createElement('div')
    coordinates.append(
      row('Cabinet X', numberInput(inspectedCabinet.coordinate.x, 'Hardware pixel X', value => {
        inspectedCabinet = { id: cabinet.id, coordinate: { x: value, y: inspectedCabinet?.coordinate.y ?? 0 } }
        renderInspector()
      })),
      row('Cabinet Y', numberInput(inspectedCabinet.coordinate.y, 'Hardware pixel Y', value => {
        inspectedCabinet = { id: cabinet.id, coordinate: { x: inspectedCabinet?.coordinate.x ?? 0, y: value } }
        renderInspector()
      })),
    )
    container.append(group('Pixel coordinate', coordinates))
    try {
      const inspection = inspectionFor(cabinet.id, inspectedCabinet.coordinate)
      const path = document.createElement('div')
      path.append(
        row('Input', `${inspection.geometry.inputCoordinate.x}, ${inspection.geometry.inputCoordinate.y}`),
        row('Screen', `${inspection.geometry.screenCoordinate.x}, ${inspection.geometry.screenCoordinate.y}`),
        row('Cabinet', inspection.geometry.cabinet),
        row('Module', `${inspection.geometry.module} · ${inspection.geometry.moduleCoordinate.x}, ${inspection.geometry.moduleCoordinate.y}`),
      )
      if (inspection.mapped) {
        path.append(
          row('Receiver', inspection.mapped.address.hardware.receiver),
          row('Port', inspection.mapped.address.hardware.port),
          row('Processor', inspection.mapped.address.hardware.processor),
          row('dataIndex', format(inspection.mapped.address.dataIndex)),
        )
      } else {
        path.append(row('Hardware', 'Incomplete'))
      }
      container.append(group('Full Pixel Inspector', path))
    } catch (error) {
      const message = document.createElement('p')
      message.className = 'hint error-hint'
      message.textContent = error instanceof Error ? error.message : 'Pixel inspection is unavailable.'
      container.append(message)
    }
    return container
  }

  function renderInspector(): void {
    properties.replaceChildren()
    if (!selection) {
      inspectorTitle.textContent = selectedCabinetIds.length > 0 ? cabinetCountLabel(selectedCabinetIds.length) : 'Hardware'
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Select a Processor, Port or Receiver in the topology tree.'
      properties.append(hint, renderPixelInspector())
      return
    }
    if (selection.type === 'processor') {
      const processor = findProcessor(model(), selection.id)
      if (!processor) return
      inspectorTitle.textContent = 'Processor'
      const ports = model().hardware.ports.filter(port => port.processorId === processor.id)
      const fields = document.createElement('div')
      const load = projectHardwareLoadV2(model()).processors.find(value => value.processorId === processor.id)!
      fields.append(
        row('Name', textInput(processor.name, 'Processor name', value => commit(source => renameProcessorV2(source, processor.id, value), 'Unable to rename Processor.'))),
        row('Identity', processor.id),
        row('Ports used', capacityText(ports.length, processor.portCount)),
        row('Pixel usage', load.capacity === null ? `${format(load.used)} · transport limit unknown` : `${capacityText(load.used, load.capacity)} px`),
        row('Pixel headroom', load.headroom === null ? 'unknown' : `${format(load.headroom)} px`),
        row('Port capacity', numberInput(processor.portCount, 'Processor port capacity', value => commit(source => setProcessorPortCountV2(source, processor.id, value), 'Unable to update Processor.'))),
      )
      if (processor.capacityProfile) {
        const profile = processor.capacityProfile
        const source = `${profile.source.kind} · ${profile.source.reference} · ${profile.source.revision}`
        const sourceRow = row('Capacity source', source)
        sourceRow.title = source
        fields.append(row('Capacity profile', profile.name), row('Signal mode', capacityModeText(profile.mode)),
          sourceRow)
      }
      properties.append(group('Processor', fields), processorCapacityEditor(model(), processor.id, command => commit(command, 'Unable to apply capacity profile.')), renderPixelInspector())
      return
    }
    if (selection.type === 'port') {
      const port = findPort(model(), selection.id)
      if (!port) return
      inspectorTitle.textContent = 'Port'
      const receiverCount = model().hardware.receivers.filter(receiver => receiver.portId === port.id).length
      const fields = document.createElement('div')
      const load = projectHardwareLoadV2(model()).ports.find(value => value.portId === port.id)!
      fields.append(
        row('Identity', port.id),
        row('Processor', port.processorId),
        row('Index', numberInput(port.index, 'Port index', value => commit(source => updatePortV2(source, port.id, { index: value }), 'Unable to update Port.'))),
        row('Receivers used', capacityText(receiverCount, port.receiverCapacity)),
        row('Pixel usage', load.capacity === null ? `${format(load.used)} · transport limit unknown` : `${capacityText(load.used, load.capacity)} px`),
        row('Pixel headroom', load.headroom === null ? 'unknown' : `${format(load.headroom)} px`),
        row('Receiver capacity', numberInput(port.receiverCapacity, 'Port receiver capacity', value => commit(source => updatePortV2(source, port.id, { receiverCapacity: value }), 'Unable to update Port.'))),
      )
      properties.append(group('Port', fields), portCapacityEditor(model(), port.id, command => commit(command, 'Unable to apply Port override.')), renderPixelInspector())
      return
    }
    const receiver = findReceiver(model(), selection.id)
    if (!receiver) return
    inspectorTitle.textContent = 'Receiver'
    const usage = receiverPixelUsage(model(), receiver.id)
    const fields = document.createElement('div')
    fields.append(
      row('Identity', receiver.id),
      row('Port', receiver.portId),
      row('Index', numberInput(receiver.legacyIndex, 'Receiver index', value => commit(source => updateReceiverV2(source, receiver.id, { index: value }), 'Unable to update Receiver.'))),
      row('Pixel usage', usage.capacity === null ? format(usage.used) : capacityText(usage.used, usage.capacity)),
      row('Pixel capacity', numberInput(usage.capacity ?? usage.used, 'Receiver pixel capacity', value => commit(source => updateReceiverV2(source, receiver.id, { pixelCapacity: value }), 'Unable to update Receiver.'))),
    )
    const buttons = document.createElement('div')
    buttons.className = 'inspector-actions'
    buttons.append(
      action('Assign selected', () => mutate(source => assignCabinetsV2(source, receiver.id, orderedSelectedCabinetsV2(source, selectedCabinetIds)), 'Unable to assign Cabinets.'), selectedCabinetIds.length === 0),
      action('Unassign selected', () => mutate(source => unassignCabinetsV2(source, receiver.id, selectedCabinetIds), 'Unable to unassign Cabinets.'), selectedCabinetIds.length === 0),
    )
    properties.append(group('Generic Receiver', fields), buttons, renderSignalChain(receiver.id), renderPixelInspector())
  }

  function focusChainCabinet(cabinetId: string): void {
    requestAnimationFrame(() => {
      const row = Array.from(properties.querySelectorAll<HTMLButtonElement>('[data-signal-cabinet-id]'))
        .find(value => value.dataset['signalCabinetId'] === cabinetId)
      row?.focus()
    })
  }

  function renderSignalChain(receiverId: string): HTMLElement {
    const source = model()
    const ids = receiverCabinetIds(source, receiverId)
    const usage = receiverPixelUsage(source, receiverId)
    const chosen = selectedCabinetIds.length === 1 && ids.includes(selectedCabinetIds[0]!) ? selectedCabinetIds[0]! : null
    const index = chosen === null ? -1 : ids.indexOf(chosen)
    const summary = document.createElement('p')
    summary.className = 'signal-chain-summary'
    summary.textContent = `${ids.length} Cabinets · ${format(usage.used)}${usage.capacity === null ? '' : ` / ${format(usage.capacity)}`} pixels · FIRST → LAST`
    const list = document.createElement('div')
    list.className = 'signal-chain-list'
    list.setAttribute('role', 'list')
    if (ids.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'No Cabinets in this Receiver signal chain.'
      list.append(empty)
    }
    ids.forEach((id, position) => {
      const cabinet = source.design.cabinets.find(value => value.id === id)!
      const grid = source.design.cabinetGrids.find(value => value.id === cabinet.gridId)
      const screen = source.design.screens.find(value => value.id === grid?.screenId)
      const item = document.createElement('div')
      item.setAttribute('role', 'listitem')
      const select = document.createElement('button')
      select.type = 'button'
      select.className = 'signal-chain-item'
      select.dataset['signalCabinetId'] = id
      select.setAttribute('aria-pressed', String(chosen === id))
      const title = document.createElement('strong')
      title.textContent = `${position + 1}. ${cabinet.label || id}`
      const edge = document.createElement('span')
      edge.className = 'signal-chain-edge'
      edge.textContent = [position === 0 ? 'FIRST' : '', position === ids.length - 1 ? 'LAST' : ''].filter(Boolean).join(' · ')
      const detail = document.createElement('small')
      detail.textContent = `${id} · ${screen?.name ?? grid?.screenId ?? 'Screen'} · ${grid?.name ?? cabinet.gridId} (${cabinet.column + 1}, ${cabinet.row + 1}) · ${format(cabinet.pixelWidth * cabinet.pixelHeight)} px`
      select.append(title, edge, detail)
      select.addEventListener('click', () => {
        selectedCabinetIds = [id]
        inspectedCabinet = { id, coordinate: { x: 0, y: 0 } }
        render()
        focusChainCabinet(id)
      })
      item.append(select)
      list.append(item)
    })
    list.addEventListener('keydown', event => {
      if (!event.altKey || event.repeat || event.isComposing ||
          !(event.target instanceof HTMLButtonElement) || !event.target.matches('[data-signal-cabinet-id]')) return
      const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : null
      if (delta === null) return
      event.preventDefault()
      const cabinetId = event.target.dataset['signalCabinetId']!
      selectedCabinetIds = [cabinetId]
      reorderChain(receiverId, cabinetId, delta)
    })
    const actions = document.createElement('div')
    actions.className = 'signal-chain-actions'
    const up = action('Move Up', () => { if (chosen) reorderChain(receiverId, chosen, -1) }, index <= 0)
    up.dataset['signalAction'] = 'move-up'
    const down = action('Move Down', () => { if (chosen) reorderChain(receiverId, chosen, 1) }, index < 0 || index === ids.length - 1)
    down.dataset['signalAction'] = 'move-down'
    const unassign = action('Unassign', () => {
      if (!chosen) return
      mutate(source => unassignCabinetsV2(source, receiverId, [chosen]), 'Unable to unassign Cabinet.', () => {
        selectedCabinetIds = []
        inspectedCabinet = null
      })
    }, chosen === null)
    unassign.dataset['signalAction'] = 'unassign'
    actions.append(up, down, unassign)
    const transfer = document.createElement('div')
    transfer.className = 'signal-chain-transfer'
    const target = document.createElement('select')
    target.setAttribute('aria-label', 'Target Receiver in hardware order')
    target.dataset['signalTarget'] = ''
    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = 'Choose target Receiver'
    target.append(placeholder)
    for (const receiver of receiversInHardwareOrder(source)) {
      if (receiver.id === receiverId) continue
      const port = findPort(source, receiver.portId)!
      const processor = findProcessor(source, receiver.processorId)!
      const load = receiverPixelUsage(source, receiver.id)
      const option = document.createElement('option')
      option.value = receiver.id
      option.textContent = `${processor.name} → Port ${port.index + 1} → ${receiver.id} · ${format(load.used)}${load.capacity === null ? '' : `/${format(load.capacity)}`} px`
      target.append(option)
    }
    const move = action('Move to Receiver…', () => {
      if (!chosen || !target.value) return
      const targetReceiverId = target.value
      mutate(source => moveCabinetToReceiverV2(source, chosen, targetReceiverId), 'Unable to move Cabinet.', () => {
        selection = { type: 'receiver', id: targetReceiverId }
        selectedCabinetIds = [chosen]
      })
      focusChainCabinet(chosen)
    }, chosen === null || target.options.length < 2)
    move.dataset['signalAction'] = 'transfer'
    target.addEventListener('change', () => { move.disabled = chosen === null || !target.value })
    move.disabled = true
    const hint = document.createElement('p')
    hint.className = 'signal-chain-hint'
    hint.textContent = 'Cabinet will be added to end of target chain.'
    transfer.append(target, move, hint)
    return group('Signal Chain', summary, list, actions, transfer)
  }

  function reorderChain(receiverId: string, cabinetId: string, delta: -1 | 1): void {
    const ids = [...receiverCabinetIds(model(), receiverId)]
    const index = ids.indexOf(cabinetId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    mutate(source => reorderSignalRouteV2(source, receiverId, ids), 'Unable to reorder Signal Chain.')
    focusChainCabinet(cabinetId)
  }

  function renderStatus(): void {
    const topology = model().hardware
    selectionChip.textContent = selection ? `${selection.id} selected` : `${cabinetCountLabel(selectedCabinetIds.length)} selected`
    addPortButton.disabled = selectedProcessorId() === null
    addReceiverButton.disabled = selectedPortId() === null
    deleteButton.disabled = selection === null
    orderUpButton.disabled = selection?.type !== 'processor' && selection?.type !== 'receiver'
    orderDownButton.disabled = orderUpButton.disabled
    const receiverSelected = selection?.type === 'receiver'
    assignButton.disabled = !receiverSelected || selectedCabinetIds.length === 0
    unassignButton.disabled = assignButton.disabled
    allocateButton.disabled = topology.receivers.length === 0 || unassignedCabinetIds(model()).length === 0
    document.querySelectorAll<HTMLButtonElement>('[data-hardware-overlay]').forEach(button => {
      const key = button.dataset['hardwareOverlay'] as keyof HardwareOverlays
      button.setAttribute('aria-pressed', String(overlays[key]))
    })
    const unassigned = unassignedCabinetIds(model()).length
    const issues = validationReport().diagnostics.filter(issue => issue.stage === 'input' || issue.stage === 'hardware')
    healthStatus.textContent = issues.some(issue => issue.severity === 'error' && issue.code !== 'HARDWARE_UNPATCHED')
      ? 'Hardware issues'
      : unassigned === 0 && model().design.cabinets.length > 0
        ? `Assignments complete${issues.some(issue => issue.severity === 'warning') ?
          issues.some(issue => issue.code === 'HARDWARE_CAPACITY_UNKNOWN' || issue.code === 'HARDWARE_TRANSPORT_CAPACITY_UNKNOWN') ? ' · capacity limits unknown' : ' · warnings present' : ''}`
        : `${unassigned} Cabinets unassigned`
  }

  function render(): void {
    if (selection?.type === 'processor' && !findProcessor(model(), selection.id)) selection = null
    if (selection?.type === 'port' && !findPort(model(), selection.id)) selection = null
    if (selection?.type === 'receiver' && !findReceiver(model(), selection.id)) selection = null
    const known = new Set<string>(model().design.cabinets.map(cabinet => cabinet.id))
    selectedCabinetIds = selectedCabinetIds.filter(id => known.has(id))
    if (inspectedCabinet && !known.has(inspectedCabinet.id)) inspectedCabinet = null
    renderTree()
    renderDiagnostics()
    renderInspector()
    renderStatus()
    draw()
  }

  function addProcessorAction(): void {
    mutate(source => addProcessorV2(source), 'Unable to add Processor.', () => {
      const processor = options.getProjectV2().hardware.processors.at(-1)
      selection = processor ? { type: 'processor', id: processor.id } : null
    })
  }

  function addPortAction(): void {
    const processorId = selectedProcessorId()
    if (!processorId) return
    mutate(source => addPortV2(source, processorId), 'Unable to add Port.', () => {
      const port = options.getProjectV2().hardware.ports.at(-1)
      selection = port ? { type: 'port', id: port.id } : selection
    })
  }

  function addReceiverAction(): void {
    const portId = selectedPortId()
    if (!portId) return
    mutate(source => addReceiverV2(source, portId), 'Unable to add Receiver.', () => {
      const receiver = options.getProjectV2().hardware.receivers.at(-1)
      selection = receiver ? { type: 'receiver', id: receiver.id } : selection
    })
  }

  function deleteAction(): void {
    if (!selection) return
    const current = selection
    mutate(source => current.type === 'processor'
        ? deleteProcessorV2(source, current.id)
        : current.type === 'port'
          ? deletePortV2(source, current.id)
          : deleteReceiverV2(source, current.id),
      'Unable to delete Hardware entity.', () => {
      selection = null
    })
  }

  function orderAction(delta: -1 | 1): void {
    if (!selection) return
    if (selection.type === 'processor') mutate(source => moveProcessorV2(source, selection!.id, delta), 'Unable to reorder Processor.')
    if (selection.type === 'receiver') mutate(source => moveReceiverV2(source, selection!.id, delta), 'Unable to reorder Receiver.')
  }

  function assignAction(unassign: boolean): void {
    if (selection?.type !== 'receiver') return
    const receiverId = selection.id
    mutate(
      source => unassign
        ? unassignCabinetsV2(source, receiverId, selectedCabinetIds)
        : assignCabinetsV2(source, receiverId, orderedSelectedCabinetsV2(source, selectedCabinetIds)),
      unassign ? 'Unable to unassign Cabinets.' : 'Unable to assign Cabinets.',
    )
  }

  function renderPreview(proposal: ProjectHardwarePlan): void {
    previewBody.replaceChildren()
    const summary = document.createElement('p')
    summary.textContent = `${format(proposal.load.assignedPixels)} / ${format(proposal.load.totalPixels)} pixels assigned · ${proposal.unpatched.length} Cabinets unassigned`
    previewBody.append(summary)
    const before = new Map(model().hardware.receivers.map(receiver => [receiver.id, receiverCabinetIds(model(), receiver.id).length]))
    for (const receiver of proposal.topology.receivers) {
      const added = receiver.cabinets.length - (before.get(receiver.id) ?? 0)
      const item = document.createElement('div')
      item.className = 'allocation-preview-row'
      const name = document.createElement('strong')
      name.textContent = receiver.id
      const detail = document.createElement('span')
      const load = proposal.load.receivers.find(value => value.receiverId === receiver.id)!
      detail.textContent = `${receiver.cabinets.length} Cabinets${added > 0 ? ` · +${added}` : ''} · ${format(load.used)} / ${load.capacity === null ? 'unknown' : format(load.capacity)} pixels · headroom ${load.headroom === null ? 'unknown' : format(load.headroom)}`
      item.append(name, detail)
      previewBody.append(item)
    }
    if (proposal.diagnostics.length > 0) {
      const heading = document.createElement('h3')
      heading.textContent = 'Remaining capacity'
      previewBody.append(heading)
      for (const diagnostic of proposal.diagnostics) {
        const line = document.createElement('p')
        const id = diagnostic.level === 'processor' ? diagnostic.processor : diagnostic.level === 'port' ? diagnostic.port : diagnostic.receiver
        line.textContent = `${id}: ${format(diagnostic.used)} / ${format(diagnostic.capacity)} ${diagnostic.unit}`
        previewBody.append(line)
      }
    }
    for (const port of proposal.load.ports) {
      const line = document.createElement('p')
      line.textContent = `Port ${port.portId}: ${format(port.used)} pixels · ${port.receiversUsed} / ${port.receiverCapacity} Receiver slots · ` +
        (port.capacity === null ? 'transport limit unknown' : `limit ${format(port.capacity)} px · headroom ${format(port.headroom!)} px`)
      previewBody.append(line)
    }
    for (const processor of proposal.load.processors) {
      const line = document.createElement('p')
      line.textContent = `Processor ${processor.processorId}: ${format(processor.used)} pixels · ${processor.portsUsed} / ${processor.portCapacity} Port slots · ` +
        (processor.capacity === null ? 'transport limit unknown' : `limit ${format(processor.capacity)} px · headroom ${format(processor.headroom!)} px`)
      previewBody.append(line)
    }
    const report = validationReport(proposal.project)
    for (const issue of report.diagnostics.filter(issue => issue.stage === 'input' || issue.stage === 'hardware')) {
      const line = document.createElement('p')
      line.className = issue.severity === 'error' ? 'status-invalid' : 'status-incomplete'
      line.textContent = issue.message
      previewBody.append(line)
    }
    applyPreviewButton.disabled = proposal.project === model() || report.diagnostics.some(issue => issue.severity === 'error' &&
      (issue.stage === 'input' || (issue.stage === 'hardware' && issue.code !== 'HARDWARE_UNPATCHED')))
  }

  function previewAllocation(): void {
    options.clearError()
    try {
      const stamp = options.getDocumentStamp()
      const proposal = previewHardwareAllocationV2(options.getProjectV2())
      allocationPreview = { ...stamp, proposal }
      renderPreview(proposal)
      previewDialog.showModal()
    } catch (error) {
      options.showError(error, 'Unable to preview Hardware allocation.')
    }
  }

  addProcessorButton.addEventListener('click', addProcessorAction)
  addPortButton.addEventListener('click', addPortAction)
  addReceiverButton.addEventListener('click', addReceiverAction)
  deleteButton.addEventListener('click', deleteAction)
  orderUpButton.addEventListener('click', () => orderAction(-1))
  orderDownButton.addEventListener('click', () => orderAction(1))
  assignButton.addEventListener('click', () => assignAction(false))
  unassignButton.addEventListener('click', () => assignAction(true))
  allocateButton.addEventListener('click', previewAllocation)
  cancelPreviewButton.addEventListener('click', () => {
    allocationPreview = null
    previewDialog.close()
  })
  applyPreviewButton.addEventListener('click', () => {
    if (!allocationPreview) return
    const { proposal, documentId, revision } = allocationPreview
    allocationPreview = null
    previewDialog.close()
    options.clearError()
    const current = options.getDocumentStamp()
    try {
      requireCurrentHardwarePreview({ documentId, revision }, current)
    } catch (error) {
      options.showError(error, 'Unable to apply Hardware allocation.')
      return
    }
    mutate(source => applyHardwareAllocationV2(source, proposal), 'Unable to apply Hardware allocation.')
  })
  fitButton.addEventListener('click', fit)
  actualButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    const center = toProject(camera, { x: rect.width / 2, y: rect.height / 2 })
    camera = { zoom: 1, offsetX: rect.width / 2 - center.x, offsetY: rect.height / 2 - center.y }
    draw()
  })
  zoomInButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    camera = zoomAt(camera, { x: rect.width / 2, y: rect.height / 2 }, 1.2)
    draw()
  })
  zoomOutButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    camera = zoomAt(camera, { x: rect.width / 2, y: rect.height / 2 }, 1 / 1.2)
    draw()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-hardware-overlay]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset['hardwareOverlay'] as keyof HardwareOverlays
      overlays = { ...overlays, [key]: !overlays[key] }
      renderStatus()
      draw()
    })
  })

  function viewportPoint(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  canvas.addEventListener('pointerdown', event => {
    const point = viewportPoint(event)
    if (event.button === 1 || spaceDown) {
      pan = point
      canvas.classList.add('dragging')
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }
    if (event.button !== 0) return
    const hit = hitHardwareCabinet(project(), toProject(camera, point))
    if (!hit) {
      selectedCabinetIds = []
      inspectedCabinet = null
      render()
      return
    }
    const additive = event.ctrlKey || event.metaKey || event.shiftKey
    selectedCabinetIds = additive
      ? selectedCabinetIds.includes(hit.cabinet)
        ? selectedCabinetIds.filter(id => id !== hit.cabinet)
        : [...selectedCabinetIds, hit.cabinet]
      : [hit.cabinet]
    inspectedCabinet = { id: hit.cabinet, coordinate: hit.local }
    render()
  })
  canvas.addEventListener('pointermove', event => {
    const point = viewportPoint(event)
    const source = toProject(camera, point)
    cursorStatus.textContent = `Layout X ${Math.round(source.x)} · Y ${Math.round(source.y)}`
    if (!pan) {
      canvas.style.cursor = hitHardwareCabinet(project(), source) ? 'crosshair' : 'default'
      return
    }
    camera = { ...camera, offsetX: camera.offsetX + point.x - pan.x, offsetY: camera.offsetY + point.y - pan.y }
    pan = point
    draw()
  })
  function finishPointer(event: PointerEvent): void {
    pan = null
    canvas.classList.remove('dragging')
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  canvas.addEventListener('pointerup', finishPointer)
  canvas.addEventListener('pointercancel', finishPointer)
  canvas.addEventListener('wheel', event => {
    event.preventDefault()
    if (event.ctrlKey) camera = zoomAt(camera, { x: event.offsetX, y: event.offsetY }, Math.exp(-event.deltaY * .002))
    else camera = { ...camera, offsetX: camera.offsetX - event.deltaX, offsetY: camera.offsetY - event.deltaY }
    draw()
  }, { passive: false })
  window.addEventListener('keydown', event => {
    if (!active || event.target instanceof HTMLInputElement) return
    if (event.code === 'Space') {
      spaceDown = true
      event.preventDefault()
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      deleteAction()
      event.preventDefault()
    }
  })
  window.addEventListener('keyup', event => {
    if (event.code === 'Space') spaceDown = false
  })
  window.addEventListener('resize', () => { if (active) draw() })

  function dump(): HardwareDump {
    const source = model().hardware
    return {
      processors: source.processors.map(processor => ({ ...processor })),
      ports: source.ports.map(port => ({ id: port.id, processor: port.processorId, index: port.index, receiverCapacity: port.receiverCapacity })),
      receivers: source.receivers.map(receiver => ({
        id: receiver.id,
        processor: receiver.processorId,
        port: receiver.portId,
        index: receiver.legacyIndex,
        pixelCapacity: receiver.pixelCapacity ?? null,
        cabinets: [...receiverCabinetIds(model(), receiver.id)],
      })),
      processorOrder: [...source.processorOrder],
      receiverOrder: source.receiverOrder.map(order => ({ port: order.portId, receivers: [...order.receiverIds] })),
      unassigned: [...unassignedCabinetIds(model())],
    }
  }

  const hook: HardwareTestHook = {
    dump,
    camera: () => ({ ...camera }),
    cabinetCenterPx: cabinetId => {
      const center = hardwareCabinetCenter(project(), cabinetId)
      return center ? { x: center.x * camera.zoom + camera.offsetX, y: center.y * camera.zoom + camera.offsetY } : null
    },
    inspectCabinet: (cabinetId, x, y) => inspectionDump(inspectionFor(cabinetId, { x, y })),
  }
  ;(window as Window & { __ledmapHardware?: HardwareTestHook }).__ledmapHardware = hook

  return {
    activate: () => {
      active = true
      render()
      requestAnimationFrame(fit)
    },
    deactivate: () => { active = false },
    projectChanged: render,
  }
}
