import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = resolve(appRoot, 'out', 'smoke')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(resolve(output, 'recovery-'))
const userData = resolve(directory, 'user-data')
await mkdir(userData)
const manifests = resolve(userData, 'recovery', 'v1', 'manifests')
const savedPath = resolve(directory, 'saved.ledmap')

async function launch(action = 'later', unsavedAction = 'cancel') {
  const env = { ...process.env, LEDMAP_SMOKE_USER_DATA: userData, LEDMAP_SMOKE_RECOVERY_ACTION: action,
    LEDMAP_SMOKE_UNSAVED_ACTION: unsavedAction, LEDMAP_SMOKE_PROJECT_PATH: savedPath }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [appRoot], env })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => window.__ledmap !== undefined)
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

async function recoveryFiles() {
  try { return (await readdir(manifests)).filter(name => name.endsWith('.json')) } catch { return [] }
}

async function waitForCount(count) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const names = await recoveryFiles()
    if (names.length === count) return names
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`Expected ${count} recovery manifests; found ${(await recoveryFiles()).length}.`)
}

async function addScreen(page, name) {
  await page.locator('#add-screen').click()
  await page.locator('#new-screen-name').fill(name)
  await page.locator('#screen-form button[type="submit"]').click()
  await page.waitForFunction(value => window.__ledmap.dump().some(screen => screen.name === value), name)
}

let running = await launch()
try {
  await addScreen(running.page, 'First recovery')
  await waitForCount(1)
  assert.equal((await running.page.evaluate(() => window.__ledmap.document())).dirty, true)
} finally { await exit(running.app) }

running = await launch('later')
try {
  assert.equal((await running.page.evaluate(() => window.__ledmap.document())).dirty, false)
  assert.equal((await recoveryFiles()).length, 1)
  await addScreen(running.page, 'Second recovery')
  await waitForCount(2)
} finally { await exit(running.app) }

running = await launch('recover')
try {
  await running.page.waitForFunction(() => window.__ledmap.document().dirty &&
    window.__ledmap.dump().some(screen => screen.name === 'Second recovery'))
  assert.equal((await running.page.evaluate(() => window.__ledmap.document())).currentFilePath, null)
  assert.equal((await recoveryFiles()).length, 2)
} finally { await exit(running.app) }

running = await launch('recover')
try {
  await running.page.waitForFunction(() => window.__ledmap.document().dirty &&
    window.__ledmap.dump().some(screen => screen.name === 'Second recovery'))
  assert.equal((await recoveryFiles()).length, 2)
  await running.page.locator('#save-project').click()
  await running.page.waitForFunction(() => window.__ledmap.document().dirty === false)
  await waitForCount(1)
  assert.equal(JSON.parse(await readFile(savedPath, 'utf8')).schemaVersion, 5)
} finally { await exit(running.app) }

running = await launch('recover')
try {
  await running.page.waitForFunction(() => window.__ledmap.document().dirty &&
    window.__ledmap.dump().some(screen => screen.name === 'First recovery'))
  assert.equal((await recoveryFiles()).length, 1)
} finally { await exit(running.app) }

const conflictSource = resolve(directory, 'conflict.ledmap')
await writeFile(conflictSource, 'external source bytes')
const conflictManifest = (await recoveryFiles())[0]
assert.ok(conflictManifest)
const manifestPath = resolve(manifests, conflictManifest)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.sourcePath = conflictSource
manifest.baselineSourceSha256 = '0'.repeat(64)
await writeFile(manifestPath, JSON.stringify(manifest))
running = await launch('recover')
try {
  await running.page.waitForFunction(() => window.__ledmap.document().dirty &&
    window.__ledmap.dump().some(screen => screen.name === 'First recovery'))
  assert.equal((await running.page.evaluate(() => window.__ledmap.document())).currentFilePath, null)
  assert.equal(await readFile(conflictSource, 'utf8'), 'external source bytes')
} finally { await exit(running.app) }

const discardUserData = resolve(directory, 'discard-user-data')
await mkdir(discardUserData)
const discardEnv = { ...process.env, LEDMAP_SMOKE_USER_DATA: discardUserData, LEDMAP_SMOKE_UNSAVED_ACTION: 'discard',
  LEDMAP_SMOKE_RECOVERY_ACTION: 'later' }
delete discardEnv.ELECTRON_RUN_AS_NODE
delete discardEnv.ELECTRON_RENDERER_URL
const discardApp = await electron.launch({ args: [appRoot], env: discardEnv })
try {
  const page = await discardApp.firstWindow()
  await page.waitForFunction(() => window.__ledmap !== undefined)
  await addScreen(page, 'Discard me')
  const discardManifests = resolve(discardUserData, 'recovery', 'v1', 'manifests')
  const deadline = Date.now() + 10_000
  while ((await readdir(discardManifests).catch(() => [])).length === 0 && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  assert.equal((await readdir(discardManifests)).length, 1)
  await discardApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const closedDeadline = Date.now() + 5_000
  while ((await readdir(discardManifests)).length > 0 && Date.now() < closedDeadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
  }
  assert.equal((await readdir(discardManifests)).length, 0)
} finally { await exit(discardApp) }

console.log('Electron recovery smoke passed: restart, Later, multiple candidates, Recover without deletion, second crash, Save, conflict copy and Discard close.')
process.exit(0)
