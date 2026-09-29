import {
  TEST_PATTERN_DEFINITIONS,
  evaluateTestPattern,
  testPatternAvailability,
  type TestFrame,
  type TestPatternGroup,
  type TestPatternId,
  type TestScope,
  type TestScopeKind,
  type TestWalkPixel,
} from '../shared/test-engine.js'
import { fitCamera, toProject, zoomAt, type Camera, type Point } from './canvas.js'
import { drawTestFrame } from './test-canvas.js'
import {
  buildTestScene,
  buildTestWalkSpace,
  resolveTestWalkPixel,
  testScopeTargets,
  walkOrdinalForDataIndex,
} from './test-project.js'
import type { Project } from './project.js'

interface TestWorkspaceOptions {
  readonly getProject: () => Project
}

export interface TestWorkspace {
  activate(): void
  deactivate(): void
  projectChanged(): void
}

interface TestHookDump {
  readonly pattern: TestPatternId
  readonly scope: TestScope
  readonly hardwareReady: boolean
  readonly mappingReady: boolean
  readonly scopedCabinets: readonly string[]
  readonly primitiveKinds: readonly string[]
  readonly solidColors: readonly string[]
  readonly walk: TestWalkPixel | null
}

interface TestHook {
  dump(): TestHookDump
  camera(): Camera
}

const scopeLabels: Readonly<Record<TestScopeKind, string>> = {
  composition: 'Entire Composition',
  screen: 'Screen',
  cabinet: 'Cabinet',
  module: 'Module',
  receiver: 'Receiver',
  port: 'Port',
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

function row(label: string, value: string): HTMLDivElement {
  const result = document.createElement('div')
  result.className = 'property'
  const name = document.createElement('label')
  name.textContent = label
  const content = document.createElement('span')
  content.className = 'value'
  content.textContent = value
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

function formatPoint(value: Point): string {
  return `${value.x.toLocaleString('en-US')}, ${value.y.toLocaleString('en-US')}`
}

export function createTestWorkspace(options: TestWorkspaceOptions): TestWorkspace {
  const canvas = element<HTMLCanvasElement>('test-canvas')
  const empty = element<HTMLDivElement>('test-empty')
  const patternList = element<HTMLDivElement>('test-pattern-list')
  const patternReason = element<HTMLDivElement>('test-pattern-reason')
  const canvasTitle = element<HTMLHeadingElement>('test-canvas-title')
  const inspectorTitle = element<HTMLHeadingElement>('test-inspector-title')
  const properties = element<HTMLDivElement>('test-properties')
  const scopeSelect = element<HTMLSelectElement>('test-scope')
  const targetSelect = element<HTMLSelectElement>('test-target')
  const addressControls = element<HTMLDivElement>('test-address-controls')
  const previousButton = element<HTMLButtonElement>('test-address-previous')
  const nextButton = element<HTMLButtonElement>('test-address-next')
  const addressIndex = element<HTMLInputElement>('test-address-index')
  const addressGo = element<HTMLButtonElement>('test-address-go')
  const fitButton = element<HTMLButtonElement>('test-fit')
  const actualButton = element<HTMLButtonElement>('test-actual-size')
  const zoomOutButton = element<HTMLButtonElement>('test-zoom-out')
  const zoomInButton = element<HTMLButtonElement>('test-zoom-in')
  const cursorStatus = element<HTMLSpanElement>('test-cursor-status')
  const zoomStatus = element<HTMLSpanElement>('test-zoom-indicator')
  const healthStatus = element<HTMLSpanElement>('test-health-status')

  let active = false
  let pattern: TestPatternId = 'white'
  let scope: TestScope = { kind: 'composition', target: null }
  let walkOrdinal = 0
  let scene = buildTestScene(options.getProject())
  let walkSpace = buildTestWalkSpace(options.getProject(), scene, scope)
  let walkPixel: TestWalkPixel | null = null
  let frame: TestFrame = evaluateTestPattern(scene, { pattern, scope, walkPixel })
  let camera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 }
  let pan: Point | null = null
  let spaceDown = false
  let sourceReference = options.getProject().source

  function project(): Project {
    return options.getProject()
  }

  function availability(): string | null {
    return testPatternAvailability(scene, pattern)
  }

  function scopeValid(): boolean {
    if (scope.kind === 'composition') return true
    if ((scope.kind === 'receiver' || scope.kind === 'port') && !scene.hardwareReady) return false
    return testScopeTargets(scene, scope.kind).some(target => target.id === scope.target)
  }

  function normalizeScope(): void {
    if (scopeValid()) return
    scope = { kind: 'composition', target: null }
    walkOrdinal = 0
  }

  function updateFrame(): void {
    normalizeScope()
    walkSpace = buildTestWalkSpace(project(), scene, scope)
    walkOrdinal = Math.max(0, Math.min(walkOrdinal, Math.max(0, walkSpace.total - 1)))
    walkPixel = pattern === 'address-walk' && availability() === null
      ? resolveTestWalkPixel(project(), walkSpace, walkOrdinal)
      : null
    frame = evaluateTestPattern(scene, { pattern, scope, walkPixel })
  }

  function fit(): void {
    const rect = canvas.getBoundingClientRect()
    camera = fitCamera({
      left: frame.bounds.x,
      top: frame.bounds.y,
      right: frame.bounds.x + frame.bounds.width,
      bottom: frame.bounds.y + frame.bounds.height,
      width: frame.bounds.width,
      height: frame.bounds.height,
    }, rect.width, rect.height)
    draw()
  }

  function draw(): void {
    if (!active) return
    drawTestFrame(canvas, frame, camera)
    zoomStatus.textContent = `${Math.round(camera.zoom * 100)}%`
  }

  function renderPatterns(): void {
    patternList.replaceChildren()
    const groups: TestPatternGroup[] = ['Basic', 'Geometry', 'LedMAP diagnostics', 'Address Walk']
    for (const groupName of groups) {
      const container = document.createElement('section')
      container.className = 'test-pattern-group'
      const heading = document.createElement('h2')
      heading.textContent = groupName
      container.append(heading)
      for (const definition of TEST_PATTERN_DEFINITIONS.filter(value => value.group === groupName)) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset['testPattern'] = definition.id
        button.textContent = definition.name
        button.setAttribute('aria-pressed', String(pattern === definition.id))
        const reason = testPatternAvailability(scene, definition.id)
        button.disabled = reason !== null
        if (reason) button.title = reason
        button.addEventListener('click', () => {
          pattern = definition.id
          walkOrdinal = 0
          render()
        })
        container.append(button)
      }
      patternList.append(container)
    }
  }

  function renderScope(): void {
    scopeSelect.value = scope.kind
    const hardwareDisabled = !scene.hardwareReady
    for (const kind of ['receiver', 'port'] as const) {
      const option = scopeSelect.querySelector<HTMLOptionElement>(`option[value="${kind}"]`)
      if (option) {
        option.disabled = hardwareDisabled
        option.title = hardwareDisabled ? scene.hardwareReason ?? 'Complete Hardware first.' : ''
      }
    }
    targetSelect.replaceChildren()
    const targets = testScopeTargets(scene, scope.kind)
    if (scope.kind === 'composition') {
      const option = document.createElement('option')
      option.textContent = 'Entire Composition'
      targetSelect.append(option)
      targetSelect.disabled = true
    } else {
      for (const target of targets) {
        const option = document.createElement('option')
        option.value = target.id
        option.textContent = target.label
        targetSelect.append(option)
      }
      targetSelect.disabled = targets.length === 0
      targetSelect.value = scope.target ?? targets[0]?.id ?? ''
    }
  }

  function renderAddressControls(): void {
    const visible = pattern === 'address-walk'
    addressControls.hidden = !visible
    if (!visible) return
    const ready = availability() === null && walkSpace.total > 0 && walkPixel !== null
    previousButton.disabled = !ready || walkOrdinal === 0
    nextButton.disabled = !ready || walkOrdinal >= walkSpace.total - 1
    addressIndex.disabled = !ready
    addressGo.disabled = !ready
    addressIndex.max = ready
      ? String(scope.kind === 'port' || scope.kind === 'receiver' ? Math.max(...walkSpace.spans.map(span => span.dataIndexBase + span.pixelCount - 1)) : walkSpace.total - 1)
      : '0'
    addressIndex.value = String(scope.kind === 'port' || scope.kind === 'receiver' ? walkPixel?.dataIndex ?? 0 : walkOrdinal)
  }

  function renderInspector(): void {
    properties.replaceChildren()
    const definition = TEST_PATTERN_DEFINITIONS.find(value => value.id === pattern)!
    inspectorTitle.textContent = definition.name
    const status = document.createElement('div')
    status.append(
      row('Pattern', definition.name),
      row('Scope', scopeLabels[scope.kind]),
      row('Target', scope.target ?? 'Entire Composition'),
      row('Cabinets', frame.scopedCabinets.length.toLocaleString('en-US')),
      row('State', 'Session only'),
    )
    properties.append(group('Test configuration', status))
    if (walkPixel) {
      const path = document.createElement('div')
      path.append(
        row('Input', formatPoint(walkPixel.input)),
        row('Screen', `${walkPixel.screenName} · ${formatPoint(walkPixel.screenCoordinate)}`),
        row('Cabinet', `${walkPixel.cabinet} · ${formatPoint(walkPixel.cabinetCoordinate)}`),
        row('Module', `${walkPixel.module} · ${formatPoint(walkPixel.moduleCoordinate)}`),
        row('Receiver', walkPixel.receiver),
        row('Port', walkPixel.port),
        row('Processor', walkPixel.processor),
        row('dataIndex', walkPixel.dataIndex.toLocaleString('en-US')),
      )
      const chain = document.createElement('p')
      chain.className = 'test-walk-chain'
      chain.textContent = 'Input → Screen → Cabinet → Module → Receiver → Port → Processor → dataIndex'
      properties.append(group('Address Walk', chain, path))
    }
    const readiness = document.createElement('div')
    readiness.append(
      row('Geometry', scene.mappingReady ? 'Ready' : 'Incomplete'),
      row('Hardware', scene.hardwareReady ? 'Ready' : 'Incomplete'),
    )
    properties.append(group('Readiness', readiness))
  }

  function render(): void {
    updateFrame()
    renderPatterns()
    renderScope()
    renderAddressControls()
    renderInspector()
    const definition = TEST_PATTERN_DEFINITIONS.find(value => value.id === pattern)!
    canvasTitle.textContent = `${definition.name} · ${scope.target ?? scopeLabels[scope.kind]}`
    const reason = availability()
    patternReason.textContent = reason ?? 'Pattern evaluation is deterministic and uses session-only controls.'
    healthStatus.textContent = reason ?? `${definition.name} ready`
    empty.hidden = scene.screens.length > 0
    canvas.hidden = scene.screens.length === 0
    draw()
  }

  scopeSelect.addEventListener('change', () => {
    const kind = scopeSelect.value as TestScopeKind
    const target = testScopeTargets(scene, kind)[0]?.id ?? null
    scope = { kind, target }
    walkOrdinal = 0
    render()
  })
  targetSelect.addEventListener('change', () => {
    scope = { ...scope, target: targetSelect.value }
    walkOrdinal = 0
    render()
  })
  previousButton.addEventListener('click', () => {
    walkOrdinal = Math.max(0, walkOrdinal - 1)
    render()
  })
  nextButton.addEventListener('click', () => {
    walkOrdinal = Math.min(Math.max(0, walkSpace.total - 1), walkOrdinal + 1)
    render()
  })
  function goToAddress(): void {
    const value = Number(addressIndex.value)
    const ordinal = scope.kind === 'port' || scope.kind === 'receiver'
      ? walkOrdinalForDataIndex(walkSpace, value)
      : Number.isSafeInteger(value) ? value : null
    if (ordinal === null || ordinal < 0 || ordinal >= walkSpace.total) {
      addressIndex.setAttribute('aria-invalid', 'true')
      return
    }
    addressIndex.removeAttribute('aria-invalid')
    walkOrdinal = ordinal
    render()
  }
  addressGo.addEventListener('click', goToAddress)
  addressIndex.addEventListener('keydown', event => { if (event.key === 'Enter') goToAddress() })
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

  function viewportPoint(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 1 && !spaceDown) return
    pan = viewportPoint(event)
    canvas.classList.add('dragging')
    canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  })
  canvas.addEventListener('pointermove', event => {
    const current = viewportPoint(event)
    const source = toProject(camera, current)
    cursorStatus.textContent = `Composition X ${Math.floor(source.x)} · Y ${Math.floor(source.y)}`
    if (!pan) return
    camera = { ...camera, offsetX: camera.offsetX + current.x - pan.x, offsetY: camera.offsetY + current.y - pan.y }
    pan = current
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
    if (!active || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
    if (event.code === 'Space') {
      spaceDown = true
      canvas.classList.add('space-grab')
      event.preventDefault()
    }
    if (pattern === 'address-walk' && event.key === 'ArrowLeft') previousButton.click()
    if (pattern === 'address-walk' && event.key === 'ArrowRight') nextButton.click()
  })
  window.addEventListener('keyup', event => {
    if (event.code !== 'Space') return
    spaceDown = false
    canvas.classList.remove('space-grab')
  })
  window.addEventListener('resize', () => { if (active) draw() })

  function dump(): TestHookDump {
    return {
      pattern,
      scope: { ...scope },
      hardwareReady: scene.hardwareReady,
      mappingReady: scene.mappingReady,
      scopedCabinets: [...frame.scopedCabinets],
      primitiveKinds: frame.primitives.map(primitive => primitive.kind),
      solidColors: frame.primitives.flatMap(primitive => primitive.kind === 'rect' && primitive.fill ? [primitive.fill] : []),
      walk: walkPixel ? { ...walkPixel } : null,
    }
  }

  const hook: TestHook = { dump, camera: () => ({ ...camera }) }
  ;(window as Window & { __ledmapTest?: TestHook }).__ledmapTest = hook

  return {
    activate: () => {
      active = true
      render()
      requestAnimationFrame(fit)
    },
    deactivate: () => { active = false },
    projectChanged: () => {
      if (sourceReference === project().source) {
        if (active) render()
        return
      }
      sourceReference = project().source
      scene = buildTestScene(project())
      render()
    },
  }
}
