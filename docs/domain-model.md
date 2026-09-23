# LedMAP — Domain Model

Статус: **Working** (каркас Phase 1). Математические контракты (ordering/dataIndex) не доказаны — финализируются по REF-001…004.

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
  ├── Port: id, processor, index, receiverCapacity, receivers[]
  └── Receiver: id, index, processor, port, cabinets[]
  (used/remaining pixels — производные метрики Hardware Engine, не хранятся)

SignalPath / PixelAddress / Pixel
  ├── SignalPath: id + HardwareAddress{processor, port, receiver} + cabinet
  ├── PixelAddress: hardware + cabinet + module + coordinate + physical + dataIndex (derived, WORKING)
  └── Pixel: PixelAddress + logicalIndex (derived, WORKING)
```

Сущности ссылаются друг на друга **по ID** (плоская модель, без вложенности и рекурсии). Полные объекты собираются контекстами/движками.

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
- `moduleIndex`, `pixelIndex` — порядок в пределах кабинета (Module Ordering / Pixel Ordering, WORKING);
- `logicalIndex` (на `Pixel`) — индекс в логическом порядке экрана (WORKING).

## 6. Signal topology

- `HardwareAddress` — `{ processor, port, receiver }`; `SignalPath` — hardware + cabinet; `PixelAddress` доадресует module + pixel; `Pixel` = PixelAddress + `logicalIndex`.
- **`dataIndex`** — конечный сигнальный индекс (WORKING), отдельный от `logicalIndex` и от физических координат.
- Precedence Processor→Port→Receiver→Cabinet — **WORKING**, финализируется после REF-001…004.
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
3. Module Ordering, Pixel Ordering (row-major L→R/T→B как предположение) — ревизия по REF-001…004.
4. Processor→Port→Receiver→Cabinet precedence — ревизия по REF-001.
5. auto-allocation (полное/частичное заполнение) — Hardware Engine (Phase 6).
6. `dataIndex` семантика (logicalIndex ≠ dataIndex ≠ physical) — ревизия по REF-001…004.
7. Rotation/flip — допустимые значения (90-градусная сетка?) и как влияют на module/pixel order.
8. MappingRegion: допустимы ли повёрнутые/непрямоугольные регионы; связь Input→Output корреляция.
9. Точная модель экспорта производителей (отдельный контракт, не в core-модели).