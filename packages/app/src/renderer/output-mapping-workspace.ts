import {
  createMediaOutputPixelResolver, inspectMediaOutputMapping, pointInPolygon, resolveMediaOutputPixel,
  resolveScreenPixelToOutput,
  type LedMapProjectV2, type MediaOutputMappingInspection,
} from '@ledmap/core'
import {
  addMediaOutputV2, addOutputMappingV2, addOutputMaskPointV2, deleteMediaOutputV2, deleteOutputMappingV2,
  moveOutputMaskPointV2, removeOutputMaskPointV2, reorderOutputMappingV2, setOutputMappingMaskV2,
  splitOutputMappingIntoRowsV2, updateMediaOutputV2, updateOutputMappingV2,
} from './v2-output-commands.js'
import { outputMappingPreviewRaster } from './output-mapping-preview.js'
import {
  containsPoint, fitCamera, hitResizeHandle, snapMove, snapResize, worldFromScreen,
  zoomAt, type EditorRect, type ResizeHandle, type ViewCamera,
} from './rect-editor.js'

interface Options {
  readonly getProject: () => LedMapProjectV2
  readonly runCommand: (command: (project: LedMapProjectV2) => LedMapProjectV2, groupId?: number) => void
  readonly beginHistoryGroup: () => number
  readonly endHistoryGroup: (groupId: number) => void
  readonly showError: (error: unknown, fallback: string) => void
  readonly clearError: () => void
}

export interface OutputMappingWorkspace {
  activate(): void
  deactivate(): void
  finishGesture(): void
  projectChanged(): void
}

type SliceView = 'input' | 'output'

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id)
  if (!result) throw new Error(`Missing element: ${id}`)
  return result as T
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const result = document.createElement('label')
  result.className = 'output-field'
  const caption = document.createElement('span')
  caption.textContent = label
  result.append(caption, control)
  return result
}

function numberField(label: string, value: number | undefined, commit: (value: number) => void): HTMLLabelElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.step = '1'
  input.value = value === undefined ? '' : String(value)
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => {
    if (input.value.trim() !== '') commit(Number(input.value))
  })
  return field(label, input)
}

function textField(label: string, value: string, commit: (value: string) => void): HTMLLabelElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => commit(input.value))
  return field(label, input)
}

function checkField(label: string, value: boolean, commit: (value: boolean) => void): HTMLLabelElement {
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = value
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => commit(input.checked))
  return field(label, input)
}

function selectField(
  label: string, value: string, choices: readonly { readonly id: string; readonly name: string }[],
  commit: (value: string) => void,
): HTMLLabelElement {
  const select = document.createElement('select')
  select.setAttribute('aria-label', label)
  for (const choice of choices) {
    const option = document.createElement('option')
    option.value = choice.id
    option.textContent = choice.name
    select.append(option)
  }
  select.value = value
  select.addEventListener('change', () => commit(select.value))
  return field(label, select)
}

function rotationField(label: string, value: number, commit: (value: 0 | 90 | 180 | 270) => void): HTMLLabelElement {
  return selectField(label, String(value),
    [{ id: '0', name: '0°' }, { id: '90', name: '90°' }, { id: '180', name: '180°' }, { id: '270', name: '270°' }],
    raw => commit(Number(raw) as 0 | 90 | 180 | 270))
}

function item(label: string, selected: boolean, click: () => void, detail?: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'output-tree-item'
  button.setAttribute('aria-pressed', String(selected))
  const strong = document.createElement('strong')
  strong.textContent = label
  button.append(strong)
  if (detail) {
    const small = document.createElement('small')
    small.textContent = detail
    button.append(small)
  }
  button.addEventListener('click', click)
  return button
}

function action(label: string, click: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  button.addEventListener('click', click)
  return button
}

function diagnosticLabel(code: string): string {
  const labels: Record<string, string> = {
    OUTPUT_MAPPING_PARTIALLY_CLIPPED: 'Partially clipped by output bounds',
    OUTPUT_MAPPING_OUTSIDE: 'Entirely outside output bounds',
    OUTPUT_MAPPING_OVERLAP: 'Visible mappings overlap; strict overlap blocks conflicted pixels',
  }
  return labels[code] ?? code
}

type Gesture =
  | { readonly kind: 'pan'; readonly startX: number; readonly startY: number; readonly camera: ViewCamera }
  | { readonly kind: 'move'; readonly id: string; readonly group: number; readonly startWorldX: number; readonly startWorldY: number; readonly origin: EditorRect }
  | { readonly kind: 'resize'; readonly id: string; readonly group: number; readonly handle: ResizeHandle; readonly startWorldX: number; readonly startWorldY: number; readonly origin: EditorRect }
  | { readonly kind: 'mask-point'; readonly id: string; readonly group: number; readonly index: number }
  | { readonly kind: 'mask-move'; readonly id: string; readonly group: number; readonly startWorldX: number; readonly startWorldY: number; readonly origin: readonly { readonly x: number; readonly y: number }[] }

export function createOutputMappingWorkspace(options: Options): OutputMappingWorkspace {
  const tree = element<HTMLDivElement>('output-mapping-tree')
  const diagnostics = element<HTMLDivElement>('output-mapping-diagnostics')
  const properties = element<HTMLDivElement>('output-mapping-properties')
  const inspectorTitle = element<HTMLHeadingElement>('output-mapping-inspector-title')
  const title = element<HTMLHeadingElement>('output-mapping-title')
  const status = element<HTMLSpanElement>('output-mapping-preview-status')
  const canvas = element<HTMLCanvasElement>('output-mapping-canvas')
  const viewport = element<HTMLDivElement>('output-mapping-viewport')
  const empty = element<HTMLDivElement>('output-mapping-empty')
  const addOutputButton = element<HTMLButtonElement>('output-add-media')
  const addMappingButton = element<HTMLButtonElement>('output-add-mapping')
  const deleteButton = element<HTMLButtonElement>('output-delete-selection')
  const viewInputButton = element<HTMLButtonElement>('output-view-input')
  const viewOutputButton = element<HTMLButtonElement>('output-view-output')
  const splitButton = element<HTMLButtonElement>('output-split-rows')
  const orderUpButton = element<HTMLButtonElement>('output-order-up')
  const orderDownButton = element<HTMLButtonElement>('output-order-down')
  const fitButton = element<HTMLButtonElement>('output-fit')
  const actualButton = element<HTMLButtonElement>('output-actual-size')
  const zoomOutButton = element<HTMLButtonElement>('output-zoom-out')
  const zoomInButton = element<HTMLButtonElement>('output-zoom-in')
  let active = false
  let selectedOutputId: string | null = null
  let selectedMappingId: string | null = null
  let view: SliceView = 'output'
  const cameras = new Map<string, ViewCamera>()
  let gesture: Gesture | null = null
  let spaceDown = false

  function project(): LedMapProjectV2 { return options.getProject() }

  function run(command: (value: LedMapProjectV2) => LedMapProjectV2, groupId?: number): boolean {
    try {
      options.runCommand(command, groupId)
      options.clearError()
      render()
      return true
    } catch (error) {
      options.showError(error, 'Unable to edit Output Mapping.')
      render()
      return false
    }
  }

  function output() { return project().content.mediaOutputs.find(value => value.id === selectedOutputId) }

  function selectedMapping() {
    return project().content.outputMappings.find(value => value.id === selectedMappingId) ?? null
  }

  function selectedScreen() {
    const mapping = selectedMapping()
    if (!mapping) return null
    return project().design.screens.find(value => value.id === mapping.screenId) ?? null
  }

  function worldBounds(): EditorRect {
    if (view === 'output') {
      const media = output()
      return { x: 0, y: 0, width: media?.resolution.width ?? 1, height: media?.resolution.height ?? 1 }
    }
    const screen = selectedScreen()
    return { x: 0, y: 0, width: screen?.resolution.width ?? 1, height: screen?.resolution.height ?? 1 }
  }

  function viewRects(): { readonly id: string; readonly rect: EditorRect }[] {
    const value = project()
    if (view === 'output') {
      const media = output()
      if (!media) return []
      return value.content.outputMappings
        .filter(mapping => mapping.mediaOutputId === media.id)
        .map(mapping => ({ id: mapping.id, rect: { ...mapping.outputRect } }))
    }
    const screen = selectedScreen()
    if (!screen) return []
    return value.content.outputMappings
      .filter(mapping => mapping.screenId === screen.id)
      .map(mapping => ({ id: mapping.id, rect: { ...mapping.screenRect } }))
  }

  function cameraKey(): string {
    if (view === 'output') return `output:${selectedOutputId ?? 'none'}`
    return `input:${selectedMappingId ?? 'none'}`
  }

  function camera(): ViewCamera {
    const key = cameraKey()
    const bounds = worldBounds()
    const existing = cameras.get(key)
    if (existing) return existing
    const rect = canvas.getBoundingClientRect()
    const fitted = fitCamera(Math.max(1, rect.width || viewport.clientWidth), Math.max(1, rect.height || viewport.clientHeight),
      bounds.width, bounds.height)
    cameras.set(key, fitted)
    return fitted
  }

  function setCamera(next: ViewCamera): void {
    cameras.set(cameraKey(), next)
  }

  function normalize(): void {
    const value = project()
    if (!value.content.mediaOutputs.some(item => item.id === selectedOutputId)) {
      selectedOutputId = value.content.mediaOutputs[0]?.id ?? null
      selectedMappingId = null
    }
    if (!value.content.outputMappings.some(mapping => mapping.id === selectedMappingId)) selectedMappingId = null
    if (selectedMappingId) {
      const mapping = value.content.outputMappings.find(item => item.id === selectedMappingId)!
      if (view === 'output' && mapping.mediaOutputId !== selectedOutputId) selectedOutputId = mapping.mediaOutputId
    }
  }

  function renderTree(inspection: MediaOutputMappingInspection | null): void {
    tree.replaceChildren()
    for (const media of project().content.mediaOutputs) {
      tree.append(item(media.name, media.id === selectedOutputId && selectedMappingId === null, () => {
        finishGesture()
        selectedOutputId = media.id
        selectedMappingId = null
        render()
      }, `${media.resolution.width} × ${media.resolution.height} px · ${media.mappingOrder.length}`))
      if (media.id !== selectedOutputId) continue
      for (const mappingId of media.mappingOrder) {
        const mapping = project().content.outputMappings.find(value => value.id === mappingId)
        if (!mapping) continue
        const screen = project().design.screens.find(value => value.id === mapping.screenId)
        const placement = inspection?.placements.find(value => value.mappingId === mapping.id)
        tree.append(item(`${mapping.name}`, mapping.id === selectedMappingId, () => {
          selectedMappingId = mapping.id
          render()
        }, placement?.coverage === 'disabled' ? 'DISABLED' :
          `${screen?.name ?? mapping.screenId} · ${mapping.outputRect.x},${mapping.outputRect.y} · ${placement?.coverage ?? ''}${mapping.mask?.enabled ? ' · mask' : ''}`))
      }
    }
  }

  function renderDiagnostics(inspection: MediaOutputMappingInspection | null): void {
    diagnostics.replaceChildren()
    if (!inspection) return
    if (inspection.diagnostics.length === 0) {
      const message = document.createElement('p')
      message.textContent = 'No Output Mapping diagnostics.'
      diagnostics.append(message)
    }
    for (const diagnostic of inspection.diagnostics) {
      const message = document.createElement('p')
      message.className = diagnostic.severity === 'error' ? 'output-diagnostic-error' : ''
      message.textContent = `${diagnostic.mappingIds.join(' + ')}: ${diagnosticLabel(diagnostic.code)}`
      diagnostics.append(message)
    }
  }

  function absoluteInputHints(mappingId: string): string | null {
    const value = project()
    const mapping = value.content.outputMappings.find(item => item.id === mappingId)
    if (!mapping) return null
    const regions = value.content.mappingRegions.filter(region => region.screenId === mapping.screenId)
    if (regions.length === 0) return `Screen ${mapping.screenRect.x},${mapping.screenRect.y} (no MappingRegion)`
    return regions.map(region => `Input ${region.position.x + mapping.screenRect.x},${region.position.y + mapping.screenRect.y} via ${region.id}`).join(' · ')
  }

  function renderInspector(): void {
    properties.replaceChildren()
    const value = project()
    const mapping = selectedMapping()
    const media = output()
    if (!media) {
      inspectorTitle.textContent = 'Output Mapping'
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Add a Media Output to begin.'
      properties.append(hint)
      return
    }
    if (!mapping) {
      inspectorTitle.textContent = media.name
      properties.append(textField('Media Output name', media.name,
        name => { run(project => updateMediaOutputV2(project, media.id, { name })) }),
      numberField('Media Output width', media.resolution.width,
        width => { run(project => updateMediaOutputV2(project, media.id, { width })) }),
      numberField('Media Output height', media.resolution.height,
        height => { run(project => updateMediaOutputV2(project, media.id, { height })) }))
      return
    }
    const screen = value.design.screens.find(item => item.id === mapping.screenId)
    inspectorTitle.textContent = mapping.name
    const order = media.mappingOrder
    const orderIndex = order.findIndex(item => item === mapping.id)
    properties.append(
      textField('Slice name', mapping.name, name => { run(project => updateOutputMappingV2(project, mapping.id, { name })) }),
      checkField('Enabled', mapping.enabled, enabled => { run(project => updateOutputMappingV2(project, mapping.id, { enabled })) }),
      selectField('Mapped Screen', mapping.screenId, value.design.screens.map(item => ({ id: item.id, name: item.name })),
        screenId => { run(project => updateOutputMappingV2(project, mapping.id, { screenId })) }),
      selectField('Media Output', mapping.mediaOutputId, value.content.mediaOutputs.map(item => ({ id: item.id, name: item.name })),
        mediaOutputId => {
          if (run(project => updateOutputMappingV2(project, mapping.id, { mediaOutputId }))) {
            selectedOutputId = mediaOutputId
            render()
          }
        }),
      numberField('Input rect X', mapping.screenRect.x,
        x => { run(project => updateOutputMappingV2(project, mapping.id, { screenRect: { ...mapping.screenRect, x } })) }),
      numberField('Input rect Y', mapping.screenRect.y,
        y => { run(project => updateOutputMappingV2(project, mapping.id, { screenRect: { ...mapping.screenRect, y } })) }),
      numberField('Input rect W', mapping.screenRect.width,
        width => { run(project => updateOutputMappingV2(project, mapping.id, { screenRect: { ...mapping.screenRect, width } })) }),
      numberField('Input rect H', mapping.screenRect.height,
        height => { run(project => updateOutputMappingV2(project, mapping.id, { screenRect: { ...mapping.screenRect, height } })) }),
      numberField('Output rect X', mapping.outputRect.x,
        x => { run(project => updateOutputMappingV2(project, mapping.id, { position: { x, y: mapping.outputRect.y } })) }),
      numberField('Output rect Y', mapping.outputRect.y,
        y => { run(project => updateOutputMappingV2(project, mapping.id, { position: { x: mapping.outputRect.x, y } })) }),
      numberField('Output rect W', mapping.outputRect.width,
        width => { run(project => updateOutputMappingV2(project, mapping.id, { outputRect: { ...mapping.outputRect, width } })) }),
      numberField('Output rect H', mapping.outputRect.height,
        height => { run(project => updateOutputMappingV2(project, mapping.id, { outputRect: { ...mapping.outputRect, height } })) }),
      rotationField('Input rotation', mapping.inputRotation,
        inputRotation => { run(project => updateOutputMappingV2(project, mapping.id, { inputRotation })) }),
      rotationField('Output rotation', mapping.outputRotation,
        outputRotation => { run(project => updateOutputMappingV2(project, mapping.id, { outputRotation })) }),
      checkField('Flip X', mapping.flipX, flipX => { run(project => updateOutputMappingV2(project, mapping.id, { flipX })) }),
      checkField('Flip Y', mapping.flipY, flipY => { run(project => updateOutputMappingV2(project, mapping.id, { flipY })) }),
    )
    const absolute = absoluteInputHints(mapping.id)
    if (absolute) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = absolute
      properties.append(hint)
    }
    if (screen) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = `Screen ${screen.name} ${screen.resolution.width}×${screen.resolution.height} · order ${orderIndex + 1}/${order.length}`
      properties.append(hint)
    }
    const row = document.createElement('div')
    row.className = 'output-field-row'
    row.append(
      action('Order ↑', () => { run(project => reorderOutputMappingV2(project, media.id, mapping.id, orderIndex - 1)) }, orderIndex <= 0),
      action('Order ↓', () => { run(project => reorderOutputMappingV2(project, media.id, mapping.id, orderIndex + 1)) }, orderIndex < 0 || orderIndex >= order.length - 1),
    )
    properties.append(row)
    const splitCount = document.createElement('input')
    splitCount.type = 'number'
    splitCount.min = '2'
    splitCount.max = '64'
    splitCount.value = '3'
    splitCount.setAttribute('aria-label', 'Split rows count')
    const splitRow = document.createElement('div')
    splitRow.className = 'output-field-row'
    splitRow.append(field('Split rows', splitCount),
      action('Split', () => { run(project => splitOutputMappingIntoRowsV2(project, mapping.id, Number(splitCount.value))) }))
    properties.append(splitRow)
    if (mapping.mask) {
      properties.append(checkField('Mask enabled', mapping.mask.enabled,
        enabled => { run(project => setOutputMappingMaskV2(project, mapping.id, { enabled, points: mapping.mask!.points.map(point => ({ ...point })) })) }))
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = `Mask: ${mapping.mask.points.length} points · Input view: drag points, drag polygon, double-click adds, right-click removes.`
      properties.append(hint)
      properties.append(action('Clear mask', () => { run(project => setOutputMappingMaskV2(project, mapping.id, null)) }))
    } else {
      properties.append(action('Add polygon mask', () => {
        const w = mapping.screenRect.width
        const h = mapping.screenRect.height
        const x0 = mapping.screenRect.x
        const y0 = mapping.screenRect.y
        run(project => setOutputMappingMaskV2(project, mapping.id, { enabled: true, points: [
          { x: x0 + w * 0.15, y: y0 + h * 0.15 }, { x: x0 + w * 0.85, y: y0 + h * 0.15 }, { x: x0 + w * 0.5, y: y0 + h * 0.85 },
        ] }))
      }))
    }
    const probeTitle = document.createElement('p')
    probeTitle.className = 'hint'
    probeTitle.textContent = 'Pixel probe · Output → Screen → slice'
    properties.append(probeTitle)
    const probeX = document.createElement('input')
    probeX.type = 'number'
    probeX.step = '1'
    probeX.value = String(media.resolution.width > 0 ? 0 : 0)
    probeX.setAttribute('aria-label', 'Probe output X')
    const probeY = document.createElement('input')
    probeY.type = 'number'
    probeY.step = '1'
    probeY.value = '0'
    probeY.setAttribute('aria-label', 'Probe output Y')
    const probeResult = document.createElement('p')
    probeResult.className = 'hint'
    probeResult.setAttribute('aria-label', 'Probe result')
    const updateProbe = (): void => {
      const x = Number(probeX.value)
      const y = Number(probeY.value)
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        probeResult.textContent = 'Enter integer output pixels.'
        return
      }
      const hit = resolveMediaOutputPixel(project(), media.id, x, y)
      if (hit.status === 'resolved') {
        probeResult.textContent = `Out ${x},${y} → slice ${hit.mappingId} · screen ${hit.screenId} ${hit.screenX},${hit.screenY}`
      } else if (hit.status === 'blocked') {
        probeResult.textContent = `Out ${x},${y} → blocked (${hit.code})`
      } else {
        probeResult.textContent = `Out ${x},${y} → empty`
      }
    }
    probeX.addEventListener('change', updateProbe)
    probeY.addEventListener('change', updateProbe)
    properties.append(field('Probe out X', probeX), field('Probe out Y', probeY), probeResult)
    const reverseResult = document.createElement('p')
    reverseResult.className = 'hint'
    reverseResult.setAttribute('aria-label', 'Reverse probe result')
    reverseResult.textContent = `Screen ${mapping.screenRect.x},${mapping.screenRect.y} → out ${
      JSON.stringify(resolveScreenPixelToOutput(project(), mapping.id, mapping.screenRect.x, mapping.screenRect.y) ?? null)
    }`
    properties.append(reverseResult)
  }

  function draw(inspection: MediaOutputMappingInspection | null): void {
    const width = Math.max(1, viewport.clientWidth)
    const height = Math.max(1, viewport.clientHeight)
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const bounds = worldBounds()
    const cam = camera()
    const left = cam.x
    const top = cam.y
    const worldWidth = bounds.width * cam.scale
    const worldHeight = bounds.height * cam.scale
    ctx.fillStyle = view === 'output' ? '#0c141e' : '#101820'
    ctx.fillRect(left, top, worldWidth, worldHeight)
    if (view === 'output' && inspection) {
      const raster = outputMappingPreviewRaster(project(), inspection.mediaOutputId)
      status.textContent = `${view.toUpperCase()} · ` + (raster.status === 'blocked'
        ? 'Geometry only · pixel preview blocked by diagnostics'
        : raster.exact ? 'Synthetic pixel-exact preview' : 'Synthetic sampled preview · not real media')
      if (raster.pixels) {
        const bitmap = document.createElement('canvas')
        bitmap.width = raster.width
        bitmap.height = raster.height
        const bitmapContext = bitmap.getContext('2d')
        if (bitmapContext) {
          const image = bitmapContext.createImageData(raster.width, raster.height)
          image.data.set(raster.pixels)
          bitmapContext.putImageData(image, 0, 0)
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(bitmap, left, top, worldWidth, worldHeight)
        }
      }
    } else {
      const screen = selectedScreen()
      status.textContent = screen ? `INPUT · ${screen.name} ${screen.resolution.width}×${screen.resolution.height}` : 'INPUT · select a slice'
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, worldWidth, worldHeight)
    ctx.clip()
    for (const entry of viewRects()) drawSlice(ctx, entry.id, entry.rect, cam)
    const mapping = selectedMapping()
    if (mapping && view === 'input' && mapping.mask) drawMask(ctx, mapping.mask.points, cam, mapping.mask.enabled)
    ctx.restore()
    ctx.strokeStyle = '#80a0b8'
    ctx.lineWidth = 2
    ctx.strokeRect(left, top, worldWidth, worldHeight)
    viewInputButton.setAttribute('aria-pressed', String(view === 'input'))
    viewOutputButton.setAttribute('aria-pressed', String(view === 'output'))
  }

  function drawSlice(ctx: CanvasRenderingContext2D, id: string, rect: EditorRect, cam: ViewCamera): void {
    const mapping = project().content.outputMappings.find(value => value.id === id)
    const x = cam.x + rect.x * cam.scale
    const y = cam.y + rect.y * cam.scale
    const width = rect.width * cam.scale
    const height = rect.height * cam.scale
    const selected = id === selectedMappingId
    ctx.strokeStyle = !mapping?.enabled ? '#5a6a78' : selected ? '#f1d47e' : '#69d5b7'
    ctx.lineWidth = selected ? 3 : 2
    ctx.strokeRect(x, y, width, height)
    if (selected) {
      ctx.fillStyle = '#f1d47e'
      for (const px of [x, x + width / 2, x + width]) {
        for (const py of [y, y + height / 2, y + height]) {
          if ((px === x + width / 2 && py === y + height / 2)) continue
          ctx.fillRect(px - 3, py - 3, 6, 6)
        }
      }
    }
    const label = mapping?.name ?? id
    if (width > 38 && height > 18) {
      ctx.fillStyle = '#f0f6fa'
      ctx.font = '11px Segoe UI'
      ctx.fillText(label, x + 5, y + 15, Math.max(0, width - 10))
    }
  }

  function drawMask(ctx: CanvasRenderingContext2D, points: readonly { readonly x: number; readonly y: number }[], cam: ViewCamera, enabled: boolean): void {
    if (points.length === 0) return
    ctx.save()
    ctx.strokeStyle = enabled ? '#dca16a' : '#5a6a78'
    ctx.fillStyle = enabled ? 'rgba(220,161,106,0.15)' : 'rgba(90,106,120,0.15)'
    ctx.lineWidth = 2
    ctx.beginPath()
    points.forEach((point, index) => {
      const screen = { x: cam.x + point.x * cam.scale, y: cam.y + point.y * cam.scale }
      if (index === 0) ctx.moveTo(screen.x, screen.y)
      else ctx.lineTo(screen.x, screen.y)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = enabled ? '#f1d47e' : '#9aa8b5'
    for (const point of points) {
      const screen = { x: cam.x + point.x * cam.scale, y: cam.y + point.y * cam.scale }
      ctx.fillRect(screen.x - 3, screen.y - 3, 6, 6)
    }
    ctx.restore()
  }

  function render(): void {
    if (!active) return
    normalize()
    const media = output()
    const inspection = media ? inspectMediaOutputMapping(project(), media.id) : null
    title.textContent = media ? `${media.name} · ${media.resolution.width} × ${media.resolution.height} px · ${view.toUpperCase()}` : 'Media Output'
    empty.hidden = view === 'input' ? selectedMapping() !== null : media !== undefined
    addMappingButton.disabled = media === undefined || project().design.screens.length === 0
    deleteButton.disabled = media === undefined
    const mapping = selectedMapping()
    splitButton.disabled = !mapping
    orderUpButton.disabled = !mapping
    orderDownButton.disabled = !mapping
    renderTree(inspection)
    renderDiagnostics(inspection)
    renderInspector()
    if (!inspection && view === 'output') status.textContent = 'Synthetic preview · no Media Output'
    draw(inspection)
  }

  function finishGesture(): void {
    const previous = gesture
    gesture = null
    if (previous && (previous.kind === 'move' || previous.kind === 'resize' || previous.kind === 'mask-point' || previous.kind === 'mask-move')) {
      options.endHistoryGroup(previous.group)
    }
    canvas.classList.remove('dragging')
  }

  function clampToScreen(rect: EditorRect, bounds: EditorRect): EditorRect {
    return {
      x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - rect.width),
      y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - rect.height),
      width: Math.min(rect.width, bounds.width),
      height: Math.min(rect.height, bounds.height),
    }
  }

  function hitWorld(x: number, y: number): { readonly id: string; readonly rect: EditorRect } | null {
    const cam = camera()
    const world = worldFromScreen(cam, { x, y })
    const rects = viewRects()
    for (let i = rects.length - 1; i >= 0; i -= 1) {
      const entry = rects[i]!
      if (containsPoint(entry.rect, world)) return entry
    }
    return null
  }

  function hitMaskPoint(x: number, y: number): number | null {
    if (view !== 'input') return null
    const mapping = selectedMapping()
    if (!mapping?.mask) return null
    const cam = camera()
    let best: number | null = null
    let bestDist = 7 * 7
    mapping.mask.points.forEach((point, index) => {
      const screen = { x: cam.x + point.x * cam.scale, y: cam.y + point.y * cam.scale }
      const dist = (screen.x - x) ** 2 + (screen.y - y) ** 2
      if (dist <= 6 * 6 && dist < bestDist) {
        best = index
        bestDist = dist
      }
    })
    return best
  }

  addOutputButton.addEventListener('click', () => {
    const count = project().content.mediaOutputs.length
    if (run(project => addMediaOutputV2(project, 1920, 1080))) {
      selectedOutputId = project().content.mediaOutputs[count]!.id
      selectedMappingId = null
      render()
    }
  })
  addMappingButton.addEventListener('click', () => {
    const media = output()
    const screen = project().design.screens[0]
    if (!media || !screen) return
    const count = project().content.outputMappings.length
    if (run(project => addOutputMappingV2(project, screen.id, media.id, { x: 0, y: 0 }))) {
      selectedMappingId = project().content.outputMappings[count]!.id
      render()
    }
  })
  deleteButton.addEventListener('click', () => {
    const media = output()
    if (!media) return
    if (selectedMappingId) {
      const id = selectedMappingId
      if (run(project => deleteOutputMappingV2(project, id))) selectedMappingId = null
    } else if (run(project => deleteMediaOutputV2(project, media.id))) selectedOutputId = null
    render()
  })
  viewInputButton.addEventListener('click', () => { view = 'input'; render() })
  viewOutputButton.addEventListener('click', () => { view = 'output'; render() })
  splitButton.addEventListener('click', () => {
    if (selectedMappingId) run(project => splitOutputMappingIntoRowsV2(project, selectedMappingId!, 2))
  })
  orderUpButton.addEventListener('click', () => {
    const media = output()
    const mapping = selectedMapping()
    if (!media || !mapping) return
    const index = media.mappingOrder.findIndex(item => item === mapping.id)
    if (index > 0) run(project => reorderOutputMappingV2(project, media.id, mapping.id, index - 1))
  })
  orderDownButton.addEventListener('click', () => {
    const media = output()
    const mapping = selectedMapping()
    if (!media || !mapping) return
    const index = media.mappingOrder.findIndex(item => item === mapping.id)
    if (index >= 0) run(project => reorderOutputMappingV2(project, media.id, mapping.id, index + 1))
  })
  fitButton.addEventListener('click', () => {
    const bounds = worldBounds()
    const rect = canvas.getBoundingClientRect()
    setCamera(fitCamera(Math.max(1, rect.width || viewport.clientWidth), Math.max(1, rect.height || viewport.clientHeight), bounds.width, bounds.height))
    draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
  })
  actualButton.addEventListener('click', () => {
    const cam = camera()
    const rect = canvas.getBoundingClientRect()
    const center = worldFromScreen(cam, { x: rect.width / 2, y: rect.height / 2 })
    setCamera({ scale: 1, x: rect.width / 2 - center.x, y: rect.height / 2 - center.y })
    draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
  })
  zoomInButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    setCamera(zoomAt(camera(), { x: rect.width / 2, y: rect.height / 2 }, 1.2))
    draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
  })
  zoomOutButton.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect()
    setCamera(zoomAt(camera(), { x: rect.width / 2, y: rect.height / 2 }, 1 / 1.2))
    draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
  })
  canvas.addEventListener('wheel', event => {
    event.preventDefault()
    setCamera(zoomAt(camera(), { x: event.offsetX, y: event.offsetY }, event.deltaY < 0 ? 1.15 : 1 / 1.15))
    draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
  }, { passive: false })
  window.addEventListener('keydown', event => { if (event.code === 'Space') spaceDown = true })
  window.addEventListener('keyup', event => { if (event.code === 'Space') spaceDown = false })

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 1 || spaceDown) {
      gesture = { kind: 'pan', startX: event.offsetX, startY: event.offsetY, camera: camera() }
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('dragging')
      event.preventDefault()
      return
    }
    if (event.button !== 0) return
    const cam = camera()
    const world = worldFromScreen(cam, { x: event.offsetX, y: event.offsetY })
    const pointIndex = hitMaskPoint(event.offsetX, event.offsetY)
    if (pointIndex !== null && selectedMappingId) {
      const group = options.beginHistoryGroup()
      gesture = { kind: 'mask-point', id: selectedMappingId, group, index: pointIndex }
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add('dragging')
      return
    }
    if (view === 'input' && selectedMappingId) {
      const mapping = selectedMapping()
      if (mapping?.mask && pointInPolygon(world.x, world.y, mapping.mask.points)) {
        const group = options.beginHistoryGroup()
        gesture = { kind: 'mask-move', id: selectedMappingId, group, startWorldX: world.x, startWorldY: world.y,
          origin: mapping.mask.points.map(point => ({ ...point })) }
        canvas.setPointerCapture(event.pointerId)
        canvas.classList.add('dragging')
        return
      }
    }
    const selected = viewRects().find(entry => entry.id === selectedMappingId)
    if (selected) {
      const handle = hitResizeHandle(selected.rect, { x: event.offsetX, y: event.offsetY }, cam)
      if (handle) {
        const group = options.beginHistoryGroup()
        gesture = { kind: 'resize', id: selected.id, group, handle, startWorldX: world.x, startWorldY: world.y, origin: { ...selected.rect } }
        canvas.setPointerCapture(event.pointerId)
        canvas.classList.add('dragging')
        return
      }
    }
    const placement = hitWorld(event.offsetX, event.offsetY)
    if (!placement) {
      if (view === 'output') selectedMappingId = null
      render()
      return
    }
    selectedMappingId = placement.id
    if (view === 'output') {
      const mapping = project().content.outputMappings.find(item => item.id === placement.id)
      if (mapping) selectedOutputId = mapping.mediaOutputId
    }
    render()
    const group = options.beginHistoryGroup()
    gesture = { kind: 'move', id: placement.id, group, startWorldX: world.x, startWorldY: world.y, origin: { ...placement.rect } }
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('dragging')
  })
  canvas.addEventListener('pointermove', event => {
    const cam = camera()
    const world = worldFromScreen(cam, { x: event.offsetX, y: event.offsetY })
    const active = gesture
    if (!active) return
    if (active.kind === 'pan') {
      setCamera({ ...active.camera, x: active.camera.x + event.offsetX - active.startX, y: active.camera.y + event.offsetY - active.startY })
      draw(output() ? inspectMediaOutputMapping(project(), output()!.id) : null)
      return
    }
    if (active.kind === 'mask-point') {
      run(project => moveOutputMaskPointV2(project, active.id, active.index, { x: world.x, y: world.y }), active.group)
      return
    }
    if (active.kind === 'mask-move') {
      const dx = world.x - active.startWorldX
      const dy = world.y - active.startWorldY
      const current = project().content.outputMappings.find(item => item.id === active.id)
      if (!current?.mask) return
      const points = active.origin.map(point => ({ x: point.x + dx, y: point.y + dy }))
      run(project => setOutputMappingMaskV2(project, active.id, { enabled: current.mask!.enabled, points }), active.group)
      return
    }
    const others = viewRects().filter(entry => entry.id !== active.id).map(entry => entry.rect)
    const bounds = worldBounds()
    if (active.kind === 'move') {
      const dx = world.x - active.startWorldX
      const dy = world.y - active.startWorldY
      const snapped = snapMove(active.origin, dx, dy, others, bounds, cam)
      const next = view === 'input' ? clampToScreen({ ...active.origin, ...snapped }, bounds) : snapped
      if (view === 'input') {
        run(project => updateOutputMappingV2(project, active.id, { screenRect: { ...active.origin, x: Math.round(next.x), y: Math.round(next.y) } }), active.group)
      } else {
        run(project => updateOutputMappingV2(project, active.id, { position: { x: Math.round(next.x), y: Math.round(next.y) } }), active.group)
      }
      return
    }
    if (active.kind === 'resize') {
      const dx = world.x - active.startWorldX
      const dy = world.y - active.startWorldY
      const resized = snapResize(active.origin, active.handle, dx, dy, others, bounds, cam, { aspectLock: event.shiftKey })
      const next = view === 'input' ? clampToScreen(resized, bounds) : resized
      if (view === 'input') {
        run(project => updateOutputMappingV2(project, active.id, { screenRect: { ...next } }), active.group)
      } else {
        run(project => updateOutputMappingV2(project, active.id, { outputRect: { ...next } }), active.group)
      }
    }
  })
  canvas.addEventListener('pointerup', finishGesture)
  canvas.addEventListener('pointercancel', finishGesture)
  canvas.addEventListener('dblclick', event => {
    if (view !== 'input' || !selectedMappingId) return
    const mapping = selectedMapping()
    if (!mapping?.mask) return
    const cam = camera()
    const world = worldFromScreen(cam, { x: event.offsetX, y: event.offsetY })
    let bestIndex = mapping.mask.points.length
    let bestDist = Infinity
    mapping.mask.points.forEach((point, index) => {
      const next = mapping.mask!.points[(index + 1) % mapping.mask!.points.length]!
      const mx = (point.x + next.x) / 2
      const my = (point.y + next.y) / 2
      const dist = (mx - world.x) ** 2 + (my - world.y) ** 2
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index + 1
      }
    })
    run(project => addOutputMaskPointV2(project, selectedMappingId!, { x: world.x, y: world.y }, bestIndex))
  })
  canvas.addEventListener('contextmenu', event => {
    if (view !== 'input') return
    const index = hitMaskPoint(event.offsetX, event.offsetY)
    if (index === null || !selectedMappingId) return
    event.preventDefault()
    run(project => removeOutputMaskPointV2(project, selectedMappingId!, index))
  })
  new ResizeObserver(() => { if (active) render() }).observe(viewport)

  const hook = {
    dump: () => ({ outputs: project().content.mediaOutputs.map(value => ({ ...value })),
      mappings: project().content.outputMappings.map(value => ({ ...value })),
      selectedOutputId, selectedMappingId, view }),
    pixel: (mediaOutputId: string, x: number, y: number) => createMediaOutputPixelResolver(project(), mediaOutputId)(x, y),
    viewPoint: (x: number, y: number) => {
      const cam = camera()
      return { x: cam.x + x * cam.scale, y: cam.y + y * cam.scale }
    },
  }
  ;(window as Window & { __ledmapOutputMapping?: typeof hook }).__ledmapOutputMapping = hook

  return { activate: () => { active = true; render() }, deactivate: () => { finishGesture(); active = false },
    finishGesture, projectChanged: () => { if (active) render() } }
}
