import type { EditableProject, EditableProjectDiagnostic } from './types.js'

type Path = readonly (string | number)[]

function diagnostic(
  code: EditableProjectDiagnostic['code'],
  path: Path,
  message: string,
): EditableProjectDiagnostic {
  return Object.freeze({ severity: 'error', code, path: Object.freeze([...path]), message })
}

function push(
  diagnostics: EditableProjectDiagnostic[],
  code: EditableProjectDiagnostic['code'],
  path: Path,
  message: string,
): void {
  diagnostics.push(diagnostic(code, path, message))
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function checkPositive(
  value: number,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
): void {
  if (!isPositiveSafeInteger(value)) push(diagnostics, 'EDITOR_INVALID_NUMBER', path, 'Expected a positive safe integer')
}

function checkNonNegative(
  value: number,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
): void {
  if (!isNonNegativeSafeInteger(value)) push(diagnostics, 'EDITOR_INVALID_NUMBER', path, 'Expected a non-negative safe integer')
}

function checkSigned(
  value: number,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
): void {
  if (!Number.isSafeInteger(value)) push(diagnostics, 'EDITOR_INVALID_NUMBER', path, 'Expected a signed safe integer')
}

function checkSize(
  width: number,
  height: number,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
): void {
  checkPositive(width, [...path, 'width'], diagnostics)
  checkPositive(height, [...path, 'height'], diagnostics)
}

function duplicateIds(
  path: Path,
  records: readonly { readonly id: string }[],
  diagnostics: EditableProjectDiagnostic[],
): void {
  const seen = new Set<string>()
  for (let index = 0; index < records.length; index += 1) {
    const id = records[index]!.id
    if (seen.has(id)) push(diagnostics, 'EDITOR_DUPLICATE_ID', [...path, index, 'id'], `Duplicate id: ${id}`)
    seen.add(id)
  }
}

function duplicateReferences(
  path: Path,
  values: readonly string[],
  diagnostics: EditableProjectDiagnostic[],
): void {
  const seen = new Set<string>()
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!
    if (seen.has(value)) push(diagnostics, 'EDITOR_DUPLICATE_REFERENCE', [...path, index], `Duplicate reference: ${value}`)
    seen.add(value)
  }
}

function expectReference(
  known: ReadonlySet<string>,
  value: string,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
): boolean {
  if (known.has(value)) return true
  push(diagnostics, 'EDITOR_UNKNOWN_REFERENCE', path, `Unknown reference: ${value}`)
  return false
}

function expectMembership(
  values: readonly string[],
  value: string,
  path: Path,
  diagnostics: EditableProjectDiagnostic[],
  label: string,
): void {
  if (!values.includes(value)) push(diagnostics, 'EDITOR_PARENT_MISMATCH', path, `${label} does not contain ${value}`)
}

export function inspectEditableProject(project: EditableProject): readonly EditableProjectDiagnostic[] {
  const diagnostics: EditableProjectDiagnostic[] = []
  const { hardwareTopology } = project
  const inputCanvases = project.inputCanvas === null ? [] : [project.inputCanvas]

  duplicateIds(['screens'], project.screens, diagnostics)
  duplicateIds(['cabinetGrids'], project.cabinetGrids, diagnostics)
  duplicateIds(['mappingRegions'], project.mappingRegions, diagnostics)
  duplicateIds(['hardwareTopology', 'processors'], hardwareTopology.processors, diagnostics)
  duplicateIds(['hardwareTopology', 'ports'], hardwareTopology.ports, diagnostics)
  duplicateIds(['hardwareTopology', 'receivers'], hardwareTopology.receivers, diagnostics)
  duplicateIds(['hardwareTopology', 'cabinets'], hardwareTopology.cabinets, diagnostics)
  duplicateIds(['hardwareTopology', 'modules'], hardwareTopology.modules, diagnostics)

  const inputIds = new Set(inputCanvases.map(record => record.id))
  const screens = new Map(project.screens.map(record => [record.id, record] as const))
  const grids = new Map(project.cabinetGrids.map(record => [record.id, record] as const))
  const regions = new Map(project.mappingRegions.map(record => [record.id, record] as const))
  const processors = new Map(hardwareTopology.processors.map(record => [record.id, record] as const))
  const ports = new Map(hardwareTopology.ports.map(record => [record.id, record] as const))
  const receivers = new Map(hardwareTopology.receivers.map(record => [record.id, record] as const))
  const cabinets = new Map(hardwareTopology.cabinets.map(record => [record.id, record] as const))

  const screenIds = new Set(screens.keys())
  const gridIds = new Set(grids.keys())
  const regionIds = new Set(regions.keys())
  const processorIds = new Set(processors.keys())
  const portIds = new Set(ports.keys())
  const receiverIds = new Set(receivers.keys())
  const cabinetIds = new Set(cabinets.keys())

  if (project.inputCanvas !== null) {
    checkSize(project.inputCanvas.resolution.width, project.inputCanvas.resolution.height, ['inputCanvas', 'resolution'], diagnostics)
  }

  for (let index = 0; index < project.screens.length; index += 1) {
    const screen = project.screens[index]!
    checkSize(screen.resolution.width, screen.resolution.height, ['screens', index, 'resolution'], diagnostics)
    duplicateReferences(['screens', index, 'mappingRegions'], screen.mappingRegions, diagnostics)
    duplicateReferences(['screens', index, 'cabinetGrids'], screen.cabinetGrids, diagnostics)

    for (let item = 0; item < screen.mappingRegions.length; item += 1) {
      const regionId = screen.mappingRegions[item]!
      if (expectReference(regionIds, regionId, ['screens', index, 'mappingRegions', item], diagnostics)) {
        const region = regions.get(regionId)!
        if (region.screen !== screen.id) {
          push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['screens', index, 'mappingRegions', item], `MappingRegion ${regionId} belongs to Screen ${region.screen}`)
        }
      }
    }

    for (let item = 0; item < screen.cabinetGrids.length; item += 1) {
      const gridId = screen.cabinetGrids[item]!
      if (expectReference(gridIds, gridId, ['screens', index, 'cabinetGrids', item], diagnostics)) {
        const grid = grids.get(gridId)!
        if (grid.screen !== screen.id) {
          push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['screens', index, 'cabinetGrids', item], `CabinetGrid ${gridId} belongs to Screen ${grid.screen}`)
        }
      }
    }
  }

  for (let index = 0; index < project.cabinetGrids.length; index += 1) {
    const grid = project.cabinetGrids[index]!
    if (expectReference(screenIds, grid.screen, ['cabinetGrids', index, 'screen'], diagnostics)) {
      expectMembership(screens.get(grid.screen)!.cabinetGrids, grid.id, ['cabinetGrids', index, 'screen'], diagnostics, `Screen ${grid.screen}.cabinetGrids`)
    }
    checkPositive(grid.columns, ['cabinetGrids', index, 'columns'], diagnostics)
    checkPositive(grid.rows, ['cabinetGrids', index, 'rows'], diagnostics)
    checkPositive(grid.cabinetWidth, ['cabinetGrids', index, 'cabinetWidth'], diagnostics)
    checkPositive(grid.cabinetHeight, ['cabinetGrids', index, 'cabinetHeight'], diagnostics)
  }

  for (let index = 0; index < project.mappingRegions.length; index += 1) {
    const region = project.mappingRegions[index]!
    expectReference(inputIds, region.inputCanvas, ['mappingRegions', index, 'inputCanvas'], diagnostics)
    const screenKnown = expectReference(screenIds, region.screen, ['mappingRegions', index, 'screen'], diagnostics)
    const gridKnown = expectReference(gridIds, region.grid, ['mappingRegions', index, 'grid'], diagnostics)
    if (screenKnown) {
      expectMembership(screens.get(region.screen)!.mappingRegions, region.id, ['mappingRegions', index, 'screen'], diagnostics, `Screen ${region.screen}.mappingRegions`)
    }
    if (gridKnown && grids.get(region.grid)!.screen !== region.screen) {
      push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['mappingRegions', index, 'grid'], `CabinetGrid ${region.grid} does not belong to Screen ${region.screen}`)
    }
    checkNonNegative(region.position.x, ['mappingRegions', index, 'position', 'x'], diagnostics)
    checkNonNegative(region.position.y, ['mappingRegions', index, 'position', 'y'], diagnostics)
    checkSize(region.size.width, region.size.height, ['mappingRegions', index, 'size'], diagnostics)
  }

  const occupiedCells = new Set<string>()
  for (let index = 0; index < hardwareTopology.cabinets.length; index += 1) {
    const cabinet = hardwareTopology.cabinets[index]!
    const gridKnown = expectReference(gridIds, cabinet.grid, ['hardwareTopology', 'cabinets', index, 'grid'], diagnostics)
    checkNonNegative(cabinet.column, ['hardwareTopology', 'cabinets', index, 'column'], diagnostics)
    checkNonNegative(cabinet.row, ['hardwareTopology', 'cabinets', index, 'row'], diagnostics)
    checkNonNegative(cabinet.origin.x, ['hardwareTopology', 'cabinets', index, 'origin', 'x'], diagnostics)
    checkNonNegative(cabinet.origin.y, ['hardwareTopology', 'cabinets', index, 'origin', 'y'], diagnostics)
    checkPositive(cabinet.width, ['hardwareTopology', 'cabinets', index, 'width'], diagnostics)
    checkPositive(cabinet.height, ['hardwareTopology', 'cabinets', index, 'height'], diagnostics)
    checkPositive(cabinet.pixelWidth, ['hardwareTopology', 'cabinets', index, 'pixelWidth'], diagnostics)
    checkPositive(cabinet.pixelHeight, ['hardwareTopology', 'cabinets', index, 'pixelHeight'], diagnostics)
    checkPositive(cabinet.moduleColumns, ['hardwareTopology', 'cabinets', index, 'moduleColumns'], diagnostics)
    checkPositive(cabinet.moduleRows, ['hardwareTopology', 'cabinets', index, 'moduleRows'], diagnostics)
    checkSigned(cabinet.rotation, ['hardwareTopology', 'cabinets', index, 'rotation'], diagnostics)

    if (gridKnown && isNonNegativeSafeInteger(cabinet.column) && isNonNegativeSafeInteger(cabinet.row)) {
      const grid = grids.get(cabinet.grid)!
      if (cabinet.column >= grid.columns || cabinet.row >= grid.rows) {
        push(diagnostics, 'EDITOR_OUT_OF_RANGE', ['hardwareTopology', 'cabinets', index], `Cabinet ${cabinet.id} is outside CabinetGrid ${grid.id}`)
      } else {
        const key = `${cabinet.grid}\u0000${cabinet.column}\u0000${cabinet.row}`
        if (occupiedCells.has(key)) {
          push(diagnostics, 'EDITOR_DUPLICATE_CELL', ['hardwareTopology', 'cabinets', index], `CabinetGrid ${grid.id} cell ${cabinet.column},${cabinet.row} is occupied more than once`)
        }
        occupiedCells.add(key)
      }
    }
  }

  const occupiedModuleCells = new Set<string>()
  for (let index = 0; index < hardwareTopology.modules.length; index += 1) {
    const module = hardwareTopology.modules[index]!
    const cabinetKnown = expectReference(cabinetIds, module.cabinet, ['hardwareTopology', 'modules', index, 'cabinet'], diagnostics)
    checkNonNegative(module.column, ['hardwareTopology', 'modules', index, 'column'], diagnostics)
    checkNonNegative(module.row, ['hardwareTopology', 'modules', index, 'row'], diagnostics)
    checkNonNegative(module.localX, ['hardwareTopology', 'modules', index, 'localX'], diagnostics)
    checkNonNegative(module.localY, ['hardwareTopology', 'modules', index, 'localY'], diagnostics)
    checkPositive(module.width, ['hardwareTopology', 'modules', index, 'width'], diagnostics)
    checkPositive(module.height, ['hardwareTopology', 'modules', index, 'height'], diagnostics)
    checkPositive(module.pixelWidth, ['hardwareTopology', 'modules', index, 'pixelWidth'], diagnostics)
    checkPositive(module.pixelHeight, ['hardwareTopology', 'modules', index, 'pixelHeight'], diagnostics)

    if (cabinetKnown && isNonNegativeSafeInteger(module.column) && isNonNegativeSafeInteger(module.row)) {
      const cabinet = cabinets.get(module.cabinet)!
      if (module.column >= cabinet.moduleColumns || module.row >= cabinet.moduleRows) {
        push(diagnostics, 'EDITOR_OUT_OF_RANGE', ['hardwareTopology', 'modules', index], `Module ${module.id} is outside Cabinet ${cabinet.id}`)
      } else {
        const key = `${module.cabinet}\u0000${module.column}\u0000${module.row}`
        if (occupiedModuleCells.has(key)) {
          push(diagnostics, 'EDITOR_DUPLICATE_CELL', ['hardwareTopology', 'modules', index], `Cabinet ${cabinet.id} module cell ${module.column},${module.row} is occupied more than once`)
        }
        occupiedModuleCells.add(key)
      }
      if (isPositiveSafeInteger(module.width) && isPositiveSafeInteger(module.height)) {
        const expectedX = module.column * module.width
        const expectedY = module.row * module.height
        const tiledWidth = cabinet.moduleColumns * module.width
        const tiledHeight = cabinet.moduleRows * module.height
        if (!Number.isSafeInteger(expectedX) || !Number.isSafeInteger(expectedY) || module.localX !== expectedX || module.localY !== expectedY) {
          push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['hardwareTopology', 'modules', index], `Module ${module.id} local position does not match its Cabinet grid cell`)
        }
        if (!Number.isSafeInteger(tiledWidth) || !Number.isSafeInteger(tiledHeight) || tiledWidth !== cabinet.width || tiledHeight !== cabinet.height) {
          push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['hardwareTopology', 'modules', index], `Module ${module.id} physical size does not tile Cabinet ${cabinet.id}`)
        }
      }
      if (isPositiveSafeInteger(module.pixelWidth) && isPositiveSafeInteger(module.pixelHeight)) {
        const tiledPixelWidth = cabinet.moduleColumns * module.pixelWidth
        const tiledPixelHeight = cabinet.moduleRows * module.pixelHeight
        if (!Number.isSafeInteger(tiledPixelWidth) || !Number.isSafeInteger(tiledPixelHeight) || tiledPixelWidth !== cabinet.pixelWidth || tiledPixelHeight !== cabinet.pixelHeight) {
          push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['hardwareTopology', 'modules', index], `Module ${module.id} pixel size does not tile Cabinet ${cabinet.id}`)
        }
      }
    }
  }

  for (let index = 0; index < hardwareTopology.processors.length; index += 1) {
    checkPositive(hardwareTopology.processors[index]!.portCount, ['hardwareTopology', 'processors', index, 'portCount'], diagnostics)
  }

  const portIndices = new Set<string>()
  for (let index = 0; index < hardwareTopology.ports.length; index += 1) {
    const port = hardwareTopology.ports[index]!
    const processorKnown = expectReference(processorIds, port.processor, ['hardwareTopology', 'ports', index, 'processor'], diagnostics)
    checkNonNegative(port.index, ['hardwareTopology', 'ports', index, 'index'], diagnostics)
    checkPositive(port.receiverCapacity, ['hardwareTopology', 'ports', index, 'receiverCapacity'], diagnostics)
    if (processorKnown && isNonNegativeSafeInteger(port.index)) {
      const processor = processors.get(port.processor)!
      if (port.index >= processor.portCount) {
        push(diagnostics, 'EDITOR_OUT_OF_RANGE', ['hardwareTopology', 'ports', index, 'index'], `Port ${port.id} exceeds Processor ${processor.id}.portCount`)
      }
      const key = `${port.processor}\u0000${port.index}`
      if (portIndices.has(key)) push(diagnostics, 'EDITOR_DUPLICATE_CELL', ['hardwareTopology', 'ports', index, 'index'], `Processor ${processor.id} port index ${port.index} is used more than once`)
      portIndices.add(key)
    }
  }

  const assignedCabinets = new Set<string>()
  for (let index = 0; index < hardwareTopology.receivers.length; index += 1) {
    const receiver = hardwareTopology.receivers[index]!
    const processorKnown = expectReference(processorIds, receiver.processor, ['hardwareTopology', 'receivers', index, 'processor'], diagnostics)
    const portKnown = expectReference(portIds, receiver.port, ['hardwareTopology', 'receivers', index, 'port'], diagnostics)
    checkNonNegative(receiver.index, ['hardwareTopology', 'receivers', index, 'index'], diagnostics)
    if (receiver.pixelCapacity !== undefined) checkPositive(receiver.pixelCapacity, ['hardwareTopology', 'receivers', index, 'pixelCapacity'], diagnostics)
    duplicateReferences(['hardwareTopology', 'receivers', index, 'cabinets'], receiver.cabinets, diagnostics)

    if (processorKnown && portKnown && ports.get(receiver.port)!.processor !== receiver.processor) {
      push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['hardwareTopology', 'receivers', index, 'port'], `Receiver ${receiver.id} Processor does not match Port ${receiver.port}`)
    }

    for (let item = 0; item < receiver.cabinets.length; item += 1) {
      const cabinetId = receiver.cabinets[item]!
      if (!expectReference(cabinetIds, cabinetId, ['hardwareTopology', 'receivers', index, 'cabinets', item], diagnostics)) continue
      if (assignedCabinets.has(cabinetId)) {
        push(diagnostics, 'EDITOR_DUPLICATE_REFERENCE', ['hardwareTopology', 'receivers', index, 'cabinets', item], `Cabinet ${cabinetId} is assigned to more than one Receiver`)
      }
      assignedCabinets.add(cabinetId)
    }
  }

  duplicateReferences(['hardwareTopology', 'processorOrder'], hardwareTopology.processorOrder, diagnostics)
  for (let index = 0; index < hardwareTopology.processorOrder.length; index += 1) {
    expectReference(processorIds, hardwareTopology.processorOrder[index]!, ['hardwareTopology', 'processorOrder', index], diagnostics)
  }

  const orderedPorts = new Set<string>()
  const orderedReceivers = new Set<string>()
  for (let index = 0; index < hardwareTopology.receiverOrder.length; index += 1) {
    const order = hardwareTopology.receiverOrder[index]!
    const portKnown = expectReference(portIds, order.port, ['hardwareTopology', 'receiverOrder', index, 'port'], diagnostics)
    if (orderedPorts.has(order.port)) push(diagnostics, 'EDITOR_DUPLICATE_REFERENCE', ['hardwareTopology', 'receiverOrder', index, 'port'], `Receiver order for Port ${order.port} is duplicated`)
    orderedPorts.add(order.port)
    duplicateReferences(['hardwareTopology', 'receiverOrder', index, 'receivers'], order.receivers, diagnostics)
    for (let item = 0; item < order.receivers.length; item += 1) {
      const receiverId = order.receivers[item]!
      const receiverKnown = expectReference(receiverIds, receiverId, ['hardwareTopology', 'receiverOrder', index, 'receivers', item], diagnostics)
      if (orderedReceivers.has(receiverId)) push(diagnostics, 'EDITOR_DUPLICATE_REFERENCE', ['hardwareTopology', 'receiverOrder', index, 'receivers', item], `Receiver ${receiverId} appears in more than one receiver order`)
      orderedReceivers.add(receiverId)
      if (portKnown && receiverKnown && receivers.get(receiverId)!.port !== order.port) {
        push(diagnostics, 'EDITOR_PARENT_MISMATCH', ['hardwareTopology', 'receiverOrder', index, 'receivers', item], `Receiver ${receiverId} does not belong to Port ${order.port}`)
      }
    }
  }

  const placements = new Set<string>()
  for (let index = 0; index < project.editorLayout.screenPositions.length; index += 1) {
    const placement = project.editorLayout.screenPositions[index]!
    expectReference(screenIds, placement.screen, ['editorLayout', 'screenPositions', index, 'screen'], diagnostics)
    if (placements.has(placement.screen)) push(diagnostics, 'EDITOR_DUPLICATE_PLACEMENT', ['editorLayout', 'screenPositions', index, 'screen'], `Duplicate screen placement: ${placement.screen}`)
    placements.add(placement.screen)
    checkSigned(placement.position.x, ['editorLayout', 'screenPositions', index, 'position', 'x'], diagnostics)
    checkSigned(placement.position.y, ['editorLayout', 'screenPositions', index, 'position', 'y'], diagnostics)
  }

  for (let index = 0; index < project.screens.length; index += 1) {
    const screen = project.screens[index]!
    if (!placements.has(screen.id)) push(diagnostics, 'EDITOR_MISSING_PLACEMENT', ['screens', index, 'id'], `Missing screen placement: ${screen.id}`)
  }

  return Object.freeze(diagnostics)
}
