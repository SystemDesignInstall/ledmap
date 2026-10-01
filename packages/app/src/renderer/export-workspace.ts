import {
  preflightV2GenericMapping, selectGenericMappingExportInput,
  type V2GenericMappingFormat, type V2GenericMappingScope,
} from '../shared/v2-export-engine.js'
import { buildPngExportPlan, type PngExportMode } from '../shared/png-export.js'
import { TEST_PATTERN_DEFINITIONS, type TestPatternGroup, type TestPatternId } from '../shared/test-engine.js'
import { renderPngJob } from './export-image.js'
import type { LedMapProjectV2 } from '@ledmap/core'
import type { TestWorkspaceSnapshot } from './test-workspace.js'

interface ExportWorkspaceOptions {
  readonly getProjectV2: () => LedMapProjectV2
  readonly getTestSnapshot: () => TestWorkspaceSnapshot
  readonly getSelectedScreenId: () => string | null
  readonly showError: (error: unknown, fallback: string) => void
  readonly clearError: () => void
}

export interface ExportWorkspace {
  activate(): void
  deactivate(): void
  projectChanged(): void
}

interface ExportHook {
  dump(): {
    readonly ready: boolean
    readonly pixelCount: number
    readonly stages: ReadonlyArray<{ readonly id: string; readonly status: string; readonly diagnostics: readonly string[] }>
    readonly pngReady: boolean
    readonly pngJobs: number
    readonly pattern: string
    readonly genericScope: V2GenericMappingScope
    readonly lastResult: string
  }
  simulateCancel(): Promise<boolean>
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing element: ${id}`)
  return found as T
}

function option(value: string, label: string): HTMLOptionElement {
  const result = document.createElement('option')
  result.value = value
  result.textContent = label
  return result
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function fileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'screen'
}

export function createExportWorkspace(options: ExportWorkspaceOptions): ExportWorkspace {
  const patternSelect = element<HTMLSelectElement>('export-png-pattern')
  const pngScopeSelect = element<HTMLSelectElement>('export-png-scope')
  const pngScreenSelect = element<HTMLSelectElement>('export-png-screen')
  const pngScreenField = element<HTMLLabelElement>('export-png-screen-field')
  const pngButton = element<HTMLButtonElement>('export-png-run')
  const jsonButton = element<HTMLButtonElement>('export-json-run')
  const csvButton = element<HTMLButtonElement>('export-csv-run')
  const genericScopeSelect = element<HTMLSelectElement>('export-generic-scope')
  const genericScreenSelect = element<HTMLSelectElement>('export-generic-screen')
  const genericScreenField = element<HTMLLabelElement>('export-generic-screen-field')
  const preflightElement = element<HTMLDivElement>('export-preflight')
  const pngDiagnostics = element<HTMLDivElement>('export-png-diagnostics')
  const mappingSummary = element<HTMLDivElement>('export-mapping-summary')
  const resultElement = element<HTMLDivElement>('export-result')
  const pixelCountElement = element<HTMLSpanElement>('export-pixel-count')
  let active = false
  let busy = false
  let pattern: TestPatternId = options.getTestSnapshot().frame.pattern
  let patternCustomized = false
  let pngMode: PngExportMode = 'composition'
  let pngScreenId: string | null = null
  let genericScope: V2GenericMappingScope = { kind: 'composition' }
  let genericScreenId: string | null = null
  let lastResult = 'No export has run in this session.'

  for (const group of ['Basic', 'Geometry', 'LedMAP diagnostics', 'Address Walk'] as const satisfies readonly TestPatternGroup[]) {
    const optgroup = document.createElement('optgroup')
    optgroup.label = group
    for (const definition of TEST_PATTERN_DEFINITIONS.filter(value => value.group === group)) {
      optgroup.append(option(definition.id, definition.name))
    }
    patternSelect.append(optgroup)
  }

  function selectedScreenFallback(): string | null {
    const project = options.getProjectV2()
    const selected = options.getSelectedScreenId()
    return selected && project.design.screens.some(screen => screen.id === selected)
      ? selected
      : project.design.screens[0]?.id ?? null
  }

  function normalizeScreens(): void {
    const ids = new Set<string>(options.getProjectV2().design.screens.map(screen => screen.id))
    if (!pngScreenId || !ids.has(pngScreenId)) pngScreenId = selectedScreenFallback()
    if (!genericScreenId || !ids.has(genericScreenId)) genericScreenId = selectedScreenFallback()
  }

  function renderScreenSelect(select: HTMLSelectElement, selected: string | null): void {
    const project = options.getProjectV2()
    select.replaceChildren(...project.design.screens.map(screen => option(screen.id, `${screen.name} · ${screen.id}`)))
    if (selected) select.value = selected
    select.disabled = project.design.screens.length === 0
  }

  function currentGenericScope(): V2GenericMappingScope {
    return genericScope.kind === 'screen' && genericScreenId
      ? { kind: 'screen', screenId: genericScreenId }
      : { kind: 'composition' }
  }

  function currentPngPlan() {
    const snapshot = options.getTestSnapshot()
    return buildPngExportPlan(snapshot.scene, {
      pattern,
      currentScope: snapshot.scope,
      walkPixel: snapshot.frame.walkPixel,
      mode: pngMode,
      screenId: pngScreenId,
    })
  }

  function renderPreflight(): ReturnType<typeof preflightV2GenericMapping> {
    const report = preflightV2GenericMapping(selectGenericMappingExportInput(options.getProjectV2()), currentGenericScope())
    preflightElement.replaceChildren(...report.stages.map(value => {
      const card = document.createElement('section')
      card.className = `export-stage ${value.status}`
      const heading = document.createElement('div')
      heading.className = 'export-stage-heading'
      const name = document.createElement('strong')
      name.textContent = value.id[0]!.toUpperCase() + value.id.slice(1)
      const state = document.createElement('span')
      state.textContent = value.status === 'ready' ? 'Ready' : 'Blocked'
      heading.append(name, state)
      const detail = document.createElement('p')
      detail.textContent = value.diagnostics[0]?.message ?? (
        value.id === 'remap' ? 'Identity Remap · empty rule set' : 'No blocking diagnostics.'
      )
      card.append(heading, detail)
      return card
    }))
    pixelCountElement.textContent = report.ready ? `${formatCount(report.pixelCount)} pixels` : 'Blocked'
    return report
  }

  function render(): void {
    normalizeScreens()
    patternSelect.value = pattern
    pngScopeSelect.value = pngMode
    genericScopeSelect.value = genericScope.kind
    renderScreenSelect(pngScreenSelect, pngScreenId)
    renderScreenSelect(genericScreenSelect, genericScreenId)
    pngScreenField.hidden = pngMode !== 'screen'
    genericScreenField.hidden = genericScope.kind !== 'screen'
    const report = renderPreflight()
    const pngPlan = currentPngPlan()
    pngDiagnostics.textContent = pngPlan.ready
      ? `${pngPlan.jobs.length} file${pngPlan.jobs.length === 1 ? '' : 's'} · actual pixel resolution · ${formatCount(pngPlan.jobs.reduce((sum, job) => sum + job.bounds.width * job.bounds.height, 0))} output pixels`
      : pngPlan.diagnostics.join(' ')
    mappingSummary.textContent = report.ready
      ? `${formatCount(report.pixelCount)} deterministic rows. JSON and CSV use identical traversal and project-wide port-local dataIndex values.`
      : 'Resolve the blocked preflight stages before exporting Generic Mapping files.'
    pngButton.disabled = busy || !pngPlan.ready
    jsonButton.disabled = busy || !report.ready
    csvButton.disabled = busy || !report.ready
    resultElement.textContent = lastResult
  }

  async function exportPng(): Promise<void> {
    const plan = currentPngPlan()
    if (!plan.ready) return
    busy = true
    lastResult = 'Rendering TestFrame PNG…'
    render()
    options.clearError()
    try {
      const files = []
      for (const job of plan.jobs) files.push({ name: job.name, bytes: await renderPngJob(job) })
      const result = await window.ledmapDesktop.writeExportFiles({
        mode: plan.jobs.length === 1 ? 'single' : 'batch',
        files,
      })
      lastResult = result.canceled ? 'PNG export canceled.' : `Exported ${result.filePaths.length} PNG file${result.filePaths.length === 1 ? '' : 's'}.`
    } catch (error) {
      lastResult = error instanceof Error ? error.message : 'Unable to export PNG.'
      options.showError(error, 'Unable to export PNG.')
    } finally {
      busy = false
      render()
    }
  }

  async function exportMapping(format: V2GenericMappingFormat): Promise<void> {
    const input = selectGenericMappingExportInput(options.getProjectV2())
    const scope = currentGenericScope()
    const report = preflightV2GenericMapping(input, scope)
    if (!report.ready) return
    busy = true
    lastResult = `Writing Generic Mapping ${format.toUpperCase()}…`
    render()
    options.clearError()
    try {
      const suffix = scope.kind === 'screen' && genericScreenId ? `-${fileSegment(genericScreenId)}` : ''
      const result = await window.ledmapDesktop.writeGenericMapping({
        input,
        scope,
        format,
        name: `ledmap-generic-mapping${suffix}.${format}`,
      })
      lastResult = result.canceled ? `${format.toUpperCase()} export canceled.` : `Exported ${format.toUpperCase()} · ${formatCount(report.pixelCount)} rows.`
    } catch (error) {
      lastResult = error instanceof Error ? error.message : `Unable to export ${format.toUpperCase()}.`
      options.showError(error, `Unable to export ${format.toUpperCase()}.`)
    } finally {
      busy = false
      render()
    }
  }

  patternSelect.addEventListener('change', () => {
    pattern = patternSelect.value as TestPatternId
    patternCustomized = true
    render()
  })
  pngScopeSelect.addEventListener('change', () => {
    pngMode = pngScopeSelect.value as PngExportMode
    render()
  })
  pngScreenSelect.addEventListener('change', () => {
    pngScreenId = pngScreenSelect.value
    render()
  })
  genericScopeSelect.addEventListener('change', () => {
    genericScope = genericScopeSelect.value === 'screen' && genericScreenId
      ? { kind: 'screen', screenId: genericScreenId }
      : { kind: 'composition' }
    render()
  })
  genericScreenSelect.addEventListener('change', () => {
    genericScreenId = genericScreenSelect.value
    genericScope = { kind: 'screen', screenId: genericScreenId }
    render()
  })
  pngButton.addEventListener('click', () => { void exportPng() })
  jsonButton.addEventListener('click', () => { void exportMapping('json') })
  csvButton.addEventListener('click', () => { void exportMapping('csv') })

  const hook: ExportHook = {
    dump: () => {
      const report = preflightV2GenericMapping(selectGenericMappingExportInput(options.getProjectV2()), currentGenericScope())
      const pngPlan = currentPngPlan()
      return {
        ready: report.ready,
        pixelCount: report.pixelCount,
        stages: report.stages.map(value => ({
          id: value.id,
          status: value.status,
          diagnostics: value.diagnostics.map(item => item.message),
        })),
        pngReady: pngPlan.ready,
        pngJobs: pngPlan.jobs.length,
        pattern,
        genericScope: currentGenericScope(),
        lastResult,
      }
    },
    simulateCancel: () => window.ledmapDesktop.simulateExportCancel(),
  }
  ;(window as Window & { __ledmapExport?: ExportHook }).__ledmapExport = hook

  return {
    activate: () => {
      active = true
      if (!patternCustomized) pattern = options.getTestSnapshot().frame.pattern
      render()
    },
    deactivate: () => { active = false },
    projectChanged: () => { if (active) render() },
  }
}
