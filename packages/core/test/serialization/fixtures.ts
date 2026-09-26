import { expect } from 'vitest'
import {
  asCabinetGridId, asCabinetId, asInputCanvasId, asMappingRegionId, asModuleId,
  asPortId, asProcessorId, asReceiverId, asScreenId,
  SerializationError, type SerializationErrorCode, type ValidateProjectInput,
} from '../../src/index.js'

export function captureError(action: () => unknown): SerializationError {
  try {
    action()
  } catch (error) {
    if (error instanceof SerializationError) return error
    throw error
  }
  throw new Error('Expected a SerializationError to be thrown')
}

export function expectSerializationError(
  action: () => unknown,
  code: SerializationErrorCode,
  path: readonly (string | number)[],
): SerializationError {
  const error = captureError(action)
  expect(error.code).toBe(code)
  expect([...error.path]).toEqual([...path])
  return error
}

export function mutable<T>(value: T): { -readonly [K in keyof T]: T[K] } {
  return value as { -readonly [K in keyof T]: T[K] }
}

export function minimalProject(): ValidateProjectInput {
  return {
    mapping: {
      inputCanvas: { id: asInputCanvasId('input'), resolution: { width: 2, height: 3 } },
      screen: {
        id: asScreenId('screen'), name: 'Screen', resolution: { width: 2, height: 3 },
        mappingRegions: [asMappingRegionId('region')], cabinetGrids: [asCabinetGridId('grid')],
      },
      grid: {
        id: asCabinetGridId('grid'), screen: asScreenId('screen'), name: 'Grid',
        columns: 1, rows: 1, cabinetWidth: 100, cabinetHeight: 100,
        ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
      },
      region: {
        id: asMappingRegionId('region'), inputCanvas: asInputCanvasId('input'), screen: asScreenId('screen'),
        grid: asCabinetGridId('grid'),
        inputRect: { x: 0, y: 0, width: 2, height: 3 },
        screenRect: { x: 0, y: 0, width: 2, height: 3 },
        transform: { inputRotation: 0, screenRotation: 0, flipX: false, flipY: false },
      },
      hardwareTopology: {
        processors: [{ id: asProcessorId('P'), name: 'Processor', portCount: 1 }],
        ports: [{ id: asPortId('P:0'), processor: asProcessorId('P'), index: 0, receiverCapacity: 1 }],
        receivers: [{
          id: asReceiverId('R'), index: 0, processor: asProcessorId('P'), port: asPortId('P:0'),
          cabinets: [asCabinetId('C')], pixelCapacity: 6,
        }],
        cabinets: [{
          id: asCabinetId('C'), grid: asCabinetGridId('grid'), column: 0, row: 0, origin: { x: 0, y: 0 },
          width: 100, height: 100, pixelWidth: 2, pixelHeight: 3, moduleColumns: 1, moduleRows: 1,
          rotation: 0, flipH: false, flipV: false,
        }],
        modules: [{
          id: asModuleId('M'), cabinet: asCabinetId('C'), column: 0, row: 0, localX: 0, localY: 0,
          width: 100, height: 100, pixelWidth: 2, pixelHeight: 3,
        }],
        processorOrder: [asProcessorId('P')],
        receiverOrder: [{ port: asPortId('P:0'), receivers: [asReceiverId('R')] }],
      },
    },
    rules: [],
  }
}

export function minimalDocument(): Record<string, unknown> {
  return {
    format: 'ledmap',
    schemaVersion: 2,
    project: {
      mapping: {
        inputCanvas: { id: 'input', resolution: { width: 2, height: 3 } },
        screen: { id: 'screen', name: 'Screen', resolution: { width: 2, height: 3 }, mappingRegions: ['region'], cabinetGrids: ['grid'] },
        grid: {
          id: 'grid', screen: 'screen', name: 'Grid', columns: 1, rows: 1, cabinetWidth: 100, cabinetHeight: 100,
          ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
        },
        region: {
          id: 'region', inputCanvas: 'input', screen: 'screen', grid: 'grid',
          inputRect: { x: 0, y: 0, width: 2, height: 3 },
          screenRect: { x: 0, y: 0, width: 2, height: 3 },
          transform: { inputRotation: 0, screenRotation: 0, flipX: false, flipY: false },
        },
        hardwareTopology: {
          processors: [{ id: 'P', name: 'Processor', portCount: 1 }],
          ports: [{ id: 'P:0', processor: 'P', index: 0, receiverCapacity: 1 }],
          receivers: [{ id: 'R', processor: 'P', port: 'P:0', index: 0, cabinets: ['C'], pixelCapacity: 6 }],
          cabinets: [{
            id: 'C', grid: 'grid', column: 0, row: 0, origin: { x: 0, y: 0 }, width: 100, height: 100,
            pixelWidth: 2, pixelHeight: 3, moduleColumns: 1, moduleRows: 1, rotation: 0, flipH: false, flipV: false,
          }],
          modules: [{ id: 'M', cabinet: 'C', column: 0, row: 0, width: 100, height: 100, pixelWidth: 2, pixelHeight: 3 }],
          processorOrder: ['P'],
          receiverOrder: [{ port: 'P:0', receivers: ['R'] }],
        },
      },
      rules: [],
    },
    extensions: {},
  }
}

export function minimalDocumentV1(): Record<string, unknown> {
  const document = minimalDocument()
  document['schemaVersion'] = 1
  const project = document['project'] as Record<string, unknown>
  const mapping = project['mapping'] as Record<string, unknown>
  mapping['region'] = {
    id: 'region', inputCanvas: 'input', screen: 'screen', grid: 'grid',
    position: { x: 0, y: 0 }, size: { width: 2, height: 3 },
  }
  return document
}

export const minimalGoldenText = `{
  "format": "ledmap",
  "schemaVersion": 2,
  "project": {
    "mapping": {
      "inputCanvas": {
        "id": "input",
        "resolution": {
          "width": 2,
          "height": 3
        }
      },
      "screen": {
        "id": "screen",
        "name": "Screen",
        "resolution": {
          "width": 2,
          "height": 3
        },
        "mappingRegions": [
          "region"
        ],
        "cabinetGrids": [
          "grid"
        ]
      },
      "grid": {
        "id": "grid",
        "screen": "screen",
        "name": "Grid",
        "columns": 1,
        "rows": 1,
        "cabinetWidth": 100,
        "cabinetHeight": 100,
        "ordering": {
          "numbering": "row",
          "startCorner": "top-left",
          "direction": "left-to-right",
          "snake": false
        }
      },
      "region": {
        "id": "region",
        "inputCanvas": "input",
        "screen": "screen",
        "grid": "grid",
        "inputRect": {
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 3
        },
        "screenRect": {
          "x": 0,
          "y": 0,
          "width": 2,
          "height": 3
        },
        "transform": {
          "inputRotation": 0,
          "screenRotation": 0,
          "flipX": false,
          "flipY": false
        }
      },
      "hardwareTopology": {
        "processors": [
          {
            "id": "P",
            "name": "Processor",
            "portCount": 1
          }
        ],
        "ports": [
          {
            "id": "P:0",
            "processor": "P",
            "index": 0,
            "receiverCapacity": 1
          }
        ],
        "receivers": [
          {
            "id": "R",
            "processor": "P",
            "port": "P:0",
            "index": 0,
            "cabinets": [
              "C"
            ],
            "pixelCapacity": 6
          }
        ],
        "cabinets": [
          {
            "id": "C",
            "grid": "grid",
            "column": 0,
            "row": 0,
            "origin": {
              "x": 0,
              "y": 0
            },
            "width": 100,
            "height": 100,
            "pixelWidth": 2,
            "pixelHeight": 3,
            "moduleColumns": 1,
            "moduleRows": 1,
            "rotation": 0,
            "flipH": false,
            "flipV": false
          }
        ],
        "modules": [
          {
            "id": "M",
            "cabinet": "C",
            "column": 0,
            "row": 0,
            "width": 100,
            "height": 100,
            "pixelWidth": 2,
            "pixelHeight": 3
          }
        ],
        "processorOrder": [
          "P"
        ],
        "receiverOrder": [
          {
            "port": "P:0",
            "receivers": [
              "R"
            ]
          }
        ]
      }
    },
    "rules": []
  },
  "extensions": {}
}
`

export function multiProcessorProject(): ValidateProjectInput {
  return {
    mapping: {
      inputCanvas: { id: asInputCanvasId('input'), resolution: { width: 4, height: 2 } },
      screen: {
        id: asScreenId('screen'), name: 'Screen', resolution: { width: 4, height: 2 },
        mappingRegions: [asMappingRegionId('region')], cabinetGrids: [asCabinetGridId('grid')],
      },
      grid: {
        id: asCabinetGridId('grid'), screen: asScreenId('screen'), name: 'Grid',
        columns: 2, rows: 1, cabinetWidth: 10, cabinetHeight: 10,
        ordering: { numbering: 'row', startCorner: 'top-left', direction: 'left-to-right', snake: false },
      },
      region: {
        id: asMappingRegionId('region'), inputCanvas: asInputCanvasId('input'), screen: asScreenId('screen'),
        grid: asCabinetGridId('grid'),
        inputRect: { x: 0, y: 0, width: 4, height: 2 },
        screenRect: { x: 0, y: 0, width: 4, height: 2 },
        transform: { inputRotation: 0, screenRotation: 0, flipX: false, flipY: false },
      },
      hardwareTopology: {
        processors: [
          { id: asProcessorId('P02'), name: 'Second', portCount: 1 },
          { id: asProcessorId('P01'), name: 'First', portCount: 1 },
        ],
        ports: [
          { id: asPortId('P02:01'), processor: asProcessorId('P02'), index: 0, receiverCapacity: 1 },
          { id: asPortId('P01:01'), processor: asProcessorId('P01'), index: 0, receiverCapacity: 1 },
        ],
        receivers: [
          { id: asReceiverId('RB'), index: 5, processor: asProcessorId('P02'), port: asPortId('P02:01'), cabinets: [asCabinetId('C02')] },
          { id: asReceiverId('RA'), index: 0, processor: asProcessorId('P01'), port: asPortId('P01:01'), cabinets: [asCabinetId('C01')], pixelCapacity: 4 },
        ],
        cabinets: [
          {
            id: asCabinetId('C02'), grid: asCabinetGridId('grid'), column: 1, row: 0, origin: { x: 10, y: 0 },
            width: 10, height: 10, pixelWidth: 2, pixelHeight: 2, moduleColumns: 1, moduleRows: 1,
            rotation: 0, flipH: false, flipV: false,
          },
          {
            id: asCabinetId('C01'), grid: asCabinetGridId('grid'), column: 0, row: 0, origin: { x: 0, y: 0 },
            width: 10, height: 10, pixelWidth: 2, pixelHeight: 2, moduleColumns: 1, moduleRows: 1,
            rotation: 0, flipH: false, flipV: false,
          },
        ],
        modules: [
          {
            id: asModuleId('M02'), cabinet: asCabinetId('C02'), column: 0, row: 0, localX: 0, localY: 0,
            width: 10, height: 10, pixelWidth: 2, pixelHeight: 2,
          },
          {
            id: asModuleId('M01'), cabinet: asCabinetId('C01'), column: 0, row: 0, localX: 0, localY: 0,
            width: 10, height: 10, pixelWidth: 2, pixelHeight: 2,
          },
        ],
        processorOrder: [asProcessorId('P02'), asProcessorId('P01')],
        receiverOrder: [
          { port: asPortId('P02:01'), receivers: [asReceiverId('RB')] },
          { port: asPortId('P01:01'), receivers: [asReceiverId('RA')] },
        ],
      },
    },
    rules: [],
  }
}

export function cloneDocument(document: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(document)) as Record<string, unknown>
}

export function pathOf(document: Record<string, unknown>, ...path: (string | number)[]): unknown {
  let current: unknown = document
  for (const step of path) {
    current = (current as Record<string | number, unknown>)[step]
  }
  return current
}

export function setPath(document: Record<string, unknown>, value: unknown, ...path: (string | number)[]): void {
  const parent = pathOf(document, ...path.slice(0, -1)) as Record<string | number, unknown>
  parent[path[path.length - 1]!] = value
}

export function deletePath(document: Record<string, unknown>, ...path: (string | number)[]): void {
  const parent = pathOf(document, ...path.slice(0, -1)) as Record<string, unknown>
  delete parent[path[path.length - 1] as string]
}
