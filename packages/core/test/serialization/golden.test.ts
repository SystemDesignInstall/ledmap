import { describe, expect, it } from 'vitest'
import { loadProject, parseProject, serializeProject, type SerializeProjectInput, type ValidateProjectInput } from '../../src/index.js'
import { minimalGoldenText, minimalProject } from './fixtures.js'

function withoutPixelCapacity(): ValidateProjectInput {
  const project = minimalProject()
  const receivers = project.mapping.hardwareTopology.receivers
  const source = receivers[0]!
  return {
    mapping: {
      ...project.mapping,
      hardwareTopology: {
        ...project.mapping.hardwareTopology,
        receivers: [{
          id: source.id, index: source.index, processor: source.processor, port: source.port, cabinets: source.cabinets,
        }],
      },
    },
    rules: [],
  }
}

describe('7D canonical golden document', () => {
  it('serializes the minimal v1 project to the exact canonical text', () => {
    expect(serializeProject({ project: minimalProject() })).toBe(minimalGoldenText)
  })

  it('writes LF endings, two-space indent, no BOM and exactly one final newline', () => {
    const text = serializeProject({ project: minimalProject() })
    expect(text).not.toContain('\r')
    expect(text.charCodeAt(0)).toBe(123)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.endsWith('}\n\n')).toBe(false)
    expect(text.split('\n')[1]).toBe('  "format": "ledmap",')
  })

  it('loads the golden text and reports a valid project', () => {
    const loaded = loadProject(minimalGoldenText)
    expect(loaded.validation).toEqual({
      valid: true,
      diagnostics: [],
      checks: [
        { stage: 'input', status: 'passed' },
        { stage: 'mapping', status: 'passed' },
        { stage: 'remap', status: 'passed' },
      ],
    })
    expect(loaded.project).toEqual(minimalProject())
    expect(loaded.extensions).toEqual({})
  })

  it('keeps canonical field order at every record level', () => {
    const document = parseProject(minimalGoldenText)
    expect(Object.keys(document)).toEqual(['format', 'schemaVersion', 'project', 'extensions'])
    expect(Object.keys(document.project)).toEqual(['mapping', 'rules'])

    const mapping = document.project.mapping
    expect(Object.keys(mapping)).toEqual(['inputCanvas', 'screen', 'grid', 'region', 'hardwareTopology'])
    expect(Object.keys(mapping.inputCanvas)).toEqual(['id', 'resolution'])
    expect(Object.keys(mapping.inputCanvas.resolution)).toEqual(['width', 'height'])
    expect(Object.keys(mapping.screen)).toEqual(['id', 'name', 'resolution', 'mappingRegions', 'cabinetGrids'])
    expect(Object.keys(mapping.grid)).toEqual(['id', 'screen', 'name', 'columns', 'rows', 'cabinetWidth', 'cabinetHeight', 'ordering'])
    expect(Object.keys(mapping.grid.ordering)).toEqual(['numbering', 'startCorner', 'direction', 'snake'])
    expect(Object.keys(mapping.region)).toEqual(['id', 'inputCanvas', 'screen', 'grid', 'position', 'size'])
    expect(Object.keys(mapping.region.position)).toEqual(['x', 'y'])
    expect(Object.keys(mapping.region.size)).toEqual(['width', 'height'])

    const topology = mapping.hardwareTopology
    expect(Object.keys(topology)).toEqual([
      'processors', 'ports', 'receivers', 'cabinets', 'modules', 'processorOrder', 'receiverOrder',
    ])
    expect(Object.keys(topology.processors[0]!)).toEqual(['id', 'name', 'portCount'])
    expect(Object.keys(topology.ports[0]!)).toEqual(['id', 'processor', 'index', 'receiverCapacity'])
    expect(Object.keys(topology.receivers[0]!)).toEqual(['id', 'processor', 'port', 'index', 'cabinets', 'pixelCapacity'])
    expect(Object.keys(topology.cabinets[0]!)).toEqual([
      'id', 'grid', 'column', 'row', 'origin', 'width', 'height',
      'pixelWidth', 'pixelHeight', 'moduleColumns', 'moduleRows', 'rotation', 'flipH', 'flipV',
    ])
    expect(Object.keys(topology.modules[0]!)).toEqual([
      'id', 'cabinet', 'column', 'row', 'width', 'height', 'pixelWidth', 'pixelHeight',
    ])
    expect(Object.keys(topology.receiverOrder[0]!)).toEqual(['port', 'receivers'])
  })

  it('omits optional pixelCapacity instead of writing null', () => {
    const text = serializeProject({ project: withoutPixelCapacity() })
    expect(text).not.toContain('pixelCapacity')
    expect(text).not.toContain('null')
    expect(text).toBe(minimalGoldenText.replace(/,\n\s+"pixelCapacity": 6\n/, '\n'))
    expect(loadProject(text).project).toEqual(withoutPixelCapacity())
  })

  it('defaults absent and undefined extensions to an empty object', () => {
    expect(serializeProject({ project: minimalProject() })).toContain('  "extensions": {}')
    const input: Record<string, unknown> = { project: minimalProject(), extensions: undefined }
    expect(serializeProject(input as unknown as SerializeProjectInput)).toBe(minimalGoldenText)
  })

  it('never persists derived module coordinates or engine data', () => {
    const text = serializeProject({ project: minimalProject() })
    for (const derived of ['localX', 'localY', 'dataIndex', 'cells', 'spans', 'diagnostics', 'pixelMap', 'signalOrder']) {
      expect(text).not.toContain(derived)
    }
  })
})
