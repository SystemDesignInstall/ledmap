# LEDMAP-UI-WIREFRAMES-001 — Wireframes Vision

**Версия:** 1.0

**Статус:** Accepted — vision, docs-only. Не является разрешением на production-код.

**Baseline:** `02e8483`.

**Upstream:** [LEDMAP-UI-ARCHITECTURE-001](LEDMAP-UI-ARCHITECTURE-001.md), [ADR-028](../DECISIONS.md#adr-028-ui-architecture-vision); детали токенов — [LEDMAP-UI-DESIGN-SYSTEM-001](LEDMAP-UI-DESIGN-SYSTEM-001.md).

Каждый экран: layout + toolbar + tree-режим + properties + overlays + state-матрица + empty-state. Все поля помечены `stored / derived / view`. `Outputs` — секция `W-03b` внутри Mapping. `W-05/W-06` — future (LATER), без кода до core-контрактов.

## W-00. Shell (все workspace)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ LedMAP  ArenaTour.ledmap   Modified ●    Undo Redo        ⚠ 2  [⋮] │
├─────────────────────────────────────────────────────────────────────┤
│ Project  Layout  Mapping  Hardware  Signal  Test  Export           │
│            ✓       ✓        —        ⚠ 2      ⚠       —      ✕     │
├────────────┬─────────────────────────────────────┬──────────────────┤
│ TREE   [⌕] │ TOOLBAR (per workspace)             │ PROPERTIES       │
│            ├─────────────────────────────────────┤ contextual       │
│ Arena Tour │                                     │                  │
│ ▼ Screens  │              CANVAS                 │ Name [...]       │
│ ▼ Hardware │          (per workspace)            │ ...              │
│            │                                     │                  │
├────────────┴─────────────────────────────────────┴──────────────────┤
│ X:384 Y:128 │ Sel: 1 Screen │ 12 Screens/184 Cab/16.5M px │ 75% │⚠2│
└─────────────────────────────────────────────────────────────────────┘
```

* Top Bar: project menu (`New/Open/Recent/Save/Save As/Settings/Export/Close/Exit` — пункты `Open/Save` за пределами NOW только как дизайн), save states, Undo/Redo placeholder, Problems `⚠ N`, `⋮`.
* Tabs показывают агрегатор `✓/⚠/✕/—/●` (§3 ARCHITECTURE-001).
* Status Bar: координаты, selection, счётчики, zoom, валидация.
* Problems Panel (overlay справа): `ERRORS n / WARNINGS n`, каждая с `[ Show ]` → Show Problem primitive.

State-матрица shell:

| State | Trigger | UI |
|---|---|---|
| Empty | нет проекта | Start Screen: New/Open/Recent |
| Ready | проект в памяти | все зоны активны |
| Selection | объект выбран | Tree+Canvas+Properties синхронизированы |
| Preview | Auto-* рассчитан | overlay поверх canvas, стиль ≠ saved, `[Cancel/Recalculate/Apply]` |
| Error | blocking diagnostic | табы `✕`, Preflight/Problems с `[ Show ]` |

## W-01. Project overview

```text
┌────────────┬─────────────────────────────────────┬──────────────────┐
│ TREE       │ ARENA TOUR 2026                     │ QUICK ACTIONS    │
│ (как W-00) │ Screens 6 / Cabinets 184 / 16.5M px │ + Add Screen     │
│            │ Layout ✓  Mapping ✓  Outputs —      │ Open Mapping     │
│            │ Hardware ⚠2  Signal ✓  Test —       │ Auto Map         │
│            │ EXPORT READINESS 82% [View Problems]│ Run Test / Export│
│            │ Recent: HW changed 3m / resized 11m │                  │
└────────────┴─────────────────────────────────────┴──────────────────┘
```

* Summary — `derived` (пересчёт engines) + `view` счётчики; Workflow — агрегатор WorkspaceStatus; Readiness — `%` blocked-aware.
* Empty: `No project yet → [New Project] [Open]`.

## W-02. Layout (NOW priority)

```text
│ TREE       │ [Select][+Screen][Pan][Snap▼][Align▼][Distrib▼][Fit][100%]│ PROPS │
│ Screens    ├─────────────────────────────────────┤ SCREEN (stored+derived+view)│
│  Main LED  │  Side Left   Main LED   Side Right  │ Name [Main LED] (stored)    │
│  Side Left │  ┌────┐ ┌────────────┐ ┌────┐       │ X [0] Y [0] (view)          │
│  Side Right│  │    │ │C01 C02 C03 │ │    │       │ Columns [8] Rows [4](stored)│
│            │  │    │ │C06 C05 C04 │ │    │       │ Cabinet 128×128 (derived)   │
│            │  └────┘ └────────────┘ └────┘       │ Screen 1024×512 (derived)   │
│            │  Breadcrumb: Layout > Main LED      │ Order Row/LTR/Snake (stored)│
```

* Toolbar NOW: Select, `+ Screen`, Pan, Snap-меню, Align/Distribute (UI-05), Fit/Zoom. Cabinet edit mode (double-click): overlays `Cabinet IDs / Signal Numbers / Module Grid / Pixel Grid`, breadcrumb clickable, `Esc` — назад.
* Canvas: бесконечный, ± координаты, grid-фон, контуры Screen с подписью (имя, cabinets, derived разрешение), cabinets `C01…` (physical ID, непрозрачен) + `#n` (derived `cabinetIndex()+1`), направленный путь сигнала (derived `cabinetOrder()`), handles resize (только `right/bottom/bottomRight` в итерации 3).
* Properties Screen: `Name (stored) / X,Y (view) / Columns,Rows (stored, via resizeScreenGrid) / Cabinet size (derived) / Screen size (derived) / Cabinets N (derived) / Ordering (stored, readonly до ALPHA-UI-004)`. Grid/Cabinet — readonly сводки (+ editable Columns/Rows из Grid selection через тот же `resizeScreenGrid`, selection переживает commit).
* Empty: `No LED Screens yet → [+ Add Screen]`.
* Selection model: click select, `Ctrl+click` add/remove, drag empty — box, `Esc` clear, double-click enter, `Del` delete (с impact-диалогом), `Ctrl+D` duplicate, arrows nudge (UI-04).
* Quick Add dialog: `Name / Cabinet profile / Columns / Rows` + calculated + `[Advanced]` progressive disclosure + `[Cancel / Create Screen]`. Profile Picker: search, Favorites, Project Profiles, `[+ Create Custom Profile]` (custom — LATER).

## W-03a. Mapping (LATER; дизайн зафиксирован)

```text
│ SIDEBAR    │ Input Canvas: 3840×2160  [Select][+Canvas][Auto Place][Fit]...│ PROPS │
│ INPUT      │ ┌──────────────────────────────────────────┐ │ MAPPING REGION  │
│ Canvas 1   │ │ ┌──────────┐                             │ │ Screen Main LED │
│ 3840×2160  │ │ │ Main LED │      ┌──────┐               │ │ SOURCE X/Y/W/H  │
│ MAPPED     │ │ └──────────┘      │Side  │               │ │ SCREEN X/Y/W/H  │
│ Main, Left │ │                   └──────┘               │ │ Rot/Flip/Enabld │
│ UNMAPPED   │ │  (визуально ≠ Layout)                    │ │                 │
│ Side Right │ └──────────────────────────────────────────┘ │                 │
```

* Toolbar: Select, `+ Input Canvas`, Auto Place, Fit, Snap, Rotation, Flip X/Y, `Show Names/Resolution`.
* Sidebar: `INPUT CANVAS / MAPPED / UNMAPPED`; unmapped drag&drop на canvas.
* Region Properties: `SOURCE RECT / SCREEN RECT / TRANSFORM`.
* Auto Place Preview overlay: `3 Screens, Canvas usage 71%, No overlaps, [Cancel/Configure/Apply]`, preview-стиль ≠ saved.
* Empty: `No Input Canvas → [+ Input Canvas]`.

## W-03b. Outputs-секция внутри Mapping (временно, LATER)

```text
│ Media Output: Resolume UHD 3840×2160 │ [+Canvas][+Mapping][Auto Pack][Rotate/Flip/Crop/Mask/Fit] │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Slice Main A    Slice Main B           Side LED                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ OUTPUT MAPPING: Screen / Output Canvas / SCREEN RECT / OUTPUT RECT / │
│ Input+Output Rotation / Flip / Polygon Mask / Enabled               │
```

* Обязательный кейс: один Screen → N Output Mappings → N canvas без дробления Screen.

## W-04. Hardware + Auto Mapping (LATER; дизайн зафиксирован)

```text
│ HARDWARE TREE        │ SCREEN / ASSIGNMENT VIEW   │ PROPERTIES      │
│ Processor P01        │ C01 C02 C03 C04            │ RECEIVER R01    │
│  Port 1 [████░░ 20%] │ C08 C07 C06 C05            │ Port 1 / P01    │
│   R01 / R02          │ C09 C10 C11 C12            │ Pixels 65536    │
│  Port 2 [░░░░░░ 0%]  │ overlay: Receiver/Port/    │ Assignment Man. │
│   R03                │ Capacity/Status/Unassigned │ Locked [✓]      │
```

* Toolbar: `+ Processor / + Receiver / Assign / Auto Map / Lock / Clear / overlays / Validate`. Фильтр `All/Assigned/Unassigned/Locked/Errors`; unassigned — `C07 UNASSIGNED`.
* Manual assign flow: `select cabinets → select receiver → [Assign]` (или drag). Add Processor dialog: `Profile/Name/Ports/Pixel Capacity/Receiver Capacity`.
* Auto Mapping panel: `Scope (Project/Screen), Respect locked ✓, Prefer integrity ✓, Minimize fragmentation ✓, [Calculate] → Preview (12/12, 3 Receivers, 2/4 Ports, Port Load, Warnings, [Cancel/Recalculate/Apply])`.
* Capacity meter на Port: `131072/655360 px`, состояния normal/threshold/error.
* Empty: `No Processors → [+ Processor] [Skip for now]`.

## W-05. Signal (LATER; дизайн зафиксирован)

```text
│ Processor P01 / Port 1              │ SIGNAL ROUTE R02              │
│ R01: C01 → C02 → C03 → C04 ─┐       │ Targets 1 C08 2 C07 3 C06 4 C05│
│ R02: C08 ← C07 ← C06 ← C05 ←┘       │ Pixels 65536                  │
│ Port 2 / R03: C09 → C10 → C11 → C12 │ Address 65536→131071          │
│                                     │ [Reverse Route]               │
```

* Toolbar: Select/Connect/Reorder/Reverse/Auto Route/Show Numbers/Addresses/Validate. Drag-reorder или `Move Before/After`; меняет только маршрут, не позиции. Overlays: route arrows, order numbers, addresses.
* Empty: `No assignments → [Go to Hardware]`.

## W-06. Test + Export (LATER; дизайн зафиксирован)

Test:

```text
│ PATTERNS              │ TEST PREVIEW (diagnostic overlay) │ PROPS per pattern │
│ Basic / Hardware /    │ Cabinet IDs / Receiver Colors /   │ Cell 32px / Invert│
│ Diagnostics           │ Signal Order / Inspector pin      │ Grid Module / ... │
│ Address Walk form     │ LIVE TARGET: Monitor 2 [LIVE/STOP]│                   │
```

* Address Walk: `Mode Screen→HW / HW→Screen`, `X/Y`, результат `Screen/Cabinet/Module/Receiver/Processor/Port/Address`. Inspector: hover `X/Y/Cabinet/Module/R/Port/Address`, click pin, `Esc` unpin. Live drawer: `Target/Resolution/Scaling/Black outside/[Start]` → `LIVE ●` + `STOP OUTPUT`.

Export:

```text
│ EXPORT TYPES          │ PREFLIGHT / OPTIONS                           │
│ Image/Docs/Media/Data │ Geometry ✓ Mapping ✓ Output ✓ Hardware ⚠ ... │
│ /Remap                │ Resolume: slices/rot/flip/masks, file, Preview/Export │
```

* Preflight до любого export; blocking `✕ + [Show Problem]`.

## Матрица состояний (обязательна для каждого workspace при детализации)

```text
Empty → CTA (не серый canvas)
Ready → объект/конфиг существует
Selection → Tree+Canvas+Properties синхронизированы
Editing → поле редактируется, ошибка у поля
Preview → overlay ≠ saved, [Cancel/Recalculate/Apply], проект неизменён
Validation Error → ✕ + Show Problem
Live → только Test (LIVE ● + STOP)
Read-only → derived-поля, readonly сводки
```
