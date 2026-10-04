import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = resolve(appRoot, 'out', 'output-mapping-smoke')
await mkdir(output, { recursive: true })
const userData = await mkdtemp(resolve(output, 'user-data-'))
const projectPath = resolve(output, 'output-mapping.ledmap')
const errors = []

async function launch(recoveryAction = 'later', sourcePath = projectPath, dataPath = userData) {
  const env = { ...process.env,
    LEDMAP_SMOKE_PROJECT_PATH: sourcePath,
    LEDMAP_SMOKE_USER_DATA: dataPath,
    LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
    LEDMAP_SMOKE_RECOVERY_ACTION: recoveryAction,
    LEDMAP_SMOKE_UPGRADE_ACTION: 'upgrade',
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [appRoot], env })
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.waitForFunction(() => window.__ledmapOutputMapping !== undefined)
  return { app, page }
}

async function exit(app) {
  const child = app.process()
  if (child.exitCode === null && child.signalCode === null) child.kill()
  const deadline = Date.now() + 3_000
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null && child.signalCode === null) throw new Error('Electron smoke process did not exit.')
}

async function addScreen(page) {
  const before = await page.evaluate(() => window.__ledmap.dump().length)
  await page.locator('#add-screen').click()
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(count => window.__ledmap.dump().length === count + 1, before)
}

async function setNumber(page, label, value) {
  const input = page.locator(`input[aria-label="${label}"]`)
  await input.fill(String(value))
  await input.blur()
}

const dump = page => page.evaluate(() => window.__ledmapOutputMapping.dump())
const pixel = (page, outputId, x, y) => page.evaluate(
  ({ outputId, x, y }) => window.__ledmapOutputMapping.pixel(outputId, x, y), { outputId, x, y })

async function waitForRecovery(x) {
  const root = resolve(userData, 'recovery', 'v1')
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      for (const name of (await readdir(resolve(root, 'manifests'))).filter(value => value.endsWith('.json'))) {
        const manifest = JSON.parse(await readFile(resolve(root, 'manifests', name), 'utf8'))
        const payload = JSON.parse(await readFile(resolve(root, 'payloads', manifest.payloadFile), 'utf8'))
        if (payload.schemaVersion === 5 && payload.project.content.outputMappings[1]?.outputRect.x === x) return
      }
    } catch { }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error('Output Mapping V5 recovery snapshot was not created.')
}

let running = await launch()
let saved
try {
  const page = running.page
  await addScreen(page)
  await addScreen(page)
  await page.locator('#output-mapping-mode').click()
  await page.locator('#output-add-media').click()
  await page.waitForFunction(() => window.__ledmapOutputMapping.dump().outputs.length === 1)
  const outputId = (await dump(page)).outputs[0].id
  await page.locator('#output-add-mapping').click()
  await page.waitForFunction(() => window.__ledmapOutputMapping.dump().mappings.length === 1)
  await setNumber(page, 'Output position X', 10)
  await setNumber(page, 'Output position Y', 20)
  assert.deepEqual((await dump(page)).mappings[0].outputRect, { x: 10, y: 20 })
  assert.deepEqual(await pixel(page, outputId, 11, 22), { status: 'resolved',
    mappingId: 'output-mapping-1', screenId: 'screen-1', screenX: 1, screenY: 2 })
  const canvas = page.locator('#output-mapping-canvas')
  const bounds = await canvas.boundingBox()
  const start = await page.evaluate(() => window.__ledmapOutputMapping.viewPoint(20, 30))
  const end = await page.evaluate(() => window.__ledmapOutputMapping.viewPoint(120, 80))
  await page.mouse.move(bounds.x + start.x, bounds.y + start.y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + end.x, bounds.y + end.y, { steps: 4 })
  await page.mouse.up()
  assert.deepEqual((await dump(page)).mappings[0].outputRect, { x: 110, y: 70 })
  await page.locator('#undo-project').click()
  assert.deepEqual((await dump(page)).mappings[0].outputRect, { x: 10, y: 20 })
  await page.locator('#redo-project').click()
  assert.deepEqual((await dump(page)).mappings[0].outputRect, { x: 110, y: 70 })
  await page.locator('#output-add-mapping').click()
  await page.locator('select[aria-label="Mapped Screen"]').selectOption('screen-2')
  assert.equal((await pixel(page, outputId, 110, 70)).status, 'blocked')
  assert.match(await page.locator('#output-mapping-diagnostics').innerText(), /overlap/i)
  await setNumber(page, 'Output position X', 400)
  await setNumber(page, 'Output position Y', 100)
  assert.equal((await pixel(page, outputId, 400, 100)).status, 'resolved')
  await page.screenshot({ path: resolve(output, 'output-mapping-workspace.png') })
  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().dirty === false)
  saved = JSON.parse(await readFile(projectPath, 'utf8'))
  assert.equal(saved.schemaVersion, 5)
  assert.deepEqual(saved.project.content.outputMappings.map(value => ({ x: value.outputRect.x, y: value.outputRect.y })),
    [{ x: 110, y: 70 }, { x: 400, y: 100 }])
  await setNumber(page, 'Output position X', 500)
  await waitForRecovery(500)
  assert.deepEqual(errors, [])
} finally { await exit(running.app) }

running = await launch('recover')
try {
  const page = running.page
  await page.waitForFunction(() => window.__ledmapOutputMapping.dump().mappings[1]?.outputRect.x === 500)
  assert.equal((await page.evaluate(() => window.__ledmap.document())).dirty, true)
  assert.deepEqual(errors, [])
} finally { await exit(running.app) }

const legacy = structuredClone(saved)
legacy.schemaVersion = 4
for (const media of legacy.project.content.mediaOutputs) delete media.mappingOrder
legacy.project.content.outputMappings = legacy.project.content.outputMappings.map(mapping => ({
  id: mapping.id, screenId: mapping.screenId, mediaOutputId: mapping.mediaOutputId,
  position: { x: mapping.outputRect.x, y: mapping.outputRect.y },
}))
legacy.project.content.outputMappings = [legacy.project.content.outputMappings[0]]
const legacyPath = resolve(output, 'old-v4-output-mapping.ledmap')
await writeFile(legacyPath, JSON.stringify(legacy), 'utf8')
const legacyData = await mkdtemp(resolve(output, 'legacy-user-data-'))
running = await launch('later', legacyPath, legacyData)
try {
  const page = running.page
  await page.locator('#open-project').click()
  await page.waitForFunction(() => window.__ledmapOutputMapping.dump().mappings.length === 1)
  assert.equal((await page.evaluate(() => window.__ledmap.document())).sourceSchemaVersion, 4)
  await page.locator('#output-mapping-mode').click()
  await page.locator('#output-mapping-tree .output-tree-item').nth(1).click()
  assert.deepEqual({ x: (await dump(page)).mappings[0].outputRect.x, y: (await dump(page)).mappings[0].outputRect.y }, { x: 110, y: 70 })
  await page.locator('#save-project').click()
  await page.waitForFunction(() => window.__ledmap.document().sourceSchemaVersion === 5)
  const upgraded = JSON.parse(await readFile(legacyPath, 'utf8'))
  assert.equal(upgraded.schemaVersion, 5)
  assert.deepEqual({ x: upgraded.project.content.outputMappings[0].outputRect.x, y: upgraded.project.content.outputMappings[0].outputRect.y }, { x: 110, y: 70 })
  assert.deepEqual(errors, [])
} finally { await exit(running.app) }

console.log('Electron Output Mapping smoke passed: placement, pixel lookup, drag history, overlap, V5 Save, recovery and V4 upgrade.')
process.exit(0)
