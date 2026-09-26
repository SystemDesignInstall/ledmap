# LEDMAP-HARDWARE-PROFILE-001 — Phase 7E Hardware Profile v1

**Версия:** 1.0

**Статус:** Accepted — documentation only; production 7E ожидает отдельного разрешения после проверки SHA docs-only acceptance-коммита.

**Baseline:** `6bf98b437c3f0c1371e1636a578dce917168c76e` — Phase 7 CLOSED (7A/7B/7C/7D + headless integration gate).

**Upstream:** Architecture umbrella [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md) (1.0 Draft, staged); принятые контракты 6A/6B/7A/7B/7C/7D и ADR-018, ADR-020, ADR-021, ADR-022, ADR-023.

**Regression baseline:** 1087 тестов (43 test-файла; `npm run test:core` — 41 файл / 1051 тест). Принятые результаты локальные, без CI-подтверждения.

---

# 1. Назначение

Phase 7E вводит **foundation layer** hardware-профилей: immutable описание transport возможностей оборудования, детерминированный forward/inverse transport lookup и валидацию самого profile contract.

```text
Phase 7 CLOSED
      ↓
7E Hardware Profile v1        ← этот документ
      ↓
Address Encoder               ← отдельный следующий gate
      ↓
Final Remap / ReverseIndex    ← отдельный contract и gate
```

Профиль — единственный источник hardware-специфичных знаний о **транспорте пикселей и ёмкости**. Engines не получают vendor-логику и не изменяются.

# 2. Границы increment

Входит в 7E:

- `HardwareProfileBundle` и constituent profiles как immutable данные.
- Стабильная идентификация `id` / `version` и `HardwareProfileRef`.
- Разделение logical / physical / transport доменов.
- `PixelTransportProfile` и детерминированный forward/inverse transport lookup.
- Profile capacity и constraint semantics, включая явную трактовку «ограничение отсутствует» и «ограничение неприменимо».
- Валидация profile contract (`validateHardwareProfile`).
- Vendor-neutral reference profile `LEDMAP-GENERIC-REF001`.

Не входит в 7E (явно, с причинами):

| Исключено | Причина |
|---|---|
| `AddressEncoder`, `HardwareAddress`, vendor encoding, base/port address computation | отдельный следующий gate; в 7E `AddressingProfile` — только data/config |
| Final Remap, ReverseIndex, addressing rules | отдельный contract `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` |
| `SplitLevel` ниже `CABINET`, Cabinet → несколько Receiver | assignment unit v1 — Cabinet; более мелкий split = отдельный contract |
| Изменения `.ledmap` schema v1, persistence `profileId`/`profileVersion` | 7D закрыт; persistence профиля — отдельное versioning/serialization решение |
| Интеграция профиля в `validateProject` (7C) и в `resolveHardware()` (6B) | принятые runtime boundaries не меняются; нужен отдельный integration contract |
| Severity `WARNING` / `INFO`, агрегация semantic checks | 7C ввела errors-only; расширение — отдельное решение |
| File I/O, загрузка профилей с диска, UI, vendor catalog | Phase 8+; 7E — pure core |
| Изменения 6A/6B/7A/7B/7C/7D математики и public API | 7E строго additive |

# 3. Обязательные ограничения на границы

## 3.1 Serialization 7D не меняется

`.ledmap` schema v1 **не содержит** `profileId` / `profileVersion`. Профиль передаётся **отдельным runtime input** и в 7E не сериализуется.

- `extensions` **не могут** использоваться как обход: profile identity в extensions не является core semantics и не читается ни одним loader.
- Первое изменение persistence профиля — отдельное решение: schema v2 с явной версией, либо внешняя ссылка на зарегистрированный профиль. Это не часть 7E.
- Существующие 7D тесты (closed schema, canonical writer, round-trip) должны остаться зелёными без изменений.

## 3.2 Validation 7C не расширяется

- 7C остаётся pipeline `input → mapping → remap` с errors-only report.
- Валидация профиля — отдельная функция `validateHardwareProfile(bundle)`, не вызываемая из `validateProject` и не влияющая на его report.
- 7E не вводит `WARNING` / `INFO` ни в одном report.
- Signature и поведение `validateProject` в 7E не меняются; отсутствие профиля не является для 7C ошибкой.

## 3.3 Hardware 6B не переопределяется

- `Receiver.pixelCapacity` и текущая topology/capacity математика 6B остаются источником истины для **project**-уровня.
- Transport capacity из профиля — **отдельная величина** в отдельном поле; она не является синонимом и не переопределяет `Receiver.pixelCapacity`.
- Подстановка transport capacity внутрь существующего `resolveHardware()` запрещена: это отдельный integration contract с отдельными тестами и отдельным решением.

## 3.4 Cabinet остаётся атомарной единицей assignment

- Assignment unit v1 — целый Cabinet. Один Cabinet не делится между несколькими Receiver.
- `SplitLevel` в 7E — закрытый enum с единственным членом `CABINET`.

# 4. Pixel domains

Различаются три домена (терминология umbrella §12):

```text
logical   — пространственная модель LedMAP: Input → Region → Screen → Cabinet → Module
physical  — физическая LED-матрица устройства
transport — адресуемые и передаваемые элементы, расходующие hardware transport capacity
```

В 7E действуют явные правила:

- `logical = physical` не предполагается и не проверяется движками; v1 профиля объявляет обе геометрии явно.
- `transportPixelCount` — отдельная величина; `logical`, `physical` и `transport` количества пикселей не обязаны совпадать.
- Домены не меняют 6A/7A: `mapInputPixel` / `unmapHardwarePixel` продолжают работать в принятой паре logical/physical.

# 5. Идентификация профиля

```ts
interface ProfileIdentity {
  readonly id: string
  readonly version: string
}

interface HardwareProfileRef {
  readonly profileId: string
  readonly profileVersion: string
}
```

Правила:

- `id` — стабильный, vendor-neutral, kebab/namespace-стиль без пробелов; `version` — строка `MAJOR.MINOR.PATCH` с non-negative integer components.
- Любое изменение профиля, способное изменить transport lookup, ёмкость или constraint semantics, MUST приводить к изменению `version`.
- Семантика версий: MAJOR — несовместимое изменение shape или semantics; MINOR — новое обратносуместимое правило; PATCH — редакция описания без влияния на вычисления.
- Ссылка на неизвестную `profileId`/`profileVersion` — явная ошибка, а не fallback и не «ближайшая известная версия».
- Профиль v1 **не** содержит поля `confidence` и не выражает «профиль описан частично» (umbrella §50) — см. §6.4.

# 6. Состав bundle

Профили ссылаются друг на друга по `id` (модель umbrella §4–§8), что даёт проверяемую referential integrity.

```ts
interface HardwareProfileBundle {
  readonly identity: ProfileIdentity
  readonly manufacturer: string
  readonly family: string
  readonly model: string

  readonly pixelTransportProfile: PixelTransportProfile
  readonly processorProfiles: readonly ProcessorProfile[]
  readonly portProfiles: readonly PortProfile[]
  readonly receiverProfiles: readonly ReceiverProfile[]
  readonly moduleProfiles: readonly ModuleProfile[]

  readonly addressingProfile: AddressingProfile
}

interface ProcessorProfile {
  readonly identity: ProfileIdentity
  readonly maxPorts: number
  readonly portProfileIds: readonly string[]
  readonly addressingProfileId: string
}

interface PortProfile {
  readonly identity: ProfileIdentity
  readonly maxTransportPixels: number
  readonly maxReceivers?: number
  readonly receiverProfileIds: readonly string[]
  readonly addressingMode: PortAddressingMode
}

interface ReceiverProfile {
  readonly identity: ProfileIdentity
  readonly maxTransportPixels: number
  readonly maxCabinets: number
  readonly portProfileId: string
}

interface ModuleProfile {
  readonly identity: ProfileIdentity
  readonly physicalWidth: number
  readonly physicalHeight: number
  readonly moduleCountX: number
  readonly moduleCountY: number
}

interface PixelTransportProfile {
  readonly transportPixelCountPerCabinet: number
  readonly scanMode: TransportScanMode
  readonly activePixelMask?: ActivePixelMask
}

type TransportScanMode = 'ROW_MAJOR' | 'COLUMN_MAJOR'
type PortAddressingMode = 'CONTINUOUS' | 'INDEPENDENT'
type SplitLevel = 'CABINET'

interface ActivePixelMask {
  readonly width: number
  readonly height: number
  readonly activePixels: readonly number[]
}

interface AddressingProfile {
  readonly receiverBaseAddressMode: 'RESERVED_CAPACITY' | 'PACKED_USED'
  readonly portAddressingMode: PortAddressingMode
  readonly addressWidthBits: number
}
```

## 6.1 AddressingProfile — только данные

`AddressingProfile` в 7E — **конфигурация без вычислений**: mode-флаги и ширина адреса. В нём нет и не будет функций address computation, base/port address derivation или vendor encoding — это Address Encoder gate. Значения mode-флагов в 7E проверяются только на допустимость enum, без вычисления адресов.

## 6.2 Терминология ёмкости

Профильные ёмкости выражаются в **transport pixels** и называются `maxTransportPixels`, чтобы их нельзя было спутать с 6B `Receiver.pixelCapacity`. Поле `maxPixels` umbrella §7 в 7E не используется.

## 6.3 Ссылочная целостность

- `portProfileIds`, `receiverProfileIds`, `portProfileId`, `addressingProfileId` MUST разрешаться в bundle; отсутствующая ссылка — ошибка валидации.
- Каждый `id` внутри bundle уникален в пределах своего массива профилей и не должен совпадать с `identity.id` bundle.
- Порядок массивов профилей сохраняется и не используется для семантики; lookup по `id` — единственный разрешающий механизм.

## 6.4 Unknown vs unlimited — явная семантика

В 7E отсутствие опционального ограничения имеет **ровно одно** значение: ограничение не объявлено, то есть **не ограничивает** (unlimited).

- `maxReceivers` отсутствует → unlimited, а не «неизвестно».
- `0` — валидное явно заданное ограничение (нулевая ёмкость) и не эквивалентно отсутствию поля.
- «Ограничение неизвестно автору профиля» в 7E **не выражается**: создание bundle с неполными данными — ошибка валидации, а не «мягкий» профиль. Mechanism уровня umbrella §49/§50 (unknown constraints, confidence) отложен и в 7E не моделируется.
- Смешивать unlimited и unknown нельзя, потому что unknown в 7E отсутствует как значение.

# 7. Transport lookup

Профиль v1 предоставляет детерминированное разрешение физического пикселя в transport index и обратно.

```ts
interface TransportPixelResolution {
  readonly active: boolean
  readonly transportIndex: number | null
}

function resolveTransportPixel(
  bundle: HardwareProfileBundle,
  x: number,
  y: number,
): TransportPixelResolution

function unresolveTransportPixel(
  bundle: HardwareProfileBundle,
  transportIndex: number,
): { readonly x: number; readonly y: number } | null
```

Правила:

- `activePixelMask` отсутствует → identity transport: для пикселя с physical-координатами `(x, y)` внутри `physicalWidth × physicalHeight` Cabinet: `active = true`, `transportIndex = y * physicalWidth + x`; вне границ → `active = false`, `transportIndex = null`.
- `activePixelMask` присутствует: `activePixels` — строго возрастающий список physical linear indices (`y * width + x`) активных пикселей. `resolveTransportPixel` возвращает `transportIndex` = позиция пикселя в этом списке; неактивный пиксель → `active = false`, `transportIndex = null`.
- `scanMode` v1: `ROW_MAJOR` (linear index `y * width + x`) и `COLUMN_MAJOR` (linear index `x * height + y`). `ROW_MAJOR` — default для `LEDMAP-GENERIC-REF001`.
- `unresolveTransportPixel` — обратная функция: активный `transportIndex` в диапазоне `[0, transportPixelCountPerCabinet)` всегда разрешается в координаты; неактивный или out-of-range index → `null` (без исключения).
- Инварианты, проверяемые тестами: `0 ≤ transportIndex < transportPixelCountPerCabinet`; bijektivность между активными physical пикселями и индексами `[0, N)`; полное покрытие — каждый index разрешается обратно; детерминированный порядок не зависит от порядка массивов bundle.
- Custom lookup (umbrella §15 `customLookup`) в 7E не поддерживается и не является допустимым значением.
- `SplitLevel` v1 (`CABINET`): lookup определён **per Cabinet**; разбиение Cabinet на модули как allocation unit не моделируется; модульная геометрия остаётся свойством 6A.

# 8. Валидация profile contract

```ts
function validateHardwareProfile(input: unknown): HardwareProfileValidationReport

interface HardwareProfileValidationReport {
  readonly valid: boolean
  readonly checks: readonly HardwareProfileValidationCheck[]
}

interface HardwareProfileValidationCheck {
  readonly code: HardwareProfileValidationCode
  readonly path: readonly (string | number)[]
  readonly message: string
}
```

Правила:

- Вход — `unknown`; функция не бросает исключений для данных и не обращается к I/O, файловой системе, окружению или сети.
- Report глубоко immutable; caller-owned input не мутируется и не замораживается.
- Severity только `ERROR`; `valid === true` iff `checks` пуст. Ни `WARNING`, ни `INFO` не вводятся.
- Детерминированный порядок: структурные проверки §6, затем referential integrity §6.3, затем capacity/constraint §6.2/§6.4, затем transport-инварианты §7, затем версия §5. В отчёт попадают **все** структурные нарушения в этом фиксированном порядке.
- Отличие от 7C сознательное: profile contract не является частью project pipeline, профиль — небольшой ограниченный документ, поэтому полный список нарушений полезнее staged first-failure. Это решение не меняет семантику 7C.
- Коды v1 (closed enum): `PROFILE_SHAPE_INVALID`, `PROFILE_FIELD_MISSING`, `PROFILE_FIELD_INVALID`, `PROFILE_VERSION_INVALID`, `PROFILE_REFERENCE_UNKNOWN`, `PROFILE_DUPLICATE_ID`, `PROFILE_CAPACITY_INVALID`, `PROFILE_SPLIT_LEVEL_UNSUPPORTED`, `PROFILE_MASK_INVALID`, `PROFILE_TRANSPORT_INCONSISTENT`.

# 9. `LEDMAP-GENERIC-REF001`

Vendor-neutral reference profile, повторяющий Reference Test Case 001 в терминах профиля. Значения транспорта и ёмкости — константы этого теста, а не измерения реального оборудования.

```text
bundle identity      : id "ledmap.generic.ref001", version "1.0.0"
manufacturer/family/model : "ledmap" / "generic" / "ref001"

PixelTransportProfile:
  transportPixelCountPerCabinet : 16384      (128 × 128, transport == physical)
  scanMode                      : ROW_MAJOR
  activePixelMask               : отсутствует  (identity transport)

ModuleProfile:
  physicalWidth/Height          : 32 / 32
  moduleCountX / moduleCountY   : 4 / 4

ReceiverProfile:
  maxTransportPixels            : 65536       (4 × 16384)
  maxCabinets                   : 4
  portProfileId                 : "ledmap.generic.ref001.port"

PortProfile:
  maxTransportPixels            : 131072      (2 × 65536)
  maxReceivers                  : 2
  receiverProfileIds            : ["ledmap.generic.ref001.receiver"]
  addressingMode                : CONTINUOUS

ProcessorProfile:
  maxPorts                      : 4
  portProfileIds                : ["ledmap.generic.ref001.port"] × 4
  addressingProfileId           : "ledmap.generic.ref001.addressing"

AddressingProfile:
  receiverBaseAddressMode       : RESERVED_CAPACITY
  portAddressingMode            : CONTINUOUS
  addressWidthBits              : 23           (≥ 196608, с запасом)
```

Ограничения: профиль **не** вычисляет ни port index, ни base address, ни hardware address; ёмкости только объявляют верхние границы. Profile не используется для переопределения 6B (см. §3.3).

# 10. Public API v1 (предлагаемые имена)

```ts
type HardwareProfileRef
type ProfileIdentity
type SplitLevel = 'CABINET'
type TransportScanMode
type PortAddressingMode

interface HardwareProfileBundle
interface ProcessorProfile
interface PortProfile
interface ReceiverProfile
interface ModuleProfile
interface PixelTransportProfile
interface AddressingProfile

function validateHardwareProfile(input: unknown): HardwareProfileValidationReport
function resolveTransportPixel(bundle, x, y): TransportPixelResolution
function unresolveTransportPixel(bundle, transportIndex): { x, y } | null
```

Имена ниже считаются утверждёнными этим docs-gate и не являются разрешением на production API: renaming выполняется только до отдельного production-разрешения. Экспорт — из `@ledmap/core`; 7E строго additive и не меняет существующие exports.

# 11. Детерминированность, чистота, неизменяемость

- Только pure functions и immutable данные: нет `Date`, `Math.random`, сети, файлов, процесса, env, DOM, Electron.
- Результаты глубоко frozen; входные объекты не мутируются и не замораживаются; ссылочная идентичность входа не удерживается.
- Детерминированный порядок обхода и сообщений; одинаковый bundle даёт байт-в-байт одинаковый report на всех прогонах и во всех ОС.
- Никаких исключений для ошибочных данных: ошибки данных выражаются report-ом или явным `null`/flag; исключения допустимы только для программных ошибок (нарушение собственной типизации).

# 12. Acceptance plan 7E

Тестовые области (Vitest, `packages/core/test/hardware-profile/`):

1. Shape и identity: bundle и все constituent profiles, `id`/`version`, уникальность id, referential integrity, unknown references.
2. Validation: коды §8, порядок checks, полнота списка, `valid === true` iff пустой список, deep immutability, отсутствие мутации входа, детерминированный повторный прогон.
3. Capacity/constraints: `maxTransportPixels`, `maxCabinets`, `maxReceivers`, `0` vs отсутствие (unlimited), `maxPorts`; запрет подмены 6B `Receiver.pixelCapacity`.
4. Transport forward/inverse: identity sweep всего Cabinet REF-001 (16384 px) для `ROW_MAJOR` и `COLUMN_MAJOR`, bijektivность, round-trip всех индексов, out-of-range → `null`, `active = false` → `null`, детерминированный порядок.
5. Active mask: построение mask, разрежение индексов, неактивные пиксели, полное покрытие, `PROFILE_MASK_INVALID`.
6. `LEDMAP-GENERIC-REF001`: константы профиля, полный sweep 196608 px по всем 12 Cabinet в logical- и physical-доменах, совпадение с принятой 7A/6A математикой без изменений engines, детерминированные ёмкости.
7. Split narrowing: `SplitLevel` содержит только `CABINET`; `MODULE` / `PIXEL_BLOCK` и `CABINET → несколько Receiver` отклоняются явным кодом или отсутствуют в типе; тест фиксирует запрет.
8. Границы: `validateProject` (7C) не принимает профиль и не вызывает `validateHardwareProfile`; `.ledmap` v1 loader отвергает `profileId`/`profileVersion` как unknown fields; в `extensions` profile identity игнорируется; 7D/6B/7A/7B публичные API и поведение не изменены.
9. Regression: 1087 baseline-тестов (41 core-файл / 1051 core-only) остаются зелёными без правок; REF-001 sweeps 6A/6B/7A/7B/7D не редактируются.
10. Gates: `npm run test:core`, `npm run typecheck -w @ledmap/core`, `npm run build -w @ledmap/core`, `npx eslint packages/core`, `npm test`, `npm run test:smoke`, `git diff --check` — локальный PASS, без CI-подтверждения.

# 13. Out of scope 7E

`AddressEncoder`, `HardwareAddress` и vendor encoding; Final Remap и ReverseIndex; `SplitLevel` ниже `CABINET`; Cabinet → несколько Receiver; интеграция профиля в 7C/6B; persistence профиля и изменение `.ledmap`; profile catalog, загрузка и версионирование профилей на диске; unknown-constraint/confidence semantics; warning/info severity; UI, file I/O, IPC; изменения принятой математики движков.

# 14. Backward compatibility

- 7E добавляет новые exports и не меняет существующие: Cabinet Engine, Hardware Engine (6B), Mapping (7A), Remap (7B), Validation (7C), Serialization (7D) остаются байт-в-байт прежними.
- Ни один существующий тест не требует правки; изменение любого из них — обязательный сигнал нарушения этого контракта.
- Umbrella §4–§8 и §12–§18 сохраняют силу как архитектурное обоснование; normative для 7E — только этот документ.

# 15. Definition of ready для production 7E

1. Пользователь проверил SHA docs-only acceptance-коммита этого gate.
2. Отдельное разрешение на production 7E.
3. Production реализует §6–§8, §10 и покрывается §12; любой выход за эти рамки требует нового gate.

Текущий deliverable — docs-only acceptance gate из четырёх файлов: эта спецификация, staged-annotation umbrella-спецификации, ADR-025 и `TODO.md`. Production-код, тесты, app и изменение принятых контрактов в этот коммит не входят.
