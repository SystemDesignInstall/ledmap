// Generates a temporary placeholder icon for the Windows portable build.
// Replace packages/app/build/icon.ico with the brand icon when ready (see README, Portable section).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/app/build/icon.ico')

function draw(size) {
  const px = Buffer.alloc(size * size * 4, 0)
  const set = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = b
    px[i + 1] = g
    px[i + 2] = r
    px[i + 3] = 255
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) set(x, y, 0x15, 0x18, 0x1a)
  }
  // LED-wall accent: green / white / red mosaic in the center.
  const palette = [[0, 255, 0], [255, 255, 255], [255, 0, 0], [220, 81, 123]]
  const cells = 4
  const cell = Math.floor(size / (cells + 2))
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const [r, g, b] = palette[(cx + cy) % palette.length]
      const ox = cell + cx * cell
      const oy = cell + cy * cell
      for (let y = 0; y < cell - 1; y += 1) {
        for (let x = 0; x < cell - 1; x += 1) set(ox + x, oy + y, r, g, b)
      }
    }
  }
  return px
}

const sizes = [16, 32, 48, 256]
const images = sizes.map(size => ({ size, pixels: draw(size) }))
const headerSize = 6 + 16 * images.length
let offset = headerSize
const header = Buffer.alloc(headerSize)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
const bodies = []
for (const [index, image] of images.entries()) {
  const rowMask = Math.ceil(image.size / 32) * 4
  const bodySize = 40 + image.pixels.length + rowMask * image.size
  const base = 6 + index * 16
  const edge = image.size >= 256 ? 0 : image.size
  header.writeUInt8(edge, base)
  header.writeUInt8(edge, base + 1)
  header.writeUInt8(0, base + 2)
  header.writeUInt8(0, base + 3)
  header.writeUInt16LE(1, base + 4)
  header.writeUInt16LE(32, base + 6)
  header.writeUInt32LE(bodySize, base + 8)
  header.writeUInt32LE(offset, base + 12)
  offset += bodySize
  const info = Buffer.alloc(40)
  info.writeInt32LE(image.size, 0)
  info.writeInt32LE(image.size * 2, 4)
  info.writeUInt16LE(1, 8)
  info.writeUInt16LE(32, 10)
  info.writeUInt32LE(0, 12)
  info.writeUInt32LE(image.pixels.length, 16)
  // Bottom-up rows for BMP-based ICO.
  const flipped = Buffer.alloc(image.pixels.length)
  for (let y = 0; y < image.size; y += 1) {
    image.pixels.copy(flipped, y * image.size * 4, (image.size - 1 - y) * image.size * 4, (image.size - y) * image.size * 4)
  }
  const andMask = Buffer.alloc(rowMask * image.size, 0)
  bodies.push(Buffer.concat([info, flipped, andMask]))
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.concat([header, ...bodies]))
console.log(`Placeholder icon written: ${out}`)
