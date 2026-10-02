import { describe, expect, it } from 'vitest'
import {
  createEditableProject, loadLedMapProject, loadProjectV3, serializeEditableProject, serializeProjectV3,
} from '../../src/index.js'
import { minimalGoldenText } from './fixtures.js'

describe('v1/v2/v3 production document dispatch', () => {
  it('imports old v1 and v2 through the legacy path and reopens their native v3 Save', () => {
    const extension = { vendor: { ordered: [3, 1, 2] } }
    const v2 = serializeEditableProject({ project: createEditableProject(), extensions: extension })
    for (const [text, version] of [[minimalGoldenText, 1], [v2, 2]] as const) {
      const loaded = loadLedMapProject(text)
      expect(loaded.sourceSchemaVersion).toBe(version)
      const serialized = serializeProjectV3({ project: loaded.project, extensions: loaded.extensions })
      const reopened = loadLedMapProject(serialized)
      expect(reopened.sourceSchemaVersion).toBe(3)
      expect(reopened.project).toEqual(loaded.project)
      expect(reopened.extensions).toEqual(loaded.extensions)
      expect(loadProjectV3(serialized).project).toEqual(loaded.project)
    }
  })

  it('rejects unsupported versions without guessing their project shape', () => {
    expect(() => loadLedMapProject('{"format":"ledmap","schemaVersion":4,"project":null,"extensions":null}'))
      .toThrow(/SERIALIZATION_UNSUPPORTED_VERSION/)
  })
})
