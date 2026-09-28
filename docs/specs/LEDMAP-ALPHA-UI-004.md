# LEDMAP-ALPHA-UI-004 — Early Alpha UI: Cabinet Geometry & Ordering Editor

Статус: **Implemented — CI PASS 2026-09-28, not merged.** Четвёртая итерация Early Alpha UI, продолжающая [LEDMAP-ALPHA-UI-003](LEDMAP-ALPHA-UI-003.md) (Screen Resize via Cabinet Grid, ACCEPTED/CLOSED на `02e8483`). Основание исключения — ADR-017, первая итерация — ADR-017, вторая — ADR-024, третья — ADR-026; настоящая итерация оформляется ADR-027. Базовые контракты ALPHA-UI-001/002/003 сохраняются в части границ core/app, интеграции, лимитов preview, deferred commit и запретов.

Документ одобрен пользователем 2026-09-28; production-код разрешён строго в границах этого контракта. Ветка `feat/cabinet-geometry-ordering-editor` от `dc027f7`.

## 1. Цель и границы

Итерация 3 научила `Screen` менять только структуру сетки — `Columns`/`Rows`. Геометрия кабинета и ordering остались read-only, что и зафиксировано в ALPHA-UI-003 §7 как сознательное отклонение. Четвёртая итерация снимает это отклонение: пользователь редактирует геометрию модулей и трансформации обхода для выбранного `Cabinet Grid`.

Разделение операций — центральный контракт этапа:

```text
Grid structure
  columns / rows
        ↓
resizeScreenGrid()                    — операция итерации 3, не меняется

Cabinet geometry + ordering
  moduleColumns / moduleRows
  modulePixelWidth / modulePixelHeight
  numbering / direction / snake
        ↓
updateScreenCabinetConfig()           — новая операция
```

`resizeScreenGrid()` и `updateScreenCabinetConfig()` — **две отдельные чистые функции**. Первая меняет количество ячеек Cabinet Grid, вторая — геометрию и обход существующей сетки. Ни одна из них не поглощает другую, и ни одна не решает обе задачи: `resizeScreenGrid()` MUST NOT принимать module-поля и ordering, `updateScreenCabinetConfig()` MUST NOT принимать `columns`/`rows`.

Вне этапа (запреты ALPHA-UI-001/002/003 и `TODO.md` сохраняются): Open/Save `.ledmap`, привилегированный IPC и preload, сериализация, UI Hardware/Mapping/Remap/Validation, экспорт, packaging, undo/redo, попиксельный preview, произвольный Screen scale, индивидуальная геометрия отдельных кабинетов (§8). `packages/core`, его public API, математика и reference-тесты **не изменяются** — см. §9.

## 2. Модель: только два источника размера, оба вычисляемые

В модели ровно два размера кабинета, и оба — производные от module-геометрии:

```text
cabinetWidth  = moduleColumns × modulePixelWidth
cabinetHeight = moduleRows    × modulePixelHeight

screenWidth   = grid.columns × cabinetWidth
screenHeight  = grid.rows    × cabinetHeight
```

`Cabinet Width/Height` и `Screen Width/Height` остаются **read-only** и в этом, и в следующем UI. Ввод этих значений напрямую не допускается: одному `cabinetWidth` соответствует бесконечно много пар `moduleColumns`/`modulePixelWidth`, поэтому отдельное редактируемое поле разрешения кабинета неоднозначно. Редактируются четыре module-поля, размеры пересчитываются.

Проверяемые примеры (кабинет по умолчанию `4 × 4` модулей по `32 × 32 px`):

| Изменение | `Cabinet` | `Screen` при `5 × 2` кабинетах |
|---|---|---|
| начальное состояние | `128 × 128 px` | `640 × 256 px` |
| `moduleColumns 4 → 5` | `160 × 128 px` | `800 × 256 px` |
| `modulePixelWidth 32 → 64` | `256 × 128 px` | `1280 × 256 px` |

**Разведение имён модулей.** Существующий `Snapshot.moduleCount` / `ScreenView.moduleCount` — это `moduleColumns * moduleRows`, то есть модулей **в одном кабинете**. Модулей **во всём Screen** — другое число, и оно уже вычисляется внутри `buildSnapshot` как `totalModules`, но наружу не выдаётся. На панели появятся оба значения, поэтому имена MUST NOT совпадать: `modulesPerCabinet` (per cabinet) и `totalModules` (screen-wide) вместо текущего `moduleCount`. Переименование затрагивает только app (`state.ts`, `project.ts`, `index.ts`, тесты) и не выходит в core.

## 3. Операция `updateScreenCabinetConfig`

```ts
updateScreenCabinetConfig(
  project: Project,
  screenId: string,
  patch: ScreenCabinetConfigPatch,
): Project

interface ScreenCabinetConfigPatch {
  readonly moduleColumns?: number
  readonly moduleRows?: number
  readonly modulePixelWidth?: number
  readonly modulePixelHeight?: number
  readonly numbering?: Numbering
  readonly direction?: Direction
  readonly snake?: boolean
}
```

- Чистая функция над `Project`, рядом с `resizeScreenGrid` / `moveScreen` / `setScreenPosition` / `addScreen`. Возвращает новый `Project`; вход не мутируется.
- **Атомарный patch:** поля, отсутствующие в patch, сохраняют текущие значения. Если хотя бы одно поле невалидно, операция отклоняется **целиком** — частичное применение (`moduleColumns` применён, `snake` нет) невозможно, а невалидный patch MUST NOT менять состояние.
- Каждое числовое поле валидируется как positive safe integer `>= 1`; итоговый `CabinetEngineConfig` проходит существующий путь `buildSnapshot(...)`, который уже вызывает core-проверки (`decomposeCabinetPixel(...)`, `cabinetOrder(...)`) и не дублирует правила ordering в UI.
- Лимиты preview ALPHA-UI-001 сохраняются и теперь зависят от module-геометрии: 1024 кабинета на grid и 65 536 модулей суммарно. Рост любого module-поля может вытолкнуть экран за предел при неизменных `columns`/`rows`, поэтому предел проверяется на итоговом patch.
- Сборка snapshot идёт **тем же** путём, что и в итерации 3: `buildSnapshot(seed, draft, ids)` с текущими кабинетами и `nextCabinetSerial` в качестве seed. Новый путь построения snapshot не создаётся, иначе инварианты непрерывности ID из ADR-026 разойдутся с реальностью.
- Остальные Screen возвращаются без изменений (тот же readonly `ScreenView`).

### 3.1 Что сохраняется, что пересчитывается

Сохранение identity — центральное требование этапа, а не побочный эффект:

```text
СОХРАНЯЕТСЯ                          ПЕРЕСЧИТЫВАЕТСЯ
Screen ID                            cabinet width / height
Grid ID                              Screen resolution
Screen position (x, y)               Screen pixel count
Grid name                            modules per cabinet / total modules
Cabinet physical ID (C…)             cabinet index (logical order #n)
Cabinet cell (column, row)           signal path (arrows)
nextCabinetSerial                    project bounds
                                     hit-testing
                                     canvas geometry
                                     Properties
```

- `updateScreenCabinetConfig()` MUST NOT потреблять `nextCabinetSerial` ни при каких значениях patch. Число кабинетов и набор ячеек не меняются, поэтому ни один новый ID не аллоцируется, а счётчик сохраняет прежнее значение.
- Cabinet ID и `(column, row)` — физическая идентичность. Смена `moduleColumns`, `modulePixelWidth`, `numbering`, `direction` или `snake` не переименовывает `C…` и не двигает кабинет.
- Логический номер `#n` и сигнальный путь — **производные**. Смена ordering пересчитывает их существующим Cabinet Engine (`cabinetIndex()` / `cabinetOrder()`) и не меняет ничего больше.

Пример: `C04` в ячейке `column 3, row 0` сохраняет свои ID и ячейку при любом ordering, но после `Direction = Right → Left` становится логическим `#1`.

### 3.2 Ортогональность

| Изменение | Не меняет |
|---|---|
| `numbering` / `direction` / `snake` | `cabinetWidth`, `cabinetHeight`, `Screen.resolution`, `pixelCount`, размеры модулей |
| `moduleColumns` / `moduleRows` / `modulePixelWidth` / `modulePixelHeight` | логический порядок, `index`, сигнальный путь, ID, ячейки |

`direction` и `snake` — независимые трансформации (AGENTS.md, правило 5). `snake` не зависит от `numbering` и не сбрасывается при его смене.

## 4. Ordering: direction выводится из numbering

`GridOrdering.direction` в core допускает четыре значения, но только два осмысленны при каждом `numbering`. В редакторе доступны только допустимые комбинации:

```text
Numbering = Row      →  Direction: Left → Right | Right → Left
Numbering = Column   →  Direction: Top → Bottom | Bottom → Top
```

- **Единственный источник правила — существующий `changeNumbering()`** в app-state (`state.ts:55-63`). UI MUST NOT содержать вторую копию этой логики и MUST NOT собирать `GridOrdering` вручную. При смене `numbering` направление переносится по признаку «обратное/прямое»: `Row + Right → Left` → `Column + Bottom → Top` и наоборот. Это гарантирует, что недопустимая комбинация `Row + Top → Bottom` не может быть получена из UI в принципе.
- Набор опций в `<select>` `Direction` фильтруется по текущему `numbering`, поэтому недостижимые значения не предлагаются.
- `snake` — независимый `ON`/`OFF` toggle, не производная от numbering.
- `startCorner` **не редактируется** и не отображается как редактируемое поле: `GridOrdering.startCorner` в core не поддерживает значения кроме `top-left` (см. `UNSUPPORTED_ORDERING` в app-state тестах). Расширение StartCorner остаётся отдельной итерацией (ADR-024 §отложено).

## 5. Properties выбранного Cabinet Grid

```text
Cabinet Grid
  Grid
    Name                        (readonly)
    Screen                      (readonly)
  Grid Size
    Columns                     (number input — resizeScreenGrid)
    Rows                        (number input — resizeScreenGrid)
  Modules per Cabinet
    Columns                     (number input — updateScreenCabinetConfig)
    Rows                        (number input — updateScreenCabinetConfig)
  Module Resolution
    Width                       (number input — updateScreenCabinetConfig)
    Height                      (number input — updateScreenCabinetConfig)
  Calculated Cabinet
    Width                       (readonly px)
    Height                      (readonly px)
    Modules                     (readonly)  ← modulesPerCabinet
  Ordering
    Numbering                   (select Row | Column)
    Direction                   (select, зависит от Numbering)
    Snake                       (toggle ON | OFF)
  Calculated Screen
    Width                       (readonly px)
    Height                      (readonly px)
  Totals
    Cabinets                    (readonly)
    Modules                     (readonly)  ← totalModules по всему Screen
```

- Панель `Screen` получает те же редактируемые module-поля и ordering: обе панели вызывают одну и ту же `updateScreenCabinetConfig(project, screenId, patch)`. Семантика Grid-selection и Screen-selection MUST быть эквивалентна, как это уже зафиксировано в ALPHA-UI-003 §5 для `Columns`/`Rows`.
- Selection остаётся `cabinetGrid` (из Grid) или `screen` (из Screen) после успешного commit.
- Блоки `Calculated Cabinet` и `Calculated Screen` визуально read-only: значения обновляются после каждого commit, поля не редактируются.
- Коммит — немедленный после валидации, как в итерации 3 для Properties. Deferred commit применяется к canvas-жестам, а не к вводу в панели; в этой итерации canvas-жестов, меняющих геометрию, не появляется.
- Предел для каждого module-поля вычисляется от итогового состояния grid, а не от вводимого значения: предел по числу кабинетов зависит от `columns`/`rows` и `modulesPerCabinet`, поэтому ввод `moduleColumns` может изменить допустимый предел соседнего поля `columns`. Проверка MUST NOT быть самоссылающейся (дефект, исправленный в `29173ac` для `Columns`/`Rows`).

## 6. Canvas

- Геометрия кабинета меняет пропорции экрана: `drawProject` уже читает `grid.cabinetWidth`/`cabinetHeight` и `gridPixelSize`, поэтому перерисовка не требует новой логики. Нужно только убедиться, что модульная сетка внутри кабинета и подписи `#n`/`C…` перерисовываются из `config`.
- `Fit to Project` учитывает новые bounds автоматически, поскольку `projectBounds` считается от `Screen.resolution`.
- `hitTesting` кабинетов пересчитывается: `local.x / cabinetWidth` и `local.y / cabinetHeight` уже читают обновлённые значения.
- Resize handles остаются привязанными к `columns`/`rows` и не зависят от module-геометрии.
- Новых canvas-жестов этап не вводит.

## 7. Тесты

**Unit (app, `packages/app/test/`)** — обязательна регрессия, а не только ручная проверка:

| Проверка | Ожидаемый результат |
|---|---|
| `4 × 4` модулей @ `32 × 32` | `cabinetWidth = 128`, `cabinetHeight = 128` |
| `moduleColumns 4 → 5` | `cabinetWidth = 160`, `cabinetHeight = 128`; для `5 × 2` — `screenWidth = 800`, `screenHeight = 256` |
| `modulePixelWidth 32 → 64` | `cabinetWidth = 256`, `cabinetHeight = 128`; `screenWidth = 1280` при `5 × 2` |
| `moduleRows 4 → 2` | `cabinetHeight = 64`; `modulesPerCabinet` и `totalModules` пересчитаны |
| **ID прежних кабинетов после смены геометрии** | все ID и все `(column, row)` прежние; `nextCabinetSerial` **не изменился** |
| **`nextCabinetSerial` после смены ordering** | не изменился |
| **Физическая ячейка после смены ordering** | `C04` остаётся в `column 3, row 0`; его `index` пересчитан |
| `Row / L→R / Snake ON` | существующий REF-001 order `1 2 3 4 8 7 6 5 9 10 11 12` сохранён |
| `Row / R→L / Snake ON` | порядок фиксируется тестом против `cabinetIndex()`; **нормативного reference-документа для `Row + RTL` нет** — `LEDMAP-REF-002` не написан (`TODO.md`, Phase 5, пункт открыт), поэтому ожидаемое значение MUST NOT выводиться из предположения о зеркале, а берётся из движка и закрепляется тестом |
| `Column / T→B / Snake ON` | соответствует [LEDMAP-REF-003](../reference/LEDMAP-REF-003.md) §3–§4 |
| `Column / B→T / Snake ON` | соответствует [LEDMAP-REF-004](../reference/LEDMAP-REF-004.md) §3–§4 |
| `snake` OFF | обход без чередования направления рядов; REF-003 §3 для `Column / T→B`, REF-004 §3 для `Column / B→T` |
| `Row / R→L` → `Numbering = Column` | direction становится `Bottom → Top` (через `changeNumbering`) |
| **Ортогональность** | смена ordering не меняет `cabinetWidth`/`Height`/`resolution`; смена геометрии не меняет `index`/`path` |
| Атомарность patch | невалидное поле отклоняет **весь** patch; ни одно поле не применено |
| Валидация | `0`, отрицательные, дробные, `NaN`, `Infinity`, пустое значение отклоняются |
| Лимит модулей | patch, выводящий суммарные модули за 65 536, отклонён без мутации |
| Изоляция экранов | правка Screen 1 не меняет Screen 2 и Screen 3 |
| Bounds / hit-test | новые bounds и попадание в кабинет по новой геометрии |

**Electron smoke (реальное окно):** правка `moduleColumns 4 → 5` в панели `Cabinet Grid` с проверкой `dump()`, рассчитанного размера кабинета и Screen; смена `Numbering Row → Column` с проверкой пересчитанного `order` и неизменных ID; смена `Snake ON → OFF`; `aria-invalid` на невалидном вводе и отсутствие мутации; недостижимые опции `Direction` при `Numbering = Column`; панель остаётся `Cabinet Grid`; REF-001 safety; скриншот.

Регрессия: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke` — локальный PASS. Локальные результаты не объявляются результатом CI. Ожидаемый baseline — 1252 теста, 53 файла.

## 8. Что сознательно не входит

- **Индивидуальная геометрия отдельных кабинетов** (`C01` ≠ `C02` в module-раскладке) не просто вне scope — она **запрещена текущим контрактом core**: `mapping-engine/resolve.ts` берёт размер кабинета у первого `Cabinet` hardware topology и затем требует, чтобы у всех кабинетов grid `pixelWidth`/`pixelHeight` совпадали (иначе `SIZE_MISMATCH`). Preview повторяет это допущение одним набором module-полей на Cabinet Grid, поэтому менять геометрию по кабинетам было бы расхождением с core, а не упрощением UI. Отдельный контракт индивидуальной геометрии — будущая задача core, не этап app.
- **Hardware Topology как источник геометрии.** Preview — предположение уровня проекта; после Phase 8/7E authority переходит к hardware topology. См. §9.
- **`startCorner`**, rotation и flip кабинета. `UNSUPPORTED_TRANSFORM` в core остаётся в силе.
- **Перетаскивание кабинета между экранами**, `+ Screen` с наследованием геометрии, undo/redo (запрещён).

## 9. Границы core и разделение двух источников размера

- **`packages/core` не меняется.** Новое публичное имя в core этап не вводит, математика Cabinet Engine и `gridPixelSize` не переписываются.
- **Расхождение источников размера фиксируется как решение, а не как случайность.** Сегодня `mapping-engine/resolve.ts:27` берёт размер кабинета у **первого** `Cabinet` hardware topology (`const cabinetPixelSize = { width: first.pixelWidth, height: first.pixelHeight }`), а preview считает из `grid.cabinetWidth`/`cabinetHeight` через app-helper `gridPixelSize`. Это расхождение уже было зафиксировано в ALPHA-UI-003 §7, и оно сохраняется:
  - preview — **допущение уровня проекта**: «все кабинеты этого Screen имеют одинаковую module-геометрию», редактируемую пользователем;
  - hardware topology — **authority** для фактического оборудования, когда Phase 8/7E дойдёт до интеграции;
  - расхождение не «чинится» на этом этапе и не маскируется: изменение module-геометрии в preview MUST NOT менять семантику `resolveMapping`, а переход на hardware-источник — отдельная задача интеграции.
- **Сериализация v1 (7D) не изменяется:** `Cabinet` уже хранит `pixelWidth`/`pixelHeight`, `moduleColumns`/`moduleRows`, а `StoredModuleV1` — собственные `pixelWidth`/`pixelHeight`; `CabinetGrid` хранит `columns`/`rows`/`cabinetWidth`/`cabinetHeight`/`ordering`. UI-поля `modulePixelWidth`/`modulePixelHeight` не являются отдельными wire-полями, но их значение представимо существующими module records. Эта итерация не меняет schema/serialization code и не определяет Open/Save mapping между in-memory preview и полным набором serialized Cabinet/Module records — это интеграционная задача Phase 8. Утверждать, что `moduleColumns`/`moduleRows` отсутствуют в v1, нельзя.

## 10. Одобрение

Одобрено пользователем 2026-09-28. Docs-gate `8764f52`; implementation `051f5e8`; Properties UI и Electron smoke `4800559`; CI `130c38c` и `9e0abf9`. GitHub Actions подтвердил `npm test`, `typecheck`, `lint`, `build` и `xvfb-run -a npm run test:smoke`. `master` не изменён.
