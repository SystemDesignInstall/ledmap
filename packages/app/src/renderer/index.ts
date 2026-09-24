import type { Direction, Numbering } from '@ledmap/core'
import { applyDraft, changeNumbering, dimensionFields, initialDraft, type AlphaState, type Draft } from './state.js'
import { drawPreview } from './canvas.js'

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

const canvas = element<HTMLCanvasElement>('grid-canvas')
const form = element<HTMLFormElement>('settings')
const numbering = element<HTMLSelectElement>('numbering')
const direction = element<HTMLSelectElement>('direction')
const snake = element<HTMLInputElement>('snake')
const create = element<HTMLButtonElement>('create-screen')
let draft: Draft = initialDraft
let state: AlphaState = { snapshot: null, errors: {} }

function draw(): void {
  if (state.snapshot) element('detail-note').textContent = drawPreview(canvas, state.snapshot)
}

function update(): void {
  state = applyDraft(state.snapshot, draft)
  for (const field of dimensionFields) {
    element<HTMLInputElement>(field).setAttribute('aria-invalid', String(Boolean(state.errors[field])))
    element(`${field}-error`).textContent = state.errors[field] ?? ''
  }
  const invalid = Object.keys(state.errors).length > 0
  const error = element('error')
  error.hidden = !invalid
  error.textContent = invalid
    ? `${state.errors.form ?? 'Check the highlighted dimensions.'} Changes have not been applied. ${state.snapshot ? 'Showing the last valid preview.' : ''}`
    : ''
  element('preview-status').textContent = invalid ? 'Changes not applied' : 'Preview up to date'
  const snapshot = state.snapshot
  if (!snapshot) return
  canvas.hidden = false
  element('empty').hidden = true
  element('screen-title').textContent = snapshot.screen.name
  const format = new Intl.NumberFormat('en-US')
  const size = (w: number, h: number) => `${format.format(w)} × ${format.format(h)} px`
  const summary: Record<string, string> = {
    'cabinet-count': format.format(snapshot.cabinets.length),
    'module-count': format.format(snapshot.moduleCount),
    'module-size': size(snapshot.config.modulePixelWidth, snapshot.config.modulePixelHeight),
    'cabinet-size': size(snapshot.grid.cabinetWidth, snapshot.grid.cabinetHeight),
    'screen-resolution': size(snapshot.screen.resolution.width, snapshot.screen.resolution.height),
    'pixel-count': format.format(snapshot.pixelCount),
  }
  for (const [id, value] of Object.entries(summary)) element(id).textContent = value
  canvas.setAttribute('aria-label', `Physical cabinet grid. ${snapshot.cabinets.map(c => `${c.id}: logical ${c.index + 1}`).join('; ')}`)
  draw()
}

create.addEventListener('click', () => {
  update()
  if (state.snapshot) {
    create.disabled = true
    create.textContent = 'Screen 1 created'
    element<HTMLFieldSetElement>('settings-fields').disabled = false
  }
})

form.addEventListener('submit', event => event.preventDefault())
for (const field of dimensionFields) {
  element<HTMLInputElement>(field).addEventListener('input', event => {
    draft = { ...draft, [field]: (event.target as HTMLInputElement).value }
    update()
  })
}
numbering.addEventListener('change', () => {
  const ordering = changeNumbering(draft.ordering, numbering.value as Numbering)
  draft = { ...draft, ordering }
  const choices = ordering.numbering === 'row'
    ? [['left-to-right', 'Left → Right'], ['right-to-left', 'Right → Left']]
    : [['top-to-bottom', 'Top → Bottom'], ['bottom-to-top', 'Bottom → Top']]
  direction.replaceChildren(...choices.map(([value, label]) => new Option(label, value)))
  direction.value = ordering.direction
  update()
})
direction.addEventListener('change', () => {
  draft = { ...draft, ordering: { ...draft.ordering, direction: direction.value as Direction } }
  update()
})
snake.addEventListener('change', () => {
  draft = { ...draft, ordering: { ...draft.ordering, snake: snake.checked } }
  update()
})
new ResizeObserver(draw).observe(element('viewport'))
window.addEventListener('resize', draw)

function watchPixelRatio(): void {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  query.addEventListener('change', () => {
    draw()
    watchPixelRatio()
  }, { once: true })
}

watchPixelRatio()
