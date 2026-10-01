import { describe, expect, it } from 'vitest'
import { convertEditableProjectToV2 } from '@ledmap/core'
import { hardwareCabinetCenter, hitHardwareCabinet } from '../src/renderer/hardware-canvas.js'
import { projectV2WorkspaceReadModel } from '../src/renderer/v2-read-model.js'
import { createTestProject } from './project-fixtures.js'

describe('Hardware canvas geometry', () => {
  it('hit-tests Cabinets in composition coordinates', () => {
    const project = projectV2WorkspaceReadModel(convertEditableProjectToV2(createTestProject().source))
    expect(hitHardwareCabinet(project, { x: 10, y: 20 })).toMatchObject({
      cabinet: 'screen-1/C01',
      screenId: 'screen-1',
      local: { x: 10, y: 20 },
    })
    expect(hitHardwareCabinet(project, { x: -1, y: -1 })).toBeNull()
  })

  it('exposes stable cabinet centers for flow overlays and automation', () => {
    const project = projectV2WorkspaceReadModel(convertEditableProjectToV2(createTestProject().source))
    expect(hardwareCabinetCenter(project, 'screen-1/C01')).toEqual({ x: 64, y: 64 })
    expect(hardwareCabinetCenter(project, 'screen-2/C01')).toEqual({ x: 764, y: 184 })
    expect(hardwareCabinetCenter(project, 'missing')).toBeNull()
  })
})
