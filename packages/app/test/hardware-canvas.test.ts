import { describe, expect, it } from 'vitest'
import { hardwareCabinetCenter, hitHardwareCabinet } from '../src/renderer/hardware-canvas.js'
import { createTestProject } from './project-fixtures.js'

describe('Hardware canvas geometry', () => {
  it('hit-tests Cabinets in composition coordinates', () => {
    const project = createTestProject()
    expect(hitHardwareCabinet(project, { x: 10, y: 20 })).toMatchObject({
      cabinet: 'screen-1/C01',
      screenId: 'screen-1',
      local: { x: 10, y: 20 },
    })
    expect(hitHardwareCabinet(project, { x: -1, y: -1 })).toBeNull()
  })

  it('exposes stable cabinet centers for flow overlays and automation', () => {
    const project = createTestProject()
    expect(hardwareCabinetCenter(project, 'screen-1/C01')).toEqual({ x: 16, y: 16 })
    expect(hardwareCabinetCenter(project, 'screen-2/C01')).toEqual({ x: 716, y: 136 })
    expect(hardwareCabinetCenter(project, 'missing')).toBeNull()
  })
})
