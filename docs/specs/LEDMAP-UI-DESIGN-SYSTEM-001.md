# LEDMAP-UI-DESIGN-SYSTEM-001 — Design System Vision

**Версия:** 1.0

**Статус:** Accepted — vision, docs-only. Токены обязательны для всех будущих wireframes и production UI; реализацию вводит только авторизованный production gate.

**Baseline:** `02e8483`.

**Upstream:** [LEDMAP-UI-ARCHITECTURE-001](LEDMAP-UI-ARCHITECTURE-001.md), [LEDMAP-UI-WIREFRAMES-001](LEDMAP-UI-WIREFRAMES-001.md), [ADR-028](../DECISIONS.md#adr-028-ui-architecture-vision).

## 1. Layout-правила

* Canvas доминирует. Фиксированные ширины: `Project Tree 240 px`, `Properties 300–340 px`, `Workspace flex`. Сайдбары скрываются по `Tab` или отдельными тогглами; скрытие не меняет модель.
* Порядок Properties Screen (канон): `Name (stored) → Position X,Y (view) → Cabinet Grid Columns,Rows (stored) → Cabinet size (derived, readonly) → Screen size (derived, readonly) → Cabinets N (derived, readonly) → Ordering (stored, readonly до ALPHA-UI-004)`. Grid/Cabinet — readonly сводки. Вычисляемое никогда не редактируется.
* Empty states — CTA, не серый canvas (`No LED Screens yet → [+ Add Screen]`, `No Input Canvas → [+ Input Canvas]`, `No Processors → [+ Processor] [Skip]`, `No assignments → [Go to Hardware]`).
* Breadcrumbs для nested editing clickable: `Layout > Main LED > Cabinets > C08 > Modules`, `Hardware > Processor P01 > Port 1 > R02`. `Esc` — cancel/deselect/exit nested.

## 2. Типографика и spacing

* Один sans-шрифт renderer (системный стек, без веб-зависимостей). Размеры: Title 15–16 semibold, Section header 12–13 semibold uppercase, Body 13, Caption/derived values 12, Canvas labels 11–12 (скрываются при мелком zoom с пояснением).
* Spacing-база 4 px: `4 / 8 / 12 / 16 / 24`. Отступы панелей 12–16, секции Properties разделены hairline, поля — label сверху, input 28–32 px высотой.
* Числа: тысячи с разделителем (`131,072 / 655,360 px`), разрешения `1024 × 512 px`, физические `4000 × 2000 mm`.

## 3. Цвета и статусы (семантика, не hex-канон)

* Роли: `selection` (контур выбранного + chip + properties-title согласованы), `hover` (лёгкая подсветка), `preview` (стиль ≠ saved: dashed/полупрозрачный + pending-ячейки без ID), `error` (поле + таб `✕` + Preflight), `warning` (`⚠` non-blocking), `stale` (`●` требует пересчёта), `disabled/readonly` (derived-поля визуально read-only).
* Статусы вкладок/Preflight: `✓ valid / ⚠ non-blocking / ✕ blocking / — not configured / ● stale` — из агрегатора WorkspaceStatus (ARCHITECTURE-001 §3), не из `7C` напрямую.
* Hardware overlays: `None / Receiver / Port / Processor / Capacity / Assignment Status`. Цвет кабинетов — visualization; source of truth — assignments. Unassigned: подпись `UNASSIGNED` + фильтр `All / Assigned / Unassigned / Locked / Errors`.
* Canvas overlays общие: `Screen Names, Cabinet IDs, Module Grid, Pixel Grid, Mapping Bounds, Receiver Colors, Port Colors, Signal Order, Address Range, Validation`. Per-workspace наборы — WIREFRAMES-001. Без необходимости отдельный canvas на задачу не заводится.

## 4. Icons и toolbar

* Toolbar — текстовые кнопки с иконками (`Select`, `+ Screen`, `Pan`, `Snap ▼`, `Align ▼`, `Distribute ▼`, `Fit All`, `100%`). Dropdown-группы: Snap (`Grid / Screen Edges / Centers / Guides / Cabinet Edges`), Align (`Left/Center/Right/Top/Middle/Bottom`), Distribute (`Horizontal/Vertical`).
* Cabinet badge: `C03 🔒` при lock (lock — future domain, сейчас только визуальный контракт). Preview-бейджи: `PENDING` на ячейках без identity.
* Problems: `⚠ N`; Preflight: `✓/⚠/✕`; Save: `Saved ✓ / Saving... / Modified ● / Recovery / Save failed ⚠`; Live: `LIVE ● Monitor 2` + `STOP OUTPUT`.

## 5. Canvas interaction (канон)

Mouse:

```text
Left Click      Select
Left Drag obj   Move (Screen position; handle — только resize)
Drag empty      Box Select
Middle Drag     Pan (также Space+drag)
Wheel           Pan (текущий Alpha-контракт) — см. примечание
Ctrl + Wheel    Zoom к курсору (clamp 0.02…8)
Double Click    Enter object / edit hierarchy
```

Примечание: `ALPHA-UI-002` фиксирует `wheel = pan, Ctrl+wheel = zoom`. Полный UI vision допускает классический `wheel = zoom`; смена поведения — только отдельным production gate с обновлением `002`-контракта и smoke-тестов, не молча.

* Zoom: статус-бар `75% + [-] slider [+] + Fit Selection / Fit All / 100%`, центрирование на курсоре.
* Snap: тулбар `Snap ✓` + dropdown; временный модификатор `Alt` отключает snapping на время drag.
* Guides: drag с ruler; Properties `Orientation / Position px / Locked ✓`.
* Handles: `right/bottom/bottomRight` (итерация 3); `left/top` — вне scope до компенсации `Screen.position`. Preview дискретен по кабинетам, без аллокации identity (pending-ячейки без ID/номеров), commit один на `pointerup`, `Esc/pointercancel` — отмена без мутации.
* Hit-test/bounds/selection-frame/labels/tree перечитывают то же project state; расхождение canvas и модели — дефект.

Right-click меню (vision): Layout (`Add Screen / Paste / Select All / Create Guide / Fit All / Grid Settings`), Screen (`Rename/Duplicate/Lock/Bring Forward/Send Backward/Create Mapping/Show Cabinets/Delete`), Cabinet (`Inspect Pixel Address / Assign Receiver / Lock Assignment / Show Signal Path`).

## 6. Keyboard (essential)

```text
Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S — New/Open/Save/Save As (Open/Save — дизайн до Phase 8)
Ctrl+Z / Ctrl+Y — Undo/Redo (placeholder, механизма нет, запрещён)
Delete, Ctrl+D, Ctrl+A — delete/duplicate/select all
F / Shift+F — Fit Selection / Fit All
Space — temporary Pan; Esc — cancel/deselect/exit nested
Tab — hide/show sidebars; Ctrl+K — зарезервирован под Command Palette (later, не P0)
```

Поля `X/Y/Columns/Rows`: пустой/невалидный ввод → `aria-invalid`, сохранение последнего допустимого, без молчаливого округления и без `NaN/Infinity`. Предел Columns считается от текущего Rows и наоборот (не самоссылающе).

## 7. Уведомления и опасные действия

* Успехи — toast, не modal: `Project saved`, `Auto Mapping applied: 12 cabinets assigned`, `Export completed: Open Folder`.
* Modal — только при required decision. Delete Screen с impact-листом (`1 Input Mapping, 2 Output Mappings, 12 Hardware Assignments`, `Remove references / Cancel`).
* Loading: `Calculating hardware mapping… (12 Screens, 184 Cabinets) [Cancel] → Preview ready`; проект неизменён до Apply.

## 8. Search, Inspector, Command Palette

* Search Tree: `[C08]` ищет Screens/Cabinets/Processors/Ports/Receivers/Mappings; результат `C08 — Main LED > Cabinet Grid > C08`; клик — switch workspace при необходимости, select, fit.
* Inspector mode (future, один из сильных инструментов): диагностический курсор; hover показывает `Screen/Cabinet/Module/Mapping/Hardware/Address`; не смешивается с Select/Move.
* `Ctrl+K` палитра (`Add Screen, Run Auto Map, Open Hardware, Show C08, Export Resolume, Run Address Walk`) — later; архитектура shell обязана оставить точку расширения.

## 9. Границы

* Этот документ фиксирует токены и правила, но не вводит production-код, зависимости, IPC, persistence или изменения `core`.
* Любые hex-значения, шрифтовые файлы, icon-сеты — отдельный production gate; здесь — роли и поведение.
