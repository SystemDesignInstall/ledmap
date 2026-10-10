import type { NdiOutputState } from '../shared/ipc.js'
import { planNdiStreams, type NdiStreamPlan } from '../shared/ndi-output-plan.js'
import type { TestWorkspaceSnapshot } from './test-workspace.js'

export interface NdiOutputController {
  frameChanged(snapshot: TestWorkspaceSnapshot): void
}

interface ActiveStream {
  readonly name: string
  readonly region: NdiStreamPlan['region']
  readonly fps: 25 | 30 | 60
}

export function createNdiOutputController(dialog: HTMLDialogElement): NdiOutputController {
  const panel = document.createElement('section')
  panel.className = 'ndi-output-panel'
  const header = document.createElement('div')
  header.className = 'dialog-heading'
  const heading = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = 'NDI Output'
  const description = document.createElement('p')
  description.textContent = 'One stream for the whole composition plus an independent stream for each Screen. Windows x64.'
  const trademark = document.createElement('p')
  trademark.textContent = 'NDI® is a registered trademark of Vizrt NDI AB. '
  const ndiLink = document.createElement('a')
  ndiLink.href = 'https://ndi.video/'
  ndiLink.target = '_blank'
  ndiLink.rel = 'noopener noreferrer'
  ndiLink.textContent = 'ndi.video'
  trademark.append(ndiLink)
  heading.append(title, description, trademark)
  const fpsLabel = document.createElement('label')
  fpsLabel.textContent = 'FPS '
  const fpsSelect = document.createElement('select')
  fpsSelect.setAttribute('aria-label', 'NDI frame rate')
  for (const fps of [25, 30, 60]) {
    const option = document.createElement('option')
    option.value = String(fps)
    option.textContent = String(fps)
    fpsSelect.append(option)
  }
  fpsSelect.value = '30'
  fpsLabel.append(fpsSelect)
  header.append(heading, fpsLabel)
  const content = document.createElement('div')
  content.className = 'live-output-list'
  panel.append(header, content)
  const dialogActions = dialog.querySelector('.dialog-actions')
  dialogActions?.parentElement?.insertBefore(panel, dialogActions)

  let snapshot: TestWorkspaceSnapshot | null = null
  const running = new Map<string, ActiveStream>()
  const pending = new Set<string>()
  const messages = new Map<string, string>()
  let lastPlan: readonly NdiStreamPlan[] = []
  const fps = (): 25 | 30 | 60 => Number(fpsSelect.value) as 25 | 30 | 60

  function applyState(state: NdiOutputState): void {
    if (!state.running) running.delete(state.streamId)
    if (state.reason) messages.set(state.streamId, state.reason)
    render()
  }

  async function stop(id: string): Promise<void> {
    if (pending.has(id)) return
    pending.add(id)
    render()
    try {
      applyState(await window.ledmapDesktop.stopNdiOutput(id))
      running.delete(id)
    } catch (error) {
      messages.set(id, error instanceof Error ? error.message : 'Unable to stop NDI stream.')
    } finally {
      pending.delete(id)
      render()
    }
  }

  async function start(plan: NdiStreamPlan): Promise<void> {
    if (!snapshot || pending.has(plan.id)) return
    pending.add(plan.id)
    messages.delete(plan.id)
    render()
    try {
      const selectedFps = fps()
      const state = await window.ledmapDesktop.startNdiOutput({
        streamId: plan.id, streamName: plan.name,
        region: plan.region, fps: selectedFps, frame: snapshot.frame,
      })
      if (state.running) running.set(plan.id, { name: plan.name, region: plan.region, fps: selectedFps })
      applyState(state)
    } catch (error) {
      running.delete(plan.id)
      messages.set(plan.id, error instanceof Error ? error.message : 'Unable to start NDI stream.')
    } finally {
      pending.delete(plan.id)
      render()
    }
  }

  function render(): void {
    lastPlan = snapshot ? planNdiStreams(snapshot.scene) : []
    content.replaceChildren()
    if (!lastPlan.length) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = 'Add a Screen to enable NDI Output.'
      content.append(empty)
      return
    }
    for (const plan of lastPlan) {
      const card = document.createElement('section')
      card.className = 'live-output-card'
      card.dataset['ndiStreamId'] = plan.id
      const title = document.createElement('strong')
      title.textContent = plan.name
      const details = document.createElement('p')
      details.className = 'hint'
      details.textContent = `${plan.region.width} × ${plan.region.height} px · X ${plan.region.x}, Y ${plan.region.y} · ${running.get(plan.id)?.fps ?? fps()} FPS`
      const status = document.createElement('span')
      status.className = 'live-output-state'
      status.textContent = pending.has(plan.id) ? 'Working…' : running.has(plan.id) ? 'Running' : 'Stopped'
      const action = document.createElement('button')
      action.type = 'button'
      action.disabled = pending.has(plan.id)
      action.textContent = running.has(plan.id) ? 'Stop NDI' : 'Start NDI'
      action.addEventListener('click', () => {
        if (running.has(plan.id)) void stop(plan.id)
        else void start(plan)
      })
      const error = document.createElement('p')
      error.className = 'live-output-message'
      error.textContent = messages.get(plan.id) ?? ''
      card.append(title, details, status, action, error)
      content.append(card)
    }
  }

  async function sync(): Promise<void> {
    if (!snapshot) return
    const planned = new Map(planNdiStreams(snapshot.scene).map(plan => [plan.id, plan]))
    for (const [id, active] of [...running]) {
      if (pending.has(id)) continue
      const plan = planned.get(id)
      if (!plan || plan.region.width !== active.region.width ||
          plan.region.height !== active.region.height || plan.name !== active.name) {
        messages.set(id, 'Source changed; restart the NDI stream.')
        await stop(id)
        continue
      }
      try {
        const state = await window.ledmapDesktop.updateNdiOutput({
          streamId: id, region: plan.region, frame: snapshot.frame,
        })
        if (!state.running) applyState(state)
      } catch (error) {
        messages.set(id, error instanceof Error ? error.message : 'Unable to update NDI.')
        await stop(id)
      }
    }
    render()
  }

  fpsSelect.addEventListener('change', render)
  window.ledmapDesktop.onNdiOutputStateChanged(applyState)
  render()
  return {
    frameChanged(next) {
      snapshot = next
      void sync()
    },
  }
}
