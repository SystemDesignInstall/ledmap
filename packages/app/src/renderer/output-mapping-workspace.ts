import {
  createMediaOutputPixelResolver, inspectMediaOutputMapping,
  type LedMapProjectV2, type MediaOutputMappingInspection, type OutputMappingPlacement,
} from '@ledmap/core'
import {
  addMediaOutputV2, addOutputMappingV2, deleteMediaOutputV2, deleteOutputMappingV2,
  updateMediaOutputV2, updateOutputMappingV2,
} from './v2-output-commands.js'
import { outputMappingPreviewRaster } from './output-mapping-preview.js'

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

interface ViewTransform { readonly x: number; readonly y: number; readonly scale: number }

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
  input.placeholder = value === undefined ? 'Unplaced' : ''
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

function diagnosticLabel(code: string): string {
  const labels: Record<string, string> = {
    OUTPUT_MAPPING_UNPLACED: 'Unplaced: choose X and Y',
    OUTPUT_MAPPING_PARTIALLY_CLIPPED: 'Partially clipped by output bounds',
    OUTPUT_MAPPING_OUTSIDE: 'Entirely outside output bounds',
    OUTPUT_MAPPING_OVERLAP: 'Visible mappings overlap; no z-order is defined',
    OUTPUT_MASK_UNSUPPORTED: 'Saved mask is preserved but not interpreted',
  }
  return labels[code] ?? code
}

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
  let active = false
  let selectedOutputId: string | null = null
  let selectedMappingId: string | null = null
  let transform: ViewTransform = { x: 0, y: 0, scale: 1 }
  let drag: { id: string; group: number; startX: number; startY: number; x: number; y: number } | null = null

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

  function normalize(): void {
    const value = project()
    if (!value.content.mediaOutputs.some(output => output.id === selectedOutputId)) {
      selectedOutputId = value.content.mediaOutputs[0]?.id ?? null
      selectedMappingId = null
    }
    if (!value.content.outputMappings.some(mapping => mapping.id === selectedMappingId && mapping.mediaOutputId === selectedOutputId)) {
      selectedMappingId = null
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
      }, `${media.resolution.width} × ${media.resolution.height} px`))
      if (media.id !== selectedOutputId) continue
      for (const mapping of project().content.outputMappings.filter(value => value.mediaOutputId === media.id)) {
        const screen = project().design.screens.find(value => value.id === mapping.screenId)
        const placement = inspection?.placements.find(value => value.mappingId === mapping.id)
        tree.append(item(screen?.name ?? mapping.screenId, mapping.id === selectedMappingId, () => {
          selectedMappingId = mapping.id
          render()
        }, placement?.coverage === 'unplaced' ? 'UNPLACED' :
          `${mapping.position?.x}, ${mapping.position?.y} · ${placement?.coverage ?? ''}${mapping.mask ? ' · mask unsupported' : ''}`))
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

  function renderInspector(): void {
    properties.replaceChildren()
    const value = project()
    const mapping = value.content.outputMappings.find(item => item.id === selectedMappingId)
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
    inspectorTitle.textContent = screen?.name ?? 'Output Mapping'
    properties.append(
      selectField('Mapped Screen', mapping.screenId, value.design.screens.map(screen => ({ id: screen.id, name: screen.name })),
        screenId => { run(project => updateOutputMappingV2(project, mapping.id, { screenId })) }),
      selectField('Media Output', mapping.mediaOutputId, value.content.mediaOutputs.map(item => ({ id: item.id, name: item.name })),
        mediaOutputId => {
          if (run(project => updateOutputMappingV2(project, mapping.id, { mediaOutputId }))) {
            selectedOutputId = mediaOutputId
            render()
          }
        }),
      numberField('Output position X', mapping.position?.x,
        x => { run(project => updateOutputMappingV2(project, mapping.id, { position: { x, y: mapping.position?.y ?? 0 } })) }),
      numberField('Output position Y', mapping.position?.y,
        y => { run(project => updateOutputMappingV2(project, mapping.id, { position: { x: mapping.position?.x ?? 0, y } })) }),
    )
    if (mapping.position === undefined) {
      const place = document.createElement('button')
      place.type = 'button'
      place.textContent = 'Place at (0, 0)'
      place.addEventListener('click', () => { run(project => updateOutputMappingV2(project, mapping.id, { position: { x: 0, y: 0 } })) })
      properties.append(place)
    }
    if (mapping.mask) {
      const hint = document.createElement('p')
      hint.className = 'hint output-diagnostic-error'
      hint.textContent = `Mask: ${mapping.mask.points.length} saved points. Preserved, not editable or pixel-resolvable in this MVP.`
      properties.append(hint)
    }
  }

  function view(outputWidth: number, outputHeight: number): ViewTransform {
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    const scale = Math.max(0.000001, Math.min((width - 48) / outputWidth, (height - 48) / outputHeight))
    return { x: (width - outputWidth * scale) / 2, y: (height - outputHeight * scale) / 2, scale }
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
    if (!inspection) return
    transform = view(inspection.resolution.width, inspection.resolution.height)
    const left = transform.x
    const top = transform.y
    const outputWidth = inspection.resolution.width * transform.scale
    const outputHeight = inspection.resolution.height * transform.scale
    ctx.fillStyle = '#0c141e'
    ctx.fillRect(left, top, outputWidth, outputHeight)
    const raster = outputMappingPreviewRaster(project(), inspection.mediaOutputId)
    status.textContent = raster.status === 'blocked'
      ? 'Geometry only · pixel preview blocked by diagnostics'
      : raster.exact ? 'Synthetic pixel-exact preview' : 'Synthetic sampled preview · not real media'
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
        ctx.drawImage(bitmap, left, top, outputWidth, outputHeight)
      }
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, outputWidth, outputHeight)
    ctx.clip()
    for (const placement of inspection.placements) drawPlacement(ctx, placement, inspection)
    ctx.restore()
    ctx.strokeStyle = '#80a0b8'
    ctx.lineWidth = 2
    ctx.strokeRect(left, top, outputWidth, outputHeight)
  }

  function drawPlacement(ctx: CanvasRenderingContext2D, placement: OutputMappingPlacement, inspection: MediaOutputMappingInspection): void {
    if (!placement.position) return
    const screen = project().design.screens.find(value => value.id === placement.screenId)
    if (!screen) return
    const x = transform.x + placement.position.x * transform.scale
    const y = transform.y + placement.position.y * transform.scale
    const width = screen.resolution.width * transform.scale
    const height = screen.resolution.height * transform.scale
    const overlapped = inspection.diagnostics.some(value => value.code === 'OUTPUT_MAPPING_OVERLAP' && value.mappingIds.includes(placement.mappingId))
    ctx.strokeStyle = overlapped ? '#ea7e83' : placement.maskUnsupported ? '#dca16a' :
      placement.mappingId === selectedMappingId ? '#f1d47e' : '#69d5b7'
    ctx.lineWidth = placement.mappingId === selectedMappingId ? 3 : 2
    ctx.strokeRect(x, y, width, height)
    if (width > 38 && height > 18) {
      ctx.fillStyle = '#f0f6fa'
      ctx.font = '11px Segoe UI'
      ctx.fillText(screen.name, x + 5, y + 15, Math.max(0, width - 10))
    }
  }

  function render(): void {
    if (!active) return
    normalize()
    const media = output()
    const inspection = media ? inspectMediaOutputMapping(project(), media.id) : null
    title.textContent = media ? `${media.name} · ${media.resolution.width} × ${media.resolution.height} px` : 'Media Output'
    empty.hidden = media !== undefined
    addMappingButton.disabled = media === undefined || project().design.screens.length === 0
    deleteButton.disabled = media === undefined
    renderTree(inspection)
    renderDiagnostics(inspection)
    renderInspector()
    if (!inspection) status.textContent = 'Synthetic preview · no Media Output'
    draw(inspection)
  }

  function finishGesture(): void {
    const previous = drag
    drag = null
    if (previous) options.endHistoryGroup(previous.group)
    canvas.classList.remove('dragging')
  }

  function hit(x: number, y: number): OutputMappingPlacement | null {
    const media = output()
    if (!media) return null
    const inspection = inspectMediaOutputMapping(project(), media.id)
    const mediaX = Math.floor((x - transform.x) / transform.scale)
    const mediaY = Math.floor((y - transform.y) / transform.scale)
    const hits = inspection.placements.filter(value => value.visibleRect &&
      mediaX >= value.visibleRect.x && mediaX < value.visibleRect.x + value.visibleRect.width &&
      mediaY >= value.visibleRect.y && mediaY < value.visibleRect.y + value.visibleRect.height)
    return hits.length === 1 ? hits[0]! : null
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
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    const placement = hit(event.offsetX, event.offsetY)
    if (!placement) return
    selectedMappingId = placement.mappingId
    render()
    if (!placement.position) return
    const group = options.beginHistoryGroup()
    drag = { id: placement.mappingId, group, startX: event.offsetX, startY: event.offsetY,
      x: placement.position.x, y: placement.position.y }
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('dragging')
  })
  canvas.addEventListener('pointermove', event => {
    if (!drag) return
    const dx = Math.round((event.offsetX - drag.startX) / transform.scale)
    const dy = Math.round((event.offsetY - drag.startY) / transform.scale)
    const at = { x: drag.x + dx, y: drag.y + dy }
    run(project => updateOutputMappingV2(project, drag!.id, { position: at }), drag.group)
  })
  canvas.addEventListener('pointerup', finishGesture)
  canvas.addEventListener('pointercancel', finishGesture)
  new ResizeObserver(() => { if (active) render() }).observe(viewport)

  const hook = {
    dump: () => ({ outputs: project().content.mediaOutputs.map(value => ({ ...value })),
      mappings: project().content.outputMappings.map(value => ({ ...value })),
      selectedOutputId, selectedMappingId }),
    pixel: (mediaOutputId: string, x: number, y: number) => createMediaOutputPixelResolver(project(), mediaOutputId)(x, y),
    viewPoint: (x: number, y: number) => ({ x: transform.x + x * transform.scale,
      y: transform.y + y * transform.scale }),
  }
  ;(window as Window & { __ledmapOutputMapping?: typeof hook }).__ledmapOutputMapping = hook

  return { activate: () => { active = true; render() }, deactivate: () => { finishGesture(); active = false },
    finishGesture, projectChanged: () => { if (active) render() } }
}
