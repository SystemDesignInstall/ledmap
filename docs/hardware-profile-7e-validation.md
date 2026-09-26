# Phase 7E — Hardware profile validation

Дата локальной проверки: 2026-09-26. Утверждённый контракт: [LEDMAP-HARDWARE-PROFILE-001](specs/LEDMAP-HARDWARE-PROFILE-001.md), ADR-025; docs-baseline `6fdb9aa`. Реализация готова к приёмке; пользовательская приёмка реализации ещё не выполнена.

## Реализация и public API

Новый модуль `packages/core/src/hardware-profile`, экспортированный через `packages/core/src/index.js` аддитивно.

Типы: `HardwareProfileRef`, `ProfileIdentity`, `HardwareProfileBundle`, `ProcessorProfile`, `PortProfile`, `ReceiverProfile`, `ModuleProfile`, `PixelTransportProfile`, `ActivePixelMask`, `AddressingProfile`, `TransportScanMode`, `PortAddressingMode`, `ReceiverBaseAddressMode`, `SplitLevel`, `HardwareProfileValidationCode`, `HardwareProfileValidationCheck`, `HardwareProfileValidationReport`, `CabinetPhysicalGeometry`, `TransportPixelResolution`, `TransportPixelCoordinate`.

Функции: `validateHardwareProfile(input: unknown): HardwareProfileValidationReport`, `resolveTransportPixel(bundle, x, y): TransportPixelResolution`, `unresolveTransportPixel(bundle, transportIndex): TransportPixelCoordinate | null`, константа `LEDMAP_GENERIC_REF001`.

Имя константы в контракте записано как `LEDMAP-GENERIC-REF001`; в TypeScript идентификатор с дефисом невозможен, поэтому экспортируется `LEDMAP_GENERIC_REF001`. Это единственное расхождение формы имени с §9 контракта, семантика не менялась.

`LEDMAP_GENERIC_REF001` — глубоко замороженный reference bundle: 1 Processor, 1 Port, 1 Receiver, 1 ModuleProfile 32×32 px / 4×4 модуля, AddressingProfile 23 бит, `transportPixelCountPerCabinet` 16 384, `maxTransportPixels` 65 536 на Receiver и 131 072 на Port, `maxCabinets` 4, `maxReceivers` 2, `maxPorts` 4.

## Validation

`validateHardwareProfile` — чистая функция: не мутирует и не замораживает вход, не использует глобальное состояние, кэш или WeakMap. Возвращает глубоко замороженный `{ valid, checks }`; `checks` пуст при `valid: true`. Диагностика содержит только `code`, `path`, `message`.

Закрытый набор кодов: `PROFILE_SHAPE_INVALID`, `PROFILE_FIELD_MISSING`, `PROFILE_FIELD_INVALID`, `PROFILE_VERSION_INVALID`, `PROFILE_REFERENCE_UNKNOWN`, `PROFILE_DUPLICATE_ID`, `PROFILE_CAPACITY_INVALID`, `PROFILE_SPLIT_LEVEL_UNSUPPORTED`, `PROFILE_MASK_INVALID`, `PROFILE_TRANSPORT_INCONSISTENT`.

Детерминированный порядок фаз: closed fields и shape → bundle scalars → `pixelTransportProfile` → `processorProfiles` → `portProfiles` → `receiverProfiles` → `moduleProfiles` → `addressingProfile` → duplicate ids → referential integrity → derived geometry → declared capacity → transport invariants → versions. Numeric domains проверяются в структурной фазе, поэтому `PROFILE_CAPACITY_INVALID` для значения лимита может предшествовать `PROFILE_REFERENCE_UNKNOWN`.

Зависимости и skip: structurally invalid prerequisite не порождает каскад dependent-диагностик. Нечитаемая коллекция подавляет только dependent reference checks; нечитаемое поле подавляет только dependent check этого поля. Независимые диагностики собираются в один отчёт. Все входы кроме record-object дают `PROFILE_SHAPE_INVALID` с пустым path и не приводят к исключению.

Unknown fields: `Object.keys` сравнивается с закрытым набором, сортировка ключей по UTF-16 → byte-identical отчёт для двух равных, но независимо построенных bundle. `splitLevel: 'CABINET'` — единственное допустимое значение, остальные известные значения дают `PROFILE_SPLIT_LEVEL_UNSUPPORTED` и исключаются из unknown-field проверки.

Identity: bundle, Processor, Port, Receiver, ModuleProfile и AddressingProfile несут `ProfileIdentity`; `PixelTransportProfile` — встроенная конфигурация bundle без собственной identity, `identity` там является unknown field. Версии — `MAJOR.MINOR.PATCH` без ведущих нулей, проверяются последней фазой для всех шести носителей. Duplicate id проверяется внутри каждой коллекции и против bundle id — для `processorProfiles`, `portProfiles`, `receiverProfiles`, `moduleProfiles` и для единственного `addressingProfile`; один и тот же id в разных коллекциях допустим, ссылки разрешаются строго внутри своей коллекции.

Numeric domains: positive safe integers для `physicalWidth`, `physicalHeight`, `moduleCountX`, `moduleCountY`, `addressWidthBits`, `transportPixelCountPerCabinet`, `activePixelMask.width`, `activePixelMask.height` и derived `physicalCabinetWidth`/`physicalCabinetHeight`; optional declared limits `maxTransportPixels`, `maxReceivers`, `maxCabinets` — non-negative safe integers, где `0` — валидное конечное значение, отличное от отсутствия поля; `ProcessorProfile.maxPorts` обязателен и при отсутствии даёт `PROFILE_FIELD_MISSING`; derived geometry вне safe-integer диапазона даёт `PROFILE_TRANSPORT_INCONSISTENT`. Пустой transport set запрещён: `activePixels: []` даёт `PROFILE_TRANSPORT_INCONSISTENT`. `activePixels` должны быть в границах маски, уникальны и строго возрастают.

Derived geometry вычисляется из ModuleProfile, на который ссылается `moduleProfileId`; порядок `moduleProfiles` не влияет на результат, несколько ModuleProfile с одним id невозможны. Производные значения не хранятся в профиле.

## Transport indexing

`resolveTransportPixel` / `unresolveTransportPixel` — stateless bijection между координатой кабинета и индексом транспорта кабинета. Без маски: `ROW_MAJOR` — `y * width + x`, `COLUMN_MAJOR` — `x * height + y`. С маской: индексы компактные и назначаются только активным пикселям в порядке `ROW_MAJOR` или `COLUMN_MAJOR` по возрастанию membership. Координата вне геометрии кабинета или неактивная даёт `{ active: false, transportIndex: null }`; индекс вне диапазона даёт `null`; нецелые аргументы — `TypeError`. Результаты глубоко заморожены, входной bundle не замораживается. Топология, порядок кабинетов, receiver и port в вычислениях не участвуют.

## REF-001

Полный sweep 196 608 px: для каждого из 12 кабинетов и каждой координаты 128×128 проверены активность, уникальность и полнота 7E transport-индексов (`0…16 383` на кабинет), round-trip `unresolveTransportPixel`, а также независимая полнота 6B `dataIndex` и round-trip `locatePixel`/`globalRemapIndex`. Обе нумерации являются биекциями на один и тот же диапазон, но их перестановки различаются для всех 12 кабинетов — 7E не подменяет и не переопределяет 6B addressing. `resolveHardware` с профилем и без него даёт идентичный результат; `pixelCount` 196 608.

Дополнительно проверено: 7E не выводит cabinet count, receiver order и port order; `Receiver.pixelCapacity` из 6B не связан с `maxTransportPixels` профиля, а объявление `pixelCapacity` не меняет разрешение 6B; заданный в REF-001 `splitLevel` — `CABINET`.

## Локальные проверки

Команды npm выполнены через `npm.cmd` и `npx.cmd` из-за политики PowerShell для `npm.ps1`/`npx.ps1`. Core unit-тесты выполняются против этого worktree через alias `@ledmap/core` в `vitest.config.ts`; `packages/app/out` собран локально (`electron-vite build`) перед smoke, каталог игнорируется git.

| Проверка | Результат |
|---|---|
| `npm run test:core` | PASS, 50 test files, 1202/1202; прежние 1051 сохранены без правок, добавлено 151 |
| `npm run typecheck -w @ledmap/core` | PASS |
| `npm run build -w @ledmap/core` | PASS |
| `npx eslint packages/core` | PASS |
| `npx eslint .` | PASS |
| `npm test` | PASS, 52 test files, 1238/1238; прежние 1087 сохранены без правок |
| `npm run test:smoke` | PASS, существующий Electron smoke без изменений |
| `git diff --check` | PASS |

Сборка app сообщает существующее предупреждение `preload config is missing`; Electron smoke проходит. Все результаты локальные, подтверждение CI не заявляется.

Новые тесты: identity (35), validation (24), numeric (22), capacity (15), geometry (7), transport (11), mask (11), reference-001 (4), boundaries (22) — 151 тест. Покрыты identity и ссылочная целостность, включая collision `AddressingProfile.identity.id` с `identity.id` bundle и агрегирование всех collision в одном отчёте, все коды и их порядок, dependency skip, numeric boundaries и optional limits, derived geometry и перестановка ModuleProfile, masked и unmasked `ROW_MAJOR`/`COLUMN_MAJOR` bijection, sweeps 16 384 и 196 608, детерминизм и deep freeze, prototype-pollution и non-object входы.

## Corrective после remote review

`1fe2516` — collision `AddressingProfile.identity.id` = `HardwareProfileBundle.identity.id` больше не проходит: §6.3 требует, чтобы каждый id внутри bundle отличался от `identity.id` bundle, а первая проверка это требование выполняла только для четырёх массивов constituent profiles. Добавлена `PROFILE_DUPLICATE_ID` с path `["addressingProfile", "identity", "id"]` в фазе duplicate ids, сразу после массивов и до referential integrity. Public API и остальные semantics не изменены.

`§6.2` спецификации приведён к принятой production трактовке: `ProcessorProfile.maxPorts` обязателен, опциональны только `PortProfile.maxTransportPixels?`, `PortProfile.maxReceivers?`, `ReceiverProfile.maxTransportPixels?`, `ReceiverProfile.maxCabinets?`.

## Границы diff

Production: новый `packages/core/src/hardware-profile/{types,geometry,transport,validation,reference,index}.ts` и одна аддитивная строка export в `packages/core/src/index.ts`.

Тесты: новый `packages/core/test/hardware-profile/` (fixtures + 9 test-файлов). Существующие 6A–7D тесты, `hardware-engine`, `mapping-engine`, `remap-engine`, `validation`, `serialization`, `packages/app/**`, `.ledmap` schema, `Receiver.pixelCapacity`, `resolveHardware()` и `validateProject()` не изменены. Новых runtime-зависимостей нет; core остаётся чистым и детерминированным.

Address Encoder, Final Remap/ReverseIndex, persistence профиля в `.ledmap` и интеграция 7C/6B не входят в эту фазу.
