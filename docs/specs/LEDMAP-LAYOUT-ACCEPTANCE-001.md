# LEDMAP-LAYOUT-ACCEPTANCE-001 — Layout Acceptance / Polish

**Статус:** Accepted — spec + polish production Accepted; **Layout v1 CLOSED как workflow.**

**Baseline:** UI-05 CLOSED (1316 unit PASS + smoke T1–T6; snap/align/distribute/guides).

**Upstream:** ALPHA-UI-001…004, UI-04 (`LEDMAP-UI-04-001`), UI-05 (`LEDMAP-UI-05-001`); решение — [ADR-031](../DECISIONS.md#adr-031-layout-acceptance--polish); backlog пункт 4.

Новых Layout capabilities не добавляется. Задача — проверить Layout как единый workflow и закрыть только найденные interaction-дефекты.

## 1. Integration inspection report

Проверено чтением фактического кода (`index.ts` заданные строки, `canvas.ts` View/отрисовка, `project.ts`/`selection.ts`/`productivity.ts` операции) плюс существующие unit/smoke-покрытия.

### Selection — НАЙДЕН BLOCKER (A-01)

`selectedGuideId` пишут 4 сайта (guide click, add-guide, guide delete/clear), а Screen-selection пишут 13 сайтов (`index.ts`: 264, 274, 315, 745, 767, 774, 924, 928, 944, 1011, 1054, 1080, 1197) — ни один Screen-путь guide не сбрасывает. `renderProperties` проверяет guide первым, поэтому после `Guide → Screen click` панель показывает Guide, а canvas/tree — Screens. Canvas тоже двойственно подсвечивает (guide highlight + screen outlines). Инвариант `selectedGuideId ≠ null ⟹ items empty` ничем не enforced.

Обратное направление корректно: выбор гайда всегда очищает Screen-набор. Escape чистит оба. Box-restore (944) и box-cancel-restore корректны и трогать их нельзя (восстанавливают предыдущее состояние, а не устанавливают новое).

### Selection — остальное чисто

Tree ↔ canvas ↔ Properties синхронизированы через единый `render()`; primary детерминирован (`last wins`, box — project order, Ctrl+box zero-new сохраняет); cabinet inspect всегда replace-single и не смешивается с Screen-набором (toggle только для Screens, в дереве и на canvas); `activeScreenId` следует за primary screen, repair при delete — первая Screen в project order либо `null`.

### Gestures — чисто с оговорками

Приоритет соблюдён: resize handle (только single unlocked) > group drag с lock-проверкой > toggle/select > guide (только мимо Screens) > box > pan. `pointercancel`/`Escape` не оставляют transient state для box/guide/resize/preview (box/guide восстанавливают предыдущее). Оговорка A-04: drag пишет позицию инкрементально, поэтому `pointercancel` посреди drag оставляет частичное перемещение — без undo-инфраструктуры restore невозможен; фиксируется как future, не чинится здесь.

### Keyboard — чисто

Space/arrows/Delete/Ctrl+D guarded (`INPUT/SELECT/TEXTAREA/BUTTON`), жесты блокируют (`pointerMode !== 'none'`), Escape — blur-first только для текстовых контролов (ADR-029 уточнение). Property editing не вызывает canvas-команд: `change` коммитит в модель, стрелки в input принадлежат input.

### Lock — равномерно

Все шесть операций проверяют один `groupActionBlocker`: drag, nudge, delete, align, distribute + resize/commit guards для locked single (handles скрыты, Properties-коммиты отклонены). Duplicate locked → allowed/unlocked. Locked guide: selectable/inspectable/snap-target, не move/delete target. Причины — в `canvasNote`.

### Snap — чисто

Tolerance в screen px (zoom-инвариантно), negatives по нормативной формуле, group offsets сохраняются (единый delta на набор), moving set исключён из целей, overlay рисуется из реально применённой correction (`correction.lines`). Alt читается per-`pointermove` только в drag-ветке (resize/nudge/guide/box его не видят).

### Geometry — чисто

Resize/duplicate/move/snap/align/distribute не меняют `config`: spread `{...s, x, y}` сохраняет grid/ordering/cabinets; duplicate пересобирает тот же config через `buildSnapshot` (тот же engine, свежий identity-namespace). REF-001 traversal защищён существующими unit + smoke.

### Guides — чисто кроме A-01

Mutual exclusion в одну сторону (guide→screens), CRUD/lock не трогают `Project`/domain (отдельный массив), off-viewport/negative позиции детерминированы (project-координаты, hit-test везде). Выбор гайда при пустом canvas подтверждается smoke T3.

### Visual/UI — один polish (A-02)

Single/multi/primary/locked различимы (толщина outline + outer рамка primary + `· locked` в label + badge-логика, не только цвет). Align/Distribute disabled с причинами. Multi-Properties read-only summary. Но chip при выбранном гайде говорит `No selection` — противоречит панели Guide (A-02).

## 2. Defects

| ID | Описание | Классификация |
|---|---|---|
| A-01 | Screen-selection пути не сбрасывают `selectedGuideId` → Properties показывает Guide при выбранных Screens (и двойная canvas-подсветка) | **blocker** |
| A-02 | Chip `No selection` при выбранном гайде | polish |
| A-03 | `activeScreenId`-repair после delete покрыт только unit-уровнем `repairSelection`, сквозного smoke-assert нет | polish (покрытие) |
| A-04 | `pointercancel` посреди drag оставляет частичное перемещение (restore невозможен без undo) | future/non-goal (не чинить; undo — отдельный контракт) |
| A-05 | Delete/Grid-selection и cabinet-only набор — no-op без сообщения | accepted (задокументировать как v1-поведение, не дефект) |
| A-06 | Escape во время guide-drag восстанавливает позицию и — как для всех жестов — снимает выбор (uniform cancel; ранее в спеке было неточно stated обратное, исправлено production review без изменения кода) | accepted (зафиксировать asserts текущего поведения) |

## 3. Minimal production fix plan (только по отдельному approval)

1. Ввести `setScreenSelection(next: SelectionState)` — единственное место, устанавливающее Screen-набор: присваивает `selection` и сбрасывает `selectedGuideId`. Перевести все устанавливающие сайты (264, 274, 315, 745, 767, 774, 924, 928, 1011, 1054, 1080; Escape-1197 уже чистит оба явно). НЕ переводить restore-пути 944/box-cancel (восстановление предыдущего, инвариант сохраняется исходным состоянием).
2. `chipText`: ветка гайда (`Guide selected`) — чинит A-02.
3. Smoke-дополнения: `Guide → Screen click → properties показывает Screen, guide highlight снят`; `Screen → Guide → Screen` туда-обратно; `activeScreenId` после delete-all-selected (A-03); повтор A-05/A-06 как явные asserts текущего поведения.
4. Файлы: `packages/app/src/renderer/index.ts`, `packages/app/test/electron-smoke.mjs`. Без изменений: `packages/core/**`, `canvas.ts`, `project.ts`, `selection.ts`, `productivity.ts`, сериализация, IPC, persistence.

## 4. Acceptance matrix (полный Layout workflow, journey LAY-*)

LAY-01 Launch → demo 3 Screens, REF-001 порядок на Screen 1. LAY-02 select Screen (canvas+tree), Properties редактируемые. LAY-03 Rows/Columns commit + identity continuity. LAY-04 Numbering/Direction/Snake truth table видима в renderer. LAY-05 duplicate (новые ID, +32/+32, selection переходит). LAY-06 multi-select + primary детерминирован + multi summary read-only. LAY-07 group drag (одна delta, offsets) + Alt raw. LAY-08 nudge 1/Shift-10 + focus-guard. LAY-09 lock/unlock: шесть блокировок + duplicate-unlocked. LAY-10 resize handles/single + preview/commit/Escape. LAY-11 guide create/move/lock/delete + mutual exclusion туда-обратно (A-01 regression). LAY-12 snap Grid/Edge/Guide + tolerance zoom-инвариантность + overlay==correction. LAY-13 align ×6 + distribute ×2 на тройке/четвёрке. LAY-14 delete + repair (selection/active/tree/canvas) + add без live-коллизий. LAY-15 empty click/Escape → `No selection`, guide снят. LAY-16 REF-001 survival: после всего workflow без config-изменений traversal `1 2 3 4 / 8 7 6 5 / 9 10 11 12` и те же cabinet identities.

Покрытие на baseline: LAY-01…10, 12…16 в основном покрыты существующими unit/smoke; deltas polish — A-01 regression, A-02 chip, A-03 activeScreenId asserts, A-05/A-06 asserts поведения.

## 5. Non-goals gate

Без новых capabilities: без rulers, anchor mode, bulk editing, persisted guides/lock, undo, cabinet bulk-ops, Shell/Project/Mapping/Hardware, UI-05 extensions, рефакторингов состояния. Закрытие этого gate переводит Layout v1 в CLOSED как workflow и открывает `NEXT — Shell / Project foundation`.
