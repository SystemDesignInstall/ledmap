import { describe, expect, it } from 'vitest'
import { loadProject, parseProject, serializeProject } from '../../src/index.js'
import { smallMapping } from '../mapping-engine/fixtures.js'
import { minimalProject, multiProcessorProject, mutable } from './fixtures.js'

function withPixelCapacity(value: number): ReturnType<typeof minimalProject> {
  const project = minimalProject()
  mutable(project.mapping.hardwareTopology.receivers[0]!).pixelCapacity = value
  return project
}

describe('7D explicit orders and scale', () => {
  it('keeps multi-processor orders, receiver indices and cabinet assignments', () => {
    const project = multiProcessorProject()
    const text = serializeProject({ project })
    const document = parseProject(text)
    const topology = document.project.mapping.hardwareTopology
    expect([...topology.processorOrder]).toEqual(['P02', 'P01'])
    expect(topology.receiverOrder.map(entry => entry.port)).toEqual(['P02:01', 'P01:01'])
    expect(topology.receiverOrder.map(entry => [...entry.receivers])).toEqual([['RB'], ['RA']])
    expect(topology.receivers.map(receiver => receiver.id)).toEqual(['RB', 'RA'])
    expect(topology.receivers.map(receiver => receiver.index)).toEqual([5, 0])
    expect(topology.receivers.map(receiver => receiver.cabinets[0])).toEqual(['C02', 'C01'])
    expect(topology.cabinets.map(cabinet => cabinet.id)).toEqual(['C02', 'C01'])
    expect(topology.modules.map(module => module.id)).toEqual(['M02', 'M01'])

    const loaded = loadProject(text)
    expect(loaded.project).toEqual(project)
    expect(serializeProject({ project: loaded.project, extensions: loaded.extensions })).toBe(text)
  })

  it('keeps a nontrivial receiver cabinet list in its explicit order', () => {
    const mapping = smallMapping(2, 2)
    const project = { mapping, rules: [] }
    const text = serializeProject({ project })
    const document = parseProject(text)
    expect([...document.project.mapping.hardwareTopology.receivers[0]!.cabinets]).toEqual(['C0', 'C1', 'C2', 'C3'])

    const receiver = mapping.hardwareTopology.receivers[0]!
    const reversed = { ...receiver, cabinets: [...receiver.cabinets].reverse() }
    const reversedProject = {
      mapping: {
        ...mapping,
        hardwareTopology: { ...mapping.hardwareTopology, receivers: [reversed] },
      },
      rules: [],
    }
    const reversedText = serializeProject({ project: reversedProject })
    expect(reversedText).not.toBe(text)
    const reversedDocument = parseProject(reversedText)
    expect([...reversedDocument.project.mapping.hardwareTopology.receivers[0]!.cabinets]).toEqual(['C3', 'C2', 'C1', 'C0'])
    expect(loadProject(reversedText).validation.valid).toBe(true)
  })

  it('preserves shuffled entity collections without sorting them by id or position', () => {
    const project = multiProcessorProject()
    const topology = project.mapping.hardwareTopology
    const shuffled = {
      mapping: {
        ...project.mapping,
        hardwareTopology: {
          ...topology,
          processors: [...topology.processors].reverse(),
          ports: [...topology.ports].reverse(),
          receivers: [...topology.receivers].reverse(),
          cabinets: [...topology.cabinets].reverse(),
          modules: [...topology.modules].reverse(),
        },
      },
      rules: [],
    }
    const text = serializeProject({ project: shuffled })
    const document = parseProject(text)
    expect(document.project.mapping.hardwareTopology.processors.map(item => item.id)).toEqual(['P01', 'P02'])
    expect(document.project.mapping.hardwareTopology.receivers.map(item => item.id)).toEqual(['RA', 'RB'])
    expect(document.project.mapping.hardwareTopology.cabinets.map(item => item.id)).toEqual(['C01', 'C02'])
    expect(document.project.mapping.hardwareTopology.modules.map(item => item.id)).toEqual(['M01', 'M02'])
    expect([...document.project.mapping.hardwareTopology.processorOrder]).toEqual(['P02', 'P01'])
    expect(text).not.toBe(serializeProject({ project }))
  })

  it('keeps a huge capacity compact and free of pixel-sized storage', () => {
    const text = serializeProject({ project: withPixelCapacity(Number.MAX_SAFE_INTEGER) })
    expect(text).toContain('"pixelCapacity": 9007199254740991')
    expect(text.length).toBeLessThan(5000)
    expect(text).not.toContain('"cells"')
    expect(text).not.toContain('"dataIndex"')
    const loaded = loadProject(text)
    expect(loaded.project.mapping.hardwareTopology.receivers[0]!.pixelCapacity).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('never allocates or fills topology while saving', () => {
    const project = minimalProject()
    const topology = project.mapping.hardwareTopology
    const text = serializeProject({ project })
    const document = parseProject(text)
    expect(document.project.mapping.hardwareTopology.processors).toHaveLength(topology.processors.length)
    expect(document.project.mapping.hardwareTopology.ports).toHaveLength(topology.ports.length)
    expect(document.project.mapping.hardwareTopology.receivers).toHaveLength(topology.receivers.length)
    expect(document.project.mapping.hardwareTopology.cabinets).toHaveLength(topology.cabinets.length)
    expect(document.project.mapping.hardwareTopology.modules).toHaveLength(topology.modules.length)
    expect(text).toBe(serializeProject({ project }))
  })
})
