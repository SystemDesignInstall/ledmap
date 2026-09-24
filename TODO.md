# LedMAP — TODO

Поэтапный план. Никакой этап не начинается без одобрения предыдущего. Каждый этап: зелёные тесты + `typecheck` + `lint`. Статусы: `[ ]` — не начато, `[x]` — готово, `[~]` — в работе.

## Текущая точка и следующий этап

- [x] Phase 4E — обобщённая геометрия Cabinet pixel layout принята пользователем на `67fd975cf0e0036fd50c06d533a13a1bff871651`.
- Cabinet Engine поддерживает Row/Column, LTR/RTL, TTB/BTT, независимый Snake, Top Left и прямоугольный module-first pixel layout с inverse mapping и safe integer validation. REF-001…004 служат регрессией Cabinet Engine; полная hardware/mapping-приёмка из Phase 5 ниже этим не объявляется завершённой.
- Старые пункты Phase 0–5 ниже сохраняют исходный план и не являются актуальным отчётом о каждом реализованном файле.
- Early Alpha UI принята пользователем на `88f110d15f06a86f7c277ef61979520218140720`. Следующий утверждённый этап — **Phase 6A**, [план](docs/specs/LEDMAP-HARDWARE-ENGINE-001.md), ADR-018. Расширение StartCorner отложено.

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

## Early Alpha UI — Cabinet Grid Visualizer (после Phase 4E)

Статус: **Accepted** (2026-09-23), пользователь одобрил [LEDMAP-ALPHA-UI-001](docs/specs/LEDMAP-ALPHA-UI-001.md) и ADR-017. Это ограниченное исключение из прежнего запрета раннего UI; Phase 6–8 сохраняются.

- [x] Подготовить спецификацию, ADR-017 и согласованные изменения архитектурного плана/AGENTS.md.
- [x] Получить одобрение плана реализации Early Alpha UI.
- [x] Подключить Electron/electron-vite и запуск `npm run dev`; сборка приложения через `npm run build`.
- [x] Create Screen: один Screen/Grid, настройки геометрии и ordering, readonly snapshot через существующий core, ошибки и лимиты preview.
- [x] Canvas: физические ID, отдельные логические номера, модульная сетка, направленный путь, fit-to-window и сводка размеров.
- [x] Целевые тесты app, регрессия core, typecheck/lint/build, smoke-проверка реального Electron-окна и инструкция запуска. См. [отчёт Alpha](docs/alpha-ui-001-validation.md).

## Phase 6 — Hardware (Receiver/Processor/Port) Engine
- [~] Phase 6A: явная полная topology, компактные spans, port-local dataIndex, forward/reverse и отдельный globalRemapIndex; план принят 2026-09-24.
- [ ] Phase 6A: полный REF-001 sweep, multi-processor, variable sizes, валидация, регрессия и итоговый отчёт.
- Phase 6B (пункты allocation/partial ниже) требует отдельного плана; в 6A не входит.
- [ ] `hardware-engine/allocate.ts` (ёмкости, precedence Processor→Port→Receiver)
- [ ] `hardware-engine/resolve.ts` (явные назначения + доводка)
- [ ] Диагностики overflow / unused slot
- [ ] Тестовая матрица capacity/overflow/partial

## Phase 7 — Mapping, Remap, Validation, Serialization
- [ ] `mapping-engine` (Input Canvas rect → логическая позиция → PixelMap компактно)
- [ ] `remap-engine` (пост-коррекция готового PixelMap, без мутации модели)
- [ ] `validation` (rules, codes, validator)
- [ ] `serialization` schema v1 + round-trip + миграции (скелет)
- [ ] Все тесты движков зелёные и выполняются headless независимо от Alpha UI

## Phase 8 — Полный UI (packages/app)
- [ ] Развить минимальное Electron-окно Early Alpha до полного редактора
- [ ] Open/Save `.ledmap` через IPC + `main/services`
- [ ] Реактивное state; Canvas: screen → cabinet outline → module grid из read-only модели
- [ ] Диагностики валидатора в UI
- [ ] `electron-builder` Windows packaging
- [ ] Экспорт hardware-форматов производителей (отдельный контракт)

## Запреты на ближайших этапах (0–5)
- UI — Phase 8; исключение только для Early Alpha UI по утверждённым LEDMAP-ALPHA-UI-001 / ADR-017
- Electron runtime — Phase 8; в одобренном Early Alpha разрешены окно и renderer, без привилегированного IPC
- Без hardware драйверов/сетевых протоколов видеопроцессоров
- Без экспортных форматов производителей
- Без packaging/distribution, undo/redo, локализации, превью-рендера пикселей
