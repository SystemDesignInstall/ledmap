# LedMAP — Decisions (ADR)

Статус по умолчанию: **Proposed** до одобрения; после фиксации — **Accepted**. Записи добавляются до написания кода, чтобы контракт не расходился с реализацией.

## Статус ADR-002…013

Приняты как **рабочие решения для построения каркаса** (Working). НЕ объявлены математически доказанными. Следующие контракты подлежат ревизии после Reference Tests REF-001…004:

- Direction semantics
- Snake semantics
- Module Ordering
- Pixel Ordering
- Общая конфигурация project-wide ordering вне REF-001 (порядок flattening уточнён в ADR-006)
- auto-allocation
- Реализация и executable-проверка addressing (нормативная семантика dataIndex уже зафиксирована ADR-015)

Математические решения валидируются на REF-001 → REF-002 → REF-003 до того, как перейдут в UI/hardware/renderer.

---

## ADR-001: Технологический стек
- **Статус:** Accepted
- **Решение:** TypeScript (strict) + npm workspaces; Electron + electron-vite + electron-builder; HTML5 Canvas; Vitest; ESLint flat config.
- **Почему:** один язык на Core и UI без binding-моста; Canvas нативно удобен для LED-раскладок и zoom/pan; JSON-проекты нативно поддерживаются; чистое детерминированное ядро легко тестировать.
- **Следствия:** нужен Node.js 24 LTS (>= 24) + npm. Python/.NET/C++ не используются, несмотря на наличие в окружении.

## ADR-002: Монорепо с двумя пакетами
- **Статус:** Proposed
- **Решение:** `packages/core` (чистый домен, нулевые runtime-зависимости) + `packages/app` (Electron main/preload/renderer). `core` никогда не импортирует `electron`/`node:*`/DOM; enforce-ся eslint import-restriction.
- **Почему:** единый `src/core` не гарантирует границу на уровне пакета/импортов. Раздельные пакеты делают «UI — клиент core» проверяемым, а не декларацией.

## ADR-003: Immutable-модель, pure functions
- **Статус:** Proposed
- **Решение:** доменные данные — обычные замороженные объекты/типы (TS `const`, никаких классов с методами). Движки — `(model) → derived`, детерминированы и идемпотентны.
- **Следствия:** детерминированные ассерты попиксельной раскладки; возможность headless-потребителя core (CLI/экспорт).

## ADR-004: Координатная система и логический порядок
- **Статус:** Proposed
- **Решение:** origin — верхний левый угол; ось Y растёт вниз (в духе Canvas2D). `Direction` применяется к оси нумерации: Numbering=Row → горизонтальное чтение (Left→Right / Right→Left); Numbering=Column → вертикальное. **Уточнение Phase 2A:** ReferenceAddressingProfile-001 задаёт логический row-major L→R/T→B порядок модулей, затем пикселей внутри каждого модуля (start top-left, оба snake OFF). Это не physical panel scan и не обход всего кабинета по строкам; универсальный default для остальных профилей не устанавливается.
- **Почему:** без фиксации пиксельные ассерты Test 001 неоднозначны; snake-семантика зависит от направления Y.

## ADR-005: Mapping Region vs Cabinet Grid
- **Статус:** Proposed
- **Решение:** `CabinetGrid` владеет физическим размещением **и** конфигурацией упорядочивания (Numbering/Direction/Snake) — это физико-логический этап. `MappingRegion` — логическая оболочка: ссылка на rect `InputCanvas` + целевой Grid + корреляция (Input→Output). Модель проектируется сразу с учётом поворота/смещения/непрямоугольности регионов на будущее.
- **Почему:** фиксирует, кто кем компонуется, и не требует переписывания типов под общий случай.

## ADR-006: Precedence сигнальных индексов
- **Статус:** Amended — Phase 2A; normative для global flattening, см. ADR-015.
- **История:** исходное Proposed-решение называло порядок глобальным, но обосновывало его аппаратной нумерацией портов и приводило диапазоны без указания scope. Это смешивало flattened reference numbering с hardware addressing. Исторические числа сохранены ниже с точным названием; вывод об универсальности аппаратного представления отозван.
- **Уточнённое решение LedMAP:** **Processor → Port → Receiver → Cabinet → Module → Pixel** определяет отдельный derived `globalRemapIndex` / deterministic global flattening. Оно **не определяет PixelAddress.dataIndex** и не задаёт vendor physical address.
- **Следствия для REF-001:** P01 → P01:01 (R01/R02, **globalRemapIndex 0..131071**) → P01:02 (R03, **globalRemapIndex 131072..196607**). Старые processor0/port0/port1 — нуль-базовые обозначения тех же сущностей. Port-local `dataIndex` второго порта равен **0..65535**; C09 начинается с 0, его `globalRemapIndex=131072`.
- **Основание:** это нормативный порядок flattening LedMAP для reference model, не утверждение о едином протоколе всех LED vendors. Детали multi-processor ordering остаются OPEN в спецификации.

## ADR-007: Явные назначения + авторазметка
- **Статус:** Proposed
- **Решение:** модель хранит **явные** назначения (cabinet → receiver); движок даёт `allocate()` (автозаполнение по ёмкости) и `resolve()` (доводка пропусков с диагностикой). Фикстура 001 содержит явные назначения, согласованные с авторасчётом.
- **Почему:** авто vs явные назначения из файла не должны расходиться незаметно.

## ADR-008: Ёмкости и частичная заполненность
- **Статус:** Proposed
- **Решение:** Receiver = максимум пикселей (число), Port = максимум Receiver'ов, Processor = максимум Port'ов — простые целые, без потолков сложности. Частичная заполненность допустима; незанятые слоты → информативная диагностика «unused slot». Overflow → ошибка валидации.

## ADR-009: Границы Mapping vs Remap Engine
- **Статус:** Proposed
- **Решение:** Mapping Engine — корреляция источника на этапе проектирования (строит PixelMap). Remap Engine — пост-коррекция **готового** PixelMap (swap/rotate/invert субрегионов, dead-LED). Remap никогда не мутирует исходную модель.

## ADR-010: Сериализация
- **Статус:** Proposed
- **Решение:** версионированный JSON; `schemaVersion` целое + pure-миграции; строгая схема (`additionalProperties: false`); `extensions` passthrough; канонический порядок ключей и отступов; производные данные **не сериализуются**. Сериализация живёт в `core` (pure); fs-файловые операции — в `app`.

## ADR-011: Канонические токены enums
- **Статус:** Proposed
- **Решение:** в `core` — enum-строки: `numbering: "row" | "column"`, `direction: "left-to-right" | "right-to-left"`, `snake: boolean`. Отображение в презентационные лейблы («Row», «Left → Right», «ON») — в `app` (ui-adapters), нормализация алиасов — на слое сериализации, не в движках.

## ADR-012: Reference Test 001 как приёмочный тест
- **Статус:** Proposed
- **Решение:** методология — fixture-driven (`project.json` + `expected.json`), независимые ручные пиксельные якоря (см. [LEDMAP-REF-001](reference/LEDMAP-REF-001.md) и ARCHITECTURE §6), полное равенство золотого файла, границы SignalPath, round-trip, вызов движков дважды для проверки детерминизма. Phase 2A задаёт только документационный контракт, executable REF-тесты ещё впереди.

## ADR-013: Reference Tests 002–004 (спецификации к фиксации)
- **Статус:** Proposed
- **Решение:** 002 — Row + Right→Left + Snake; 003 — Column + Snake; 004 — Column + варианты Direction. Каждый фиксирует Numbering/Direction/Snake по отдельности и в комбинациях; полные spec-файлы пишутся до реализации, по образцу 001.
- **Следствия:** 001 — полный приёмочный; 002–004 — регрессия независимости трансформаций.

## ADR-014: Конвенции Domain Model (Phase 1)
- **Статус:** Working
- **Решение:** домен — плоские immutable-сущности (`readonly` свойства, ссылки по брендированным ID), value objects как readonly-структуры с фабриками (`createSize`, `createPoint`, …), один класс только для ошибок (`DomainError` с кодами). Без класса-обёрток, getters/setters, UI/Electron/Node-зависимостей.
- **Уровни разделены и не сводятся к одному индексу:** Geometry (x,y,row,column,localX,localY) | Ordering (cabinetIndex/moduleIndex/pixelIndex/logicalIndex — производные) | Signal topology (processor/port/receiver + port-local dataIndex по ADR-015) | Physical panel scan / vendor encoding (будущий HardwareProfile). Общее ordering остаётся WORKING; ReferenceAddressingProfile-001 уже задан нормативно.
- **Pixel ≠ PixelAddress.** Pixel — физическая/логическая сущность (cabinet, module, coordinate, physical, logicalIndex). PixelAddress — отдельная derived addressing-структура (hardware + cabinet + module + coordinate + dataIndex). Биекция `Pixel → Mapping Engine → PixelAddress` по ключу `(cabinet, module, coordinate)`; PixelAddress не наследуется от Pixel и не является его полем.
- **Derived allocation state не хранится:** `usedPixels`/`remainingPixels`/`assignedReceivers` (Port) вычисляются из capacity и назначений, никогда не хранятся как независимые поля (устраняется риск рассинхрона capacity ↔ usage). Аллокатор не реализован.
- Координаты 0-базовые, origin top-left, Y растёт вниз (см. ADR-004).
- Производные индексы на сущностях **не хранятся** (кроме read-model `Pixel`, заполняемой движками); правило «derived не персистится» сохраняется.
- Инварианты проверяются в фабриках (полный список — `docs/domain-model.md` §7).

## ADR-015: Port-local dataIndex и граница HardwareProfile

- **Статус:** Normative — Phase 2A, documentation / contract only; реализация движков не выполнена.
- **Проверено по репозиторию:** `model/signal-path.ts` уже разделяет HardwareAddress, SignalPath и PixelAddress; `model/pixel.ts` определяет отдельный Pixel; `receiver.ts`, `port.ts`, `processor.ts` явно описывают topology. Тип `dataIndex: number` сам по себе не определял scope.
- **Проверено по hardware research:** [NovaLCT V5.4.7.1, §5.2.2](https://oss.novastar.tech/uploads/2023/06/NovaLCT-LED-Configuration-Tool-for-Multimedia-Player-User-Manual-V5.4.7.1.pdf) описывает receiving-card connections для выбранного output port; [rpi-rgb-led-matrix](https://github.com/hzeller/rpi-rgb-led-matrix/blob/master/utils/README.md) отдельно описывает multiplexing, row-address type и pixel mapping. Эти источники подтверждают отдельные hardware concerns, но не универсальную числовую адресацию vendors.
- **Нормативное решение LedMAP:** Port — независимый output stream и scope/reset boundary. `dataIndex` = **zero-based canonical pixel offset inside one Processor Port stream**. Receiver на том же Port не сбрасывает индекс; следующий Port начинает с 0. Это не Pixel.logicalIndex, не физическая координата, не HUB75 scan index и не vendor packet address.
- **Global flattening:** отдельный `globalRemapIndex` по уточнённому ADR-006 сохраняет прежние reference numbers. Он не входит в HardwareAddress/PixelAddress и не сохраняется в проекте.
- **Граница vendor:** logical Module/Pixel ordering задаётся явной LedMAP/reference конфигурацией. Physical scan/wiring, scan ratio, driver-IC/shift-register/packet encoding относятся к будущему `HardwareProfile.encode(...)`. Cabinet Engine остаётся независимым от vendor hardware.
- **Обратимость:** для valid resolved mapping Pixel ↔ PixelAddress — биекция; reverse lookup требует `(processor, port, dataIndex)`. Голый индекс без контекста запрещён.
- **Контракт и приёмка:** [LEDMAP-HARDWARE-ADDRESSING-SPEC-001](specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md), [LEDMAP-REF-001](reference/LEDMAP-REF-001.md). Ключевая граница: P01:01 last `dataIndex=131071`, P01:02 first `dataIndex=0`, при непрерывном `globalRemapIndex` 131071 → 131072.
- **Следствия:** никаких изменений TypeScript-модели, интерфейса HardwareProfile, calculators или Engines в Phase 2A. Математическая executable-приёмка следует отдельным этапом.

## ADR-016: Независимая геометрия Cabinet pixel layout

- **Статус:** Normative — Phase 4E.
- **Решение:** `CabinetPixelLayoutConfig` задаёт только `moduleColumns`, `moduleRows`, `modulePixelWidth`, `modulePixelHeight`; `CabinetEngineConfig` — пересечение с существующим `CabinetOrderingInput`. Функции module/pixel index принимают минимальные части конфигурации, не зависят от Cabinet ordering и сущностей Cabinet/Hardware.
- **Математика:** Module и Pixel внутри Module — Row Major, Top Left, Snake OFF; flattening — module-first. Геометрия прямоугольная, все модули одного размера. Каждый входной размер и каждое производное произведение обязаны быть positive safe integers.
- **Совместимость:** один frozen `referenceCabinetLayout` и четыре прежних `reference*` wrapper сохраняют API и результаты REF-001. Производные данные не сериализуются; новые режимы ordering не вводятся.
- **Контракт и приёмка:** [Cabinet Pixel Layout Specification](specs/LEDMAP-CABINET-PIXEL-LAYOUT-001.md), полный двусторонний round-trip 3×2 модулей по 5×7 px, независимые якоря и регрессия исходных 185 тестов.

## ADR-017: Early Alpha UI — Cabinet Grid Visualizer

- **Статус:** Accepted — пользователь одобрил план 2026-09-23.
- **Основание:** Phase 4E принята пользователем на commit `67fd975cf0e0036fd50c06d533a13a1bff871651`. Cabinet ordering и обобщённый pixel layout позволяют визуализировать сетку через существующий public API, не дожидаясь Hardware Engine. StartCorner сейчас не расширяется.
- **Решение:** на основании одобренной спецификации [LEDMAP-ALPHA-UI-001](specs/LEDMAP-ALPHA-UI-001.md) разрешить отдельный Early Alpha UI между Phase 4E и дальнейшими движками: Electron, один Screen/Grid, настройки и Canvas preview. Это узкое исключение из «UI только в Phase 8»; полный UI остаётся Phase 8.
- **Границы:** production-код только в app и конфигурации запуска/сборки. UI потребляет готовый core; математика, public API и reference-тесты не меняются. Physical position и logical signal order отображаются отдельно. Mapping Region не подменяется Cabinet/Grid; Alpha не строит Input→Output mapping.
- **Отложено:** Hardware/Receiver/Port/Processor, addressing, Mapping/Remap, сериализация и Open/Save, экспорт, packaging, новые StartCorner и module/pixel ordering.
- **Приёмка:** спецификация фиксирует сценарий Create Screen, допустимые настройки, ошибки/лимиты, интеграцию API и проверку реального Electron-окна. Обязательны test/typecheck/lint/build и smoke-приёмка. Перед production-кодом утверждённый контракт фиксируется отдельным documentation commit.

## ADR-018: Phase 6A — явная Hardware topology и каноническая адресация

- **Статус:** Accepted — одобрено пользователем 2026-09-24.
- **Контракт:** [LEDMAP-HARDWARE-ENGINE-001](specs/LEDMAP-HARDWARE-ENGINE-001.md). Processor order явный, Port следует Port.index, Receiver order задаётся явным списком внутри Port и не использует Receiver.index; Cabinet следует Receiver.cabinets.
- **Полнота:** каждый входной Cabinet назначен ровно одному Receiver; все ссылки и порядки проверены. Capacity ограничена существующими Processor.portCount и Port.receiverCapacity. Auto-allocation, новая Receiver capacity и partial assignments отложены в 6B.
- **Адресация:** forward принимает CabinetId и cabinet-local pixel; reverse требует processor + port + dataIndex. Port сбрасывает dataIndex, Receiver не сбрасывает. globalRemapIndex — отдельный derived flatten, не поле PixelAddress и не hardware lookup key.
- **Представление:** immutable компактные Port/Receiver/Cabinet spans и реальные pixel counts из Cabinet Engine; разные размеры Cabinet допустимы, все накопленные суммы проверяются как safe integers. PixelAddress вычисляется по запросу.
- **Приёмка:** полный независимый sweep 196608 пикселей REF-001, оба round-trip, multi-processor с Port.index=0/dataIndex=0 на обоих Processor, variable cabinet sizes и вся существующая регрессия.

## ADR-019: Phase 6B — capacity и авто-allocation

- **Статус:** Accepted — одобрено пользователем 2026-09-24.
- **Контракт:** [LEDMAP-HARDWARE-CAPACITY-001](specs/LEDMAP-HARDWARE-CAPACITY-001.md). Этот ADR **принимает/уточняет соответствующую часть ADR-007 и ADR-008**: auto-allocation теперь не «доводит» resolver, а генерирует explicit topology; Receiver pixel capacity становится **опциональным** constraint.
- **Capacity:** опциональный `Receiver.pixelCapacity?: number` (positive safe integer). Отсутствие = «в LedMAP pixel-limit не задан»; для allocator — отсутствие верхней границы, не утверждение о физической бесконечности устройства. Аддитивно: 6A-topology без миграции, 336 тестов не меняются.
- **Allocation:** `allocateHardware()` — генератор explicit topology: entities + Processor/Receiver-скелет + fixed assignments + `cabinetOrder` → полный `HardwareTopologyInput` → неизменный `resolveHardware()` (запускается allocator'ом до возврата proposal как executable-инвариант). First-fit по явному `processorOrder → Port.index → receiverOrder`; Cabinet атомарен (split не вводится); fixed assignments фиксированы, только append; fixed поверх capacity → immediate `HARDWARE_CAPACITY_EXCEEDED`.
- **Диагностики:** unused-slot с unit (`pixels`/`receivers`/`ports`) по уровню; Receiver без `pixelCapacity` unused-slot не даёт. Overflow → ошибка валидации.
- **Единственное изменение 6A-движка:** аддитивный инвариант в `resolveHardware` — `receiverLoad ≤ pixelCapacity` при заданном `pixelCapacity`. Addressing/spans/order, `dataIndex`/`globalRemapIndex` не меняются.
- **Приёмка:** REF-001 reconstruction с `pixelCapacity=65536`/Receiver и полное equality с `resolveHardware(referenceTopology())`, тестовая матрица capacity/overflow/partial, вся существующая регрессия (336/336), typecheck/lint/build.

## ADR-020: Phase 7A — identity-translation Mapping

- **Статус:** Accepted — спецификация и план приняты пользователем 2026-09-24; production-код пока не разрешён. Затем **реализация принята/этап закрыт на `0071eeed001ed2e275e3efb827b216a1d49da1f8`** (commit `feat(core): implement mapping phase 7a`); Gate 7A PASS, Phase 7A ACCEPTED / CLOSED 2026-09-24.
- **Контракт:** [LEDMAP-MAPPING-001](specs/LEDMAP-MAPPING-001.md). Ограниченный профиль: один InputCanvas, Screen, Grid и MappingRegion; source rect отображается 1:1 на весь Grid с origin `(0,0)` в Screen space. Mapping Region ≠ Cabinet.
- **Модель:** минимальный InputCanvas (`id + resolution`), InputCanvasId и обязательная ссылка `MappingRegion.inputCanvas`. `MappingRegion.position/size` нормативно обозначают source rect в InputCanvas; source целиком внутри canvas, Region.size и Screen.resolution равны Grid pixel size. Сериализационная миграция отложена до 7D.
- **Геометрия:** полная физическая сетка, ровно один Cabinet на cell, одинаковые Cabinet.pixelWidth/pixelHeight; Grid pixel size вычисляется по pixel geometry, не physical width/height/origin. Input, Region-local/Grid/Screen, Cabinet-local и Module-local пространства явно разделены; размеры, координаты и арифметика проверяются на safe integers.
- **API и snapshot:** `resolveMapping` принимает полную HardwareTopologyInput, внутри вызывает существующий `resolveHardware` и создаёт компактный immutable ResolvedPixelMap. Нет массива на каждый пиксель, удержания изменяемых входов или auto-allocation. `mapInputPixel` и `unmapHardwarePixel` возвращают диагностический MappedPixel; globalRemapIndex остаётся отдельным derived API 6A.
- **Граница движков:** forward выбирает Cabinet исключительно по физическим column/row и передаёт Cabinet-local coordinate в `addressPixel`; reverse использует `locatePixel`, physical cell и Region.position. Numbering/Direction/Snake не применяются повторно. Hardware addressing и существующая skeleton-validation не меняются и не рефакторятся.
- **Ошибки:** два разных CabinetId в одной physical cell → `MAPPING_DUPLICATE`; повтор CabinetId во входной topology → существующий `HARDWARE_DUPLICATE` от `resolveHardware`. Остальные ошибки и границы заданы спецификацией.
- **Приёмка будущей реализации:** identity и offset fixtures REF-001, два forward sweep по 196 608 pixels, независимый reverse traversal, оба round-trip, уникальность hardware keys, 11 anchors, ordering independence, multi-processor, bounds и snapshot immutability; сохранить существующую регрессию 425 тестов.
- **Границы:** произвольные OutputRect и Input→Output rotation/flip/scale — будущее расширение Mapping contract, не Remap 7B. Remap работает над готовым PixelMap. UI, serialization, HardwareProfile и другие подэтапы Phase 7 в 7A не входят.
- **Docs-only gate:** разрешён commit `docs: define mapping phase 7a` только из спецификации, DECISIONS и TODO. После проверки SHA и этих трёх файлов пользователь отдельно разрешает production-код; принятие контракта само по себе его не разрешает.
- **Принятие реализации:** Gate 7A закрыт PASS на `0071eeed001ed2e275e3efb827b216a1d49da1f8`. Приёмка по [LEDMAP-PHASE-7-ACCEPTANCE-001](specs/LEDMAP-PHASE-7-ACCEPTANCE-001.md): identity/offset forward sweep и reverse traversal по 196 608 pixels, оба round-trip, 196 608 уникальных hardware keys, 11 normative anchors × 2 fixtures, регрессия 425/425, общий набор 543/543, typecheck/lint/build/Electron smoke/`git diff --check` PASS. Hardware/Cabinet Engine math не изменялись; в двух REF-001 hardware-swep тестах таймаут поднят 60000→120000 ms без изменения assertions. Валидация: [отчёт 7A](mapping-engine-7a-validation.md).

## Открытые вопросы для окончательной фиксации

1. Persistence/serialization of explicit `processorOrder` remains open; runtime ordering semantics are defined by ADR-018 / Phase 6A. Scope Receiver.index и конфигурация Module/Pixel ordering вне ReferenceAddressingProfile-001 (см. спецификацию §16).
2. Точный формат `extensions` (свободный JSON vs схема).
3. HardwareProfile/vendor encoding и экспортный формат производителей (отдельный контракт).
4. Диагностики: типовой набор кодов валидации (перечень до UI-этапа).
5. Нужен ли отдельный headless CLI на базе `core` (опционально).
