import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const output = resolve(appRoot, 'out', 'smoke')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(resolve(output, 'upgrade-'))

const legacy = JSON.stringify({
  format: 'ledmap', schemaVersion: 2,
  project: {
    inputCanvas: null, screens: [], cabinetGrids: [], mappingRegions: [],
    hardwareTopology: { processors: [], ports: [], receivers: [], cabinets: [], modules: [],
      processorOrder: [], receiverOrder: [] },
    rules: [], editorLayout: { screenPositions: [] },
  },
  extensions: { 'vendor.unknown': { ordered: [3, 1, 2] } },
}, null, 2) + '\n'

async function close(application) {
  const child = application.process()
  await application.evaluate(({ app }) => {
    setTimeout(() => app.exit(0), 0)
    return true
  }).catch(() => false)
  const deadline = Date.now() + 3000
  while (child.exitCode === null && Date.now() < deadline) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
  if (child.exitCode === null) child.kill()
}

async function scenario(action, name, saveAsPath = null) {
  const legacyPath = resolve(directory, `${name}.ledmap`)
  const userData = resolve(directory, `${name}-user-data`)
  await mkdir(userData, { recursive: true })
  await writeFile(legacyPath, legacy, 'utf8')
  const env = { ...process.env, LEDMAP_SMOKE_PROJECT_PATH: legacyPath, LEDMAP_SMOKE_UPGRADE_ACTION: action,
    LEDMAP_SMOKE_USER_DATA: userData,
    ...(saveAsPath ? { LEDMAP_SMOKE_SAVE_AS_PATH: saveAsPath } : {}) }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({ args: [appRoot], env })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => window.__ledmap !== undefined)
    await page.locator('#open-project').click()
    await page.waitForFunction(() => window.__ledmap.document().sourceSchemaVersion === 2)
    await page.locator('#save-project').click()
    if (action === 'cancel') {
      await page.waitForTimeout(400)
      assert.equal((await page.evaluate(() => window.__ledmap.document())).sourceSchemaVersion, 2)
      assert.equal(await readFile(legacyPath, 'utf8'), legacy)
    } else if (action === 'save-as' && saveAsPath === legacyPath) {
      await page.locator('#document-error').waitFor({ state: 'visible' })
      assert.match(await page.locator('#document-error').innerText(), /different path/i)
      assert.equal((await page.evaluate(() => window.__ledmap.document())).sourceSchemaVersion, 2)
      assert.equal(await readFile(legacyPath, 'utf8'), legacy)
    } else {
      await page.waitForFunction(() => window.__ledmap.document().sourceSchemaVersion === 4)
      const target = action === 'save-as' ? saveAsPath : legacyPath
      assert.ok(target)
      const stored = JSON.parse(await readFile(target, 'utf8'))
      assert.equal(stored.schemaVersion, 4)
      assert.deepEqual(stored.extensions['vendor.unknown'].ordered, [3, 1, 2])
      if (action === 'save-as') {
        assert.equal(await readFile(legacyPath, 'utf8'), legacy)
        assert.equal((await page.evaluate(() => window.__ledmap.document())).currentFilePath, saveAsPath)
      }
    }
  } finally {
    await close(app)
  }
}

await scenario('cancel', 'cancel')
await scenario('upgrade', 'upgrade')
await scenario('save-as', 'save-as', resolve(directory, 'new-v3.ledmap'))
const protectedPath = resolve(directory, 'protected.ledmap')
await scenario('save-as', 'protected', protectedPath)
console.log('Electron upgrade smoke passed: Cancel, in-place V4 upgrade, Save As preservation and same-path protection.')
process.exit(0)
