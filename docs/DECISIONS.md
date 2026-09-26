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
- **Amended by ADR-023:** историческое положение о нормализации алиасов на serialization layer заменено: `.ledmap` schema v1 принимает только canonical tokens, aliases отклоняются без silent normalization. `ADR-011 alias-normalization clause — superseded by ADR-023`. Остальные положения ADR-011 сохраняются.

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

## ADR-021: Separate Phase 7B logical Remap from final hardware remap

- **Статус:** Accepted — docs-gate Phase 7B принят на `52395cb9bc2c7d1ae358e838c80a7136ef535dcd`; production принят пользователем на `2b589ac326ab6bc066d0a55cd295bae05e9fc380` (`feat(core): implement remap phase 7b`). **Phase 7B ACCEPTED / CLOSED**.
- **Приёмка реализации:** 625/625 тестов (543 baseline + 82 новых), typecheck/lint/build/Electron smoke/`git diff --check` — локальный PASS; CI-подтверждение не заявляется. Отчёт: [remap-engine-7b-validation.md](remap-engine-7b-validation.md).
- **Контракт:** `docs/specs/LEDMAP-REMAP-001.md`.
- **Связанные решения:** ADR-018, ADR-019, ADR-020.
- **Production baseline Phase 7A:** `0071eeed001ed2e275e3efb827b216a1d49da1f8`.
- **Docs baseline перед 7B:** `08c0c387c9dbbaae91c5fa26cd676d914eba4c3f`.

### Контекст

В ранних архитектурных документах термин `Remap Engine` использовался для финального преобразования:

```text
Input Pixel
→ Mapping
→ Cabinet
→ Module
→ Receiver
→ Port
→ Processor
→ Final Address
```

Позднее архитектура LedMAP разделилась на несколько независимых уровней:

```text
Mapping
Hardware Topology
Hardware Profile
Address Encoding
Final Hardware Address
```

Phase 7A уже зафиксировала и реализовала Mapping как отдельный слой:

```text
InputCanvas
→ MappingRegion
→ Screen/Grid
→ Cabinet
→ PixelAddress
```

При этом `LEDMAP-MAPPING-001` определяет Phase 7B как постобработку уже разрешённого PixelMap и прямо исключает из 7B:

```text
OutputRect
Input→Output rotation
flip
scale/resampling
hardware allocation
vendor addressing
```

Одновременно `LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001` резервирует аппаратно-зависимые:

```text
HardwareProfile
AddressEncoder
HardwareAddress
EncodedHardwareAddress
ReverseIndex
```

для более позднего hardware-final слоя.

Использование одного названия `Final Remap` для обоих уровней создаёт неоднозначность ответственности.

### Решение

LedMAP разделяет два разных понятия.

#### 1. Phase 7B — Logical Remap

Нормативный документ:

```text
LEDMAP-REMAP-001
```

Phase 7B работает **поверх результата Mapping 7A**:

```text
ResolvedPixelMap
        ↓
Logical Remap Pipeline
        ↓
RemappedPixelMap
```

Phase 7B:

```text
≠ Mapping Transform
≠ Hardware Allocation
≠ Hardware Profile
≠ Address Encoder
≠ Vendor Addressing
≠ Final Hardware Remap
```

Project Model и исходный `ResolvedPixelMap` не мутируются.

Для пустого набора правил обязателен semantic identity invariant:

```text
remap = resolveRemap({ mapping, rules: [] })

mapRemappedInputPixel(remap, P)
==
mapInputPixel(mapping, P)
```

и

```text
unmapRemappedHardwarePixel(remap, K)
==
unmapHardwarePixel(mapping, K)
```

для каждого допустимого `P` и занятого `K`.

Форма `Remap(mapping, []) == mapping` допустима только как семантический shorthand и **не означает literal object equality** между `ResolvedPixelMap` и `RemappedPixelMap` (см. `LEDMAP-REMAP-001` §5, §22).

Phase 7B v1 вводит deterministic immutable remap infrastructure, но не вводит production rule types без отдельного утверждённого контракта.

#### 2. Final Hardware Remap

Имя:

```text
LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001
```

резервируется для более позднего hardware-final этапа после:

```text
Hardware Profile
        ↓
AddressEncoder
        ↓
Canonical HardwareAddress
```

Этот слой должен окончательно замкнуть:

```text
InputPixel
        ↔
HardwareAddress
```

и определить:

```text
FinalRemap
ReverseIndex
Forward hardware lookup
Reverse hardware lookup
cache/rebuild policy
hardware-address invalidation
vendor-independent canonical addressing
```

### Нормативная последовательность

```text
Phase 7A — Mapping
        ↓
ResolvedPixelMap
        ↓
Phase 7B — LEDMAP-REMAP-001
Logical Remap
        ↓
Phase 7C — Project Validation
        ↓
Phase 7D — Serialization
        ↓
Hardware Profiles
        ↓
Address Encoder
        ↓
LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001
        ↓
Final Hardware Remap / ReverseIndex
```

### Последствия

Положительные:

```text
Mapping не смешивается с post-processing.
Logical Remap не знает vendor hardware protocol.
AddressEncoder не просачивается в Phase 7B.
Final HardwareAddress остаётся аппаратно-зависимым слоем.
ReverseIndex получает однозначную ответственность.
Название Final Remap больше не используется для двух разных subsystem.
```

Ограничения:

```text
Phase 7B v1 не предоставляет пользовательские remap operations.
Dead-LED, swap, mask, mirroring и иные rule types требуют отдельных решений.
OutputRect/rotation/flip/scale остаются расширением Mapping contract.
HardwareAddress нельзя считать завершённым до Hardware Profile + AddressEncoder.
```

### Invariant

Главная граница:

```text
Mapping answers:
"Какой physical/hardware-topology pixel соответствует Input Pixel?"

Logical Remap answers:
"Как постобработать уже разрешённый mapping?"

Final Hardware Remap answers:
"Какой окончательный HardwareAddress соответствует pixel и как выполнить обратный lookup?"
```

Эти три ответственности не должны объединяться в одном Engine или контракте.

## ADR-022: Phase 7C Project Validation

- **Статус:** Accepted — docs-gate 7C принят на `a795717a877130b3667420e89790186b876e0e35`; production принят пользователем на `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9` (`feat(core): implement project validation phase 7c`). **Phase 7C ACCEPTED / CLOSED**.
- **Приёмка реализации:** 827/827 = 625 baseline + 202 новых теста; typecheck/lint/build/Electron smoke/`git diff --check` — локальный PASS, без CI-подтверждения. Отчёт: [project-validation-7c-validation.md](project-validation-7c-validation.md). Следующий этап — отдельный контракт 7D Serialization; production 7D не разрешён.
- **Контракт:** [LEDMAP-PROJECT-VALIDATION-001](specs/LEDMAP-PROJECT-VALIDATION-001.md), версия 1.0; upstream — ADR-020/021, закрытые 7A/7B. Regression baseline: 625 тестов.
- **Вход:** `ValidateProjectInput` содержит исходный `ResolveMappingInput` и обязательный массив `rules`. Scope — один InputCanvas/Screen/Grid/Region с полной explicit topology; новая сущность `Project` не вводится.
- **Pipeline:** shape check → `resolveMapping()` → `resolveRemap()`. Hardware проверяется внутри 7A; отдельный `resolveHardware()`, allocation и повторная реализация capacity/addressing/ordering не нужны.
- **Отчёт:** immutable `ProjectValidationReport` с фактически обнаруженными diagnostics и тремя checks: `input`, `mapping`, `remap`; состояния `passed/failed/blocked`, для blocked указан `blockedBy`. `valid` означает структурную корректность и работоспособность текущего профиля 7A/7B, а не сертификат всех инвариантов будущего проекта, монтажа или export.
- **Полнота:** shape check собирает независимые структурные ошибки; semantic stages останавливаются на первой ошибке движка, зависимые stages блокируются. Нет warning/info и обещания собрать все semantic defects.
- **Диагностики:** собственный `PROJECT_INVALID_INPUT` для shape errors; upstream `DomainError.code/message` сохраняются буквально. Message не парсится для получения entity path; unexpected exceptions повторно выбрасываются. Input не мутируется; report, checks, diagnostics и paths глубоко immutable.
- **Граница 7D:** canonical project schema, parsing, JSON/`.ledmap`, миграции и serialization остаются отдельным этапом. Production 7C не меняет математику Cabinet/Hardware/Mapping/Remap, UI или принятые scope 7A/7B.

## ADR-023: Phase 7D Serialization

- **Статус:** Accepted — production 7D принят пользователем на `410ba7fcc830968b615058fe33b6bbea12fb2272` после независимого production review; docs-only closure выполнен. Contract docs-gate — `2a3e08e8379191f3f2e73286361bf04ca6f05f7b`.
- **Контракт:** [LEDMAP-SERIALIZATION-001](specs/LEDMAP-SERIALIZATION-001.md), версия 1.0. Baseline — закрытая 7C, closure `33fef12908869ce7ac87d1b723aff2bee91f731b`; 827 тестов — существующий локальный regression baseline, без CI-подтверждения. Этот gate не заявляет результатов будущей реализации 7D.
- **Wire schema v1:** closed `.ledmap` envelope `format: 'ledmap'`, `schemaVersion: 1`, `project`, `extensions`. Persisted DTO заданы явно, IDs/references — обычные строки; вложенные records и enum literals не зависят от изменяемых runtime domain interfaces. Runtime ↔ StoredV1 — явные materialization/reconstruction boundaries. Scope — один InputCanvas/Screen/Grid/Region с полной explicit topology, включая несколько Processor; универсальная domain Project model не вводится.
- **Source vs derived:** сохраняются исходные entities, geometry, capacities, references и explicit assignments/orders. `processorOrder`, `receiverOrder` и `Receiver.cabinets` — persisted source-of-truth; порядок всех arrays сохраняется без сортировки. Resolved maps, pixel addresses/indices, spans, lookup tables, allocation/validation diagnostics и UI state не сериализуются. Module.localX/localY реконструируются из column × width / row × height; save сначала проверяет исходные runtime coordinates через 7C и не «лечит» их удалением.
- **Extensions:** единственный обязательный root JSON object; opaque JSON metadata сохраняются по значению и не передаются в 7C. Вне extensions schema закрыта. Extensions не являются обходом запрета на сохранение core derived data или способом включить новые engine semantics.
- **Strict tokens / amendment ADR-011:** `ADR-011 alias-normalization clause — superseded by ADR-023`. Parser v1 принимает только canonical tokens §4–5 спецификации; `Row`, `LTR`, `ON` и другие aliases отклоняются как `SERIALIZATION_INVALID_SCHEMA`, без silent normalization. Положения ADR-011 о canonical core tokens и presentation labels в app сохраняются.
- **Parse ≠ load:** `parseProject()` проверяет syntax, schema и version и может вернуть schema-valid документ с semantic defects. `loadProject()` реконструирует runtime input и вызывает 7C; `serializeProject()` проверяет wire boundary и исходный runtime input через 7C до materialization. Успешные load/save требуют `validateProject().valid`; invalid drafts/recovery остаются отдельным контрактом. Более строгая JSON boundary не расширяет смысл 7C validity, semantic validation движков не дублируется.
- **Canonical JSON:** schema field order фиксирован, два пробела, LF и один final LF; arrays не сортируются, keys extensions рекурсивно сортируются по UTF-16 code units, включая numeric-looking keys. Duplicate decoded JSON keys отклоняются. При schema validation сначала проверяются известные поля в schema order, затем unknown own string keys в UTF-16 lexical order. Round-trip сохраняет source values/orders с только нормативной normalization; повторный save даёт стабильный текст.
- **Core / app:** parse/load/serialize и migration dispatch — pure core без I/O; fs, UTF-8 file bytes, пути, диалоги, atomic write и UI Open/Save остаются app и не реализуются этим этапом. Caller input не мутируется; результаты глубоко immutable, derived snapshots не сохраняются.
- **Versioning:** только v1 identity path и explicit unsupported-version error; legacy v0, Alpha-файлы, implicit defaults и фиктивные migrations не поддерживаются. Будущие pure migrations требуют отдельного source/target schema contract и fixtures. Конкретные Remap rules, hardware-final addressing и serialization UI не входят в 7D.
- **Docs-only gate:** commit `docs: accept phase 7d serialization contract` ограничен спецификацией, DECISIONS и TODO. Production остаётся незавершённым; после проверки SHA требуется отдельное разрешение пользователя. Это описание относится к состоянию на docs-gate.
- **Реализация 7D:** pure core `packages/core/src/serialization/` — strict JSON reader, version dispatch, closed schema walk, reconstruction и canonical writer согласно этому ADR; file I/O и UI Open/Save не входят. Ровно один production-коммит `410ba7f` (21 core source/test файл) поверх immediate parent `49d17d7` — closure Project Canvas; принятый semantic/docs baseline остаётся `2a3e08e`. Фактический regression baseline реализации — 836 тестов: 827 docs-gate floor закрытой 7C плюс 9 app-тестов легализованной Project Canvas итерации (`0c72dff`/`ab71ca2`/`49d17d7`), закрытой между docs-gate 7D и production-коммитом. Итог: 1087/1087 (836 baseline + 251 новых), принят как reported local PASS без CI-подтверждения; implementation record — `48b82016703374542403b246fe9f7628bf310eaa`. Отчёт: [serialization-7d-validation.md](serialization-7d-validation.md). Принятые контракты 6A/6B/7A/7B/7C, amendment ADR-011 и нормативный текст спецификации этим production-коммитом и docs-only closure не изменены.

## ADR-024: Early Alpha UI — Project Canvas

- **Статус:** Accepted — ретроактивная легализация одобрена пользователем 2026-09-25. Реализация существовала в working tree до формального gate; этим решением она оформляется контрактом [LEDMAP-ALPHA-UI-002](specs/LEDMAP-ALPHA-UI-002.md) и принимается отдельными documentation (`0c72dff`) и production (`ab71ca2`) коммитами.
- **Основание:** ADR-017 разрешил узкое исключение Early Alpha UI (один Screen/Grid). Практике компоновки LED-проектов нужен мультискринный layout до Phase 8; расширение оформляется как вторая итерация Alpha, а не как начало полного UI.
- **Решение:** Early Alpha UI расширяется до Project Canvas: несколько Screen на общем 2D canvas, camera (pan/zoom/fit), selection (Screen/Grid/Cabinet), project tree, properties panel, drag-перемещение Screen, добавление Screen. Позиция Screen на canvas — презентационное состояние app, не доменное свойство и не часть будущей сериализации v1 (7D не изменяется).
- **Границы:** production-код только в `packages/app`; `packages/core`, public API, математика и reference-тесты не меняются. Open/Save, привилегированный IPC/preload, сериализация, UI Hardware/Mapping/Remap/Validation, экспорт и packaging остаются Phase 8+. Форма создания Screen с редактором geometry/ordering временно заменена на «+ Screen» с настройками по умолчанию; ordering остаётся readonly, редактор возвращается в Phase 8. Диагностический hook `window.__ledmap` — read-only проекция состояния renderer для smoke-тестов, не API продукта.
- **Инварианты:** перемещение/добавление Screen не меняет cabinet IDs, логический порядок и геометрию; REF-001 sweep сохраняется на Screen 1; лимиты preview ALPHA-UI-001 действуют на каждый Screen.
- **Приёмка:** таблица [LEDMAP-ALPHA-UI-002 §6](specs/LEDMAP-ALPHA-UI-002.md): unit-тесты project-состояния, обновлённый Electron smoke в реальном окне, `npm test`/`typecheck`/`lint`/`build` — локальный PASS, без CI-подтверждения.

## ADR-025: Phase 7E Hardware Profile v1

- **Статус:** Accepted — documentation only; план/docs-gate 7E принят, corrective narrowing umbrella-спецификации выполнен. Production 7E ожидает отдельного разрешения после проверки SHA docs-only acceptance-коммита. Baseline — `6bf98b437c3f0c1371e1636a578dce917168c76e` (Phase 7 CLOSED); regression baseline 1087 тестов, локальные результаты без CI-подтверждения.
- **Основание:** umbrella [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](specs/LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md) 1.0 Draft одновременно описывает Hardware Profiles, transport domain, AddressEncoder, HardwareAddress и Final Remap. После закрытых 6A–7D широкий контракт противоречил бы уже принятым runtime boundaries, поэтому он переводится в роль architecture umbrella с явной staged-разметкой, а исполняемым production contract становится узкий [LEDMAP-HARDWARE-PROFILE-001](specs/LEDMAP-HARDWARE-PROFILE-001.md) версии 1.0.
- **Staged sequence:** `Phase 7 CLOSED → 7E Hardware Profile v1 → Address Encoder (отдельный gate) → LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001 / Final Remap + ReverseIndex`. UI и Open/Save остаются Phase 8: интерфейс не строится поверх незавершённой аппаратной адресации.
- **Scope 7E (foundation layer):** immutable `HardwareProfileBundle` и constituent `ProcessorProfile` / `PortProfile` / `ReceiverProfile` / `ModuleProfile` / `PixelTransportProfile` / `AddressingProfile`; стабильные `id`/`version` и `HardwareProfileRef`; разделение logical / physical / transport доменов; детерминированный forward/inverse transport lookup; capacity и constraint semantics; vendor-neutral `LEDMAP-GENERIC-REF001`; валидация profile contract. `AddressingProfile` в 7E — только data/config, без encoder и без вычисления адресов.
- **Идентификация и ссылочная целостность 7E:** каждый constituent profile, включая `AddressingProfile`, несёт `identity: ProfileIdentity`; bundle содержит ровно один `AddressingProfile`, поэтому `ProcessorProfile.addressingProfileId` MUST совпадать с `bundle.addressingProfile.identity.id`. Lookup по `id` — единственный разрешающий механизм; отсутствующая ссылка — ошибка, а не fallback.
- **Выбор геометрии transport:** `PixelTransportProfile.moduleProfileId` MUST разрешаться ровно в один `ModuleProfile`, из которого выводятся `physicalCabinetWidth = physicalWidth × moduleCountX` и `physicalCabinetHeight = physicalHeight × moduleCountY` (positive safe integers, вычисляются и не хранятся). Несколько `ModuleProfile` в bundle допустимы, но transport lookup детерминирован одной ссылкой. Производная геометрия профиля не подменяет геометрию 6A/7A.
- **Mask и scanMode — независимые измерения:** `activePixelMask` задаёт membership (какие physical пиксели участвуют в transport stream) и хранится каноническим набором unique strictly increasing row-major physical linear indices; `scanMode` задаёт transport ordering (`ROW_MAJOR` — `y * width + x`, `COLUMN_MAJOR` — `x * height + y`), а `transportIndex` = ordinal активного пикселя в упорядоченном по `scanMode` active set. Наличие mask не отменяет `scanMode`: masked fixture обязана давать разные корректные bijektivные mappings в обоих режимах. Reverse lookup проходит тот же упорядоченный набор.
- **Граница Serialization 7D:** `.ledmap` v1 не содержит `profileId`/`profileVersion`; профиль передаётся отдельным runtime input и в 7E не сериализуется. `extensions` не являются обходом и не читаются как profile identity. Первое изменение persistence профиля — отдельное versioning/serialization решение; правки 7D в 7E запрещены.
- **Граница Validation 7C:** pipeline `input → mapping → remap` и errors-only report сохраняются. Валидация профиля — отдельная `validateHardwareProfile`, не вызываемая из `validateProject`; `WARNING`/`INFO` не вводятся ни в одном report. Сознательное отличие: profile contract не входит в project pipeline, профиль — небольшой ограниченный документ, поэтому нарушения собираются полностью в фиксированном порядке, а не по 7C-логике first-failure.
- **Dependency / skip semantics 7E:** structural checks собирают все независимо проверяемые нарушения; зависимая referential/consistency проверка выполняется только когда все prerequisites структурно присутствуют и type-valid, иначе она пропускается без каскадных синтетических диагностик. Это гарантирует, что корректные реализации дают байт-в-байт одинаковый report, и не позволяет каскаду ошибок маскировать первопричину.
- **Numeric domains и zero semantics 7E:** `physicalWidth`, `physicalHeight`, `moduleCountX`, `moduleCountY`, `addressWidthBits`, derived `physicalCabinetWidth/Height` — positive safe integers; `transportPixelCountPerCabinet` — positive safe integer; `activePixelMask.width/height` — positive safe integers и MUST совпадать с derived geometry; `activePixels[]` — non-negative safe integers в `[0, width * height)`, unique, strictly increasing; `maxPorts`, `maxTransportPixels?`, `maxReceivers?`, `maxCabinets?` — non-negative safe integers, где `0` — валидный объявленный конечный предел и не эквивалентен отсутствию. Домены проверяются на исходных полях, поэтому отрицательные множители не могут дать положительное derived-произведение. **Empty transport set в v1 не поддерживается:** `transportPixelCountPerCabinet ≥ 1`, а mask MUST содержать хотя бы один active pixel.
- **Граница Hardware 6B:** `Receiver.pixelCapacity` и принятая topology/capacity математика остаются источником истины для project-уровня. Профильная ёмкость — отдельная величина `maxTransportPixels` в transport pixels; подстановка её в существующий `resolveHardware()` запрещена и требует отдельного integration contract.
- **Ownership геометрии:** `HardwareProfile` v1 объявляет только physical geometry, используемую transport lookup. Logical geometry остаётся project-side source-of-truth в 6A/7A и не дублируется в профиле; 7E не утверждает равенство logical и physical доменов.
- **Assignment unit:** в 7E assignment unit — целый Cabinet. `SplitLevel` — закрытый enum с единственным членом `CABINET`; `MODULE`/`PIXEL_BLOCK` и Cabinet → несколько Receiver отклоняются явно, без скрытого дробления. Профиль MAY описывать transport capability, но не менять atomicity 6A.
- **Undeclared constraints (absence ≠ unlimited):** опциональное ограничение в 7E имеет ровно два состояния — объявленный конечный предел и отсутствие объявления. Отсутствие означает, что constraint не объявлен этим профилем и потому не enforced на этом измерении в 7E; оно MUST NOT интерпретироваться как утверждение о неограниченной ёмкости физического оборудования и в модели, отчётах и UI не называется unlimited. Операционный смысл — «no enforced bound»: upper-bound ошибка не выдаётся. `0` — валидный объявленный конечный предел и не эквивалентен отсутствию поля. Согласовано с 6B: отсутствие `Receiver.pixelCapacity` означает отсутствие заданного LedMAP limit для allocator, а не бесконечность устройства. Explicit-unbounded и unknown-constraint/profile-confidence (umbrella §49–§50) в 7E не моделируются и остаются более поздними gate'ами; bundle без объявленных транспортных пределов валиден.
- **Public boundary v1 (имена утверждаются этим gate, не authorization на production API):** `HardwareProfileRef`, `ProfileIdentity`, `HardwareProfileBundle`, `ProcessorProfile`, `PortProfile`, `ReceiverProfile`, `ModuleProfile`, `PixelTransportProfile`, `AddressingProfile`, `validateHardwareProfile`, `resolveTransportPixel`, `unresolveTransportPixel`. Экспорт из `@ledmap/core`, строго additive.
- **Принципы:** pure core, только immutable данные и детерминированные функции; глубоко frozen результаты; вход не мутируется и не замораживается; никаких исключений для ошибочных данных; никаких `WARNING`/`INFO`, file I/O, UI, catalog и загрузки профилей.
- **Приёмка:** [LEDMAP-HARDWARE-PROFILE-001 §12](specs/LEDMAP-HARDWARE-PROFILE-001.md) — shape/identity, validation codes и порядок, declared limits и undeclared constraints, transport forward/inverse bijektivность, active mask, `LEDMAP-GENERIC-REF001` sweeps 196608 px, narrowing `SplitLevel`, границы с 7C/7D/6B, regression 1087 и quality gates (`test:core`, `typecheck`/`build -w @ledmap/core`, `eslint packages/core`, `npm test`, `npm run test:smoke`, `git diff --check`) — локальный PASS, без CI-подтверждения.
- **Docs-only gate:** коммит ограничен `LEDMAP-HARDWARE-PROFILE-001.md`, staged-annotation umbrella-спецификации, этим ADR и `TODO.md`. Production, тесты, app и изменения принятых контрактов в коммит не входят.

## Открытые вопросы для окончательной фиксации

1. **Persistence закрыт ADR-023:** explicit `processorOrder`, `receiverOrder` и `Receiver.cabinets` сохраняются в schema v1 без сортировки; runtime ordering semantics ADR-018 / Phase 6A не меняются. Остаются открытыми Scope Receiver.index и конфигурация Module/Pixel ordering вне ReferenceAddressingProfile-001 (см. спецификацию §16).
2. **Формат extensions закрыт ADR-023:** единственный root JSON object с opaque JSON metadata; schema остальных records закрыта, canonical key order и round-trip определены в LEDMAP-SERIALIZATION-001.
3. HardwareProfile/vendor encoding и экспортный формат производителей: профили и ёмкости закрыты ADR-025 (7E); AddressEncoder, vendor encoding и экспорт остаются отдельными contracts.
4. Диагностики: типовой набор кодов валидации (перечень до UI-этапа); profile codes отделены от 7C.
5. Нужен ли отдельный headless CLI на базе `core` (опционально).
