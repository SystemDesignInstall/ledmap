import type { LiveOutputFrameUpdate } from '../shared/ipc.js'
import { calculateLiveOutputCamera } from '../shared/live-output.js'
import { drawClippedTestFrame } from './test-canvas.js'
import type { Camera } from './canvas.js'

const canvasElement = document.getElementById('output-canvas')
if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error('Missing Live Output canvas.')
const canvas: HTMLCanvasElement = canvasElement

let current: LiveOutputFrameUpdate | null = null

function outputCamera(update: LiveOutputFrameUpdate): Camera {
  const rect = canvas.getBoundingClientRect()
  return calculateLiveOutputCamera(rect, update.region, update.scaleMode, update.displayScaleFactor)
}

function render(): void {
  if (!current) return
  drawClippedTestFrame(canvas, current.frame, outputCamera(current), current.region)
}

window.ledmapOutput.onFrame(update => {
  current = update
  render()
})

new ResizeObserver(render).observe(canvas)

const hook = {
  dump: () => current ? {
    outputId: current.outputId,
    displayId: current.displayId,
    revision: current.revision,
    pattern: current.frame.pattern,
    scope: current.frame.scope,
    region: { ...current.region },
    scaleMode: current.scaleMode,
    dataIndex: current.frame.walkPixel?.dataIndex ?? null,
    solidColors: current.frame.primitives.flatMap(primitive => primitive.kind === 'rect' && primitive.fill ? [primitive.fill] : []),
  } : null,
}
;(window as Window & { __ledmapOutput?: typeof hook }).__ledmapOutput = hook
