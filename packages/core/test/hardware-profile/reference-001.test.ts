import { describe, expect, it } from 'vitest'
import {
  LEDMAP_GENERIC_REF001, addressPixel, globalRemapIndex, locatePixel, resolveTransportPixel, resolveHardware,
  unresolveTransportPixel, validateHardwareProfile,
} from '../../src/index.js'
import { referenceTopology } from '../hardware-engine/fixtures.js'

const CABINET_WIDTH = 128
const CABINET_HEIGHT = 128
const CABINET_PIXELS = CABINET_WIDTH * CABINET_HEIGHT
const CABINET_COUNT = 12
const SCREEN_PIXELS = CABINET_PIXELS * CABINET_COUNT

describe('7E reference profile sweep over the full screen', () => {
  it('validates and freezes as a complete self-consistent reference', () => {
    const report = validateHardwareProfile(LEDMAP_GENERIC_REF001)
    expect(report).toEqual({ valid: true, checks: [] })
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001)).toBe(true)
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001.pixelTransportProfile)).toBe(true)
    expect(Object.isFrozen(LEDMAP_GENERIC_REF001.addressingProfile)).toBe(true)
  })

  it('sweeps all 196608 pixels as a per-cabinet transport bijection and a 6B addressing bijection', () => {
    const topology = referenceTopology()
    const resolved = resolveHardware(topology)
    expect(resolved.pixelCount).toBe(SCREEN_PIXELS)
    let swept = 0
    let differingPermutations = 0
    for (const cabinet of topology.cabinets) {
      const transportIndices = new Set<number>()
      const transportOrder: number[] = []
      const dataIndices: number[] = []
      for (let y = 0; y < CABINET_HEIGHT; y += 1) {
        for (let x = 0; x < CABINET_WIDTH; x += 1) {
          const resolvedPixel = resolveTransportPixel(LEDMAP_GENERIC_REF001, x, y)
          expect(resolvedPixel.active).toBe(true)
          expect(transportIndices.has(resolvedPixel.transportIndex!)).toBe(false)
          transportIndices.add(resolvedPixel.transportIndex!)
          transportOrder.push(resolvedPixel.transportIndex!)
          expect(unresolveTransportPixel(LEDMAP_GENERIC_REF001, resolvedPixel.transportIndex!)).toEqual({ x, y })
          const addressed = addressPixel(resolved, { cabinet: cabinet.id, coordinate: { x, y } })
          expect(addressed.cabinet).toBe(cabinet.id)
          dataIndices.push(addressed.dataIndex)
          const key = { processor: addressed.hardware.processor, port: addressed.hardware.port, dataIndex: addressed.dataIndex }
          const located = locatePixel(resolved, key)
          expect(located.cabinet).toBe(cabinet.id)
          expect(located.cabinetCoordinate).toEqual({ x, y })
          expect(located.module).toBe(addressed.module)
          expect(globalRemapIndex(resolved, key)).toBeGreaterThanOrEqual(0)
          swept += 1
        }
      }
      expect(transportIndices.size).toBe(CABINET_PIXELS)
      expect(Math.min(...transportIndices)).toBe(0)
      expect(Math.max(...transportIndices)).toBe(CABINET_PIXELS - 1)
      const base = Math.min(...dataIndices)
      expect(new Set(dataIndices).size).toBe(CABINET_PIXELS)
      expect(Math.max(...dataIndices) - base).toBe(CABINET_PIXELS - 1)
      const hardwareOrder = dataIndices.map(value => value - base)
      expect(new Set(hardwareOrder)).toEqual(transportIndices)
      if (hardwareOrder.some((value, index) => value !== transportOrder[index])) differingPermutations += 1
    }
    expect(swept).toBe(SCREEN_PIXELS)
    expect(differingPermutations).toBe(CABINET_COUNT)
  }, 120000)

  it('keeps transport indices relative to one cabinet and does not encode topology', () => {
    const first = resolveTransportPixel(LEDMAP_GENERIC_REF001, 5, 9)
    const second = resolveTransportPixel(LEDMAP_GENERIC_REF001, 5, 9)
    expect(first).toEqual(second)
    expect(first.transportIndex).toBeLessThan(CABINET_PIXELS)
    const topology = referenceTopology()
    const withProfile = resolveHardware({ ...topology, profile: LEDMAP_GENERIC_REF001 } as unknown as typeof topology)
    expect(withProfile).toEqual(resolveHardware(topology))
  })

  it('never derives cabinet count, receiver order or port order from the profile', () => {
    const topology = referenceTopology()
    const base = resolveHardware(topology)
    const withProfile = resolveHardware({ ...topology, profile: LEDMAP_GENERIC_REF001 } as unknown as typeof topology)
    expect(withProfile.ports).toHaveLength(base.ports.length)
    expect(Object.keys(withProfile)).toEqual(Object.keys(base))
    expect(JSON.stringify(withProfile)).not.toContain('ledmap.generic.ref001')
  })
})
