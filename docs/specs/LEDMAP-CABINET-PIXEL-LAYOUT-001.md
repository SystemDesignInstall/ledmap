# LEDMAP-CABINET-PIXEL-LAYOUT-001 — Cabinet pixel layout

Статус: **Normative — Phase 4E**. Обобщает геометрию ReferenceAddressingProfile-001 на прямоугольные сетки одинаковых прямоугольных модулей. Cabinet ordering сохраняет математику REF-001…004.

## 1. Конфигурация и границы

```ts
interface CabinetPixelLayoutConfig {
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly modulePixelWidth: number
  readonly modulePixelHeight: number
}

type CabinetEngineConfig = CabinetOrderingInput & CabinetPixelLayoutConfig
```

`CabinetOrderingInput` по-прежнему содержит `columns`, `rows`, `ordering`. Геометрия пикселей не зависит от Cabinet Numbering, Direction, Snake, StartCorner или сущности `Cabinet`. Функции остаются чистыми, детерминированными, не изменяют входные данные и не выполняют I/O.

Module ordering и Pixel ordering внутри Module фиксированы: Row Major, Top Left, Snake OFF. Настраиваемые module/pixel ordering, rotation/flip, hardware addressing, физическая разводка и UI не входят в Phase 4E.

## 2. Public API

Все перечисленные типы и значения экспортируются из `@ledmap/core`.

| API | Вход | Результат |
|---|---|---|
| `moduleIndex(layout, position)` | `Pick<CabinetPixelLayoutConfig, 'moduleColumns' \| 'moduleRows'>`, `GridPosition` | Индекс модуля, начиная с 0 |
| `pixelIndexWithinModule(layout, coordinate)` | `Pick<CabinetPixelLayoutConfig, 'modulePixelWidth' \| 'modulePixelHeight'>`, `PixelCoordinate` | Индекс пикселя внутри модуля, начиная с 0 |
| `decomposeCabinetPixel(layout, coordinate)` | `CabinetPixelLayoutConfig`, cabinet-local `PixelCoordinate` | `CabinetPixel` |
| `cabinetPixelCoordinate(layout, cabinetPixelOffset)` | `CabinetPixelLayoutConfig`, offset | cabinet-local `PixelCoordinate` |
| `referenceCabinetLayout` | — | Один объект `Object.freeze`: 4×4 модуля по 32×32 px |

`CabinetPixel` содержит readonly-поля `moduleColumn`, `moduleRow`, `moduleIndex`, `pixelX`, `pixelY`, `pixelIndexWithinModule`, `cabinetPixelOffset`. Это производный результат, не данные для сериализации проекта.

Существующие `referenceModuleIndex(position)`, `referencePixelIndexWithinModule(coordinate)`, `decomposeReferenceCabinetPixel(coordinate)` и `referenceCabinetPixelCoordinate(offset)` остаются тонкими обёртками с прежними сигнатурами и результатами. Тип `ReferenceCabinetPixel` сохранён как alias `CabinetPixel`.

Внутренние функции расчёта размеров не входят в публичный barrel API. Производные размеры и индексы в конфигурации не хранятся.

## 3. Валидация

Все четыре входных размера должны быть positive safe integers. Каждый производный размер проверяется отдельно:

```text
moduleCount        = moduleColumns × moduleRows
modulePixelCount   = modulePixelWidth × modulePixelHeight
cabinetPixelWidth  = moduleColumns × modulePixelWidth
cabinetPixelHeight = moduleRows × modulePixelHeight
cabinetPixelCount  = moduleCount × modulePixelCount
```

Ноль, отрицательные и дробные размеры, NaN, бесконечности и значения либо произведения за пределами `Number.MAX_SAFE_INTEGER` отклоняются с `DomainError('INVALID_DIMENSION', ...)`.

`moduleIndex` проверяет только размеры сетки модулей и `moduleCount`; `pixelIndexWithinModule` — только размеры модуля в пикселях и `modulePixelCount`. Оба преобразования координат проверяют всю геометрию и все пять произведений до вычисления индекса.

Координаты и offset должны быть неотрицательными целыми и строго меньше соответствующей проверенной границы. Неверный формат координат даёт `INVALID_COORDINATE`, выход за границы — `ORDERING_OUT_OF_RANGE`. Проверенные safe integer границы исключают небезопасные индексы.

## 4. Математика

Для cabinet-local координаты `(x,y)`:

```text
moduleColumn = floor(x / modulePixelWidth)
moduleRow    = floor(y / modulePixelHeight)
moduleIndex  = moduleRow × moduleColumns + moduleColumn
pixelX       = x mod modulePixelWidth
pixelY       = y mod modulePixelHeight
pixelIndexWithinModule = pixelY × modulePixelWidth + pixelX
cabinetPixelOffset = moduleIndex × modulePixelCount + pixelIndexWithinModule
```

Обратное преобразование:

```text
moduleIndex  = floor(cabinetPixelOffset / modulePixelCount)
moduleColumn = moduleIndex mod moduleColumns
moduleRow    = floor(moduleIndex / moduleColumns)
pixelIndexWithinModule = cabinetPixelOffset mod modulePixelCount
pixelX = pixelIndexWithinModule mod modulePixelWidth
pixelY = floor(pixelIndexWithinModule / modulePixelWidth)
x = moduleColumn × modulePixelWidth + pixelX
y = moduleRow × modulePixelHeight + pixelY
```

Это module-first порядок. Изменение Cabinet ordering не меняет cabinet-local преобразования.

## 5. Приёмочный случай: 3×2 модуля по 5×7 px

Получаем 6 модулей по 35 пикселей, cabinet-local размеры 15×14 px и 210 пикселей всего.

| Координата | Offset | Значение |
|---|---:|---|
| `(0,0)` | 0 | Первый пиксель M01 |
| `(4,6)` | 34 | Последний пиксель M01 |
| `(5,0)` | 35 | Первый пиксель M02; cabinet-wide raster дал бы 5 |
| `(10,0)` | 70 | Первый пиксель M03 |
| `(0,7)` | 105 | Первый пиксель M04 |
| `(14,13)` | 209 | Последний пиксель M06 |

Executable-проверки: `packages/core/test/cabinet-engine/pixel-layout.test.ts` и `pixel-layout-validation.test.ts`.

Приёмка включает полный round-trip всех 210 координат, точное покрытие offset 0…209 без повторов, обратный round-trip всех 210 offset и независимый обход модулей с проверкой полного разложения. Дополнительно проверяются минимальные входы функций, независимость от Cabinet ordering, детерминизм, immutability, вырожденные сетки, границы координат, все пять переполнений и допустимая арифметика около `Number.MAX_SAFE_INTEGER`.

Исходные 185 тестов сохраняются без изменений как регрессия, включая Cabinet ordering REF-001…004 и прежние reference module/pixel/coordinate функции.
