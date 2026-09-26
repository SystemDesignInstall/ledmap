# LedMAP — TODO

Поэтапный план. Никакой этап не начинается без одобрения предыдущего. Каждый этап: зелёные тесты + `typecheck` + `lint`. Статусы: `[ ]` — не начато, `[x]` — готово, `[~]` — в работе.

## Текущая точка и следующий этап

- [x] Phase 4E — обобщённая геометрия Cabinet pixel layout принята пользователем на `67fd975cf0e0036fd50c06d533a13a1bff871651`.
- Cabinet Engine поддерживает Row/Column, LTR/RTL, TTB/BTT, независимый Snake, Top Left и прямоугольный module-first pixel layout с inverse mapping и safe integer validation. REF-001…004 служат регрессией Cabinet Engine; полная hardware/mapping-приёмка из Phase 5 ниже этим не объявляется завершённой.
- Старые пункты Phase 0–5 ниже сохраняют исходный план и не являются актуальным отчётом о каждом реализованном файле.
- Early Alpha UI принята пользователем на `88f110d15f06a86f7c277ef61979520218140720`, Phase 6A и 6B закрыты; 6B принята на `63f340a5e181f98b93713cafcdc2d56ebd37ce1f`. **Phase 7A принята/закрыта на `0071eeed001ed2e275e3efb827b216a1d49da1f8`** (`feat(core): implement mapping phase 7a`), применение протоколируется в ADR-020. Контракты: [LEDMAP-MAPPING-001](docs/specs/LEDMAP-MAPPING-001.md), [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](docs/specs/LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md), [LEDMAP-PHASE-7-ACCEPTANCE-001](docs/specs/LEDMAP-PHASE-7-ACCEPTANCE-001.md). **Phase 7B ACCEPTED / CLOSED** на `2b589ac326ab6bc066d0a55cd295bae05e9fc380`: identity-only Logical Remap v1 по [LEDMAP-REMAP-001](docs/specs/LEDMAP-REMAP-001.md) и ADR-021; 625/625 тестов — локальный результат, без CI-подтверждения. **Phase 7C ACCEPTED / CLOSED** на `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9`: [LEDMAP-PROJECT-VALIDATION-001](docs/specs/LEDMAP-PROJECT-VALIDATION-001.md), ADR-022; 827/827 = 625 baseline + 202 новых — локальный результат, без CI-подтверждения. План/docs-gate 7D Serialization принят: [LEDMAP-SERIALIZATION-001](docs/specs/LEDMAP-SERIALIZATION-001.md), версия 1.0 Accepted, ADR-023. **Phase 7D ACCEPTED / CLOSED** — production принят на `410ba7fcc830968b615058fe33b6bbea12fb2272` после независимого production review (docs-gate `2a3e08e`, immediate production parent — closure Project Canvas `49d17d7`); 1087/1087 = 836 фактический baseline + 251 новых — reported local PASS, без CI-подтверждения. Early Alpha UI расширен до Project Canvas (мультискринный layout): [LEDMAP-ALPHA-UI-002](docs/specs/LEDMAP-ALPHA-UI-002.md), ADR-024, легализация одобрена пользователем 2026-09-25, production принят на `ab71ca2` (docs-gate `0c72dff`); 836/836 тестов, typecheck/lint/build/Electron smoke — локальный PASS, без CI-подтверждения. Расширение StartCorner отложено. **Phase 7E ACCEPTED / CLOSED** — implementation `09abe2386356073a89d75d7cf91a023abd94f9f4` + production corrective `1fe2516ae1274fddd8271366946eb5159122b151`, implementation record `b27fe0462f0f7a1c35cb227b7c1b378541dd7c1b`; ветка fast-forward в `master`, `origin/master` = `b27fe04`; 1202/1202 core и 1238/1238 full — reported local PASS, без CI-подтверждения. Следующий этап по staged sequence — Address Encoder (отдельный gate), затем `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001`; Phase 8 UI остаётся закрытой до завершения аппаратной адресации.

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

## Phase 3 — Domain Model (packages/core, только чистые данные)
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

### Вторая итерация — Project Canvas (мультискринный layout)

Статус: **Accepted (ретроактивная легализация 2026-09-25)** — [LEDMAP-ALPHA-UI-002](docs/specs/LEDMAP-ALPHA-UI-002.md), ADR-024.

- [x] Project Canvas: несколько Screen на общем canvas, camera pan/zoom/fit, selection Screen/Grid/Cabinet, project tree, properties panel, drag-перемещение, «+ Screen».
- [x] Инварианты: REF-001 порядок и cabinet IDs не меняются при перемещении; лимиты preview на каждый Screen; core не изменяется.
- [x] Unit-тесты project-состояния и обновлённый Electron smoke; test/typecheck/lint/build проходят локально.
- [ ] Редактор geometry/ordering формы из ALPHA-UI-001 возвращается в Phase 8 (сейчас ordering readonly).

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
- [x] План/docs-gate 7B принят на `52395cb9bc2c7d1ae358e838c80a7136ef535dcd` после corrective review `3a12ff1a4b661def0fb8b90d343b7268a62c3fb4`: `LEDMAP-REMAP-001` и ADR-021 — Accepted. v1 = identity-only, empty-only rule set; без concrete production rules, Mapping transforms или hardware-final addressing. `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` зарезервирован после Hardware Profiles + AddressEncoder.
- [x] **Phase 7B production ACCEPTED / CLOSED** на `2b589ac326ab6bc066d0a55cd295bae05e9fc380`: `remap-engine` (identity-only v1), compact immutable wrapper, делегирование lookup в 7A. 625/625 тестов (543 baseline + 82 новых), typecheck/lint/build/Electron smoke/diff-check — локальный PASS, CI-подтверждение не заявляется. Базовые контракты Cabinet/Mapping/Hardware сохранены. Отчёт: [remap-engine-7b-validation.md](docs/remap-engine-7b-validation.md).
- [x] План/docs-gate 7C принят на `a795717a877130b3667420e89790186b876e0e35`: [LEDMAP-PROJECT-VALIDATION-001](docs/specs/LEDMAP-PROJECT-VALIDATION-001.md), версия 1.0 Accepted; ADR-022. Single-profile runtime input, shape → 7A → 7B, immutable diagnostics/checks, first-failure semantic stages с явным blocked; без warnings и всеобщего semantic aggregation.
- [x] **Phase 7C production ACCEPTED / CLOSED** на `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9`: `validation`, descriptor-based shape-check, делегирование 7A/7B, immutable report. 827/827 = 625 baseline + 202 новых; typecheck/lint/build/Electron smoke/diff-check — локальный PASS, CI-подтверждение не заявляется. Принятые контракты движков сохранены. Отчёт: [project-validation-7c-validation.md](docs/project-validation-7c-validation.md).
- [x] План/docs-gate 7D принят: [LEDMAP-SERIALIZATION-001](docs/specs/LEDMAP-SERIALIZATION-001.md), версия 1.0 Accepted; ADR-023. Explicit wire schema v1, persisted source/orders, root extensions, strict canonical tokens с amendment ADR-011, parse ≠ load, load/save через 7C, canonical JSON и v1-only migration skeleton. Docs-gate `2a3e08e8379191f3f2e73286361bf04ca6f05f7b`; immediate production parent — closure Project Canvas `49d17d7d5e9a805a7025d9784d4f0bf385fa8926`.
- [x] 7D production: `packages/core/src/serialization/` (strict JSON reader, version dispatch, closed schema, reconstruct, canonical writer), 10 test-файлов + fixtures, валидационный отчёт. Один чистый production-коммит: 21 core source/test файл, +2932; app, математика 6A/6B/7A/7B/7C и Accepted spec не изменены. File I/O и UI Open/Save не входят. Отчёт: [serialization-7d-validation.md](docs/serialization-7d-validation.md).
- [x] **Phase 7D ACCEPTED / CLOSED** на `410ba7fcc830968b615058fe33b6bbea12fb2272` (21 файл), implementation record `48b82016703374542403b246fe9f7628bf310eaa`: 1087/1087 = 836 фактический pre-production regression baseline (827 docs-gate floor + 9 app-тестов легализованной Project Canvas итерации) + 251 новых; typecheck/lint/build/Electron smoke/diff-check — reported local PASS, CI-подтверждение не заявляется. **Phase 7 закрыт как единый блок**: 7A/7B/7C/7D CLOSED + headless integration gate CLOSED (1051 core-тест / 41 файл, `npm run test:core`). Следующий плановый этап — Hardware Profile v1 по gate 7E (ADR-025), а не Phase 8 UI.
- [x] **Phase 7 Integration Closure Gate (headless) CLOSED**: `npm run test:core` = `vitest run packages/core/test` → 41 файла / 1051 тест, все `packages/core/test/**` зелёные без Electron, без `packages/app` и без Alpha UI state; `typecheck`/`build -w @ledmap/core`/`eslint packages/core`/`npm test` (43 файла / 1087) / `git diff --check` — PASS. Только `package.json`, отчёт и TODO; `packages/core/src/**`, `packages/app/**`, engine math и Accepted specs не изменены. Отчёт: [phase-7-headless-validation.md](docs/phase-7-headless-validation.md).
- [x] Все тесты движков зелёные и выполняются headless независимо от Alpha UI
- [x] **Phase 7 CLOSED** на `6bf98b437c3f0c1371e1636a578dce917168c76e` (7A/7B/7C/7D + headless integration gate), подтверждено на `origin/master`; 1087/1087 — reported local PASS без CI-подтверждения.

## Phase 7E — Hardware Profile v1
- [x] План/docs-gate 7E принят: [LEDMAP-HARDWARE-PROFILE-001](docs/specs/LEDMAP-HARDWARE-PROFILE-001.md), версия 1.0 Accepted; ADR-025. Corrective narrowing umbrella [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](docs/specs/LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md) до роли architecture umbrella с явной staged-разметкой (Hardware Profile → Address Encoder → `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001`). Foundation layer: bundle и constituent profiles, `id`/`version`, logical/physical/transport домены, `PixelTransportProfile`, детерминированный transport forward/inverse lookup, capacity/constraints, `LEDMAP-GENERIC-REF001`, `validateHardwareProfile`. Границы: 7D не меняется (профиль — отдельный runtime input, `extensions` не обход), 7C не расширяется (errors-only, без `WARNING`/`INFO`, profile validation вне `validateProject`), 6B `Receiver.pixelCapacity`/`resolveHardware()` не переопределяются, `SplitLevel` v1 = только `CABINET`. Docs-gate baseline `6fdb9aa39d303e6d9f62fd6289be6d68e4ad43a9`; 1087 тестов (41 core-файл / 1051 core-only).
- [x] 7E production: `packages/core/src/hardware-profile/` (types, geometry, transport, validation, reference, index) + аддитивный export из `packages/core/src/index.ts`, 9 test-файлов и validation report. Строго additive: 6A–7D, app, `.ledmap` schema, `Receiver.pixelCapacity`, `resolveHardware()` и `validateProject()` не изменены, новых runtime-зависимостей нет.
- [x] **Phase 7E production ACCEPTED** — implementation `09abe2386356073a89d75d7cf91a023abd94f9f4` после remote review; required production corrective `1fe2516ae1274fddd8271366946eb5159122b151` (collision `AddressingProfile.identity.id` с `identity.id` bundle → `PROFILE_DUPLICATE_ID` на `["addressingProfile","identity","id"]` в фазе duplicate ids). Оба решения приняты: `ProcessorProfile.maxPorts` required; `LEDMAP-GENERIC-REF001` — нормативное имя профиля, `LEDMAP_GENERIC_REF001` — корректный TS export identifier.
- [x] **Phase 7E ACCEPTED / CLOSED** — implementation record / docs alignment `b27fe0462f0f7a1c35cb227b7c1b378541dd7c1b` (`§6.2` приведён к `maxPorts` required; имя типа в отчёте исправлено на `HardwareProfileValidationCheck`). Ветка `6fdb9aa → 09abe23 → 1fe2516 → b27fe04` fast-forward в `master` (`origin/master` = `b27fe04`). 1202/1202 core = 1051 baseline + 151 новых, 1238/1238 full = 1087 baseline + 151 новых; `typecheck`/`build -w @ledmap/core`/`eslint`/`test:smoke` (перепрогнан после corrective)/`git diff --check` — reported local PASS, без CI-подтверждения и без расширения scope. Аддитивно: `maxPorts` required, optional — только `PortProfile.maxTransportPixels?`, `PortProfile.maxReceivers?`, `ReceiverProfile.maxTransportPixels?`, `ReceiverProfile.maxCabinets?`. Отчёт: [hardware-profile-7e-validation.md](docs/hardware-profile-7e-validation.md). Address Encoder и Final Remap/ReverseIndex — отдельные gates, не авторизованы.

## Phase 8 — Полный UI (packages/app)
- [ ] Развить минимальное Electron-окно Early Alpha до полного редактора
- [ ] Open/Save `.ledmap` через IPC + `main/services`
- [ ] Реактивное state; Canvas: screen → cabinet outline → module grid из read-only модели
- [ ] Диагностики валидатора в UI
- [ ] `electron-builder` Windows packaging
- [ ] Экспорт hardware-форматов производителей (отдельный контракт)

## Запреты на ближайших этапах (0–5)
- UI — Phase 8; исключение только для Early Alpha UI по утверждённым LEDMAP-ALPHA-UI-001 / ADR-017 и LEDMAP-ALPHA-UI-002 / ADR-024
- Electron runtime — Phase 8; в одобренном Early Alpha разрешены окно и renderer, без привилегированного IPC
- Без hardware драйверов/сетевых протоколов видеопроцессоров
- Без экспортных форматов производителей
- Без packaging/distribution, undo/redo, локализации, превью-рендера пикселей
