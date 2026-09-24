# LedMAP — TODO

Поэтапный план. Никакой этап не начинается без одобрения предыдущего. Каждый этап: зелёные тесты + `typecheck` + `lint`. Статусы: `[ ]` — не начато, `[x]` — готово, `[~]` — в работе.

## Текущая точка и следующий этап

- [x] Phase 4E — обобщённая геометрия Cabinet pixel layout принята пользователем на `67fd975cf0e0036fd50c06d533a13a1bff871651`.
- Cabinet Engine поддерживает Row/Column, LTR/RTL, TTB/BTT, независимый Snake, Top Left и прямоугольный module-first pixel layout с inverse mapping и safe integer validation. REF-001…004 служат регрессией Cabinet Engine; полная hardware/mapping-приёмка из Phase 5 ниже этим не объявляется завершённой.
- Старые пункты Phase 0–5 ниже сохраняют исходный план и не являются актуальным отчётом о каждом реализованном файле.
- Early Alpha UI принята пользователем на `88f110d15f06a86f7c277ef61979520218140720`, Phase 6A и 6B закрыты; 6B принята на `63f340a5e181f98b93713cafcdc2d56ebd37ce1f`. **Phase 7A принята/закрыта на `0071eeed001ed2e275e3efb827b216a1d49da1f8`** (`feat(core): implement mapping phase 7a`), применение протоколируется в ADR-020. Контракты: [LEDMAP-MAPPING-001](docs/specs/LEDMAP-MAPPING-001.md), [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](docs/specs/LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md), [LEDMAP-PHASE-7-ACCEPTANCE-001](docs/specs/LEDMAP-PHASE-7-ACCEPTANCE-001.md). **План/docs-gate Phase 7B принят** после corrective review `3a12ff1a4b661def0fb8b90d343b7268a62c3fb4`: [LEDMAP-REMAP-001](docs/specs/LEDMAP-REMAP-001.md) и ADR-021 — Accepted. Production-код 7B ожидает отдельного разрешения после проверки SHA acceptance-коммита. Расширение StartCorner отложено.

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
- [x] Phase 6A: явная полная topology, компактные spans, port-local dataIndex, forward/reverse и отдельный globalRemapIndex; реализация принята пользователем, этап закрыт.
- [x] Phase 6A: полный REF-001 sweep, multi-processor, variable sizes, валидация, регрессия и [итоговый отчёт](docs/hardware-engine-6a-validation.md). 336/336 тестов, typecheck/lint/build и Electron smoke проходят локально.
- Phase 6B (allocation/capacity) закрыта: план и docs-commit `a8c6fb0` приняты, реализация принята пользователем на `63f340a5e181f98b93713cafcdc2d56ebd37ce1f`. Контракт: [LEDMAP-HARDWARE-CAPACITY-001](docs/specs/LEDMAP-HARDWARE-CAPACITY-001.md), ADR-019.
- [x] `hardware-engine/allocate.ts` → `allocateHardware()` (порядок processorOrder→Port.index→receiverOrder, first-fit, опциональный `Receiver.pixelCapacity`)
- [x] `resolveHardware`: единственный аддитивный инвариант `receiverLoad ≤ pixelCapacity`; addressing/spans/order не меняются (генератор explicit topology в `allocateHardware()`)
- [x] Диагностики unused-slot (unit: pixels/receivers/ports) / overflow
- [x] Тестовая матрица capacity/overflow/partial + REF-001 reconstruction (pixelCapacity=65536/Receiver); 425/425 тестов, typecheck/lint/build и Electron smoke проходят локально. См. [отчёт 6B](docs/hardware-engine-6b-validation.md).

## Phase 7 — Mapping, Remap, Validation, Serialization
- [x] План 7A принят 2026-09-24: [LEDMAP-MAPPING-001](docs/specs/LEDMAP-MAPPING-001.md), ADR-020; identity-translation profile, один InputCanvas/Screen/Grid/Region, компактный immutable PixelMap.
- [x] Docs-only gate: commit `docs: define mapping phase 7a` включает только спецификацию, DECISIONS и TODO. После проверки SHA пользователь отдельно разрешил production-код 7A.
- [x] 7A: InputCanvas/InputCanvasId и ссылка MappingRegion; `resolveMapping`, `mapInputPixel`, `unmapHardwarePixel` через существующие API 6A; physical cell lookup без повторного Numbering/Direction/Snake.
- [x] 7A: identity/offset REF-001 sweeps, reverse traversal, validation/immutability, регрессия 425 тестов, typecheck/lint/build/Electron smoke и diff check.
- [x] **Phase 7A ACCEPTED / CLOSED** на `0071eeed001ed2e275e3efb827b216a1d49da1f8` (18 файлов, 880+/6-, 543/543 тестов — локальные результаты, CI-подтверждение не заявляется). Отчёт: [mapping-engine-7a-validation.md](docs/mapping-engine-7a-validation.md). Приёмка по [LEDMAP-PHASE-7-ACCEPTANCE-001](docs/specs/LEDMAP-PHASE-7-ACCEPTANCE-001.md).
- [x] План/docs-gate 7B принят после corrective review `3a12ff1a4b661def0fb8b90d343b7268a62c3fb4`: `LEDMAP-REMAP-001` и ADR-021 — Accepted. v1 = identity-only, empty-only rule set; без concrete production rules, Mapping transforms или hardware-final addressing. `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` зарезервирован после Hardware Profiles + AddressEncoder.
- [ ] 7B production `remap-engine` (identity-only v1): реализация не разрешена; ожидает отдельного разрешения после проверки SHA acceptance-коммита. Базовые контракты Cabinet/Mapping/Hardware сохраняются.
- [ ] 7C: `validation` проекта (rules, codes, validator); обязательные инварианты реализуются уже в 7A/7B.
- [ ] 7D: `serialization` schema v1 + round-trip + миграции (скелет)
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
