# LEDMAP-ALPHA-UI-003 — Early Alpha UI: Screen Resize via Cabinet Grid

Статус: **Accepted — одобрено пользователем 2026-09-27 с двумя обязательными корректировками**: canvas-resize выполняет transient preview и ровно один commit на `pointerup`; `nextCabinetSerial` — аллокатор identity, отделённый от `displayNumber`/signalling order. Основание: третья итерация Early Alpha UI, расширяющая [LEDMAP-ALPHA-UI-002](LEDMAP-ALPHA-UI-002.md) в части редактирования физического размера Screen. Базовые контракты [LEDMAP-ALPHA-UI-001](LEDMAP-ALPHA-UI-001.md) и `002` сохраняются в части границ core/app, интеграции, лимитов preview и запретов.

## 1. Цель и границы

Третья итерация даёт пользователю менять физический размер выбранного Screen через параметры его Cabinet Grid: `Columns` и `Rows` — в панели Properties и дискретным drag за resize handles на canvas. Итоговое разрешение экрана остаётся **производной** величиной, а не независимым полем.

Единственный источник размера — сетка кабинетов:

```text
screenWidth  = grid.columns * grid.cabinetWidth
screenHeight = grid.rows    * grid.cabinetHeight
```

Пример REF-001 (`cabinetWidth = cabinetHeight = 128`, `columns = 4`, `rows = 3`): `512 × 384 px`, 12 кабинетов. При `columns = 5`: `640 × 384 px`, 15 кабинетов.

Вне этапа (запреты ALPHA-UI-001/002 и TODO сохраняются): Open/Save `.ledmap`, привилегированный IPC и preload, сериализация, UI Hardware/Mapping/Remap/Validation, экспорт, packaging, undo/redo, попиксельный preview, произвольный Screen scale. `packages/core`, его public API, математика и reference-тесты **не изменяются** — см. §7.

## 2. Пользовательский сценарий

1. Пользователь выбирает Screen (клик по контуру/дереву или `+ Screen`) — `SelectionContext` не меняется: `selection = { type: 'screen', id }`, `activeScreenId` равен `screen.id`.
2. Properties выбранного Screen показывает редактируемые `Columns` и `Rows` и read-only `Cabinet size`, `Calculated Screen Size`, `Cabinets`.
3. Изменение `Columns` 4 → 5 немедленно перестраивает только этот Screen: 15 кабинетов, `640 × 384 px`, пересчитанные bounds, сигнальный путь и номера — тем же Cabinet Engine, что и обычный grid.
4. Изменение `Rows` 3 → 4 даёт `5 × 4`, 20 кабинетов, `640 × 512 px`.
5. На canvas у выбранного Screen доступны три handle: `right` (→ columns), `bottom` (→ rows), `bottomRight` (→ columns + rows). Drag дискретен по кабинетам, минимум 1; во время drag виден preview нового grid, по `pointerup` изменение остаётся в состоянии.
6. Escape во время активного drag отменяет resize целиком, возвращая исходный grid, кабинеты и ID.
7. Остальные Screen не изменяются. `Fit to Project` учитывает новые bounds, рамка выделения совпадает с новым размером, кабинеты полностью заполняют экран.

## 3. Модель представления: кабинеты становятся состоянием

Текущая реализация regenerates кабинеты при каждом build и выдаёт позиционные ID `C{row * columns + column + 1}` (`state.ts:97-102`), поэтому изменение `columns` перенумеровывало бы все кабинеты. Это несовместимо с требованием сохранять ID существующих кабинетов, поэтому:

- `PreviewCabinet` остаётся `{ id, index, column, row }`, но **список кабинетов входит в `Snapshot`/`ScreenView` как состояние** и переиспользуется при resize.
- Идентичность кабинета — пара `(column, row)` внутри Screen плюс стабильный `id`. `index` остаётся **производной** величиной и пересчитывается через `cabinetIndex()` при каждом build, поэтому логический порядок всегда соответствует `ordering` и никогда не хранится как источник истины.
- `Snapshot` получает монотонный счётчик **`nextCabinetSerial: number`** — это **аллокатор идентичности**, а не нумерация. Новый ID выдаётся только как `C{serial}` с увеличением, поэтому **ID никогда не переиспользуется**, даже если кабинет был удалён shrink-операцией и его позиция затем занята снова. Это делает «ID = стабильная идентичность» проверяемым инвариантом.
- **Идентичность и номер — разные вещи.** `nextCabinetSerial` распределяет только идентичность и MUST NOT определять `displayNumber`, сигнальный порядок или позицию в grid. `C…` — непрозрачный физический ID: он не выводится из `(column, row)`, не совпадает с логическим номером и не перенумеровывается при resize. Логический номер `#n` остаётся **производной** величиной от `cabinetIndex()` и всегда соответствует текущему `ordering`. Существующий формат `C01…C12` на canvas и в Properties сохраняется как принятый контракт ALPHA-UI-002 §6; изменение его на `cab_17`-подобную схему в эту итерацию не входит.
- Семантика resize: кабинеты, чья пара `(column, row)` остаётся внутри нового grid, **сохраняют ID**; вышедшие за границу удаляются; недостающие создаются с новыми ID. Пересоздания «всех заново» нет.
- Порядок обхода при build остаётся row-major (как сейчас), но ID присваиваются из сохраняемого состояния, а не из позиции в цикле.

Существующий лимит preview ALPHA-UI-001 (1024 кабинета на grid, 65 536 модулей суммарно) сохраняется и теперь ограничивает resize.

## 4. Операция resize

Одна чистая функция над `Project`, рядом с существующими `moveScreen` / `setScreenPosition` / `addScreen`:

```ts
resizeScreenGrid(project: Project, screenId: string, columns: number, rows: number): Project
```

- Валидирует `columns`/`rows`: positive safe integer, `>= 1`, в пределах лимита preview; невалидный ввод отклоняется **без** частичного применения.
- Строит новый snapshot выбранного Screen из его текущего `config` с новыми `columns`/`rows`, передавая текущие кабинеты и счётчик как seed для непрерывности ID, поэтому `Screen.resolution` пересчитывается той же формулой, что и при создании экрана.
- Остальные Screen возвращаются без изменений (тот же readonly `ScreenView`).
- Мутация применяется только к выбранному Screen; core-инвариант `Screen.resolution == grid pixel size` (`mapping-engine/resolve.ts`) сохраняется по построению.
- **Properties коммитит сразу:** валидация → `resizeScreenGrid(...)` → render. **Canvas коммитит один раз:** `pointerdown` захватывает исходное состояние, `pointermove` только считает preview, `pointerup` вызывает `resizeScreenGrid(...)` ровно один раз. Preview — временное состояние жеста наравне с `hover` и selection rectangle: оно не содержит кабинетов, не подменяет Project Model и исчезает при commit, отмене или потере захвата указателя.
- Благодаря отложенному commit идентичность кабинетов **не зависит от траектории мыши**: серия `4×3 → 5×3 → 4×3 → 5×3` в рамках одного drag завершается тем же набором ID, что и одиночный `4×3 → 5×3`, а кабинеты, временно вышедшие за границу предпросмотра, своих ID не теряют.

Путь от пользователя до модели один: Properties и canvas handles вызывают **эту же** функцию. Собственного DOM-состояния, параллельного источника истины или локального кэша размера не появляется; после перерисовки из project state тот же grid восстанавливается.

**Единый app-helper размера.** Формула размера применяется ровно в одном месте — `gridPixelSize(grid)` в app, возвращающей `Size`. Через неё считаются `Screen.resolution` при build, размеры для Properties, renderer, resize handles, hit-testing и `projectBounds`/`screenBounds`, поэтому формула не расходится по подсистемам. Инвариант «хранимое `Screen.resolution` совпадает с `gridPixelSize(grid)`» проверяется unit-тестом, а расхождение не может возникнуть незаметно.

## 5. Properties и canvas

**Properties выбранного Screen** (порядок блоков):

```text
Screen
  Name                          (readonly)
  Position        X, Y          (number input, как сейчас)
  Cabinet Grid    Columns, Rows (number input, новое)
  Cabinet size    Width, Height px (readonly)
  Calculated Screen Size  Width, Height px (readonly, визуально read-only)
  Cabinets        N             (readonly)
```

- Валидация `Columns`/`Rows`: целое `>= 1` в пределах лимита. Пустой или некорректный ввод помечает поле `aria-invalid` и сохраняет последнее допустимое значение — тот же контракт, что у существующих X/Y. Молчаливого округления и `NaN`/`Infinity` не принимается.
- Существующий helper `numberField` получает необязательный валидатор; поведение X/Y не меняется.

**Handles на canvas:**

- Активны ровно три: `right`, `bottom`, `bottomRight`. Handles `left`/`top` в этой итерации **не рисуются**, чтобы на canvas не было квадратов, которые нельзя тянуть.
- `right` меняет только `columns`, `bottom` — только `rows`, `bottomRight` — оба.
- Snapping дискретный по кабинетам: `newColumns = clamp(round((startWidth + dx) / cabinetWidth), 1, limit)`, `newRows = clamp(round((startHeight + dy) / cabinetHeight), 1, limit)`. Частичных кабинетов не возникает по построению: `columns * cabinetWidth` всегда ровно `screenWidth`.
- Drag внутри экрана по-прежнему меняет только позицию (`moveScreen`); resize handle меняет только `columns`/`rows`. Эти действия не смешиваются: handle имеет приоритет над drag в `pointerdown`, а interior экрана — над resize.
- **Preview дискретен и не аллоцирует идентичность:** показывается сетка целевого размера, существующие кабинеты сохраняют свои ID и подписи, а ячейки, которых в модели ещё нет, рисуются как pending-области **без** идентификаторов и номеров. Номера `#n` в preview считаются из preview-конфига существующим `cabinetIndex()`, сигнальный путь — из `cabinetOrder()`, то есть обе величины остаются производными.
- `pointerup` фиксирует ровно одну мутацию; `pointercancel` и Escape во время жеста отменяют изменение без коммита, поскольку project state не был изменён.
- Минимальный размер — один кабинет по каждой оси; при `1 × 1` дальнейший drag в эту сторону ничего не меняет.
- Camera автоматически не перестраивается при resize (текущее поведение: `Fit to Project` и первичная отрисовка). Кнопка `Fit to Project` учитывает новые bounds, поскольку `projectBounds`/`screenBounds` считаются от `Screen.resolution`.

**Согласованность слоёв:** изменение позиции и изменение структуры — разные операции с разными состояниями указателя; `bounds`, hit-testing кабинетов, рамка выделения, подпись Screen и дерево перечитывают то же состояние, поэтому расхождение canvas и модели невозможно.

## 6. Тесты

Обязательны автоматические тесты, а не только ручная проверка.

**Unit (app, `packages/app/test/`):**

| Проверка | Ожидаемый результат |
|---|---|
| Начальное состояние `4 × 3`, кабинет `128 × 128` | `width = 512`, `height = 384`, `cabinets.length = 12` |
| `resize` до `5 × 4` | `width = 640`, `height = 512`, `cabinets.length = 20` |
| Непрерывность ID при `4 × 3 → 5 × 3` | все прежние 12 ID присутствуют с теми же `column`/`row`; 3 новых получили новые ID |
| Порядок после resize | `order` равен `cabinetOrder()` для нового grid, номера совпадают с `cabinetIndex()` |
| Отсутствие переиспользования ID | после `4 × 3 → 4 × 1 → 4 × 3` удалённые и заново созданные кабинеты имеют разные ID |
| Изоляция экранов | resize Screen 1 не меняет Screen 2 и Screen 3 |
| Валидация | `0`, отрицательные, дробные, `NaN`, `Infinity`, пустое значение отклоняются, состояние не меняется |
| Регрессия REF-001 | порядок Screen 1 `1 2 3 4 8 7 6 5 9 10 11 12` сохраняется до и после resize |

**Electron smoke (реальное окно):** Properties-ввод `Columns 4 → 5` и `Rows 3 → 4` с проверкой `dump()`, границ и подписи; drag `bottomRight` handle с проверкой целочисленного `columns`; `aria-invalid` на пустом вводе; неизменность остальных экранов; REF-001 safety; скриншот.

Регрессия: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke` — локальный PASS. Локальные результаты не объявляются результатом CI.

## 7. Границы core и отклонения от исходного ТЗ

- **`packages/core` не меняется.** Формула размера остаётся в app как единственный helper `gridPixelSize(grid)`, потому что `gridPixelSize` в core уже вычисляется из другого источника — `pixelWidth/pixelHeight` первого Cabinet в hardware topology (`mapping-engine/resolve.ts`), а не из `grid.cabinetWidth/cabinetHeight`. Смешивать эти два источника означало бы изменить семантику `resolveMapping`. Новое публичное имя в core этап не вводит.
- **Сериализация v1 (7D) не затрагивается:** `columns`, `rows`, `cabinetWidth`, `cabinetHeight` и кабинеты уже являются полями v1, изменение схемы не требуется. Open/Save остаётся Phase 8.
- **Отклонение от исходного ТЗ: `Cabinet Resolution Width/Height` остаются read-only.** В текущей модели размер кабинета не хранится как редактируемое поле: `cabinetWidth` выводится как `moduleColumns * modulePixelWidth` (`state.ts:82-83`). Редактирование «разрешения кабинета» неоднозначно (одному `cabinetWidth` соответствует много пар `moduleColumns`/`modulePixelWidth`), требует политики разбиения и затрагивает module-level геометрию вместе с контрактом Cabinet Pixel Layout. Это относится к возвращаемому в Phase 8 редактору geometry/ordering, а не к изменению размера Screen. Итерация 3 меняет только структуру сетки — `Columns`/`Rows`.
- **Отклонение: `left`/`top`/`topLeft`/`topRight`/`bottomLeft` handles не реализуются.** Они требуют одновременной корректировки `Screen.position`, чтобы противоположная сторона оставалась неподвижной; это отдельное усложнение. Итерация 3 ограничена тремя handles и явным требованием не смешивать операции.
- **Отклонение: undo/redo не реализуется.** Механизма истории в проекте нет, а он запрещён на текущем этапе (`LEDMAP-ALPHA-UI-002.md` §1, `TODO.md`). Пункты приёмки 10–11 исходного ТЗ снимаются как неприменимые. Отдельный history/transaction-механизм ради одной функции не заводится.
- **Соответствие требованию отложенного commit.** Требование «preview во время drag, одна commit-операция на `pointerup`» реализовано полностью (§4, §5): временное состояние `resizePreview` не содержит кабинетов и не является источником истины, а `resizeScreenGrid()` вызывается ровно один раз за жест. Поэтому зависимости identity от траектории мыши не возникает.
