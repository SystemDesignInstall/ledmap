import { describe, it } from 'vitest'
import { convertEditableProjectToV2, createProjectV2, editableProjectFromValidatedProject, selectProjectHardwareLoad } from '@ledmap/core'
import { referenceMapping } from '../../core/test/mapping-engine/fixtures.js'

describe('informational capacity profile load measurement', () => {
  it('compares unconfigured and explicitly profiled REF-001 loads in the same implementation', () => {
    const before = convertEditableProjectToV2(editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] }))
    const after = createProjectV2({ ...before, hardware: { ...before.hardware,
      processors: before.hardware.processors.map(value => ({ ...value, capacityProfile: {
        name: 'Synthetic mode', source: { kind: 'manual' as const, reference: 'Benchmark fixture', revision: '1' },
        mode: { frameRateHz: 60, bitDepth: 8 as const, linkRateGbps: 1 as const },
        portPixelCapacity: 150000, processorPixelCapacity: 250000,
      } })),
    } })
    const samples: [number[], number[]] = [[], []]
    for (let run = 0; run < 110; run += 1) {
      for (const index of run % 2 === 0 ? [0, 1] : [1, 0]) {
        const start = performance.now()
        selectProjectHardwareLoad(index === 0 ? before : after)
        const elapsed = performance.now() - start
        if (run >= 10) samples[index as 0 | 1].push(elapsed)
      }
    }
    const summary = samples.map(values => {
      values.sort((a, b) => a - b)
      return { p50: values[49], p95: values[94] }
    })
    console.log(JSON.stringify({ scope: 'same-version unconfigured vs profiled REF-001, 10 warmups and 100 alternating paired samples', summary }))
  })
})
