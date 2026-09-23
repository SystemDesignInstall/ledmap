# LedMAP — TODO

Поэтапный план. Никакой этап не начинается без одобрения предыдущего. Каждый этап: зелёные тесты + `typecheck` + `lint`. Статусы: `[ ]` — не начато, `[x]` — готово, `[~]` — в работе.

## Phase 0 — Environment & Repository
- [ ] Установить Node.js 24 LTS через winget (в окружении отсутствует)
- [ ] `package.json` корня (npm workspaces, scripts)
- [ ] `tsconfig.base.json` (strict, noEmit, verbatimModuleSyntax, exactOptionalPropertyTypes)
- [ ] `vitest.workspace.ts`, `eslint.config.mjs` (flat + import-restriction core/app)
- [ ] `.gitignore`, README
- [ ] Утвердить агентский отчёт A–H и зафиксировать стек/структуру
- [ ] Первый commit

## Phase 1 — Architecture deliverables
- [ ] `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` — финализированы (ADR-002…013 → Accepted)
- [x] `docs/reference/LEDMAP-REF-001.md` — corrected письменная спецификация Reference Test 001 (Phase 2A)
- [ ] Спеки Reference Tests 002–004 (ADR-013)
- [ ] Enforce-правила границ core/app в eslint

## Phase 2 — Build/Test skeleton
- [ ] Пустые пакеты `packages/core` и `packages/app` (init)
- [ ] Vitest + tsc + eslint проходят на тривиальном тесте core
- [ ] CI (позже): test → lint → typecheck

## Phase 3 — Domain Model (packages/core, только чистыe данные)
- [ ] `model/units.ts` — брендированные типы (Px, indices)
- [ ] `model/geometry.ts` — Rect, Point, Size
- [ ] `model/screen.ts`, `model/mapping-region.ts`, `model/cabinet-grid.ts`
- [ ] `model/cabinet.ts`, `model/module.ts`, `model/hardware.ts`, `model/ordering.ts`
- [ ] Нормализаторы модели; round-trip пустого проекта
- [ ] Unit-тесты геометрии/единиц

## Phase 4 — Cabinet Engine (САМОЕ ВАЖНОЕ)

- [x] Phase 2A — [Hardware Addressing Specification](docs/specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md) + [corrected REF-001](docs/reference/LEDMAP-REF-001.md), ADR-006 amended / ADR-015: port-local dataIndex, отдельный globalRemapIndex, HardwareProfile boundary; документационный контракт готов
- [ ] Оставшийся prerequisite: одобрить отдельный план Cabinet Engine Phase 1 — REF-001 executable implementation по новому контракту; Engines и executable REF-тесты не входят в Phase 2A
- [ ] `cabinet-engine/numbering.ts` (Row/Column) + тесты
- [ ] `cabinet-engine/direction.ts` (L→R / R→L, ось нумерации) + тесты
- [ ] `cabinet-engine/snake.ts` (ON/OFF, чередование рядов) + тесты
- [ ] `cabinet-engine/module-order.ts` + тесты
- [ ] `cabinet-engine/pixel-order.ts` + тесты
- [ ] Композиция `cabinet-engine/index.ts` + тесты независимости трансформаций

## Phase 5 — Reference Tests 001–004 (приёмочные критерии ядра)
- [ ] Фикстура `test-001/project.json` + `expected.json`
- [ ] Приёмочный тест 001: порядок cabinets, T01–T09 и прежние globalRemapIndex-якоря (0, 16383, 16384, 65536, 65535, 131072, 196607), отдельные port-local dataIndex, полное равенство, SignalPath-границы, reverse mapping, round-trip, детерминизм
- [ ] Фикстуры и тесты 002 (Row, R→L, Snake), 003 (Column, Snake), 004 (Column, варианты Direction)
- [ ] **Milestone:** математическое ядро доказано headless

## Phase 6 — Hardware (Receiver/Processor/Port) Engine
- [ ] `hardware-engine/allocate.ts` (ёмкости, precedence Processor→Port→Receiver)
- [ ] `hardware-engine/resolve.ts` (явные назначения + доводка)
- [ ] Диагностики overflow / unused slot
- [ ] Тестовая матрица capacity/overflow/partial

## Phase 7 — Mapping, Remap, Validation, Serialization
- [ ] `mapping-engine` (Input Canvas rect → логическая позиция → PixelMap компактно)
- [ ] `remap-engine` (пост-коррекция готового PixelMap, без мутации модели)
- [ ] `validation` (rules, codes, validator)
- [ ] `serialization` schema v1 + round-trip + миграции (скелет)
- [ ] Все тесты зелёные, всё ещё headless

## Phase 8 — UI (packages/app) — только последним
- [ ] Минимальное Electron-окно (electron-vite dev)
- [ ] Open/Save `.ledmap` через IPC + `main/services`
- [ ] Реактивное state; Canvas: screen → cabinet outline → module grid из read-only модели
- [ ] Диагностики валидатора в UI
- [ ] `electron-builder` Windows packaging
- [ ] Экспорт hardware-форматов производителей (отдельный контракт)

## Запреты на ближайших этапах (0–5)
- Без UI (окно, компоненты, canvas) — Phase 8
- Без Electron runtime интеграции (main/preload/IPC) — Phase 8
- Без hardware драйверов/сетевых протоколов видеопроцессоров
- Без экспортных форматов производителей
- Без packaging/distribution, undo/redo, локализации, превью-рендера пикселей
