import { expect, it } from 'vitest'
import {
  allocateHardware, convertEditableProjectToV2, createProjectV2, editableProjectFromValidatedProject,
  planProjectHardware, selectProjectCabinetSignalOrder, selectV2HardwareEngineInput, validateProject,
} from '@ledmap/core'
import { referenceMapping } from '../../core/test/mapping-engine/fixtures.js'

it('compares full REF-001 allocation proposals and records informational timings', () => {
  const original = convertEditableProjectToV2(editableProjectFromValidatedProject({ mapping: referenceMapping(), rules: [] }))
  const project = createProjectV2({ ...original, hardware: { ...original.hardware, assignments: [],
    receivers: original.hardware.receivers.map(receiver => ({ ...receiver, pixelCapacity: 65536 })),
  }, operations: { ...original.operations, signalRoutes: [] } })
  const input = { ...selectV2HardwareEngineInput(project), cabinetOrder: selectProjectCabinetSignalOrder(project) }
  const before = () => allocateHardware(input)
  const after = () => planProjectHardware(project)
  expect(after().topology).toEqual(before().topology)
  const samples = { before: [] as number[], after: [] as number[], validation: [] as number[] }
  for (let warm = 0; warm < 10; warm += 1) { before(); after(); validateProject({ project: original }) }
  for (let sample = 0; sample < 100; sample += 1) {
    for (const name of sample % 2 === 0 ? ['before', 'after'] as const : ['after', 'before'] as const) {
      const start = performance.now()
      if (name === 'before') before(); else after()
      samples[name].push(performance.now() - start)
    }
    const start = performance.now()
    validateProject({ project: original })
    samples.validation.push(performance.now() - start)
  }
  const quantiles = (values: number[]) => {
    values.sort((left, right) => left - right)
    return { p50_ms: Number(values[49]!.toFixed(3)), p95_ms: Number(values[94]!.toFixed(3)) }
  }
  console.log('P0-2 performance', JSON.stringify({ node: process.version, platform: process.platform,
    fixture: 'REF-001, 12 Cabinets, 192 Modules', warmup: 10, samples: 100,
    before: quantiles(samples.before), after: quantiles(samples.after), validation: quantiles(samples.validation) }))
})
