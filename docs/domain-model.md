# LedMAP — Domain Model

Статус: **Working** (каркас Phase 1), дополнен нормативным addressing-контрактом Phase 2A. Семантика `dataIndex` и ReferenceAddressingProfile-001 зафиксированы в [LEDMAP-HARDWARE-ADDRESSING-SPEC-001](specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md); реализация и executable-приёмка движков ещё впереди. Общее ordering вне reference profile остаётся WORKING.

Принцип документа: Domain Model — это **слой под математикой**. Он описывает, *какие сущности существуют* и *какие у них инварианты*, но не *как* они вычисляются (это зона движков: Cabinet Engine, Hardware Engine, Mapping Engine, Remap Engine).

## 1. Entity model

```
Screen (логический экран)
  ├── id, name, resolution (Size)
  ├── mappingRegions: MappingRegionId[]
  └── cabinetGrids: CabinetGridId[]

MappingRegion (логическая область ВХОДНОГО изображения; НЕ Cabinet)
  ├── id, screen, grid (ссылка на целевой CabinetGrid)
  ├── position: PixelCoordinate (на input canvas), size: Size
  └── корреляция Input→Output — производное Mapping Engine (не хранится)

CabinetGrid (физическая/логическая сетка кабинетов + конфигурация упорядочивания)
  ├── id, screen, name
  ├── columns, rows, cabinetWidth, cabinetHeight
  └── ordering: GridOrdering (numbering, startCorner, direction, snake) — данные, без алгоритмов

Cabinet (физический LED-кабинет)
  ├── id, grid
  ├── column, row, origin (Point)
  ├── width, height (физическая геометрия), pixelWidth, pixelHeight (LED-массив)
  ├── moduleColumns, moduleRows (модульная сетка)
  ├── rotation, flipH, flipV
  └── НЕ содержит UI state; cabinetIndex — производное (см. Ordering)

Module (физический LED-модуль внутри Cabinet)
  ├── id, cabinet
  ├── column, row, localX, localY (локальные координаты внутри кабинета)
  ├── width, height, pixelWidth, pixelHeight
  └── moduleIndex — производное; Module не является самостоятельным hardware endpoint

Processor / Port / Receiver (hardware topology)
  ├── Processor: id, name, portCount
  ├── Port: id, processor, index (portIndex), receiverCapacity
  │   (receivers / usedPixels / remainingPixels — derived allocation state, НЕ хранятся)
  └── Receiver: id, index, processor, port, cabinets[]

SignalPath / PixelAddress / Pixel
  ├── SignalPath: id + HardwareAddress{processor, port, receiver} + cabinet
  ├── PixelAddress (derived addressing): hardware → cabinet → module → coordinate → dataIndex (port-local)
  └── Pixel (физическая/логическая сущность): cabinet, module, coordinate (local), physical, logicalIndex (WORKING)
       Pixel ≠ PixelAddress; однозначная связь: Pixel → (Mapping Engine) → PixelAddress,
       ключ биекции: (cabinet, module, coordinate)
```

Сущности ссылаются друг на друга **по ID** (плоская модель, без вложенности и рекурсии). Полные объекты собираются контекстами/движками.

### 1a. Stored vs derived

| Данные | Stored (config/assignment) | Derived (пересчитываются движками) |
|---|---|---|
| Screen.resolution, Cabinet размеры, GridOrdering, Port.receiverCapacity | ✓ | |
| Cabinet → Grid, Module → Cabinet, Receiver → Port/Processor, Receiver.cabinets | ✓ (primary assignment, ADR-007) | |
| standalone `receivers` на Port | | ✓ (**удалено** из модели) |
| `usedPixels` / `remainingPixels` / `assignedReceivers` (Port) | | ✓ (allocation state, аллокатора пока нет) |
| `cabinetIndex` / `moduleIndex` / `pixelIndex` | | ✓ (Cabinet Engine) |
| `logicalIndex` (на Pixel) | | ✓ (Cabinet/Mapping Engine) |
| `dataIndex`, `PixelAddress` | | ✓ (Mapping Engine; биекция с Pixel) |
| `globalRemapIndex` | | ✓ (project-wide flattening; отдельный diagnostic/remap index, не поле PixelAddress) |
| `physical` (на Pixel) | | ✓ (из geometry) |

## 2. Value objects

| VO | Определение | Invariants | Immutable |
|---|---|---|---|
| `Point` | `{ x, y }` (физический/входной пиксель) | x,y — целые ≥ 0 | да |
| `PixelCoordinate` | `{ x, y }` (пиксель в пиксельном пространстве) | x,y — целые ≥ 0 | да |
| `ModuleCoordinate` | `{ x, y }` (локальные px внутри кабинета) | x,y — целые ≥ 0 | да |
| `Size` | `{ width, height }` | width,height — целые > 0 | да |
| `GridPosition` | `{ column, row }` | column,row — целые ≥ 0 | да |
| `GridOrdering` | `{ numbering, startCorner, direction, snake }` | значения из конечных unions | да |

`Point` / `PixelCoordinate` / `ModuleCoordinate` имеют одинаковую форму (`Coord2D`), но разные имена — семантическая типизация: физические vs входящие-в-кабинете координаты не должны смешиваться по ошибке. Одна структура вместо N дублей кода.

Фабрики: `createSize/createPoint/createPixelCoordinate/createGridPosition/createXxx` — кидают `DomainError` (immutable структуры, без классов).

## 3. IDs

Брендированные строковые ID (e.g. `ScreenId = string & { __brand: 'ScreenId' }`) для всех сущностей. Не избыточны: mixing, например, `CabinetId` и `ReceiverId` в параметре — ошибка, которую тип ловит на этапе компиляции.

Фабрики-ID: `asScreenId/asMappingRegionId/asCabinetGridId/asCabinetId/asModuleId/asProcessorId/asPortId/asReceiverId/asSignalPathId`.

## 4. Geometry

- Координаты **0-базовые**; origin — верхний левый угол; ось Y растёт вниз (согласуется с Canvas2D и ADR-004).
- `Cabinet`: сетка (`column, row`) + физическое смещение (`origin.x/y`).
- `Module`: позиция в модульной сетке (`column, row`) + локальное смещение в кабинет (`localX = column×width`, `localY = row×height` — производное от сетки, вычисляется фабрикой).
- `width/height` (физические) и `pixelWidth/pixelHeight` (LED-массив) — **разные пары**: геометрия шкафа ≠ разрешение LED (может отличаться за счёт зазоров/одной физической панели).

## 5. Ordering

Производные индексы упорядочивания — **не хранятся** в сущностях (правило: derived data не персистится; их вычисляет Cabinet Engine):
- `cabinetIndex` — порядок кабинета в сетке по конфигу Numbering/StartCorner/Direction/Snake;
- `moduleIndex` — логический порядок модулей внутри кабинета; `pixelIndex` — логический порядок пикселей внутри модуля. В ReferenceAddressingProfile-001 оба row-major, start top-left, snake OFF; общее представление конфигурации вне профиля остаётся WORKING;
- `logicalIndex` (на `Pixel`) — индекс в логическом порядке экрана (WORKING).

Logical Pixel Ordering ≠ Physical Panel Scan / Wiring. Cabinet Engine задаёт только явный логический порядок; multiplexing, scan ratio, row mapping, driver-IC и shift-register order — будущий HardwareProfile/vendor слой. Геометрия, ordering, topology и physical scan разделены.

## 6. Signal topology

- `HardwareAddress` — `{ processor, port, receiver }`; `SignalPath` — hardware + cabinet; `PixelAddress` — hardware + cabinet + module + `coordinate` (адресует конкретный Pixel) + **`dataIndex`**.
- **Pixel ≠ PixelAddress.** Pixel — физическая/логическая pixel-сущность (geometry: cabinet/module/coordinate/physical + ordering: logicalIndex). PixelAddress — отдельная derived addressing-структура (hardware chain + dataIndex). Они связаны однозначно (`Pixel → Mapping Engine → PixelAddress`), но это две разные концепции; PixelAddress не является частью Pixel.
- `PixelAddress.dataIndex` — **zero-based canonical pixel offset inside one Processor Port stream**. Сбрасывается на Port; Receiver того же Port продолжает индекс. Единица — пиксель, не vendor physical address, HUB75 scan index или packet address; это также не `Pixel.logicalIndex` и не координата.
- `coordinate` в Pixel/PixelAddress — module-local pixel coordinate. Для valid resolved mapping Pixel ↔ PixelAddress — биекция. Reverse lookup требует `(processor, port, dataIndex)` и возвращает ровно один receiver/cabinet/module/coordinate; голого dataIndex недостаточно.
- `globalRemapIndex` — отдельный derived project-wide flattening Processor → Port → Receiver → Cabinet → Module → Pixel. В [REF-001](reference/LEDMAP-REF-001.md) C09 начинается с `dataIndex=0` на P01:02 и `globalRemapIndex=131072`. Это не поле HardwareAddress/PixelAddress и не persisted project data.
- `PixelAddress → HardwareProfile.encode(...) → vendor-specific address` — будущая граница; интерфейс HardwareProfile сейчас не создаётся, TypeScript-модель не меняется.
- `usedPixels` / `remainingPixels` / `assignedReceivers` — **derived allocation state**: вычисляются из ёмкостей и назначений, никогда не хранятся как независимые поля (нет возможности рассинхрона capacity ↔ usage). Аллокатор не реализован (Hardware Engine, Phase 6).
- Global precedence задан ADR-006/015; конкретный порядок REF-001 указан явно. Хранение multi-processor порядка и scope Receiver.index остаются OPEN.
- auto-allocation (ёмкости Port/Receiver/Processor) — **WORKING**.

## 7. Invariants (реализованы в фабриках)

- `width > 0`, `height > 0` (Screen resolution, Cabinet, Module).
- `pixelWidth > 0`, `pixelHeight > 0` (Cabinet, Module).
- `rows > 0`, `columns > 0` (CabinetGrid).
- `cabinet count = rows × columns` — производно (`gridCabinetCount`).
- `pixel count cabinet = pixelWidth × pixelHeight` (`cabinetPixelCount`).
- Module-grid consistency: `moduleColumns × module.width == cabinet.width`, `moduleRows × module.height == cabinet.height`, и то же для `pixelWidth/pixelHeight` (`MODULE_GRID_MISMATCH`, `MODULE_PIXEL_MISMATCH`).
- `column/row/index` — целые ≥ 0; `cabinet index` не выходит за границы (MODULE_OUT_OF_RANGE для модульной сетки).
- Попиксельные координаты внутри Cabinet: `0 ≤ x < pixelWidth`, `0 ≤ y < pixelHeight` (`isWithinBounds`).
- Коды ошибок: `INVALID_DIMENSION`, `INVALID_COORDINATE`, `MODULE_OUT_OF_RANGE`, `MODULE_GRID_MISMATCH`, `MODULE_PIXEL_MISMATCH`.

НЕ добавлено бизнес-правил, не подтверждённых спецификацией (ограничения rotation/flip/config — см. Open questions).

## 8. Open / WORKING вопросы (не финализировать в коде без REF)

1. Direction semantics (применение к оси нумерации; 4 токена) — ревизия по REF-002.
2. Snake semantics — ревизия по REF-001/003.
3. Конфигурация Module/Pixel Ordering вне нормативного ReferenceAddressingProfile-001 — будущий контракт и REF-002…004.
4. Хранение multi-processor ordering и scope Receiver.index; hierarchy global flattening уже задана ADR-006/015.
5. auto-allocation (полное/частичное заполнение) — Hardware Engine (Phase 6).
6. Реализация addressing, reverse mapping и executable-приёмка по REF-001; port-local семантика `dataIndex` нормативно закрыта ADR-015.
7. Rotation/flip — допустимые значения (90-градусная сетка?) и как влияют на module/pixel order.
8. MappingRegion: допустимы ли повёрнутые/непрямоугольные регионы; связь Input→Output корреляция.
9. Точная модель экспорта производителей (отдельный контракт, не в core-модели).
