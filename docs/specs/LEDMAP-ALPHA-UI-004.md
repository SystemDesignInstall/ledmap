# LEDMAP-ALPHA-UI-004 — Early Alpha UI: Cabinet Geometry + Ordering Editor

**Статус:** Accepted — executable spec, docs-only gate. Production требует отдельного approval.

**Baseline:** `e75567b` (project-model v2 foundation) поверх `02e8483` (итерация 3 CLOSED).

**Upstream:** [LEDMAP-ALPHA-UI-003](LEDMAP-ALPHA-UI-003.md), [ADR-026](../DECISIONS.md#adr-026-early-alpha-ui--screen-resize-via-cabinet-grid); решение — [ADR-027](../DECISIONS.md#adr-027-cabinet-geometry--ordering-editor-alpha-ui-004); vision — [LEDMAP-UI-ARCHITECTURE-001](LEDMAP-UI-ARCHITECTURE-001.md) §6, NOW-пункт 1 backlog.

## 1. Цель и границы

Четвёртая итерация Early Alpha UI доводит редактор Screen до полного контроля над структурой Cabinet Grid: пользователь меняет `Columns / Rows / Numbering / Direction / Snake` из Properties выбранного Screen (и эквивалентно из Cabinet Grid selection). Разрешение Screen и размер кабинета остаются производными; `startCorner` остаётся `top-left` без редактора.

Executable scope — ровно пять полей:

```text
Rows, Columns, Numbering, Direction, Snake
```

Не входят (non-goals, без исключений):

```text
moduleColumns / moduleRows / modulePixelWidth / modulePixelHeight (остаются read-only;
  редактирование модульной геометрии — отдельная будущая итерация, не Phase 8 silently)
multi-select, box selection, duplicate, delete, lock, nudge (UI-04)
snap, guides, align, distribute (UI-05)
Mapping, Hardware, Signal editing, Undo/Redo
persistence changes (схема .ledmap v1 не меняется; позиции Screen — app-state)
project-model v2 migration (HEAD e75567b — только types+freeze, к renderer не подключён;
  004 остаётся на Alpha view-model ScreenView/Draft/Snapshot)
```

Отклонение от прежнего Draft-scope в TODO (там предлагались `module*` поля): сужено до пяти полей решением этого gate. Причина: модульная геометрия меняет `cabinetWidth/cabinetHeight` и требует политики разбиения производного размера (см. ALPHA-UI-003 §7); смешивать её с ordering в одной мутации запрещено.

## 2. Core-contract decision (инспекция фактического кода, не документов)

Вопрос gate:

```text
Does existing core API safely support mutation of rows / columns / Numbering / Direction / Snake?
```

Ответ: **да, существующего API достаточно; отдельный prerequisite core gate НЕ требуется.**

Основания (проверено по коду на baseline):

1. `CabinetEngineConfig = CabinetOrderingInput & CabinetPixelLayoutConfig`
   (`packages/core/src/cabinet-engine/pixel-layout.ts:11`): все пять полей — обычные
   immutable-данные. «Мутация» в core отсутствует как понятие и не нужна: новое состояние —
   новое immutable-значение плюс пересчёт производного.
2. Конструкторы чистые и валидирующие: `createCabinetGrid` (`model/cabinet-grid.ts:31`,
   `assertPositiveInteger` на `columns/rows/cabinetWidth/cabinetHeight`), `createScreen`.
   Производное: `cabinetIndex` / `cabinetOrder` (`cabinet-order.ts`), `gridPixelSize` (app-helper
   поверх тех же полей; расхождение источников размера зафиксировано ALPHA-UI-003 §7
   и здесь не переоткрывается).
3. Ordering-независимость — код, а не декларация: `cabinetIndex` компонует
   `numberCabinetPosition → applyCabinetDirection → applyCabinetSnake`; спаривание
   ось-направление enforced (`direction.ts:21` кидает `UNSUPPORTED_ORDERING` на
   cross-axis пару); `startCorner !== 'top-left'` отклоняется (`numbering.ts:27`).
   Все 8 валидных комбинаций покрыты исполняемыми тестами REF-001…004 (§6).
4. App уже умеет менять ordering с сохранением identity на single-screen пути:
   `buildSnapshot(seed, draft)` + `buildCabinets` (переиспользование по ключу ячейки
   `(column,row)`, монотонный `nextCabinetSerial` без переиспользования) — доказано тестом
   `packages/app/test/state.test.ts:27-42` («uses the core for all supported modes while
   preserving physical IDs»).
5. Разрыв только в multi-screen пути `packages/app/src/renderer/project.ts`:
   `resizeScreenGrid(project, screenId, columns, rows)` меняет только dims через
   `draftFromConfig` и сохраняет `ordering` (тест `resize.test.ts:149` фиксирует
   `after.grid.ordering == before.grid.ordering`). Нужна вторая app-операция для
   geometry+ordering — это app-код поверх существующих pure core-операций,
   новых core-экспортов не требует.

Следствие: запрет обхода соблюдён по построению — UI запрещено перестраивать
`Cabinet[]`, вычислять identity, переупорядочивать signal order или дублировать формулы
Numbering/Direction/Snake. Единственный легальный путь — §7.

## 3. Canonical state

| Field | Source of truth | Класс |
|---|---|---|
| Rows, Columns | domain (`CabinetEngineConfig` → `CabinetGrid`) | stored |
| Numbering, Direction, Snake | domain (`GridOrdering`) | stored |
| `startCorner` | domain, фиксировано `top-left` | stored, readonly |
| `moduleColumns/Rows/PixelW/H`, `cabinetWidth/Height` | domain, не редактируются в 004 | stored/derived, readonly |
| Cabinet `(column,row)` + physical ID | view-state со стабильностью identity (`PreviewCabinet[]` + `nextCabinetSerial` в `ScreenView`) | view-state, committed |
| `cabinet.index`, `path`, `Screen.resolution`, `pixelCount`, bounds, hit-test | engine (`cabinetIndex`, `cabinetOrder`, `gridPixelSize`) | derived, пересчёт при каждом build |
| Preview geometry `{columns, rows}` во время drag | transient жест (`resizePreview`) | view-state, transient |
| Draft в numeric input во время typing | DOM-элемент | view-state, transient |
| Позиция Screen `x/y`, camera, selection | app | view-state (без изменений) |

Никакого дублирования stored-данных в app-state. После commit то же состояние восстанавливается перерисовкой из `Project`.

## 4. Geometry semantics (Rows / Columns)

* Минимум `1 × 1`; только целые `Number.isSafeInteger`, `>= 1`. `0`, отрицательные, дроби,
  `NaN`, `Infinity`, пустое, unsafe integer — отказ без мутации.
* Максимум — действующие лимиты preview ALPHA-UI-001, без изменений:
  `columns ≤ maxColumnsForRows(rows)`, `rows ≤ maxRowsForColumns(columns)`,
  где `max*` выведены из `MAX_PREVIEW_CABINETS = 1024` и `MAX_PREVIEW_MODULES = 65536`
  при `modulesPerCabinet` конфига экрана. Предел считается от **противоположного
  (неизменённого)** измерения — самоссылающаяся проверка запрещена (правило 003 §5).
* Увеличение: ячейки, бывшие внутри grid, сохраняют `(id, column, row)`; недостающие ячейки
  создаются с новыми ID `C{serial}` по монотонному счётчику; ID никогда не переиспользуются.
* Уменьшение: ячейки вне нового grid удаляются, их ID уходят в отставку навсегда;
  оставшиеся сохраняют ID и позиции.
* `resize ≠ recreate`: полного пересоздания identity нет; `4×3 → 5×3 → 4×3` возвращает
  исходные 12 ID, а повторное `→ 5×3` выдаёт новые серийные (`C16…`, не `C13…` —
  зафиксировано `resize.test.ts:65-74`).
* Детерминизм: одинаковая пара `(seed, target)` даёт одинаковые ID и `nextCabinetSerial`;
  identity не зависит от траектории мыши (§8).
* Смена геометрии не потребляет серийный счётчик на сохранившихся ячейках; идемпотентный
  повтор таргета (`5×3 → 5×3`) не аллоцирует ничего (`resize.test.ts:76-85`).

## 5. Identity invariant

* Cabinet identity (`id`) и physical cell (`column,row`) отделены от traversal order (`index`).
* Смена `Numbering / Direction / Snake` **MUST NOT** создавать, удалять или перенумеровывать
  кабинеты: массив `cabinets` сохраняет те же `(id, column, row)`; меняется только
  производный `index` (через `cabinetIndex`) и `path` (через `cabinetOrder`).
* Snake меняет логический обход, не физическое размещение: physical ID всегда назначены
  по физическим строкам слева направо (`C01…C04 / C05…C08 / C09…C12` при любом ordering —
  контракт 001 §2, регрессия §13).
* Смена геометрии не меняет ordering-конфиг; смена ordering не меняет `cabinetWidth/Height`
  (модульная геометрия в 004 frozen) и позиции Screen.

## 6. Ordering semantics и truth table

Поля независимы; комбинированных enum (`RowSnakeLeftRight` и подобных) нет.
Валидные пары ось-направление: `Row → left-to-right | right-to-left`,
`Column → top-to-bottom | bottom-to-top`. Cross-axis пара — `DomainError
UNSUPPORTED_ORDERING` из core; UI такие опции не предлагает (Direction-селект показывает
только совместимые с текущим Numbering), защита в глубине — валидация op (§7).

Эталонный grid `4 × 3`, physical: `row0: C01 C02 C03 C04 / row1: C05 C06 C07 C08 /
row2: C09 C10 C11 C12`. Ожидаемый traversal (индекс `0 → 11`):

| # | Numbering | Direction | Snake | Traversal | Источник |
|---|---|---|---|---|---|
| 1 | Row | Left→Right | OFF | `C01 C02 C03 C04 C05 C06 C07 C08 C09 C10 C11 C12` | `cabinet-order.test.ts:71-80` |
| 2 | Row | Left→Right | ON | `C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12` | REF-001 |
| 3 | Row | Right→Left | OFF | `C04 C03 C02 C01 C08 C07 C06 C05 C12 C11 C10 C09` | REF-002 straight |
| 4 | Row | Right→Left | ON | `C04 C03 C02 C01 C05 C06 C07 C08 C12 C11 C10 C09` | REF-002 |
| 5 | Column | Top→Bottom | OFF | `C01 C05 C09 C02 C06 C10 C03 C07 C11 C04 C08 C12` | REF-003 straight |
| 6 | Column | Top→Bottom | ON | `C01 C05 C09 C10 C06 C02 C03 C07 C11 C12 C08 C04` | REF-003 |
| 7 | Column | Bottom→Top | OFF | `C09 C05 C01 C10 C06 C02 C11 C07 C03 C12 C08 C04` | REF-004 straight |
| 8 | Column | Bottom→Top | ON | `C09 C05 C01 C02 C06 C10 C11 C07 C03 C04 C08 C12` | REF-004 |

Переключение Numbering в UI сохраняет «реверсивность» через существующий
`changeNumbering` (`state.ts:55`: `LTR ↔ TTB`, `RTL ↔ BTT`, Snake сохраняется);
покрыто `state.test.ts:19-25`. Явный выбор Direction из селекта валидируется спариванием;
Snake — независимый тоггл.

## 7. Единственная мутация (canvas и Properties — один путь)

Вводится ровно одна app-операция изменения структуры (имя-кандидат, финальное имя
фиксирует production PR; поведение — этот параграф):

```text
updateScreenCabinetConfig(project, screenId, patch)
patch: { columns?: number; rows?: number; ordering?: GridOrdering }
```

Контракт:

* Валидация атомарна до любого построения: целые `>= 1`, лимиты preview от
  противоположного измерения, ordering-токены из конечных unions, спаривание
  ось-направление (делегировано core — `cabinetIndex` кинет `UNSUPPORTED_ORDERING`
  на невалидной паре). Любой отказ — throw, **ноль частичного применения**,
  входной `Project` не тронут.
* Построение — тем же путём, что `resizeScreenGrid`: `draftFromConfig`-обобщение
  (текущий config + patch) → `buildSnapshot(seed = текущий ScreenView)` →
  замена ровно одного `ScreenView`. Сохраняются: Screen/Grid ID, имена, позиция `x/y`,
  модульная геометрия, surviving `(id, column, row)`, монотонность `nextCabinetSerial`.
  Остальные Screen возвращаются теми же ссылками.
* `index`/`path`/`resolution`/`pixelCount` — только из core (`cabinetIndex`,
  `cabinetOrder`, `gridPixelSize`); app формул ordering не содержит.
* `resizeScreenGrid` сохраняется как есть (или делегирует новой операции с
  `{columns, rows}`-патчем — решение production PR; поведение и тесты 003
  неизменны). Двух параллельных путей мутации (`A` для canvas, `B` для Properties)
  быть не должно — нарушение этого правила блокирует приёмку.
* Ordering-only патч не трогает `nextCabinetSerial` и массив identity (только `index`/`path`).

## 8. Preview / Commit

Сохраняется принятый pattern 003 (`interaction → transient preview → single commit`):

* Во время preview domain state неизменён: `Project` не мутирует, `nextCabinetSerial`
  не расходуется, pending-ячейки рисуются без ID и номеров (`canvas.ts`: preview-конфиг
  `{...config, columns, rows}` для пути/подписей, вне-grid кабинеты пропускаются).
* Commit — ровно одна мутация §7. Если таргет равен исходному — ноль коммитов.

Numeric Properties (формализация наблюдаемого `numberField`, `index.ts:277-301`):

```text
typing          → локальный draft в input, ноль domain-эффектов
change (Enter / blur) + valid → ровно один commit через §7, rerender
change + invalid → aria-invalid + title, revert к последнему committed,
                   ноль коммитов, domain state сохранён
Escape во время редактирования → существующий window-хендлер (end gesture +
  clear selection + rerender) уничтожает input → draft отброшен, ноль коммитов
```

Canvas resize (формализация наблюдаемого, `index.ts:478-608`):

```text
pointerdown на handle (right/bottom/bottomRight) → захват исходного
  {startColumns, startRows}, selection = screen, приоритет над drag
pointermove → только пересчёт {columns, rows} с дискретным snapping
  round(dx/cabinetWidth), clamp 1..limit от стартового противоположного измерения;
  частичных кабинетов нет; только draw(), ноль domain-мутаций
pointerup → таргет ≠ исходному: ровно один commit §7; равен: ноль коммитов
pointercancel / Escape → отмена жеста, ноль коммитов, исходный grid и ID нетронуты
```

## 9. Properties UI

Порядок блоков Screen (канон Design System, без изменений структуры 003):

```text
Screen
  Name                       (readonly, stored)
  Position    X, Y           (number input, view-state; контракт 002 без изменений)
  Cabinet Grid  Columns, Rows (number input, §8; лимит от противоположного измерения)
  Cabinet size  Width, Height (readonly, derived)
  Calculated Screen Size     (readonly, derived)
  Cabinets    N              (readonly, derived)

ORDER (расширение 004; при отсутствии selection-Grid показывается здесь же)

  Numbering   [ Row ▼ | Column ]                       (stored)
  Direction   [ Left → Right ▼ | Right → Left ]        (stored; опции только
                для Column: [ Top → Bottom | Bottom → Top ])
  Snake       [ ✓ ]                                    (stored boolean)
```

Правила:

* При смене Numbering Direction транслируется через `changeNumbering` (реверс сохраняется,
  Snake сохраняется); пользователь видит только валидные пары.
* Cabinet Grid selection редактирует те же `Columns/Rows` через тот же §7; selection
  переживает commit (контракт 003 §5).
* Cabinet selection остаётся readonly (`Physical ID`, логический `#n`, `column/row`, Screen).
* `Cabinet Resolution Width/Height` и `Screen Width/Height` — вычисляемые, редакторов нет.
* Никаких новых презентационных лейблов вне канонических токенов ADR-011/023
  (`row/column`, `left-to-right/right-to-left/top-to-bottom/bottom-to-top`, `snake: boolean`).

## 10. Canvas UI (изменения 004)

* Handles, drag, pan/zoom/fit, hit-test, bounds — без изменений (003 §5, 002 §6).
* Подписи кабинетов: physical `C…` + derived `#n = index+1`; после ordering-commit номера
  пересчитываются из `cabinetIndex`, позиции и ID неподвижны.
* Направленный путь сигнала перерисовывается из `cabinetOrder()` нового конфига.
* Preview во время resize — по правилам §8; pending-ячейки без идентификаторов.
* Camera при commit не перестраивается (правило 003); `Fit to Project` учитывает новые bounds.

## 11. Recalculation (немедленно после commit)

```text
Cabinet physical grid (cells + bounds + hit-test)
Cabinet traversal order (index/path)
Screen pixel dimensions (resolution == gridPixelSize(grid))
Cabinet labels / order overlay
Project bounds + selection frame + tree
```

Future consequence — только architecture note, не механизм: в полном pipeline смена Grid
сделает Mapping warnings / Hardware recalc / Signal stale / Export blocked (EDIT ONCE →
MODEL → VIEWS, ARCHITECTURE-001 §12). В executable scope 004 никаких Mapping/Hardware
invalidation-механизмов не вводится.

## 12. Error behaviour

| Ввод | Реакция |
|---|---|
| `Rows/Columns = 0, -1` | полевая ошибка `≥ 1`, revert, ноль коммитов |
| текст, `1.5`, `NaN`, `Infinity`, пустое, unsafe integer | `aria-invalid`, revert, ноль коммитов |
| сверх лимита preview | `limited to N for this screen`, revert, ноль коммитов |
| cross-axis Direction (недостижимо из UI) | `UNSUPPORTED_ORDERING` из core → сообщение, ноль коммитов |
| `startCorner ≠ top-left` (программно) | `UNSUPPORTED_ORDERING`, ноль коммитов |
| неизвестный `screenId` | throw `Unknown screen`, проект нетронут |

Инвариант: невалидный ввод никогда не создаёт частично-невалидных domain-объектов;
после отказа предыдущий snapshot/`<Project>` — единственное состояние.

## 13. REF-001 — обязательная acceptance fixture

```text
Grid 4 × 3, Cabinet 128 × 128 px
Numbering Row, Direction Left → Right, Snake ON
```

Physical (неподвижно при любом ordering):

```text
row 0: C01 C02 C03 C04
row 1: C05 C06 C07 C08
row 2: C09 C10 C11 C12
```

Logical traversal:

```text
C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12
```

Критический инвариант: Snake меняет traversal, не physical placement. Любой production
PR, ломающий эту fixture, отклоняется независимо от остального diff.

## 14. Acceptance-test matrix

Существующее покрытие (расширять, не дублировать стиль):

* `packages/core/test/cabinet-engine/cabinet-order*.test.ts` — truth table §6 уже исполнена
  (REF-001…004 + straight-варианты + cross-axis rejection `ref-003.test.ts:127-130`).
* `packages/app/test/state.test.ts` — single-screen ordering с сохранением ID (§27-42),
  `changeNumbering`-трансляции, прямоугольная геометрия, атомарный отказ.
* `packages/app/test/resize.test.ts` — derived size, серийный аллокатор (сохранение /
  неповторяемость / идемпотентность / непрозрачность / пересчёт index), единственный
  `resizeScreenGrid`, изоляция экранов, отказы, `1×1`.
* `packages/app/test/project.test.ts` — конвенции project-state unit-тестов.
* `packages/app/test/electron-smoke.mjs` — реальное окно (Properties-коммиты, drag handles,
  `aria-invalid`, REF-001 safety, скриншоты в `packages/app/out/smoke/`).

Новые тесты production PR (минимум):

| # | Файл | Проверка | Ожидаемое |
|---|---|---|---|
| G1 | `cabinet-config.test.ts` (new) | `4×3 → 5×3` через §7 | 12 старых ID на тех же клетках + ровно 3 новых детерминированных; serial +3 |
| G2 | `cabinet-config.test.ts` | `5×3 → 4×3` | удалены клетки `column=4`; остальные ID и serial-монотонность сохранены |
| G3 | `cabinet-config.test.ts` | `4×3 → 4×4` | новая строка `C13…C16`-серийные (по текущему счётчику), детерминированно |
| G4 | `cabinet-config.test.ts` | shrink→grow cycle | удалённые ID не переиспользуются |
| O1–O8 | `cabinet-config.test.ts` | truth table §6 (8 комбо) через §7 на REF-геометрии | traversal равен `cabinetOrder()`; `(id,column,row)` неизменны |
| I1 | `cabinet-config.test.ts` | ordering-only patch | `cabinets` по `(id,column,row)` равны до/после; `nextCabinetSerial` неизменён; `index/path` пересчитаны |
| I2 | `cabinet-config.test.ts` | geometry patch | `ordering` конфига неизменён; позиция Screen, имена, ID Screen/Grid неизменны; остальные Screen — те же ссылки |
| V1 | `cabinet-config.test.ts` | `0/-1/1.5/NaN/текст/лимит/cross-axis/unknown screen` | throw, входной `Project` референсно нетронут |
| P1 | `cabinet-config.test.ts` | повтор таргета | идемпотентно, serial не растёт |
| S1 | smoke extend | Properties: Columns/Rows/Numbering/Direction/Snake коммиты | `dump()` показывает commit, bounds/подписи обновлены, остальные экраны нетронуты |
| S2 | smoke extend | drag `bottomRight` + `Escape`/`pointercancel` | preview без мутации (`preview()` не null во время жеста, `dump()` неизменён), commit ровно один, отмена — ноль |
| S3 | smoke extend | REF-001 safety после ordering-переключений | порядок Screen 1 `1 2 3 4 8 7 6 5 9 10 11 12` при Snake ON |

## 15. Production plan и точные файлы

Production PR — только после отдельного approval этого spec-gate. Ожидаемый diff:

* `packages/app/src/renderer/project.ts` — новая операция §7 (+ unit-путь `draftFromConfig`-обобщение); `resizeScreenGrid` без поведения-изменений.
* `packages/app/src/renderer/index.ts` — ORDER-контролы Properties (§9) через общий commit §7; Direction-опции по оси Numbering; smoke-hook только при необходимости (hook read-only, не API).
* `packages/app/src/renderer/canvas.ts` — только если ordering-меткам нужен новый overlay; путь/подписи уже derived — ожидается ноль или минимальный diff.
* `packages/app/test/cabinet-config.test.ts` — new (матрица G/O/I/V/P).
* `packages/app/test/electron-smoke.mjs` — extend (S1–S3 + скриншоты).
* Без изменений: `packages/core/**`, `.ledmap` schema, `project-model/*`, сериализация, математика, reference-тесты, IPC/preload, packaging.

Критерии разрешения production (повтор §17 задания, исполнимость проверена инспекцией):

* mutation path §7 однозначен и единственный; обход invariants невозможен по построению;
* stored/derived/view-state по §3; preview/commit по §8; canvas+Properties один путь;
* identity §5; truth table §6; REF-001 §13; errors §12; тесты §14 перечислены;
* ADR-027 Accepted.

## 16. Связь с vision-backlog

После закрытия 004 production: `UI-04 Selection → UI-05 Productivity → Layout acceptance`
(ADR-028). Никаких Mapping/Hardware/Signal/Test/Export работ этот этап не открывает.
