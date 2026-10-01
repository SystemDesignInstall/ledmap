import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const coreRoot = resolve(appRoot, '..', '..', 'core', 'src')

function dependencies(entrypoints: readonly string[]): Set<string> {
  const visited = new Set<string>()
  const pending = [...entrypoints]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    const source = readFileSync(file, 'utf8')
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      if (!imported.fileName.startsWith('.')) continue
      const target = resolve(dirname(file), imported.fileName.replace(/\.js$/, '.ts'))
      if (existsSync(target)) pending.push(target)
    }
  }
  return visited
}

describe('V2 production dependency boundary', () => {
  it('keeps legacy editor reads outside the renderer and main runtime graph', () => {
    const runtime = dependencies([
      resolve(appRoot, 'renderer', 'index.ts'),
      resolve(appRoot, 'main', 'index.ts'),
      resolve(appRoot, 'preload', 'index.ts'),
    ])
    for (const legacy of [
      'renderer/project.ts',
      'renderer/mapping-project.ts',
      'renderer/hardware-project.ts',
      'renderer/test-project.ts',
      'shared/export-engine.ts',
    ]) {
      expect(runtime.has(resolve(appRoot, legacy)), legacy).toBe(false)
    }
    for (const file of runtime) {
      const source = readFileSync(file, 'utf8')
      if (file === resolve(appRoot, 'renderer', 'project-session.ts')) {
        expect(source).toContain('loadEditableProject(text)')
        expect(source).toContain('convertEditableProjectToV2(loaded.project)')
        expect(source).toContain('projectV2AsEditableReadModel(session.project)')
        expect(source).toContain('serializeEditableProject(')
        continue
      }
      expect(source, file).not.toMatch(/EditableProject|projectV2AsEditableReadModel|inspectEditableProject|commitLegacyProject/)
    }
  })

  it('keeps V2 validation and selectors independent of editor-project', () => {
    const nativeCore = dependencies([
      'read-projections.ts', 'direct-engine-inputs.ts', 'validate.ts', 'selectors.ts', 'create.ts',
    ].map(name => resolve(coreRoot, 'project-model', name)))
    for (const file of nativeCore) {
      expect(file).not.toContain(`${resolve(coreRoot, 'editor-project')}`)
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/EditableProject|projectV2AsEditableReadModel|inspectEditableProject/)
    }
  })
})
