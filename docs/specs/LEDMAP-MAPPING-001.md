# LEDMAP-MAPPING-001 — Phase 7A: identity-translation mapping profile

Статус: **Accepted — documentation only**. Пользователь принял контракт и план Phase 7A 2026-09-24. Разрешён docs-only commit этой спецификации, ADR-020 и TODO. Production-код 7A пока не разрешён: после проверки docs-commit требуется отдельное разрешение пользователя.

Основание: [архитектура](../../ARCHITECTURE.md), [доменная модель](../domain-model.md), ADR-005/009/014/015/018/019 в [DECISIONS](../DECISIONS.md), [REF-001](../reference/LEDMAP-REF-001.md), [Hardware Engine 6A](LEDMAP-HARDWARE-ENGINE-001.md) и [Capacity 6B](LEDMAP-HARDWARE-CAPACITY-001.md). Phase 6A и 6B закрыты; принятый production-commit 6B — `63f340a5e181f98b93713cafcdc2d56ebd37ce1f`.

## 1. Место 7A в Phase 7

| Подэтап | Ответственность |
|---|---|
| 7A — Mapping | Ограниченный профиль source rect → полный Grid, соответствие 1:1 и обратный lookup |
| 7B — Remap | Постобработка уже готового PixelMap по отдельно утверждённому контракту |
| 7C — Project Validation | Общая проверка проекта и согласованные диагностики; обязательные инварианты вводятся в самих движках с 7A |
| 7D — Serialization | Версионированная конфигурация `.ledmap`, явные назначения, пересчёт derived-данных |

7A — **identity-translation profile**, а не полная реализация Input Rect / Output Rect из исходной архитектуры. Базовые Input→Output rotation/flip/scale и произвольный OutputRect относятся к будущему расширению Mapping contract. Они не становятся обязанностью Remap 7B. Mapping Region остаётся логическим соответствием, **Mapping Region ≠ Cabinet**.

## 2. Scope и границы

Один вызов `resolveMapping` получает один InputCanvas, один Screen, один CabinetGrid, один MappingRegion и полную explicit hardware topology всех кабинетов этого Grid. Target неявно равен всему Grid с origin `(0,0)` в Screen space. Ни дополнительных Grid/Region, ни кабинетов другого Grid в этом контексте нет.

В 7A входят:

- Минимальный InputCanvas и явная ссылка на него из MappingRegion.
- Нормативная семантика source rect и координатных пространств.
- Проверка полной физической сетки и одинакового pixel size кабинетов.
- Компактный immutable `ResolvedPixelMap`, forward/reverse lookup через готовые API 6A.
- Identity и offset fixtures REF-001, независимые pixel sweeps и негативные тесты.

В 7A не входят multi-region/multi-grid composition, clipping, wrap, scale/resampling, rotation/flip, OutputRect как новое поле, Remap, dead-LED rules, сериализация, UI, vendor export и HardwareProfile. Cabinet rotation/flip по-прежнему отклоняются существующим Hardware Engine. Гетерогенный pixel size кабинетов остаётся допустимым для Hardware Engine, но не для этого Mapping profile.

Hardware topology может содержать несколько Processor/Port/Receiver и пустые аппаратные слоты по правилам 6A/6B; геометрическое ограничение «один Grid» не ограничивает число аппаратных сущностей. Allocator при разрешении mapping не вызывается. Если нужны назначения, вызывающий код заранее получает полную topology через `allocateHardware()`.

## 3. Изменения доменной модели по принятому плану

Добавить `InputCanvasId`, фабрику `asInputCanvasId` по существующему паттерну branded ID и модель:

```ts
interface InputCanvas {
  readonly id: InputCanvasId
  readonly resolution: Size
}

interface CreateInputCanvasInput {
  id: string
  resolution: Size
}

function createInputCanvas(input: CreateInputCanvasInput): InputCanvas
```

Resolution — положительные safe integers в пикселях. Фабрика копирует и валидирует размер; произвольное имя, контент изображения и I/O в сущность не добавляются. Для неверного размера используется доменный `INVALID_DIMENSION`.

В `MappingRegion` и `CreateMappingRegionInput` добавить обязательный `inputCanvas: InputCanvasId`. Текущие `id`, `screen`, `grid`, `position`, `size` сохраняются. Сам существующий TypeScript-тип `position + size` не кодирует Input space: **именно этот принятый контракт впервые делает следующую семантику нормативной**:

- `position` — верхний левый угол source rect в InputCanvas.
- `size` — размер этого source rect в input pixels.
- `grid` — целевой полный CabinetGrid; его target origin в Screen space равен `(0,0)`.
- `screen` — Screen, которому принадлежит этот Grid.

Поля для output rect и transforms не добавляются. Фабрика MappingRegion проверяет safe-integer position/size без знания связанных сущностей; межсущностные проверки выполняет `resolveMapping`. Общие coordinate helpers и их существующие контракты не требуется рефакторить. Сериализационная миграция не создаётся: persistence относится к 7D.

## 4. Координатные пространства

Все координаты нуль-базовые, X вправо, Y вниз. Pixel coordinate адресует целый пиксель; дробные значения и интерполяция не допускаются.

| Пространство | Origin и диапазон | Представление в API |
|---|---|---|
| Input pixel | InputCanvas `(0,0)`; абсолютная координата внутри canvas | `InputPixel.inputCoordinate`, `MappedPixel.inputCoordinate` |
| Region-local pixel | Source rect top-left | В формулах `(gx,gy)` после вычитания region.position |
| Grid pixel | Верхний левый пиксель физической cell `(0,0)` | В 7A численно равен Region-local и Screen coordinate |
| Screen pixel | Target origin `(0,0)` | `MappedPixel.screenCoordinate` |
| Cabinet-local pixel | Верхний левый LED-пиксель выбранного Cabinet | `MappedPixel.cabinetCoordinate` |
| Module-local pixel | Верхний левый пиксель выбранного Module | `MappedPixel.moduleCoordinate`; также `PixelAddress.coordinate` |
| Hardware key | Не геометрия: адрес занятого пикселя в конкретном Port | `PortPixelKey = (processor, port, dataIndex)` |

Численное равенство Region-local/Grid/Screen coordinates — ограничение этого профиля, не взаимозаменяемость пространств в общей модели. На границах Mapping API используются именованные поля из таблицы, а не неуточнённый аргумент `coordinate`. Вызов существующего `addressPixel` получает его `coordinate` строго в Cabinet-local space; `locatePixel().coordinate` строго Module-local.

## 5. Геометрия и полнота контекста

### 5.1. References и membership

- `region.inputCanvas == inputCanvas.id`.
- `region.screen == screen.id`, `grid.screen == screen.id`, `region.grid == grid.id`.
- Для узкого профиля `screen.mappingRegions` содержит ровно `region.id`, `screen.cabinetGrids` — ровно `grid.id`. Пустые/неполные или дополнительные списки не дополняются автоматически.
- Все `hardwareTopology.cabinets` принадлежат `grid.id`; CabinetId уникальны.
- Для каждой cell `(column,row)` Grid существует ровно один Cabinet. Нельзя пропускать cell, дублировать позицию или выходить за `columns/rows`.
- Число кабинетов равно `grid.columns * grid.rows`; порядок массива и лексикографический порядок CabinetId не задают физическое размещение.
- Module ownership, полные аппаратные назначения, явные порядки и capacity проверяются существующим `resolveHardware`.

### 5.2. Pixel dimensions

Все Cabinets имеют одинаковые положительные safe-integer `pixelWidth` и `pixelHeight`; обозначим их `cw` и `ch`. Не требуется одинаковое число модулей при одинаковом Cabinet pixel size: конкретную корректную раскладку каждого Cabinet уже проверяет 6A.

```text
gridPixelWidth  = grid.columns * cw
gridPixelHeight = grid.rows * ch
gridPixelCount  = gridPixelWidth * gridPixelHeight

region.size       == (gridPixelWidth, gridPixelHeight)
screen.resolution == (gridPixelWidth, gridPixelHeight)
```

`cw/ch` берутся из **Cabinet.pixelWidth/pixelHeight**, а не из Cabinet.width/height, Cabinet.origin или Grid.cabinetWidth/cabinetHeight. Эти поля физической модели не переинтерпретируются как LED pixel dimensions. Source→Cabinet lookup использует физические cell indices и pixel geometry; проверка Cabinet/Module layout остаётся за Hardware Engine.

Равенство Screen resolution и размера Grid — сознательное ограничение 7A. В общей архитектуре оно не объявляется универсальным.

### 5.3. Source bounds и арифметика

```text
sx = region.position.x
sy = region.position.y
sw = region.size.width
sh = region.size.height

0 <= sx; 0 <= sy
sx + sw <= inputCanvas.resolution.width
sy + sh <= inputCanvas.resolution.height

source rect = [sx, sx + sw) × [sy, sy + sh)
```

Position, indices и query coordinates — non-negative safe integers; размеры — positive safe integers. Произведения Grid dimensions, pixel count и суммы границ/координат проверяются на safe-integer overflow до использования. Region, выходящий за InputCanvas, отвергается целиком. Lookup вне source rect отклоняется, даже если пиксель лежит внутри остального InputCanvas; clamp/wrap отсутствуют.

## 6. Public API по принятому контракту

Имена и типы ниже — часть принятого контракта; production exports ещё не реализованы.

```ts
interface ResolveMappingInput {
  readonly inputCanvas: InputCanvas
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly region: MappingRegion
  readonly hardwareTopology: HardwareTopologyInput
}

interface InputPixel {
  readonly inputCanvas: InputCanvasId
  readonly inputCoordinate: PixelCoordinate
}

interface MappedPixel {
  readonly inputCoordinate: PixelCoordinate
  readonly screenCoordinate: PixelCoordinate
  readonly cabinet: CabinetId
  readonly cabinetCoordinate: PixelCoordinate
  readonly module: ModuleId
  readonly moduleCoordinate: PixelCoordinate
  readonly address: PixelAddress
}

interface MappingCabinetCell {
  readonly cabinet: CabinetId
  readonly column: number
  readonly row: number
}

interface ResolvedPixelMap {
  readonly inputCanvas: InputCanvas
  readonly screen: Screen
  readonly grid: CabinetGrid
  readonly region: MappingRegion
  readonly gridPixelSize: Size
  readonly cabinetPixelSize: Size
  readonly cells: readonly MappingCabinetCell[]
  readonly hardware: ResolvedHardwareMapping
}

function resolveMapping(input: ResolveMappingInput): ResolvedPixelMap
function mapInputPixel(mapping: ResolvedPixelMap, inputPixel: InputPixel): MappedPixel
function unmapHardwarePixel(mapping: ResolvedPixelMap, key: PortPixelKey): MappedPixel
```

Для согласованности geometry и addressing принимается **полная HardwareTopologyInput**, а не пара independently supplied Cabinets + ResolvedHardwareMapping. `resolveMapping` вызывает существующий строгий `resolveHardware(input.hardwareTopology)` и строит snapshot из того же входа. Частичные назначения дают существующую hardware-ошибку; разрешение mapping не запускает allocation и не меняет topology.

`MappedPixel.cabinet/module/moduleCoordinate` согласованы с `address.cabinet/module/coordinate`. InputCanvas/Screen/Region однозначно определены контекстом mapping; query InputCanvasId должен совпадать с ним. `globalRemapIndex` не входит в MappedPixel: при необходимости вызывается существующий `globalRemapIndex(mapping.hardware, key)`.

Lookup-функции принимают результат `resolveMapping`. Десериализация или ручная сборка недоверенного `ResolvedPixelMap` не являются способом обхода validation: derived object не хранится и заново строится из исходной модели.

## 7. Компактный immutable PixelMap

`cells` — таблица размера Cabinet count в физическом row-major порядке. Индекс cell равен `row * grid.columns + column`; это **индекс физической таблицы**, не сигнальный `cabinetIndex`. Обратный поиск CabinetId возвращает ту же cell. Конкретная внутренняя оптимизация обратного поиска не меняет контракт.

Размер результата зависит от числа Cabinets/Modules/Receiver/Port/Processor, а не от количества LED pixels. Внутри нет массива PixelAddress на каждый пиксель, pixel-sized lookup table или eagerly generated MappedPixel list. Существующие компактные hardware spans переиспользуются.

`resolveMapping` создаёт отдельные immutable копии доменного контекста, включая вложенные resolution, position, size, ordering, membership arrays и cells. Замораживаются только собственные результаты, не входные объекты. Нельзя удерживать изменяемые ссылки на input. Lookup возвращает immutable MappedPixel и вложенные координаты; repeated resolve/lookup детерминированы. Сравнение и обход всех пикселей в acceptance tests не делают попиксельный массив частью production-модели.

## 8. Forward: Input → Cabinet geometry → 6A address

После проверки InputCanvasId и попадания `inputCoordinate = (ix,iy)` в source rect:

```text
gx = ix - region.position.x
gy = iy - region.position.y

column = floor(gx / cabinetPixelWidth)
row    = floor(gy / cabinetPixelHeight)
localX = gx mod cabinetPixelWidth
localY = gy mod cabinetPixelHeight

cabinet = physical cell lookup(column, row)
address = addressPixel(mapping.hardware, {
  cabinet: cabinet.id,
  coordinate: (localX, localY)
})
```

Результат: `inputCoordinate=(ix,iy)`, `screenCoordinate=(gx,gy)`, найденные CabinetId и cabinetCoordinate, ModuleId/moduleCoordinate из `address`, полный `PixelAddress`.

**Numbering/Direction/Snake не участвуют в этой геометрии.** Mapping Engine не вызывает `cabinetIndex`, `cabinetOrder` или allocation, не сортирует Cabinet по сигнальному индексу, не вычисляет dataIndex из screen row-major offset. Полная topology уже определяет Receiver.cabinets и аппаратный порядок; Grid.ordering не служит командой заново применить этот порядок. Изменение ordering при неизменной explicit topology не должно менять mapping.

## 9. Reverse: 6A key → Cabinet geometry → Input

```text
located = locatePixel(mapping.hardware, { processor, port, dataIndex })
cell = physical cell lookup by located.cabinet

gx = cell.column * cabinetPixelWidth  + located.cabinetCoordinate.x
gy = cell.row    * cabinetPixelHeight + located.cabinetCoordinate.y
ix = region.position.x + gx
iy = region.position.y + gy
```

Обратный MappedPixel содержит полученные Input/Screen/Cabinet координаты, ModuleId и Module-local coordinate из `located`. Полный `address` получается существующим `addressPixel` для найденного Cabinet-local пикселя; собственные расчёты hardware prefix sums не вводятся. Forward и reverse должны возвращать одинаковый MappedPixel для одного занятого hardware key.

Bare dataIndex не принимается. Unknown Processor/Port, индекс вне занятого диапазона и любой индекс пустого Port отклоняются существующим `locatePixel`. Receiver boundary не сбрасывает dataIndex; Port boundary сбрасывает. Эти правила 6A не переопределяются.

## 10. Validation и ошибки

Используется существующий `DomainError` с отдельными кодами `MAPPING_*` для новых mapping-инвариантов. Без накопления частичного результата: ошибка разрешения не возвращает PixelMap.

| Код | Условие |
|---|---|
| `MAPPING_INVALID_VALUE` | Неверные или unsafe размеры, cell indices, source/query coordinates |
| `MAPPING_OVERFLOW` | Переполнение производного размера, количества или суммы координат |
| `MAPPING_UNKNOWN_REFERENCE` | Несовпадение ссылок InputCanvas/Screen/Grid/Region, неверный InputCanvasId в query, Cabinet другого Grid |
| `MAPPING_DUPLICATE` | Два разных CabinetId в одной physical cell |
| `MAPPING_INCOMPLETE` | Не покрыта physical cell; отсутствует обязательное членство единственного Grid/Region в Screen |
| `MAPPING_SIZE_MISMATCH` | Различный Cabinet pixel size или несовпадение Region/Screen/Grid pixel dimensions |
| `MAPPING_OUT_OF_RANGE` | Source rect вне InputCanvas, query вне source rect, physical cell вне Grid |
| `MAPPING_UNSUPPORTED_PROFILE` | Screen содержит дополнительные Grid/Region за пределами профиля 7A |

Duplicate `CabinetId` во входной topology остаётся `HARDWARE_DUPLICATE` от `resolveHardware()`, а не `MAPPING_DUPLICATE`. Последний означает конфликт physical cell между разными CabinetId.

Ошибки entity duplication, Module geometry, аппаратных references, orders, completeness, capacity и Cabinet transforms из `resolveHardware` передаются без переименования; hardware lookup ошибки также сохраняют существующие коды. Доменные фабрики сохраняют свои `INVALID_DIMENSION` / `INVALID_COORDINATE`. При нескольких нарушениях порядок выбора первого кода не является отдельным контрактом; негативные fixtures изолируют конкретный дефект. Существующая skeleton-validation в allocator/resolver не рефакторится и не переносится в Mapping.

## 11. Acceptance fixtures REF-001

Обе fixtures используют принятую physical grid и explicit hardware topology REF-001. Полный MappedPixel сравнивается с независимым ожидаемым результатом; ModuleId — реальные ID вида `C01/M01`, а не неоднозначный локальный label.

| Параметр | Identity fixture | Offset fixture |
|---|---|---|
| InputCanvas.resolution | 512×384 | 1920×1080 |
| Region.position в Input space | (0,0) | (100,50) |
| Region.size | 512×384 | 512×384 |
| Screen.resolution | 512×384 | 512×384 |
| Grid | 4 columns × 3 rows | 4 columns × 3 rows |
| Cabinet pixel size | 128×128 | 128×128 |
| Source rect, exclusive upper bound | [0,512) × [0,384) | [100,612) × [50,434) |

У offset fixture Input `(100,50)` → Screen/Grid `(0,0)` → C01 local `(0,0)`; Input `(611,433)` → Screen/Grid `(511,383)` → C12 local `(127,127)`.

Минимальные независимые anchors; Processor во всех строках P01:

| Identity Input / Screen | Offset Input | Cabinet/local | Module/local | Receiver / Port | dataIndex |
|---|---|---|---|---|---|
| (0,0) | (100,50) | C01 / (0,0) | C01/M01 / (0,0) | R01 / P01:01 | 0 |
| (31,31) | (131,81) | C01 / (31,31) | C01/M01 / (31,31) | R01 / P01:01 | 1023 |
| (32,0) | (132,50) | C01 / (32,0) | C01/M02 / (0,0) | R01 / P01:01 | 1024 |
| (127,127) | (227,177) | C01 / (127,127) | C01/M16 / (31,31) | R01 / P01:01 | 16383 |
| (128,0) | (228,50) | C02 / (0,0) | C02/M01 / (0,0) | R01 / P01:01 | 16384 |
| (511,127) | (611,177) | C04 / (127,127) | C04/M16 / (31,31) | R01 / P01:01 | 65535 |
| (384,128) | (484,178) | C08 / (0,0) | C08/M01 / (0,0) | R02 / P01:01 | 65536 |
| (0,128) | (100,178) | C05 / (0,0) | C05/M01 / (0,0) | R02 / P01:01 | 114688 |
| (127,255) | (227,305) | C05 / (127,127) | C05/M16 / (31,31) | R02 / P01:01 | 131071 |
| (0,256) | (100,306) | C09 / (0,0) | C09/M01 / (0,0) | R03 / P01:02 | 0 |
| (511,383) | (611,433) | C12 / (127,127) | C12/M16 / (31,31) | R03 / P01:02 | 65535 |

Строки C05/C08 отдельно доказывают, что Snake не переставил physical cells. Границы Module, Cabinet, Receiver и Port проверяются в обоих направлениях. На Port boundary отдельный существующий `globalRemapIndex` даёт `131071 → 131072` при `dataIndex: 131071 → 0`; поле в MappedPixel не добавляется.

## 12. Полная тестовая матрица

1. **Два полных sweep:** для каждой fixture перебрать все 196 608 Input pixels внутри source rect. Независимо определить physical Cabinet/local и ожидаемый PixelAddress по reference tables/formulas; сравнить все поля MappedPixel. Проверить `unmapHardwarePixel(mapInputPixel(...).address key)` → тот же InputPixel и полный MappedPixel. Собрать 196 608 уникальных `(processor,port,dataIndex)`.
2. **Обратный обход:** для каждой fixture перебрать занятые Port-local диапазоны reference topology, проверить hardware key → Input → тот же hardware key, полноту Input coverage и оба round-trip. Ожидаемые значения не генерируются через production Mapping/Hardware API. Screen row-major обход не обязан давать монотонный dataIndex или globalRemapIndex.
3. **Source bounds:** offset `(99,50)`, `(100,49)`, `(612,433)`, `(611,434)` отвергаются; верхняя/левая границы включены, правая/нижняя исключены. Отдельно отрицательные, дробные, NaN/Infinity/unsafe coordinates, неверный InputCanvasId, region за canvas и арифметическое переполнение.
4. **Geometry:** пропущенная/out-of-range cell, два разных CabinetId в одной cell (`MAPPING_DUPLICATE`), чужой Grid, duplicate CabinetId во входной topology (`HARDWARE_DUPLICATE` от `resolveHardware`), неверные Screen/Region references и membership, несогласованные размеры. Отдельная валидная fixture с отличающимися physical width/height и pixelWidth/pixelHeight доказывает выбор pixel geometry. Проверить прямоугольные Cabinet/Module pixels и сетки 1×1, 1×N, N×1.
5. **Ordering independence:** перестановка entity arrays/labels не меняет mapping. При одной explicit topology изменение поддерживаемых Grid.ordering вариантов не меняет source→Cabinet geometry и hardware key. При другой валидной explicit topology геометрия сохраняется, адрес меняется ровно как результат 6A; повторное применение Snake/Direction исключено.
6. **Hardware integration:** incomplete topology отклоняется без auto-allocation; сохраняются проверки capacity/geometry 6A/6B. Reverse отвергает unknown keys, out-of-range indices и пустые Port. Покрыть размещение одного Grid на нескольких Processor, включая одинаковый численный dataIndex в разных потоках.
7. **Snapshot:** deep-frozen вход принимается, mutable вход не замораживается и его последующие изменения не меняют результат. Resolved context и lookup outputs глубоко immutable; repeated calls детерминированы. Число cells равно Cabinet count; изменение pixel resolution при фиксированном количестве сущностей не создаёт pixel-sized коллекций.
8. **Регрессия:** сохранить результаты существующих 425 тестов; никакой смены математических ожиданий Cabinet/Hardware Engine. Выполнить `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, существующий Electron smoke и `git diff --check`. Результаты будущей реализации явно отделять от текущей проверки документа и отмечать как локальные, если CI не выполнялся.

## 13. Файлы будущей реализации по принятому плану

- `core/model/input-canvas.ts`, дополнения `model/ids.ts`, `model/mapping-region.ts` и model barrel.
- `core/mapping-engine/types.ts`, `resolve.ts`, `lookup.ts`, локальные validation helpers при необходимости и `index.ts`; export из core barrel.
- Новые domain/mapping tests и identity/offset fixtures с независимыми expected anchors.

Все пути core относительны `packages/`. Новые runtime dependencies не требуются. Hardware Engine и Cabinet Engine используются через существующие API; app остаётся потребителем core. Их production-код и математика не меняются в 7A. Принятие плана отражается в ADR-020 и TODO текущим docs-only commit; отчёт о реализации появится после отдельного разрешения и выполнения production-этапа.

## 14. Текущий deliverable и условие старта

Текущий разрешённый результат — **docs-only commit `docs: define mapping phase 7a` ровно из трёх файлов**: `docs/specs/LEDMAP-MAPPING-001.md` со статусом Accepted, `docs/DECISIONS.md` с ADR-020 и `TODO.md` с принятым планом 7A. Контракт фиксирует точные API, обязательную InputCanvas reference, single-grid membership, scope полной hardware topology, immutable snapshot и mapping error codes. Production-код и новые executable tests в этот шаг не входят.

После docs-commit работа останавливается: пользователь проверяет SHA и состав трёх файлов, затем отдельно разрешает реализацию `mapping-engine`. Статус Accepted означает принятие спецификации и плана, но пока не разрешение production-кода 7A и не приёмку реализации. Remap 7B и другие подэтапы Phase 7 автоматически не начинаются.
