import assert from 'node:assert/strict'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const coreEntry = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url))
const probeEntry = fileURLToPath(new URL('./v2-png-parity-probe.ts', import.meta.url))
const bundle = await build({
  entryPoints: [probeEntry],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'LedmapV2PngParity',
  alias: { '@ledmap/core': coreEntry },
  write: false,
})
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const bundlePath = resolve(appRoot, 'out/renderer/v2-png-parity-probe.js')
await writeFile(bundlePath, bundle.outputFiles[0].text)
const app = await electron.launch({ args: [appRoot], env })
let failure = null
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.addScriptTag({ url: pathToFileURL(bundlePath).href })
  const results = await page.evaluate(() => window.LedmapV2PngParity.runV2PngParity())
  assert.equal(results.length, 6)
  assert.deepEqual(results.map(value => value.pattern), [
    'checkerboard', 'horizontal-gradient', 'cabinet-order', 'receiver-labels', 'signal-flow', 'address-walk',
  ])
  console.log(`V2 PNG parity passed: ${results.map(value => `${value.pattern} ${value.width}x${value.height}/${value.pixels}`).join(', ')}`)
} catch (error) {
  failure = error
  console.error(error)
} finally {
  const child = app.process()
  const requestExit = app.evaluate(({ app: electronApp }) => {
    setTimeout(() => electronApp.exit(0), 0)
    return true
  }).catch(() => false)
  await Promise.race([requestExit, new Promise(resolvePromise => setTimeout(resolvePromise, 500))])
  const deadline = Date.now() + 3000
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null) child.kill()
  await unlink(bundlePath)
}
process.exit(failure === null ? 0 : 1)
