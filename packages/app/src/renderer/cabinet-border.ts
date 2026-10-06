import type { TestBounds } from '../shared/test-engine.js'
import type { Camera } from './canvas.js'

export function drawCabinetBorder(ctx: CanvasRenderingContext2D, camera: Camera, bounds: TestBounds, color: string, dashed = false): void {
  const transform = ctx.getTransform()
  const left = Math.round((bounds.x * camera.zoom + camera.offsetX) * transform.a + transform.e)
  const top = Math.round((bounds.y * camera.zoom + camera.offsetY) * transform.d + transform.f)
  const right = Math.round(((bounds.x + bounds.width) * camera.zoom + camera.offsetX) * transform.a + transform.e)
  const bottom = Math.round(((bounds.y + bounds.height) * camera.zoom + camera.offsetY) * transform.d + transform.f)
  const width = right - left
  const height = bottom - top
  if (width < 1 || height < 1) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.setLineDash(dashed ? [4, 3] : [])
  if (width === 1 || height === 1) {
    ctx.fillStyle = color
    ctx.fillRect(left, top, width, height)
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.lineJoin = 'miter'
    ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1)
  }
  ctx.restore()
}
