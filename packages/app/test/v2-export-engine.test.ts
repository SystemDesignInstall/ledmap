import { convertEditableProjectToV2 } from '@ledmap/core'
import { describe, expect, it } from 'vitest'
import { genericMappingRows, preflightGenericMapping, serializeGenericMapping } from '../src/shared/export-engine.js'
import {
  genericMappingV2Rows, preflightV2GenericMapping, selectGenericMappingExportInput, serializeV2GenericMapping,
} from '../src/shared/v2-export-engine.js'
import { createTestProject } from './project-fixtures.js'
import { compactReadyProject } from './v2-parity-fixtures.js'

describe('direct V2 Generic Mapping export', () => {
  it('matches preflight stage status for incomplete and ready projects', () => {
    for (const legacy of [createTestProject(), compactReadyProject()]) {
      const input = selectGenericMappingExportInput(convertEditableProjectToV2(legacy.source))
      const scope = { kind: 'composition' as const }
      const old = preflightGenericMapping(legacy.source, scope)
      const direct = preflightV2GenericMapping(input, scope)
      expect(direct.ready).toBe(old.ready)
      expect(direct.pixelCount).toBe(old.pixelCount)
      expect(direct.stages.map(stage => [stage.id, stage.status])).toEqual(old.stages.map(stage => [stage.id, stage.status]))
    }
  })

  it('matches every row, JSON semantics, exact CSV bytes and deterministic repeat output', () => {
    const legacy = compactReadyProject()
    const input = selectGenericMappingExportInput(convertEditableProjectToV2(legacy.source))
    for (const scope of [{ kind: 'composition' as const }, { kind: 'screen' as const, screenId: 'screen-2' }]) {
      expect([...genericMappingV2Rows(input, scope)]).toEqual([...genericMappingRows(legacy.source, scope)])
      const oldJson = serializeGenericMapping(legacy.source, scope, 'json')
      const directJson = serializeV2GenericMapping(input, scope, 'json')
      expect(JSON.parse(directJson)).toEqual(JSON.parse(oldJson))
      expect(directJson).toBe(oldJson)
      const oldCsv = serializeGenericMapping(legacy.source, scope, 'csv')
      const directCsv = serializeV2GenericMapping(input, scope, 'csv')
      expect(directCsv).toBe(oldCsv)
      expect(serializeV2GenericMapping(input, scope, 'json')).toBe(directJson)
      expect(serializeV2GenericMapping(input, scope, 'csv')).toBe(directCsv)
    }
  })
})
