import { selectCompositionGeometry, type LedMapProjectV2, type PixelRect, type Size } from '@ledmap/core'
import { RESOLUME_XML_MAX_BYTES } from '../shared/resolume-import.js'
import { decodeResolumeFile, ResolumeImportSession, type ResolumeDocumentStamp, type ResolumeImportSettings } from '../shared/resolume-import-session.js'
import { RESOLUME_COMPATIBILITY, type ResolumeNativeSlice, type ResolumePoint } from '../shared/resolume-types.js'

interface Options {
  readonly getProject: () => LedMapProjectV2
  readonly getDocumentStamp: () => ResolumeDocumentStamp
  readonly getCompositionFrame: () => PixelRect
  readonly runCommand: (command: (project: LedMapProjectV2) => LedMapProjectV2) => void
  readonly finishGesture: () => void
  readonly showError: (error: unknown, fallback: string) => void
  readonly clearError: () => void
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing element: ${id}`)
  return value as T
}

function line(text: string): HTMLParagraphElement {
  const value = document.createElement('p')
  value.textContent = text.length > 2048 ? text.slice(0, 2048) + '…' : text
  return value
}

function labeled(label: string, input: HTMLElement): HTMLLabelElement {
  const value = document.createElement('label')
  value.className = 'output-field'
  const caption = document.createElement('span')
  caption.textContent = label
  input.setAttribute('aria-label', label)
  value.append(caption, input)
  return value
}

const colors = ['#5cdec2', '#f1ac51', '#78a9ff', '#e199e6']

function drawGeometry(
  canvas: HTMLCanvasElement, raster: Size | null, slices: readonly ResolumeNativeSlice[], space: 'input' | 'output',
  backgrounds: readonly { readonly name: string; readonly rect: PixelRect }[] = [],
): void {
  canvas.width = 720
  canvas.height = 240
  const context = canvas.getContext('2d')!
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const points = slices.flatMap(slice => [...slice[space], ...(space === 'output' ? slice.warp?.points ?? [] : [])])
  const left = Math.min(0, ...points.map(point => point.x), ...backgrounds.map(value => value.rect.x))
  const top = Math.min(0, ...points.map(point => point.y), ...backgrounds.map(value => value.rect.y))
  const right = Math.max(1, raster?.width ?? 1, ...points.map(point => point.x), ...backgrounds.map(value => value.rect.x + value.rect.width))
  const bottom = Math.max(1, raster?.height ?? 1, ...points.map(point => point.y), ...backgrounds.map(value => value.rect.y + value.rect.height))
  const scale = Math.min(680 / (right - left), 200 / (bottom - top))
  const xy = (point: ResolumePoint) => ({ x: 20 + (point.x - left) * scale, y: 20 + (point.y - top) * scale })
  const path = (values: readonly ResolumePoint[], close: boolean) => {
    context.beginPath()
    values.forEach((point, index) => { const p = xy(point); if (index === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y) })
    if (close) context.closePath()
    context.stroke()
  }
  context.font = '11px sans-serif'
  for (const background of backgrounds) {
    const origin = xy(background.rect)
    context.strokeStyle = '#52606c'
    context.strokeRect(origin.x, origin.y, background.rect.width * scale, background.rect.height * scale)
    context.fillStyle = '#82909b'
    context.fillText(background.name, origin.x + 4, origin.y + 12, 150)
  }
  if (raster) {
    const origin = xy({ x: 0, y: 0 })
    context.strokeStyle = '#a0adb8'
    context.strokeRect(origin.x, origin.y, raster.width * scale, raster.height * scale)
  }
  slices.forEach((slice, index) => {
    context.strokeStyle = colors[index % colors.length]!
    context.fillStyle = colors[index % colors.length]!
    context.setLineDash(slice.enabled ? [] : [4, 4])
    path(slice[space], true)
    const origin = xy(slice[space][0])
    context.fillText(slice.name.slice(0, 96), origin.x + 4, origin.y + 25, 150)
    if (space === 'output' && slice.warp) {
      context.setLineDash([])
      const warp = slice.warp
      for (let row = 0; row < warp.rows; row += 1) path(warp.points.slice(row * warp.columns, (row + 1) * warp.columns), false)
      for (let col = 0; col < warp.columns; col += 1) path(Array.from({ length: warp.rows }, (_value, row) => warp.points[row * warp.columns + col]!), false)
    }
  })
  context.setLineDash([])
}

export function createResolumeImportWorkspace(options: Options): { open(): void; close(): void; projectChanged(): void } {
  const dialog = element<HTMLDialogElement>('resolume-import-dialog')
  const fileInput = element<HTMLInputElement>('resolume-import-file')
  const summary = element<HTMLDivElement>('resolume-import-summary')
  const bindings = element<HTMLDivElement>('resolume-import-bindings')
  const diagnostics = element<HTMLDivElement>('resolume-import-diagnostics')
  const result = element<HTMLDivElement>('resolume-import-result')
  const previewButton = element<HTMLButtonElement>('resolume-import-preview')
  const applyButton = element<HTMLButtonElement>('resolume-import-apply')
  const outputSelect = element<HTMLSelectElement>('resolume-import-output')
  const compositionCanvas = element<HTMLCanvasElement>('resolume-import-input-canvas')
  const outputCanvas = element<HTMLCanvasElement>('resolume-import-output-canvas')
  const frameFields = ['x', 'y', 'width', 'height'].map(key => element<HTMLInputElement>(`resolume-import-frame-${key}`))
  const session = new ResolumeImportSession()
  const bindingFields = new Map<string, HTMLSelectElement>()
  const rasterFields = new Map<string, readonly [HTMLInputElement, HTMLInputElement]>()
  let selection = 0
  let reading = false
  let stamp: ResolumeDocumentStamp | null = null

  function setFrame(): void {
    const frame = options.getCompositionFrame()
    ;[frame.x, frame.y, frame.width, frame.height].forEach((value, index) => { frameFields[index]!.value = String(value) })
  }

  function invalidate(message = 'Settings changed. Preview the import again.'): void {
    session.invalidate()
    result.replaceChildren(line(message))
    applyButton.disabled = true
  }

  function buttons(): void {
    const source = session.document
    const count = source?.screens.reduce((sum, screen) => sum + 1 + screen.slices.length, 0) ?? 0
    previewButton.disabled = reading || !source || count > 250 || source.diagnostics.some(issue => issue.blocking)
    applyButton.disabled = reading || !session.preview
  }

  function settings(): ResolumeImportSettings {
    const values = frameFields.map(input => input.value.trim() === '' ? NaN : Number(input.value))
    if (values.some(value => !Number.isSafeInteger(value))) throw new Error('Enter integer Composition frame origin and dimensions.')
    const frame = { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! }
    const rasterEntries = [...rasterFields].map(([id, fields]) => {
      const width = fields[0].value.trim() === '' ? NaN : Number(fields[0].value)
      const height = fields[1].value.trim() === '' ? NaN : Number(fields[1].value)
      if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
        throw new Error('Enter positive integer dimensions for every unknown output raster.')
      }
      return [id, { width, height }] as const
    })
    const selected = [...bindingFields].map(([sourceSliceId, control]) => ({ sourceSliceId, screenId: control.value }))
    if (selected.some(binding => binding.screenId === '')) throw new Error('Select a LedMAP Screen for every source slice.')
    return { frame, bindings: selected, rasterOverrides: Object.fromEntries(rasterEntries) }
  }

  function draw(): void {
    const source = session.document
    const frameValues = frameFields.map(input => Number(input.value))
    const backgrounds = frameValues.every(Number.isFinite) ? selectCompositionGeometry(options.getProject()).screens.map(screen => ({
      name: options.getProject().design.screens.find(value => value.id === screen.screenId)?.name ?? screen.screenId,
      rect: { x: screen.x - frameValues[0]!, y: screen.y - frameValues[1]!, width: screen.width, height: screen.height },
    })) : []
    drawGeometry(compositionCanvas, source?.composition ?? null, source?.screens.flatMap(screen => screen.slices).slice(0, 250) ?? [], 'input', backgrounds)
    const output = source?.screens.find(screen => screen.id === outputSelect.value)
    drawGeometry(outputCanvas, output?.raster ?? null, output?.slices.slice(0, 250) ?? [], 'output')
  }

  function renderBindings(): void {
    const previous = new Map([...bindingFields].map(([id, control]) => [id, control.value]))
    const previousRaster = new Map([...rasterFields].map(([id, fields]) => [id, fields.map(field => field.value)]))
    bindings.replaceChildren()
    bindingFields.clear()
    rasterFields.clear()
    const source = session.document
    if (!source) return
    let visible = 0
    for (const screen of source.screens) {
      if (++visible > 250) break
      const section = document.createElement('section')
      section.className = 'resolume-import-output'
      const heading = document.createElement('h3')
      heading.textContent = `${screen.name.slice(0, 256)} · ${screen.deviceKind?.slice(0, 96) ?? 'unknown device'} · ${screen.enabled ? 'enabled' : 'disabled'}`
      section.append(heading)
      if (screen.raster) section.append(line(`Output raster ${screen.raster.width} × ${screen.raster.height} px`))
      else {
        section.append(line('Output raster unknown. Enter explicit dimensions; preview bounds do not supply a raster size.'))
        const fields = ['width', 'height'].map((key, index) => {
          const input = document.createElement('input')
          input.type = 'number'; input.min = '1'; input.step = '1'
          input.value = previousRaster.get(screen.id)?.[index] ?? ''
          input.addEventListener('input', () => invalidate())
          section.append(labeled(`Output ${key} for ${screen.name.slice(0, 96)} (${screen.id})`, input))
          return input
        })
        rasterFields.set(screen.id, [fields[0]!, fields[1]!])
      }
      for (const slice of screen.slices) {
        if (++visible > 250) break
        const row = document.createElement('div')
        row.className = 'resolume-import-binding'
        const select = document.createElement('select')
        const blank = document.createElement('option')
        blank.value = ''; blank.textContent = 'Select an existing Screen…'
        select.append(blank)
        for (const target of options.getProject().design.screens) {
          const choice = document.createElement('option')
          choice.value = target.id; choice.textContent = `${target.name} (${target.id})`
          select.append(choice)
        }
        const old = previous.get(slice.id)
        select.value = old && options.getProject().design.screens.some(value => value.id === old) ? old : ''
        select.addEventListener('change', () => invalidate())
        row.append(labeled(`LedMAP Screen for ${slice.name.slice(0, 96)} (${slice.id})`, select))
        const details = document.createElement('details')
        const caption = document.createElement('summary')
        caption.textContent = `${slice.name.slice(0, 256)} · ${slice.enabled ? 'enabled' : 'disabled'} · original geometry`
        details.append(caption)
        for (const space of ['input', 'output'] as const) {
          details.append(line(`${space}: ${slice[space].map(point => `(${point.x}, ${point.y})`).join(' → ')}`))
        }
        if (slice.warp) details.append(line(`Warp: ${slice.warp.columns} × ${slice.warp.rows} control lattice · ${slice.warp.mode}`))
        row.append(details)
        section.append(row)
        bindingFields.set(slice.id, select)
      }
      bindings.append(section)
    }
  }

  function inspect(): void {
    summary.replaceChildren()
    diagnostics.replaceChildren()
    outputSelect.replaceChildren()
    const source = session.document
    if (source) {
      summary.append(line(`Composition ${source.composition ? `${source.composition.width} × ${source.composition.height} px` : 'unknown'} · ` +
        `${source.screens.length} output(s) · ${source.screens.reduce((sum, screen) => sum + screen.slices.length, 0)} slice(s)`),
      line(source.version ? `${source.version.name} ${source.version.major}.${source.version.minor}.${source.version.micro} · revision ${source.version.revision}` : 'Source version unknown'))
      for (const screen of source.screens.slice(0, 250)) {
        const option = document.createElement('option')
        option.value = screen.id; option.textContent = `${screen.name.slice(0, 256)}${screen.raster ? '' : ' · raster unknown'}`
        outputSelect.append(option)
      }
      for (const issue of source.diagnostics.slice(0, 250)) {
        const message = line(`${issue.path}: ${issue.message}`)
        if (issue.blocking) message.className = 'form-error'
        diagnostics.append(message)
      }
      if (source.diagnostics.length > 250) diagnostics.append(line(`${source.diagnostics.length} source diagnostics; only the first 250 are shown. All blocking diagnostics still prevent import.`))
      const count = source.screens.reduce((sum, screen) => sum + 1 + screen.slices.length, 0)
      if (count > 250) diagnostics.append(line('Only the first 250 screen/slice items are shown. Import exceeds the supported 250-item limit.'))
    }
    renderBindings()
    buttons()
    draw()
  }

  function close(): void {
    if (dialog.open) { selection += 1; dialog.close() }
  }

  dialog.addEventListener('close', () => {
    if (dialog.open) return
    selection += 1
    reading = false
    session.clear()
    bindingFields.clear()
    rasterFields.clear()
    fileInput.value = ''
    buttons()
  })
  function open(): void {
    selection += 1
    reading = false
    fileInput.value = ''
    options.finishGesture()
    options.clearError()
    session.clear()
    bindingFields.clear()
    rasterFields.clear()
    stamp = options.getDocumentStamp()
    setFrame()
    result.replaceChildren(line('Select an Arena XML file. Bind every slice before previewing.'))
    inspect()
    dialog.showModal()
  }
  element<HTMLButtonElement>('resolume-import-cancel').addEventListener('click', close)
  element<HTMLButtonElement>('resolume-import-use-frame').addEventListener('click', () => { setFrame(); invalidate(); draw() })
  frameFields.forEach(input => input.addEventListener('input', () => invalidate()))
  outputSelect.addEventListener('change', draw)
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const current = ++selection
    session.clear()
    bindingFields.clear()
    rasterFields.clear()
    reading = true
    result.replaceChildren(line(`Reading ${file.name}…`))
    inspect()
    void (async () => {
      try {
        if (file.size > RESOLUME_XML_MAX_BYTES) throw new Error('Choose an XML file no larger than 2 MiB.')
        const bytes = await file.arrayBuffer()
        if (selection !== current || !dialog.open) return
        session.inspect(decodeResolumeFile(new Uint8Array(bytes)))
        reading = false
        result.replaceChildren(line(`${file.name} inspected. Choose explicit Screen bindings, then Preview import.`))
        inspect()
      } catch (error) {
        if (selection !== current || !dialog.open) return
        result.replaceChildren(line(error instanceof Error ? error.message : 'Unable to inspect Arena XML.'))
      } finally {
        if (selection === current) { reading = false; buttons() }
      }
    })()
  })
  previewButton.addEventListener('click', () => {
    options.clearError()
    try {
      const source = options.getProject()
      const preview = session.prepare(source, options.getDocumentStamp(), settings())
      result.replaceChildren(line(`Ready to append ${preview.addedOutputs} Media Output(s) and ${preview.mappings.length} Output Mapping(s). Apply creates one Undo step.`))
      for (const mapping of preview.mappings) {
        const screen = source.design.screens.find(value => value.id === mapping.screenId)!
        result.append(line(`${mapping.name} → ${screen.name}: Screen crop ${mapping.screenRect.x}, ${mapping.screenRect.y} · ${mapping.screenRect.width} × ${mapping.screenRect.height} px`))
      }
    } catch (error) {
      session.invalidate()
      result.replaceChildren(line(error instanceof Error ? error.message : 'Unable to preview import.'))
    }
    buttons()
    draw()
  })
  applyButton.addEventListener('click', () => {
    options.clearError()
    try {
      options.runCommand(project => session.apply(project, options.getDocumentStamp()))
      close()
    } catch (error) {
      options.showError(error, 'Unable to import Arena XML.')
      result.replaceChildren(line(error instanceof Error ? error.message : 'Unable to import Arena XML.'))
      buttons()
    }
  })
  element<HTMLDivElement>('resolume-import-compatibility').textContent = RESOLUME_COMPATIBILITY

  return { open, close, projectChanged: () => {
    const current = options.getDocumentStamp()
    if (stamp?.documentId === current.documentId && stamp.revision === current.revision) return
    stamp = current
    if (dialog.open) { invalidate('The project changed. Check bindings and preview again.'); renderBindings(); draw() }
  } }
}
