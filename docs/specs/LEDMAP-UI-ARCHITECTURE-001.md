# LEDMAP-UI-ARCHITECTURE-001 — UI Architecture Vision

**Версия:** 1.0

**Статус:** Accepted — vision, docs-only. Не является разрешением на production-код вне авторизованных gates.

**Baseline:** `02e8483` (итерация 3 Screen Resize CLOSED).

**Upstream:** `ARCHITECTURE.md`, `docs/domain-model.md`, Phase 6A/6B, 7A/7B/7C/7D, 7E; `LEDMAP-ALPHA-UI-001/002/003`; Draft `LEDMAP-ALPHA-UI-004` / ADR-027 (не авторизован).

**Решение:** [ADR-028](../DECISIONS.md#adr-028-ui-architecture-vision) — UI Architecture v1 фиксируется как target vision, явно отделённая от текущего executable scope.

Детализация экранов — [LEDMAP-UI-WIREFRAMES-001](LEDMAP-UI-WIREFRAMES-001.md). Токены и правила — [LEDMAP-UI-DESIGN-SYSTEM-001](LEDMAP-UI-DESIGN-SYSTEM-001.md).

## 1. Vision vs executable scope

UI LedMAP позволяет инженеру работать с одним Project Document через специализированные представления:

```text
Project → Layout → Mapping → Hardware → Signal → Test → Export
```

Каждое представление показывает свою часть проекта и не создаёт независимого состояния:

```text
One Project → Multiple Views → One Source of Truth
```

Эта спецификация описывает целевое состояние. Текущий executable scope — только Layout (Early Alpha Project Canvas + Resize, итерация 4 — Draft, не авторизована). Всё остальное — дизайн без кода до своих core-контрактов (§14, §15).

## 2. Shell (целевой)

```text
┌─────────────────────────────────────────────────────────────────────┐
│ LedMAP  Project.ledmap   Saved ✓         Undo Redo         ⚠ 2    │
├─────────────────────────────────────────────────────────────────────┤
│ Project  Layout  Mapping  Hardware  Signal  Test  Export           │
├────────────┬─────────────────────────────────────┬──────────────────┤
│ Tree       │ Toolbar                             │ Properties       │
│ 240 px     ├─────────────────────────────────────┤ 300–340 px       │
│            │                                     │                  │
│            │              Canvas (flex)          │                  │
│            │                                     │                  │
├────────────┴─────────────────────────────────────┴──────────────────┤
│ X 0 Y 0   Selection 1     12 Cabinets       Zoom 75%      ✓       │
└─────────────────────────────────────────────────────────────────────┘
```

Зоны постоянны: Top Bar (project, save status, Undo/Redo placeholder, Problems), Workspace Tabs, Project Tree, Toolbar, Canvas, Properties, Status Bar. Левую/правую панели можно скрывать (`Tab` или отдельные тогглы); canvas доминирует.

Паттерн работы везде один:

```text
Find object → select object → edit in Properties → see result in Workspace
```

Точная раскладка каждого экрана — `LEDMAP-UI-WIREFRAMES-001`. Размеры, типографика, цвета, icons, canvas interaction — `LEDMAP-UI-DESIGN-SYSTEM-001`.

## 3. Workspace navigation и WorkspaceStatus

Целевые вкладки:

```text
Project / Layout / Mapping / Hardware / Signal / Test / Export
```

`Outputs` в executable scope — секция внутри `Mapping`, не отдельный workspace. Отдельный Outputs workspace — LATER, после доменного контракта `MediaOutputCanvas / OutputMapping`.

Статусы вкладок — презентация UI-агрегатора, а не прямое поле `validateProject()`:

```text
✓ valid
⚠ non-blocking diagnostic
✕ blocking error
— not configured
● stale / requires recalculation
```

Концепция (не расширяет 7C):

```text
WorkspaceStatus
  ← Core Validation (7C, errors-only: passed/failed/blocked)
  ← Hardware Diagnostics (6A/6B: unused-slot info, overflow error)
  ← App-level Checks (пересечения, незамапленные screens, неиспользуемые canvas)
  ← Dirty / Recalculation State (модель изменилась, derived устарел)
```

Правила:

* `7C` не расширяется ради интерфейса: `WARNING`/`INFO` в `validateProject()` не вводятся этим gate.
* `⚠` означает non-blocking diagnostic из любого источника, `✕` — blocking error, `●` — stale (модель новее посчитанного derived), `—` — раздел не конфигурировался.
* Агрегатор живёт в `app` (`renderer/state`), а не в `core`.

## 4. Project Tree, Properties, Status Bar, Top Bar

Project Tree постоянен почти во всех workspace: `Screens → Cabinet Grids → Input Canvases → Media Outputs (future) → Hardware (Processor → Port → Receiver) → Live Outputs (future)`. Selection в Tree синхронизируется с canvas: Screen выделяет контур, Cabinet подсвечивает ячейку, Receiver подсвечивает назначенные кабинеты. Поиск по Tree (`C08` → `Main LED > Cabinet Grid > C08` → switch workspace при необходимости, select, fit).

Properties всегда контекстный, без плавающих окон на тип. Вычисляемые поля (разрешение, физический размер, число кабинетов, address range, port load) — read-only. Ошибка поля показывается рядом с полем сразу, не только после Save.

Status Bar: координаты курсора, selection сводка, счётчики проекта (Screens/Cabinets/px), zoom, агрегированная валидация.

Top Bar: save states `Saved ✓ / Saving... / Modified ● / Recovery available / Save failed ⚠`; Undo/Redo — placeholder vision (механизма истории нет, запрещён до отдельного gate); кнопка Problems `⚠ N` открывает глобальную Problems Panel с фильтрами `All / Errors / Warnings / Current Workspace`.

## 5. Project workspace (target)

Вопрос: что в проекте и всё ли в порядке. Summary (Screens/Cabinets/Pixels), Workflow checklist (Layout/Mapping/Hardware/Signal/Test со статусами агрегатора), Export Readiness %, Quick Actions (`+ Add Screen`, `Open Mapping`, `Auto Map`, `Run Test`, `Export`), Recent activity. Пустое состояние — CTA, не серый canvas.

## 6. Layout workspace (ближайший production priority)

Вопрос: что физически представляет LED system. Отвечает за `Screen / Cabinet Grid / Cabinets / CompositionPlacement` (позиция Screen — презентационное app-состояние, не домен, не `7D`). Не отвечает за Input Mapping.

Toolbar: Select, `+ Screen`, Pan, Snap-меню, Align/Distribute, Fit, Zoom. Canvas бесконечный: ± координаты, pan/zoom/box/multi/drag/nudge/snap/guides. Double-click Screen входит в Cabinet edit mode (`Layout > Main LED > Cabinets`, overlays `Cabinet IDs / Signal Numbers / Module Grid / Pixel Grid`, `Esc` — назад).

Quick Add Screen — компактный диалог (`Name / Cabinet profile / Columns / Rows` + calculated `resolution / physical size / cabinets` + `Advanced` progressive disclosure). Profile picker с поиском, Favorites и Project Profiles; профиль переиспользуется между Screens.

Текущий executable scope: Project Canvas (`002`) + Resize (`003`, `resizeScreenGrid()`, три handles, transient preview + один commit на `pointerup`, `nextCabinetSerial` — аллокатор identity). Следом — итерация 4 Geometry/Ordering (Draft, см. §15).

## 7. Mapping workspace (target, LATER; Outputs — секция внутри)

Вопрос: откуда каждый Screen получает content. `Input Canvas → Screen` через `MappingRegion` (логическое соответствие Input→Output; `Mapping Region ≠ Cabinet`).

Визуально отличается от Layout. Sidebar-режим Tree: `INPUT CANVAS / MAPPED / UNMAPPED` + drag&drop unmapped Screen на canvas. Region Properties: `SOURCE RECT / SCREEN RECT / TRANSFORM (rotation/flip/enabled)`.

Auto Place — только через общий Preview/Apply pattern (§12): `Configure → Calculate → Preview (стиль ≠ saved) → Validate → Apply`. Проект до Apply не меняется.

Outputs-секция внутри Mapping (временно): `Screen → Output Mapping → Output Canvas`, slices, rotation/flip/mask/crop, обязательный кейс split одного Screen на N canvas без искусственного дробления `Main LED Left/Right`.

Executable блокеры: multi-region mapping contract поверх `7A` (сейчас только 1:1 identity, один Region), `OutputRect`/rotation/flip/scale контракт, multi-screen persisted project.

## 8. Hardware workspace (target, LATER)

Вопрос: к какому оборудованию подключён Screen. Split `HARDWARE TREE | ASSIGNMENT VIEW`. Toolbar: `+ Processor / + Receiver / Assign / Auto Map / Lock / Clear / overlays / Validate`.

Overlay modes `None / Receiver / Port / Processor / Capacity / Assignment Status`; цвет — только visualization, не source of truth. Capacity meter на Port (`used / capacity`, состояния `normal / threshold warning / capacity error`).

Manual assign: `select cabinets → select receiver → Assign` (или drag cabinets на Receiver). Lock: badge `C03 🔒`, `Locked ✓`, Auto Map не трогает. Add Processor dialog (`Profile / Name / Ports / Pixel Capacity / Receiver Capacity`).

Auto Mapping UI — через Preview/Apply: scope (`Entire Project / Selected Screen`), опции (`Respect locked / Prefer cabinet integrity / Minimize port fragmentation`), `Calculate → Preview (12/12 assigned, receivers, ports used, Port Load, Warnings) → Recalculate / Apply`.

Executable блокеры: `lock` как доменная сущность, mutation API поверх `6A/6B`, multi-screen topology contract. Математика `allocate/resolve` готова, UI-мутации — нет.

## 9. Signal workspace (target, LATER)

Вопрос: в каком порядке проходит data. Явный порядок, не просто assignment. Визуализация цепочек `Processor → Port → Receiver → C01 → C02 → …` со стрелками, номерами порядка, адресами.

Интеракция: drag кабинета в цепочке или `Move Before / Move After`; меняет только маршрут, не `Screen position` и не physical position. Route Properties: ordered `Targets[]`, pixel count, address range, `Reverse Route`.

Executable блокер: редактируемая сущность маршрута. В core `SignalPath[]` — derived из topology, не редактируемый `SignalRoute.targets[]`. Нужен отдельный контракт.

## 10. Test workspace (target, LATER)

Вопрос: правильно ли всё работает. Отдельный operational mode: `PATTERNS | PREVIEW | LIVE drawer`.

Patterns: Basic (White/Red/Green/Blue/Black, Checkerboard, Grid, Border, Cross, Diagonals, Markers, Gradient, Moving Bar), Hardware (Cabinet IDs, Receiver/Port/Processor Colors, Signal Order), Diagnostics (Address Walk, Pixel Inspector). Per-pattern props (cell size, invert, borders, thickness, direction/speed/width/loop).

Address Walk: `Screen → Hardware / Hardware → Screen`, ввод pixel, результат `Screen / Cabinet / Module / Receiver / Processor / Port / Address`. Pixel Inspector: hover-overlay (`X/Y, Cabinet, Module, Receiver, Processor/Port, Address`), click pin, `Esc` unpin.

Live Output drawer: `Target / Resolution / Scaling (Fit/1:1/Stretch) / Black outside / Start`, после старта `LIVE ●` + всегда доступный `STOP OUTPUT`.

Executable: lookup возможен через `7A` (`map/unmap`), но patterns/live — app-only и упираются в запрет попиксельного preview; Live требует отдельного output-контракта.

## 11. Export workspace (target, LATER)

Вопрос: можно ли передать результат наружу. Отдельный workspace, не системный Save dialog: `EXPORT TYPES | PREFLIGHT / OPTIONS`.

Категории: Image (PNG/SVG), Documentation (PDF/CSV), Media Server (Resolume/Hippotizer), Project Data (LedMAP JSON), Remap (Image/Video).

Preflight перед любым export: `Geometry / Input Mapping / Output Mapping / Hardware / Capacity / Addressing` со статусами агрегатора; blocking `✕` ведёт через `Show Problem` (§12). Per-type options (пример Resolume: slices/rotation/flip/masks, file name, `Preview / Export`).

Executable блокеры: warnings-контракт, vendor export контракты, полный Open/Save IPC.

## 12. Общие application-level UX-паттерны (обязательные)

1. **Preview / Apply** — единый компонент для `Auto Place / Auto Mapping / Auto Route / Auto Pack / Import / Migration`: `Configure → Calculate → Preview → Validate → Apply`. Проект неизменён до Apply; сложные расчёты показывают `Calculating… [Cancel] → Preview ready`.
2. **Show Problem** — глобальный primitive: любая ошибка несёт `Show`; клик выполняет `switch workspace → select object → zoom → open properties → highlight offending property`.
3. **UI State model** — каждый workspace различает `Empty / Ready / Selection / Editing / Preview / Validation Error / Live / Read-only`.
4. **EDIT ONCE → MODEL UPDATES → ALL VIEWS UPDATE** — центральная механика: изменение Grid меняет resolution → Mapping warns → Hardware recalc → Signal stale → Export blocked; после исправления всё `✓`. UI показывает `Mapping ⚠ / Hardware ⚠ / Signal ● / Export ✕` до исправления.
5. **User terminology ≠ internal terminology:**

| Пользователь видит | Внутри LedMAP |
|---|---|
| LED Screen | Screen |
| Where content comes from | MappingRegion |
| Where screen is connected | HardwareAssignment |
| How signal travels | SignalRoute |
| What LEDs display | PixelAddress |
| Live destination | LiveOutputTarget |
| What I export | ExportModel |

6. **Undo Transactions:** одно пользовательское действие (например `Auto Mapping Apply` на 12 assignments) — один Undo step. Механизма истории нет (запрещён); семантика фиксируется сейчас, реализация — отдельный gate.
7. **Validation в UI — 4 уровня:** `Project → Workspace → Object → Property`; ошибка видна на каждом уровне; property-ошибка — рядом с полем.
8. **Dangerous actions:** delete с impact-листом (`1 Input Mapping, 2 Output Mappings, 12 Assignments`, выбор `Remove references / Cancel`). Успехи — toast (`Project saved`, `Auto Mapping applied: 12 assigned`, `Export completed: Open Folder`); modal — только при required decision.

## 13. Классификация данных (обязательная для всех wireframes)

| Класс | Примеры | Где живёт |
|---|---|---|
| Stored (source-of-truth, `7D v1`) | geometry, GridOrdering tokens, capacities, explicit assignments/orders (`processorOrder`, `receiverOrder`, `Receiver.cabinets`) | `.ledmap`, parse/load/serialize в core, fs в app |
| Derived (пересчитывается, не сохраняется) | logical order, signal indices, `dataIndex`, `globalRemapIndex`, spans, PixelMap, validation diagnostics | engines при загрузке |
| View-state (только app) | Screen `x/y` на canvas, camera, selection, hover, transient preview, overlays, locks UI-флаги до доменного контракта | `renderer/state`, не сериализуется |

Нарушение границы (UI пересобирает domain в обход core, derived сохраняется, view-state попадает в `.ledmap`) — дефект.

## 14. Blocked (явно, без кода до core-gates)

```text
multi-screen persisted Project Document (7D — один Screen/Region)
MediaOutputCanvas / OutputMapping (нет доменной сущности)
editable SignalRoute.targets[] (SignalPath — derived)
HardwareAssignment locks (нет доменной сущности)
validation warnings (7C — errors-only)
Undo/Redo history (механизма нет, запрещён)
LiveOutputTarget (нет контракта)
vendor export formats (нет контрактов)
full Open/Save IPC + privileged preload (Phase 8)
AddressEncoder / Final Remap / ReverseIndex (отдельные gates после 7E)
```

## 15. Staged backlog (указатель; детали — TODO.md)

```text
NOW:  0 vision docs-gate (этот gate)
      1 ALPHA-UI-004 Geometry+Ordering (Draft → executable spec → отдельный approval → production)
      2 UI-04 Selection tools
      3 UI-05 Snap/Guides/Align/Distribute
      4 Layout acceptance/polish
NEXT: UI-01 App Shell, UI-02 Project (shell + in-memory overview; Open/Save — только дизайн)
LATER: UI-07 Mapping, UI-08 Hardware, UI-09 Auto Mapping, UI-10 Signal, UI-11 Test, UI-12 Inspector, UI-13 Export
```

Первый e2e milestone (§80 исходного текста) достижим в NOW только как in-memory `Add 4×3 Snake ON → REF-001 order preserved`; полный цикл с Save/Open/Mapping/Hardware/Signal/Test/Export требует разблокировки LATER-контрактов.

## 16. Границы этого gate

* Только 5 файлов: 3 спеки + ADR-028 + TODO backlog. Никаких `packages/*/src`, тестов, IPC, сериализации, математики.
* `packages/core`, public API, reference-тесты, `.ledmap v1` не меняются.
* Запреты TODO (`Phase 8`, undo/redo, packaging, vendor export, pixel preview) сохраняются; Early Alpha исключение расширяется только авторизованными итерациями.
