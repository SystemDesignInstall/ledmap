import type { PngExportJob } from '../shared/png-export.js'
import { drawTestFrameAtActualPixels } from './test-canvas.js'

const maxPngPixels = 64 * 1024 * 1024
const maxPngDimension = 32767

export async function renderPngJob(job: PngExportJob): Promise<Uint8Array> {
  if (job.bounds.width > maxPngDimension || job.bounds.height > maxPngDimension || job.bounds.width * job.bounds.height > maxPngPixels) {
    throw new Error(`PNG ${job.bounds.width}×${job.bounds.height} exceeds the safe renderer limit.`)
  }
  const canvas = document.createElement('canvas')
  drawTestFrameAtActualPixels(canvas, job.frame, job.bounds)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to encode PNG.')), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
