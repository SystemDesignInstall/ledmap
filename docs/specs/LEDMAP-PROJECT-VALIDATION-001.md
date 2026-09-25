# LEDMAP-PROJECT-VALIDATION-001 — Phase 7C Project Validation

**Версия:** 1.0

**Статус:** Accepted — documentation only; production 7C ожидает отдельного разрешения после проверки SHA docs-only acceptance-коммита.

**Baseline:** `fb02d53101af1fdb6ceefe3ea162252221da64b8` — closure 7B.

**Upstream:** Mapping 7A `0071eeed001ed2e275e3efb827b216a1d49da1f8`, Logical Remap 7B `2b589ac326ab6bc066d0a55cd295bae05e9fc380`.

**Regression baseline:** 625 тестов; принятые результаты локальные, без CI-подтверждения.

## 1. Назначение и объём v1

Project Validation предоставляет единый pure API проверки исходной конфигурации и компактный immutable-отчёт с кодами ошибок и состоянием выполненных проверок. Он не заменяет обязательные проверки внутри Cabinet, Hardware, Mapping или Remap Engine.

В текущем core нет общей сущности `Project`, формата проекта и общего типа diagnostics. Этот документ определяет отдельный `ValidateProjectInput` как runtime-контекст проверки, **не как модель хранения проекта**. Canonical project schema, JSON parsing, миграции и `.ledmap` остаются 7D.

Принятый v1 ограничен уже поддерживаемым профилем 7A/7B:

- один InputCanvas, один Screen, один CabinetGrid и один MappingRegion;
- полная explicit HardwareTopologyInput для Cabinets этого Grid; multi-processor разрешён в пределах принятого 6A;
- текущий identity-translation Mapping 7A и identity-only / empty-only Logical Remap 7B;
- проверка входной структуры, затем существующих semantic invariants через публичные движки;
- отчёт об ожидаемых ошибках вместо исключения из `validateProject()`.

Неполная topology может передаваться для диагностики, но не становится допустимым готовым проектом. Валидатор не вызывает allocation, не достраивает назначения и не исправляет данные.

**За пределами принятого объёма:** общий граф нескольких Screen/Grid/Region, независимое накопление всех semantic defects и предупреждения. Название Project Validation не означает проверку ещё не введённого формата проекта.

## 2. Границы ответственности

```text
ValidateProjectInput (source configuration)
        ↓
input shape check
        ↓
resolveMapping(mapping) — включая существующий resolveHardware()
        ↓
resolveRemap({ mapping: resolvedMapping, rules })
        ↓
ProjectValidationReport
```

Временные resolved snapshots не входят в отчёт. Пользователь отчёта не получает через него PixelMap или RemappedPixelMap.

7C MUST NOT:

- повторять addressing formulas, physical cell lookup, Numbering/Direction/Snake или remap lookup;
- переносить/рефакторить validation из принятых движков либо выключать её после успешной проверки проекта;
- самостоятельно вычислять Receiver load, pixelCount, prefix sums или capacity limits;
- вызывать `allocateHardware()`, сортировать или исправлять caller-owned arrays;
- вводить transforms, concrete Remap rules, Hardware Profiles, AddressEncoder, Final Hardware Remap;
- выполнять I/O, писать проект, сохранять derived data или реализовывать UI;
- объявлять валидность vendor export или будущей сериализации.

Отдельный вызов `resolveHardware()` перед `resolveMapping()` не нужен: 7A уже строит hardware snapshot из той же полной topology. Полученная через 7A аппаратная ошибка сохраняет свой исходный код.

## 3. Публичный API

Типы импортируются из существующих публичных API 7A/7B. Новая сущность `Project` не вводится.

```ts
interface ValidateProjectInput {
  readonly mapping: ResolveMappingInput
  readonly rules: readonly RemapRuleDescriptor[]
}

type ProjectValidationStage = 'input' | 'mapping' | 'remap'

interface ProjectDiagnostic {
  readonly severity: 'error'
  readonly stage: ProjectValidationStage
  readonly code: string
  readonly path: readonly (string | number)[]
  readonly message: string
}

type ProjectValidationCheck =
  | {
      readonly stage: ProjectValidationStage
      readonly status: 'passed' | 'failed'
    }
  | {
      readonly stage: ProjectValidationStage
      readonly status: 'blocked'
      readonly blockedBy: ProjectValidationStage
    }

interface ProjectValidationReport {
  readonly valid: boolean
  readonly diagnostics: readonly ProjectDiagnostic[]
  readonly checks: readonly ProjectValidationCheck[]
}

function validateProject(input: ValidateProjectInput): ProjectValidationReport
```

`mapping` и `rules` обязательны. Отсутствующие `rules` не считаются `[]`. Input принимает исходный `ResolveMappingInput`, а не недоверенный или ранее построенный `ResolvedPixelMap`. Подмена/согласование геометрии с внешним hardware snapshot отсутствует.

В v1 severity только `error`. Нет неявных warning/info, severity overrides, suppression, configurable validators или async callbacks. `code` — строка, чтобы сохранять существующие `DomainError.code`, включая Cabinet/domain codes без префикса.

## 4. Что означает valid и полнота отчёта

`checks` содержит ровно три записи в порядке `input`, `mapping`, `remap`.

`valid === true` тогда и только тогда, когда все три записи имеют `status: 'passed'` и `diagnostics` пуст. `blocked` всегда делает отчёт невалидным и не означает, что пропущенная подсистема исправна или неисправна.

Здесь `valid` означает структурную корректность входа и возможность построить Mapping/Remap в текущем профиле. Это не сертификат всех инвариантов domain model, конфигурации редактора или физического монтажа: значения, которые движки не используют, не получают дополнительных semantic checks автоматически (§5).

| Состояние | input | mapping | remap |
|---|---|---|---|
| Структурно неверный вход | failed | blocked by input | blocked by input |
| DomainError из resolveMapping | passed | failed | blocked by mapping |
| DomainError из resolveRemap | passed | passed | failed |
| Все проверки успешны | passed | passed | passed |

Накопление диагностики строго ограничено:

1. Shape check собирает все независимые структурные ошибки по §5.
2. После успешной shape check Mapping выполняется один раз. При `DomainError` сохраняется одна ошибка этого вызова; Remap не запускается.
3. После успешного Mapping Remap выполняется один раз с полученным immutable snapshot.

Отчёт **не обещает список всех semantic defects**: существующие движки останавливаются на первой ошибке. Валидатор не удаляет проблемные entities и не запускает движок повторно для «поиска следующей ошибки». Диагностика `blocked` представлена только в `checks`, дополнительная фиктивная ошибка для неё не создаётся.

Это принятое ограничение v1. Расширение до независимого semantic rule graph требует следующего контракта.

## 5. Input shape check

Выполняется минимальная runtime-проверка структуры существующих TypeScript-типов, чтобы ожидаемый пропуск поля не превращался в `TypeError` внутри движка. Это не JSON parser и не semantic validation проекта.

Поддерживаются обычные records и arrays с собственными data properties. Caller-owned mutable и deep-frozen объекты одинаково допустимы. Accessors вместо проверяемых полей не вызываются и считаются структурной ошибкой; функции, class instances и mutable-state built-ins не заменяют ожидаемый record/array.

Проверяются следующие обязательные поля, в указанном порядке. Для каждой entity сначала проверяется record, затем перечисленные поля; `id` и references — строки, без trimming, нормализации или нового ограничения на формат ID.

| Путь / объект | Поля и runtime-kind |
|---|---|
| корень | `mapping`: record; `rules`: array |
| `mapping` | `inputCanvas`, `screen`, `grid`, `region`, `hardwareTopology`: records |
| `inputCanvas` | `id`: string; `resolution`: Size |
| `screen` | `id`, `name`: string; `resolution`: Size; `mappingRegions`, `cabinetGrids`: string arrays |
| `grid` | `id`, `screen`, `name`: string; `columns`, `rows`, `cabinetWidth`, `cabinetHeight`: number; `ordering`: record |
| `grid.ordering` | `numbering`, `startCorner`, `direction`: соответствующие string unions из GridOrdering; `snake`: boolean |
| `region` | `id`, `inputCanvas`, `screen`, `grid`: string; `position`: XY; `size`: Size |
| `hardwareTopology` | `processors`, `ports`, `receivers`, `cabinets`, `modules`: entity arrays; `processorOrder`: string array; `receiverOrder`: record array |
| Processor | `id`, `name`: string; `portCount`: number |
| Port | `id`, `processor`: string; `index`, `receiverCapacity`: number |
| Receiver | `id`, `processor`, `port`: string; `index`: number; `cabinets`: string array; optional `pixelCapacity`: number |
| Cabinet | `id`, `grid`: string; `column`, `row`: number; `origin`: XY; `width`, `height`, `pixelWidth`, `pixelHeight`, `moduleColumns`, `moduleRows`, `rotation`: number; `flipH`, `flipV`: boolean |
| Module | `id`, `cabinet`: string; `column`, `row`, `localX`, `localY`, `width`, `height`, `pixelWidth`, `pixelHeight`: number |
| receiverOrder entry | `port`: string; `receivers`: string array |
| Size | `width`, `height`: number |
| XY | `x`, `y`: number |

Для optional `pixelCapacity` отсутствие или `undefined` означает отсутствие лимита; `null` — неверный kind. Число проверяется как runtime number: NaN, Infinity, отрицательные, дробные и unsafe numbers не переписываются в shape errors; ограничения используемых чисел проверяют движки с прежними кодами.

Для enum-полей проверяется только принадлежность уже существующему TypeScript union: Numbering = `row | column`, StartCorner = `top-left | top-right | bottom-right | bottom-left`, Direction = `left-to-right | right-to-left | top-to-bottom | bottom-to-top`. Неизвестный токен даёт `PROJECT_INVALID_INPUT`. Совместимость пары Numbering/Direction и поддержка StartCorner Cabinet Engine не проверяются повторным применением ordering к Mapping.

В частности, 7A physical lookup не применяет Grid ordering. Значение из union, не используемое этим pipeline, не запрещается 7C лишь потому, что отдельный ordering API его не поддерживает. Аналогично 7C не добавляет проверок physical origins Cabinets или геометрии монтажа. Это явное ограничение смысла `valid`, а не расширение поддержки Cabinet Engine.

Массив `rules` проверяется только как массив. Его элементы не читаются и не проверяются по `id/version/type`. Любой непустой массив после успешного Mapping обрабатывает 7B, включая sparse array и malformed descriptors.

Неизвестные дополнительные поля не диагностируются shape check, не обходятся ею рекурсивно и не включаются в отчёт. Они не удаляются перед вызовом движков. Поэтому это не обещание, что произвольные extra fields будут приняты всем pipeline: если существующий движок их сохраняет и далее выдаёт DomainError, действует §7. Shape check не задаёт режим import/export unknown fields — это будущий 7D.

Каждое нарушение даёт `PROJECT_INVALID_INPUT`, `stage: 'input'`, path до нарушенного поля/элемента. Если record/array отсутствует или неверного kind, выдаётся одна ошибка на этом path; descendants этого узла пропускаются, независимые siblings продолжают проверяться. Missing required property и явный `undefined` дают одну и ту же категорию ошибки.

Порядок: обход в глубину по порядку полей таблицы; внутри массивов — возрастание индекса. Для корня все доступные поля внутри `mapping` проверяются до `rules`. Sparse elements в entity/reference arrays являются missing element; для `rules` действует исключение выше. Проверка не требует обхода произвольного графа неизвестных полей.

## 6. Делегированная semantic validation

После shape check вызывается `resolveMapping(input.mapping)` без изменения аргумента или orders. Это единственный источник решения о соответствии принятому Mapping/Hardware профилю.

Примеры покрываемых текущими движками инвариантов:

- references InputCanvas/Screen/Grid/Region и single-grid/single-region membership;
- source bounds, safe integer geometry, равенство pixel dimensions, полное покрытие physical cells;
- два разных CabinetId в одной cell — `MAPPING_DUPLICATE`, повтор CabinetId — `HARDWARE_DUPLICATE`;
- explicit orders, полнота и единственность hardware assignments, parent relationships;
- Cabinet/Module layout и неподдерживаемые transforms;
- capacity Receiver в pixels, Port в receivers, Processor в ports;
- отсутствие Receiver.pixelCapacity остаётся «лимит не задан».

Список не создаёт новую реализацию этих правил в 7C. Коды, единицы capacity и арифметика остаются у принятых движков. Общая модель hardware profiles и transport pixels из будущего hardware-final контракта не применяется.

После успешного Mapping вызывается `resolveRemap({ mapping: resolved, rules: input.rules })`. 7C передаёт настоящий snapshot 7A и не строит его вручную. Пустые rules дают identity; непустые — `REMAP_UNSUPPORTED_RULE`. Самостоятельной проверки fields descriptor, применения правил или проверки lookup pixels нет.

## 7. Diagnostics: коды, path и сообщения

| Источник | stage | code | path |
|---|---|---|---|
| Shape check | input | `PROJECT_INVALID_INPUT` | Точный путь к полю/элементу по §5 |
| DomainError из resolveMapping | mapping | Исходный `error.code` | `['mapping']` |
| REMAP_UNSUPPORTED_RULE из resolveRemap | remap | `REMAP_UNSUPPORTED_RULE` | `['rules']` |
| Другой DomainError из resolveRemap | remap | Исходный `error.code` | `[]` |

Path — массив сегментов относительно `ValidateProjectInput`, например `['mapping', 'hardwareTopology', 'modules', 2, 'pixelWidth']`. Число — индекс во входном массиве; строка — имя поля. Корень обозначается `[]`. Это не JSON Pointer и не путь к будущему файлу проекта.

У `DomainError` сейчас нет structured entity/path metadata. Поэтому v1 сохраняет честный путь уровня вызова и **не извлекает CabinetId, PortId или индекс массива парсингом `message`**. Stage обозначает место вызова, а не namespace ошибки: `stage: 'mapping'` с `code: 'HARDWARE_CAPACITY_EXCEEDED'` корректен.

Для другого Remap DomainError путь `[]` обозначает весь контекст проверки: аргумент Remap содержит derived snapshot, которого нет по отдельному пути во входе 7C. Такая ошибка не приписывается массиву rules без основания. Классификация REMAP_UNSUPPORTED_RULE опирается на нормативный code, не на текст сообщения.

Сохраняются `code` и полный `message` пойманного `DomainError`, без добавления `PROJECT_` к upstream codes, без удаления или дублирования существующего префикса. Для собственных shape diagnostics message объясняет ожидаемый kind; текст не используется как машинный идентификатор. В отчёт не входят stack, Error instance, исходные объекты или mutable details.

Перехватывается только существующий `DomainError`. Неожиданные исключения реализации повторно выбрасываются; они не превращаются в успешный отчёт, `PROJECT_INVALID_INPUT` или фиктивный `INTERNAL_ERROR`. Обещание «отчёт вместо исключения» относится к описанным структурным нарушениям и ожидаемым DomainError движков.

Unused-capacity diagnostics `AllocationProposal` не переименовываются в ошибки проекта. Allocation не запускается для получения предупреждений. Warning/info codes зарезервированы концептуально, но не входят в API v1.

## 8. Детерминизм и порядок

Для неизменных значений входа с тем же порядком массивов результат MUST быть семантически одинаковым. Время, случайность, locale sorting, глобальные mutable caches и I/O не участвуют.

`diagnostics` следуют порядку §5 либо содержат единственную делегированную ошибку первого неуспешного semantic stage. Checks всегда идут `input → mapping → remap`.

Не обещается одинаковая первая ошибка для перестановок невалидных entity arrays с несколькими дефектами: такого контракта нет у существующих движков. 7C не сортирует вход для искусственной стабилизации этого выбора. Для валидных equivalent entity-array permutations результат остаётся `valid: true`, diagnostics пуст; explicit signal orders не переставляются.

## 9. Ownership, compactness, повторная проверка

Вход не мутируется, не замораживается и не удерживается отчётом. Все массивы checks/diagnostics/path и содержащие их records MUST быть deeply immutable. Строки message/code копируются как значения; snapshot references в отчёте отсутствуют.

Последующая мутация caller-owned входа не меняет уже возвращённый report. Новая проверка актуальных данных требует нового вызова `validateProject()`. Успешный отчёт не является разрешением обходить validation движков и не доказывает, что вход не изменился после вызова.

Временные snapshots имеют компактность 7A/7B; shape traversal и diagnostics пропорциональны entity/reference fields и найденным ошибкам. Production не выполняет full pixel sweep и не создаёт PixelAddress/MappedPixel на каждый pixel. Число Grid cells без Cabinets не используется для создания массива недостающих cells.

## 10. Примеры результатов и зависимостей

| Вход | diagnostics | checks input / mapping / remap | valid |
|---|---|---|---|
| REF-001 identity, rules=[] | [] | passed / passed / passed | true |
| REF-001 offset, rules=[] | [] | passed / passed / passed | true |
| Отсутствуют region.size и rules | Две PROJECT_INVALID_INPUT в порядке обхода | failed / blocked / blocked | false |
| Source rect за canvas при корректной topology | MAPPING_OUT_OF_RANGE | passed / failed / blocked | false |
| Receiver перегружен при остальном корректном Mapping | HARDWARE_CAPACITY_EXCEEDED | passed / failed / blocked | false |
| Всё корректно, rules=[{}] | REMAP_UNSUPPORTED_RULE | passed / passed / failed | false |
| Ошибка Mapping и непустые rules | Только ошибка Mapping; Remap не оценён | passed / failed / blocked | false |

Последний пример намеренно не обещает обнаружение независимого rule defect. Пользователь отчёта должен учитывать blocked status, а не трактовать отсутствие REMAP-диагностики как принятие правил.

## 11. Acceptance plan будущей реализации

1. REF-001 identity и offset проходят с пустыми diagnostics и тремя passed checks. Полные существующие 7A/7B sweeps и 22 anchors остаются регрессией; 7C не дублирует sweep в production.
2. Structural fixtures: отсутствующие/null/wrong-kind records, arrays, required fields, unknown enum tokens, sparse entity/reference arrays, optional capacity, несколько независимых shape defects. Проверить точные code/stage/path, порядок, отсутствие descendant noise и блокирование semantic stages. Известные enum tokens не получают дополнительной проверки ordering compatibility; этот предел `valid` фиксируется отдельным тестом.
3. Изолированные semantic fixtures: reference/membership, bounds/overflow, missing/conflicting cells, duplicate CabinetId, layout/transform, incomplete topology, parent mismatch, capacity. Сравнить upstream code/message с прямым вызовом `resolveMapping()` на том же входе.
4. Remap fixtures: пустой mutable/frozen массив, неизвестные/некорректные descriptors и sparse rules. Для непустого массива при корректном Mapping — REMAP_UNSUPPORTED_RULE без чтения descriptor fields.
5. Mixed defects: shape + Mapping + rules; Mapping + rules; несколько semantic defects внутри Mapping. Проверить таблицу blockedBy и отсутствие утверждения «все ошибки найдены».
6. Проверить, что DomainError преобразуется в diagnostic, а unexpected exception повторно выбрасывается. Не требовать новой semantic валидации от 7A/7B.
7. Mutable и deeply frozen source input; вход не мутируется и не замораживается, report глубоко immutable, последующие мутации source не меняют report.
8. Детерминизм повторных вызовов, валидные entity-array permutations, сохранение explicit processor/receiver/cabinet orders, multi-processor fixture без смешения Port-local addressing.
9. Compactness: маленькая entity topology с MAX_SAFE_INTEGER допустимых pixels; validator возвращает компактный report без pixel-sized storage и обхода pixels. Дефект огромного неполного Grid не порождает огромный список отсутствующих cells.
10. Сохранить 625 baseline tests без изменения assertions/expected math. Новые 7C tests добавляются отдельно. Пройти `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke`, `git diff --check`.

Будущий validation report должен указывать candidate SHA, accepted docs baseline, фактическое число тестов, результаты всех gates и границу локального/CI-подтверждения.

## 12. Предполагаемые файлы и gates

После отдельного разрешения production планируются `packages/core/src/validation/{types,input,validate,index}.ts`, export из core barrel, новые tests/fixtures в `packages/core/test/validation/` и `docs/project-validation-7c-validation.md`. Публичный контракт и scope задаёт эта принятая версия спецификации.

Правки математики Cabinet/Hardware/Mapping/Remap, существующих entity types, app или serialization не планируются. Новые runtime dependencies не нужны.

Review Proposed-спецификации завершён PASS. Приняты три решения: single-profile runtime input вместо новой Project model; first-failure semantic stages с явным blocked status; отсутствие warning/info и всеобщего semantic aggregation в v1.

Текущий deliverable — docs-only acceptance-коммит `docs: accept phase 7c validation contract` ровно из трёх файлов: эта спецификация со статусом Accepted, `docs/DECISIONS.md` с ADR-022 и `TODO.md` с принятым планом/docs-gate 7C. Production-код не входит в этот коммит и ожидает отдельного разрешения пользователя после проверки SHA.
