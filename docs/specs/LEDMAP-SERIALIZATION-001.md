# LEDMAP-SERIALIZATION-001 — Phase 7D Serialization

**Версия:** 1.0

**Статус:** Accepted — documentation only; production 7D ожидает отдельного разрешения после проверки SHA docs-only acceptance-коммита.

**Baseline:** `33fef12908869ce7ac87d1b723aff2bee91f731b` — closure 7C.

**Upstream:** Mapping 7A, Logical Remap 7B, Project Validation 7C; ADR-020/021/022. Production 7C — `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9`.

**Regression baseline:** 827 тестов; принятые quality gates локальные, без CI-подтверждения.

## 1. Принятый scope и решения

7D определяет первый canonical `.ledmap` document, pure преобразования JSON text ↔ source configuration, version dispatch и минимальный migration skeleton. Файловые операции остаются в app.

Принятый v1 сохраняет single-profile scope 7A/7B/7C: один InputCanvas/Screen/Grid/Region и полная explicit HardwareTopologyInput; несколько Processor допустимы. Вводится формат документа, но не новый универсальный domain `Project` с редактором или runtime state.

Согласованный scope: `loadProject()` и `serializeProject()` успешно завершаются только для конфигурации, проходящей 7C. Сохранение незавершённых/невалидных drafts, autosave/recovery и частичных topology требует отдельного контракта. `parseProject()` проверяет формат и может вернуть structurally valid документ с semantic defects для диагностики.

Принятые решения:

1. Closed schema v1 с единственным root `extensions` для opaque JSON metadata.
2. Persisted explicit orders сохраняются без сортировки; Module.localX/localY восстанавливаются, а не хранятся.
3. Strict parse отделён от semantic load; успешный save/load требует `validateProject().valid`.
4. В v1 нет утверждённого legacy format: migration registry пуст, version 1 имеет identity path, другие версии отклоняются.

Это развивает working ADR-010; решения 7D закреплены в Accepted ADR-023, статус ADR-010 отдельно не меняется. Общий смысл `valid` из 7C не расширяется до сертификата монтажа, UI-конфигурации или vendor export.

## 2. Pure core и файловая граница

```text
app: file bytes → UTF-8 text
                ↓
core: parseProject(text) → ProjectDocumentV1
                ↓
core: source reconstruction → validateProject() → LoadedProject
                ↓
app: принять новый source state; при необходимости пересчитать engines

runtime source configuration
                ↓
core: serializeProject(input) → canonical JSON text
                ↓
app: UTF-8 bytes → file write
```

Core не импортирует fs/Electron/DOM, не выбирает путь, не открывает диалог, не пишет файл и не выполняет IPC. Расширение имени `.ledmap` — соглашение app, а не аргумент parser.

App обязан заменять текущий source state только после успешного `loadProject()`. При ошибке старый state сохраняется. Для save app сначала получает готовый текст; ошибка core не должна приводить к обнулению файла. Atomic filesystem write, backup, UI Open/Save и Electron integration не реализуются в этом этапе и требуют отдельного плана app.

Входные данные не мутируются. Parse/load/migration results глубоко immutable и не удерживают mutable caller-owned references. Derived snapshots, построенные 7C для проверки, не становятся частью файла или `LoadedProject`.

## 3. Source-of-truth и derived data

| Хранится | Назначение |
|---|---|
| InputCanvas, Screen, MappingRegion references и source rect | Исходная конфигурация mapping |
| Grid dimensions и GridOrdering tokens | Конфигурация сетки; не пересчитанный signal order |
| Cabinet id/grid/column/row, physical origin/size, pixel size, module grid, transform flags | Исходная физическая структура |
| Module id/cabinet/column/row, physical и pixel dimensions | Исходная модульная структура |
| Processor/Port/Receiver IDs, references, indices, capacities | Исходная topology и ограничения |
| Receiver.cabinets | Явные назначения и signal order Cabinets |
| processorOrder; receiverOrder и вложенные receivers | Явный runtime-порядок 6A, теперь явно persisted в v1 |
| rules | Конфигурация Remap; для успешного v1 load/save только пустой массив |
| extensions | Opaque JSON metadata, не исполняемая конфигурация core |

Не хранятся: `ResolvedHardwareMapping`, `ResolvedPixelMap`, `RemappedPixelMap`, `ProjectValidationReport`, `PixelAddress`, `MappedPixel`, cells lookup, spans, `dataIndex`, `globalRemapIndex`, cabinet/module/pixel indices, caches/reverse tables, usage/remaining capacity, AllocationProposal/diagnostics, runtime selections, renderer/canvas state.

`Module.localX` и `Module.localY` также исключены: текущая модель определяет их как `column × width` и `row × height`. При materialization они восстанавливаются по этим формулам. Это реконструкция полей существующего Module, а не новая addressing/Mapping математика.

`Cabinet.origin` сохраняется: он является исходным physical placement и не заменяется вычислением из Grid cell. `width/height` и `pixelWidth/pixelHeight` остаются разными парами. `Receiver.index` сохраняется как есть и не используется вместо `receiverOrder`.

Для save исходный runtime Module, включая localX/localY, сначала проверяется через 7C. Несогласованные local coordinates нельзя молча «исправить» путём их удаления из файла. При load недостоверные размеры/координаты не исправляются; результат реконструкции проверяется 7C.

## 4. Envelope и public DTO

```ts
type JsonValue = null | boolean | number | string | JsonObject | readonly JsonValue[]
interface JsonObject {
  readonly [key: string]: JsonValue
}

interface SizeV1 {
  readonly width: number
  readonly height: number
}

interface XYV1 {
  readonly x: number
  readonly y: number
}

interface InputCanvasV1 {
  readonly id: string
  readonly resolution: SizeV1
}

interface ScreenV1 {
  readonly id: string
  readonly name: string
  readonly resolution: SizeV1
  readonly mappingRegions: readonly string[]
  readonly cabinetGrids: readonly string[]
}

interface GridOrderingV1 {
  readonly numbering: 'row' | 'column'
  readonly startCorner: 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
  readonly direction: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
  readonly snake: boolean
}

interface GridV1 {
  readonly id: string
  readonly screen: string
  readonly name: string
  readonly columns: number
  readonly rows: number
  readonly cabinetWidth: number
  readonly cabinetHeight: number
  readonly ordering: GridOrderingV1
}

interface RegionV1 {
  readonly id: string
  readonly inputCanvas: string
  readonly screen: string
  readonly grid: string
  readonly position: XYV1
  readonly size: SizeV1
}

interface ProcessorV1 {
  readonly id: string
  readonly name: string
  readonly portCount: number
}

interface PortV1 {
  readonly id: string
  readonly processor: string
  readonly index: number
  readonly receiverCapacity: number
}

interface ReceiverV1 {
  readonly id: string
  readonly processor: string
  readonly port: string
  readonly index: number
  readonly cabinets: readonly string[]
  readonly pixelCapacity?: number
}

interface CabinetV1 {
  readonly id: string
  readonly grid: string
  readonly column: number
  readonly row: number
  readonly origin: XYV1
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly moduleColumns: number
  readonly moduleRows: number
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
}

interface StoredModuleV1 {
  readonly id: string
  readonly cabinet: string
  readonly column: number
  readonly row: number
  readonly width: number
  readonly height: number
  readonly pixelWidth: number
  readonly pixelHeight: number
}

interface ReceiverOrderV1 {
  readonly port: string
  readonly receivers: readonly string[]
}

interface StoredHardwareTopologyV1 {
  readonly processors: readonly ProcessorV1[]
  readonly ports: readonly PortV1[]
  readonly receivers: readonly ReceiverV1[]
  readonly cabinets: readonly CabinetV1[]
  readonly modules: readonly StoredModuleV1[]
  readonly processorOrder: readonly string[]
  readonly receiverOrder: readonly ReceiverOrderV1[]
}

interface StoredMappingInputV1 {
  readonly inputCanvas: InputCanvasV1
  readonly screen: ScreenV1
  readonly grid: GridV1
  readonly region: RegionV1
  readonly hardwareTopology: StoredHardwareTopologyV1
}

interface StoredProjectV1 {
  readonly mapping: StoredMappingInputV1
  readonly rules: readonly JsonValue[]
}

interface ProjectDocumentV1 {
  readonly format: 'ledmap'
  readonly schemaVersion: 1
  readonly project: StoredProjectV1
  readonly extensions: JsonObject
}
```

DTO names и типы выше определяют public API сериализации. Это самостоятельные wire-типы v1: все IDs/references имеют тип `string`, вложенные records и enum literals определены явно. Они не импортируют runtime domain interfaces, branded IDs или runtime enum unions и не выводятся из них через `Omit`, `Pick`, inheritance или indexed access. Схема v1 зафиксирована этими типами и таблицей §5 и **не расширяется автоматически** при будущем изменении runtime interface.

Переходы между runtime domain types и persisted schema types выполняются явно: Runtime → StoredV1 — materialization полей для записи; StoredV1 → Runtime — reconstruction после успешной schema-проверки. При reconstruction проверенные строки IDs/references можно присваивать существующим branded string types; это не подменяет semantic reference validation через 7C. Domain factories для defaulting не используются. Будущие изменения runtime-модели требуют явного пересмотра адаптеров и versioning решения, а не изменения смысла schemaVersion 1 по наследованию типов.

Все четыре поля envelope обязательны. `extensions: {}` записывается даже при отсутствии metadata. Версия приложения, timestamp, случайный document ID, путь файла и OS-specific данные автоматически не добавляются.

## 5. Closed schema v1

Для всех records в таблице действует `additionalProperties: false`. Порядок перечисления полей — canonical output order. Все поля обязательны, кроме `Receiver.pixelCapacity`.

| Record / path | Поля в canonical order |
|---|---|
| root | `format`, `schemaVersion`, `project`, `extensions` |
| project | `mapping`, `rules` |
| mapping | `inputCanvas`, `screen`, `grid`, `region`, `hardwareTopology` |
| InputCanvas | `id`, `resolution` |
| Screen | `id`, `name`, `resolution`, `mappingRegions`, `cabinetGrids` |
| CabinetGrid | `id`, `screen`, `name`, `columns`, `rows`, `cabinetWidth`, `cabinetHeight`, `ordering` |
| GridOrdering | `numbering`, `startCorner`, `direction`, `snake` |
| MappingRegion | `id`, `inputCanvas`, `screen`, `grid`, `position`, `size` |
| HardwareTopology | `processors`, `ports`, `receivers`, `cabinets`, `modules`, `processorOrder`, `receiverOrder` |
| Processor | `id`, `name`, `portCount` |
| Port | `id`, `processor`, `index`, `receiverCapacity` |
| Receiver | `id`, `processor`, `port`, `index`, `cabinets`, optional `pixelCapacity` |
| Cabinet | `id`, `grid`, `column`, `row`, `origin`, `width`, `height`, `pixelWidth`, `pixelHeight`, `moduleColumns`, `moduleRows`, `rotation`, `flipH`, `flipV` |
| StoredModuleV1 | `id`, `cabinet`, `column`, `row`, `width`, `height`, `pixelWidth`, `pixelHeight` |
| receiverOrder entry | `port`, `receivers` |
| Size | `width`, `height` |
| XY | `x`, `y` |

Runtime-kinds соответствуют §5 принятого 7C, с двумя отличиями: Module не содержит localX/localY; каждое сериализуемое число должно быть конечным JSON number. Dimensional/capacity/geometry safe-integer bounds остаются semantic checks 7C и движков. Schema parsing не добавляет positive/safe-integer semantics к полям, не используемым pipeline.

`format` строго равен `ledmap`; `schemaVersion` — числовой целочисленный дискриминатор, не строка и не app version. ID/name/reference — строки без trimming, нормализации Unicode или перегенерации IDs. Empty string не получает нового ограничения, отсутствующего в принятом core.

Enum tokens зафиксированы literal unions v1 в §4 и соответствуют текущим core tokens: Numbering `row/column`, Direction `left-to-right/right-to-left/top-to-bottom/bottom-to-top`, StartCorner `top-left/top-right/bottom-right/bottom-left`, Snake boolean. Алиасы `Row`, `LTR`, `ON` и numeric enums не преобразуются молча. Совместимость ordering по-прежнему не становится новой semantic проверкой 7D.

**Amendment к ADR-011:** для schema v1 этот контракт заменяет (supersedes) только положение о нормализации алиасов на serialization layer. Parser v1 принимает исключительно canonical tokens; aliases отклоняются как INVALID_SCHEMA, без silent normalization. Положение ADR-011 о canonical core tokens и presentation labels в app сохраняется. Замена закреплена в ADR-023: `ADR-011 alias-normalization clause — superseded by ADR-023`.

Entity/reference arrays обязательны. Empty arrays допустимы на schema level и могут быть отклонены 7C. `Receiver.pixelCapacity` отсутствует либо является конечным number; JSON null не означает unbounded. Для runtime save только у этого optional поля `undefined` нормализуется в отсутствие.

`rules` на schema level — JSON array без schema конкретных descriptors. Непустой JSON array может пройти parse, но не успешный semantic load/save: 7C/7B вернёт REMAP_UNSUPPORTED_RULE после успешного Mapping. Parser не интерпретирует `id/version/type`, не вводит production rule types. Не-JSON runtime values в rules отклоняются границей сериализации до semantic validation.

`Module.localX/localY`, любые другие derived поля и неизвестные поля вне `extensions` в файле дают ошибку схемы; они не игнорируются и не переносятся в extensions автоматически.

## 6. Extensions

Определено единственное root-поле `extensions`, содержащее JSON object. Вложенные keys/records не ограничены схемой core; scalar root extensions, null или array вместо object недопустимы.

Opaque values сохраняются по значению без интерпретации, переименования или автоматического удаления. Object key insertion order не сохраняется; array order сохраняется. Keys вроде `__proto__`, `constructor`, numeric-looking keys и Unicode являются обычными собственными JSON keys, не командами для прототипов; копирование/построение результата не должно менять prototype цепочки.

Extensions не передаются в `validateProject()` и не влияют на mapping/addressing/validation. Поддержка metadata не является механизмом включения будущих rule types или hardware profiles. В producer-контракте запрещено использовать extensions для сериализации core derived snapshots, caches или diagnostics; содержимое opaque metadata core не пытается классифицировать по эвристике имён.

Ограничения JSON tree применяются и к extensions: finite numbers, plain records/arrays, отсутствие functions, undefined, symbols, bigint, accessors и циклов. Разделяемые acyclic references в runtime допустимы и записываются как повторённые JSON значения; identity объектов не является persisted semantics.

Plain record имеет prototype `Object.prototype` или null. Проверяются все собственные string keys, включая non-enumerable: их data values сохраняются, а property attributes не являются persisted semantics. Accessors и symbol keys отклоняются без чтения значения. Массив имеет только собственные последовательные index data properties и стандартное `length`; дополнительные properties, holes и array subclasses не поддерживаются. Замороженные records/arrays допустимы. Эти правила также действуют на runtime source при save и document при migrate.

## 7. Публичные операции и ошибки

```ts
interface SerializeProjectInput {
  readonly project: ValidateProjectInput
  readonly extensions?: JsonObject
}

interface LoadedProject {
  readonly project: ValidateProjectInput
  readonly extensions: JsonObject
  readonly validation: ProjectValidationReport
}

class SerializationError extends DomainError {
  readonly path: readonly (string | number)[]
  readonly validation?: ProjectValidationReport
}

function parseProject(text: string): ProjectDocumentV1
function migrateProjectDocument(value: unknown): ProjectDocumentV1
function loadProject(text: string): LoadedProject
function serializeProject(input: SerializeProjectInput): string
```

`LoadedProject.validation` всегда имеет `valid: true`; это derived результат проверки, не часть `.ledmap`. Неуспешный load не возвращает partially usable LoadedProject. TypeScript input types не заменяют runtime guards на parse/save/migration boundaries.

Codes нового `SerializationError`:

| Code | Условие |
|---|---|
| `SERIALIZATION_INVALID_INPUT` | Неверный runtime argument, не-JSON value/cycle/accessor/class instance, недопустимый undefined или sparse array при save/migrate |
| `SERIALIZATION_INVALID_JSON` | Ошибка JSON text syntax, comments/trailing comma, текст с BOM; числовой overflow после чтения рассматривается отдельно схемой |
| `SERIALIZATION_DUPLICATE_KEY` | Повтор одного decoded member name в одном JSON object |
| `SERIALIZATION_INVALID_SCHEMA` | Неверный envelope/field kind/enum, неизвестное поле, отсутствующее обязательное поле, non-finite parsed number |
| `SERIALIZATION_UNSUPPORTED_VERSION` | Нет утверждённой схемы/migration path для целочисленной версии документа |
| `SERIALIZATION_PROJECT_INVALID` | `validateProject()` вернул `valid: false`; ошибка содержит полный неизменённый report в `validation` |

Error.path для schema/runtime ошибок указывает document/runtime argument path соответствующей операции. Для parse syntax — `[]`; для duplicate key — object path плюс повторённый decoded key; для unsupported version — `['schemaVersion']`; для PROJECT_INVALID — `['project']`. Paths внутри `validation.diagnostics` остаются относительно ValidateProjectInput, без добавления `project` и без изменения code/message.

Metadata ошибки (`path`, `validation`, их вложенные records/arrays) immutable; stack не является частью контракта. Message объясняет причину, но не парсится потребителем. Неожиданные исключения реализации не превращаются в SerializationError; 7C unexpected exceptions повторно выбрасываются без маскировки.

## 8. Parse и version dispatch

Нормативная последовательность `parseProject(text)`:

1. Проверить runtime string argument; неверный тип → INVALID_INPUT.
2. Разобрать JSON syntax без reviver/user callbacks. Не принимать BOM, comments, trailing commas и trailing non-whitespace text. Обычный JSON whitespace допустим.
3. Выявить duplicate member names до их потери при построении object. Например, `"id"` и `"\u0069d"` в одном object — duplicate. Проверка только через уже полученный `JSON.parse()` object недостаточна. Duplicate detection не должна искать keys регулярным выражением без учёта strings/nesting.
4. Проверить отсутствие non-finite numeric results от parsing, например `1e400`: INVALID_SCHEMA с path числа. Это ограничение JSON-представления, не geometry validation.
5. Передать разобранное значение в `migrateProjectDocument()`; получить detached deeply immutable document текущей версии.

`migrateProjectDocument(value)` проверяет plain JSON tree, обязательный envelope discriminator (`format`, `schemaVersion`), затем version dispatch. SchemaVersion — non-negative safe integer: отсутствующий, дробный, отрицательный, string или unsafe version → INVALID_SCHEMA; `0` или `>1` → UNSUPPORTED_VERSION. Для неподдерживаемой версии не интерпретируется project payload как v1.

Non-finite number, переданный непосредственно как runtime value в migrate/save, нарушает JSON input boundary и даёт INVALID_INPUT. Отличие от parsed overflow выше определяется публичной операцией, а не произвольным выбором кода.

Для version 1 выполняется strict schema check §5 и создаётся detached deeply immutable DTO. Identity migration не означает возврат mutable input по ссылке. Не вызываются 7C или engines; schema-valid семантически неверный документ допустим как результат parse/migrate.

При нескольких нарушениях syntax имеет приоритет над schema, проверка discriminator/version — над v1 payload schema. Между несколькими schema violations достаточно первой ошибки; порядок обхода известных полей — таблица §5, arrays — возрастание индекса. В каждом closed record после проверки известных полей неизвестные собственные string keys проверяются в лексикографическом порядке UTF-16 code units, включая numeric-looking keys, без зависимости от JS property enumeration или localeCompare. Полнота всех ошибок формата не обещается.

## 9. Semantic load и source reconstruction

`loadProject(text)` вызывает parse/version dispatch, затем создаёт новый runtime `ValidateProjectInput` из DTO:

- сохраняет все source values, references и array orders;
- восстанавливает Module.localX = column × width, localY = row × height;
- передаёт rules в 7C без трактовки descriptor fields;
- не запускает allocation, не генерирует отсутствующие IDs, не заполняет topology и не сортирует orders.

Восстановление localX/localY не пытается решить geometry inconsistencies. Если произведение даёт unsafe/non-finite результат, он передаётся runtime validation как number и отклоняется существующим движком; file source values при этом не изменяются. Дополнительная самостоятельная validation формул layout/capacity/addressing не появляется.

Затем выполняется ровно один `validateProject(project)`. При `valid: false` бросается PROJECT_INVALID с этим report. Report может иметь blocked stages и не обещает всех semantic defects. При успехе возвращаются глубоко immutable `project`, `extensions`, `validation`. Ни snapshots, ни serialization metadata внутрь runtime project не добавляются.

Существующие domain factories не используются для нормализации/defaulting прочитанной конфигурации: форма v1 полная, а semantic validation делегирована принятому 7C. Это предотвращает замену исходного engine error другим factory error или молчаливый default вместо отсутствующего поля.

## 10. Save boundary

`serializeProject({ project, extensions })`:

1. Проверяет собственные data properties runtime-входа и возможность точного JSON-представления. Принимает mutable или deeply frozen plain records/arrays; getters/toJSON не вызывает. Symbol keys, functions, bigint, non-finite values, cyclic references, sparse arrays и недопустимые undefined отклоняются, а не исчезают при JSON.stringify.
2. Проверяет closed field set: wrapper содержит только обязательный `project` и optional `extensions`; runtime project соответствует §5, с localX/localY как обязательными runtime fields Module. Unknown/derived fields сверх этого набора не удаляются молча. `extensions` отсутствует/undefined → `{}`; optional Receiver.pixelCapacity undefined → поле опущено. Эти два исключения учитываются уже при проверке JSON input boundary в шаге 1. Другие defaults не добавляются.
3. Вызывает `validateProject(project)` ровно один раз на исходных runtime values, включая Module.localX/localY. При failed report → PROJECT_INVALID, текст не возвращается.
4. Создаёт persisted DTO, исключая только нормативно derived Module.localX/localY. Вставляет `format: 'ledmap'`, `schemaVersion: 1`, extensions. Сериализует по §11.

Структурные ограничения wire format могут быть строже 7C: например, NaN в physical origin может не влиять на текущий pipeline, но не может быть без потерь записан JSON number и поэтому не сохраняется. Это ограничение формата, а не изменение семантики `validateProject().valid`.

Никаких изменений исходного project, замораживания caller-owned объектов или удержания ссылок после возврата. Encoding configuration из будущих hardware profiles и UI state не включаются автоматически.

## 11. Canonical output

Canonical serializer выдаёт строку JSON с отступом два пробела, LF line endings, ровно одним LF после последней `}` и без BOM. App пишет UTF-8 без BOM. Compact и pretty варианты API в v1 не вводятся.

Порядок schema object keys — §5; отсутствующий optional pixelCapacity не порождает null. В extensions object keys рекурсивно сортируются лексикографически по UTF-16 code units, без localeCompare; это правило действует и на numeric-looking keys. Реализация не должна полагаться на автоматическое enumeration integer-like keys обычного JS object для получения такого порядка. JSON arrays **никогда не сортируются**, в том числе entity arrays.

String escaping и представление finite numbers — как JSON.stringify для отдельного scalar value; `-0` канонизируется в `0`. Нет Unicode normalization, округления к заданной точности, замены null/undefined, auto-clamp или преобразования строк в числа.

Входной whitespace, порядок object keys, выбор JSON escapes и числовая лексема (`1`, `1.0`, `1e0`) не являются source-of-truth. Числа имеют runtime-семантику JavaScript number после parsing; формат v1 не является произвольной точностью decimal/bigint. Round-trip сравнивает числовые значения, не исходные лексемы.

Все arrays сохраняют исходный порядок: `processorOrder`, `receiverOrder`, каждый receivers/cabinets list, а также processors/ports/receivers/cabinets/modules как entity collections. Нельзя подменять явный order сортировкой по ID, Receiver.index, physical position или label.

Повторный save одинаковых source values и extensions MUST возвращать byte-identical UTF-8 output. Эквивалентная перестановка entity arrays может сохранять mapping, но даёт другой текст: canonicalization не меняет array order.

## 12. Round-trip invariants

Пусть `S` — сериализуемый runtime input, проходящий 7C, `J = serializeProject(S)`, `L = loadProject(J)`. Тогда:

```text
L.validation.valid === true
L.project == normalize(S.project)
L.extensions == normalize(S.extensions ?? {})
serializeProject({ project: L.project, extensions: L.extensions }) === J
```

`normalize` допускает только: `-0 → 0`, отсутствие optional pixelCapacity вместо undefined, потерю object identity/property insertion order. Module.localX/localY восстанавливаются в те же значения, поскольку до save была выполнена 7C. Любое изменение ID, reference, assignment, array order, capacity или geometry — нарушение round-trip.

Для schema-valid и semantically valid v1 текста `T`:

```text
L = loadProject(T)
canonical(T) = serializeProject({ project: L.project, extensions: L.extensions })
canonical(canonical(T)) === canonical(T)
```

Передача whole LoadedProject в serializer не является частью API: поле `validation` — derived и не входит в SerializeProjectInput.

После загрузки повторный `resolveMapping(L.project.mapping)` и `resolveRemap({ mapping, rules: L.project.rules })` должны воспроизводить прежние forward/reverse результаты для всех допустимых pixels/keys. Derived values никогда не используются как shortcut вместо rebuild.

## 13. Versioning и migration skeleton

`schemaVersion` относится к persisted document, а не к версии приложения, ADR, API core или Remap descriptor.version. Reader не угадывает версию по полям.

В текущем scope есть только v1. Нет настоящих migrations и выдуманной поддержки version 0, ранних drafts, Alpha UI state или arbitrary old JSON. Минимальный skeleton — централизованный version dispatch с identity v1 path и явным отказом при отсутствии пути. Migration registry не является публичным plugin API.

Будущая migration должна быть pure/deterministic, иметь собственные source/target schemas и normative fixtures, сохранять source semantics/opaque extensions/explicit orders, возвращать новый document и проходить target schema check. Последовательность только по явно зарегистрированным переходам; никаких silent downgrade, fallback к «последней понятной версии» или потери unknown fields ради успешного чтения.

Изменение обязательных полей, enum vocabulary, persisted semantics или разрешение concrete rules требует отдельного versioning решения и fixtures. 7D v1 не создаёт фиктивных migration tests `v0 → v1`; проверяются identity/current-version и отказ для unsupported versions.

## 14. Минимальная v1 fixture

Ниже полностью заданный документ для одного Cabinet и одного Module, 2×3 pixels. Углублённые REF-001 fixtures задаются из существующих source-конфигураций без derived fields.

```json
{
  "format": "ledmap",
  "schemaVersion": 1,
  "project": {
    "mapping": {
      "inputCanvas": { "id": "input", "resolution": { "width": 2, "height": 3 } },
      "screen": { "id": "screen", "name": "Screen", "resolution": { "width": 2, "height": 3 }, "mappingRegions": ["region"], "cabinetGrids": ["grid"] },
      "grid": { "id": "grid", "screen": "screen", "name": "Grid", "columns": 1, "rows": 1, "cabinetWidth": 100, "cabinetHeight": 100, "ordering": { "numbering": "row", "startCorner": "top-left", "direction": "left-to-right", "snake": false } },
      "region": { "id": "region", "inputCanvas": "input", "screen": "screen", "grid": "grid", "position": { "x": 0, "y": 0 }, "size": { "width": 2, "height": 3 } },
      "hardwareTopology": {
        "processors": [{ "id": "P", "name": "Processor", "portCount": 1 }],
        "ports": [{ "id": "P:0", "processor": "P", "index": 0, "receiverCapacity": 1 }],
        "receivers": [{ "id": "R", "processor": "P", "port": "P:0", "index": 0, "cabinets": ["C"], "pixelCapacity": 6 }],
        "cabinets": [{ "id": "C", "grid": "grid", "column": 0, "row": 0, "origin": { "x": 0, "y": 0 }, "width": 100, "height": 100, "pixelWidth": 2, "pixelHeight": 3, "moduleColumns": 1, "moduleRows": 1, "rotation": 0, "flipH": false, "flipV": false }],
        "modules": [{ "id": "M", "cabinet": "C", "column": 0, "row": 0, "width": 100, "height": 100, "pixelWidth": 2, "pixelHeight": 3 }],
        "processorOrder": ["P"],
        "receiverOrder": [{ "port": "P:0", "receivers": ["R"] }]
      }
    },
    "rules": []
  },
  "extensions": {}
}
```

Пример сокращает whitespace для чтения; canonical golden fixture должна иметь точное форматирование §11.

## 15. Acceptance plan будущей реализации

1. **Schema/golden:** полный минимальный документ, REF-001 identity/offset, exact canonical text, field order, LF/final newline, optional capacity omission, strict unknown-field rejection на каждом entity level.
2. **Source vs derived:** все source fields/IDs/explicit orders сохранены; localX/localY отсутствуют в файле и восстановлены; runtime несогласованные local coordinates не «лечатся» save. Попытка загрузить derived cells/spans/dataIndex/diagnostics вне extensions отвергается.
3. **Syntax:** malformed JSON, trailing text/comma, comments, BOM, escaped strings, duplicate keys на root и nested уровнях, escaped-name duplicate. Необычный whitespace и object key order принимаются и канонизируются.
4. **Numbers/strings:** NaN/Infinity/undefined/bigint/functions runtime, parsed overflow, -0 normalization, MAX_SAFE_INTEGER, finite невалидные geometry values через 7C; IDs с пробелами/Unicode без normalization и coercion.
5. **Extensions:** deep value preservation, sorted keys включая numeric-looking/Unicode, preserved array order, null/scalars nested; собственные keys `__proto__`/constructor не меняют prototypes; cycles/accessors/toJSON не исполняются и не теряются молча.
6. **Boundary:** parse structurally valid semantic defects успешен; load/save дают PROJECT_INVALID с точным 7C report. Nonempty JSON rules получают REMAP_UNSUPPORTED_RULE внутри report, malformed Mapping блокирует Remap по принятому 7C. Unexpected exception сохраняется.
7. **Versions:** отсутствующий/неправильный discriminator, current v1 identity clone, unsupported 0/future version, никакого implicit migration/defaulting/ID generation. Mutable input migrate не удерживается и не замораживается.
8. **Round-trip:** два последовательных save/load дают стабильные bytes и source equality с оговорённой normalization; caller input не мутируется. Loaded document/project/extensions/report и paths deeply immutable.
9. **Behavior reconstruction:** REF-001 identity и offset после load; 11 anchors × 2, forward/reverse comparison с исходной конфигурацией, полные acceptance sweeps по 196 608 pixels на fixture в tests. C05/C08, Receiver boundary и Port reset сохраняются; existing 7A/7B regression также остаётся.
10. **Orders/scale:** multi-processor, nontrivial receiverOrder/Receiver.cabinets, shuffled entity collections; отсутствие сортировки arrays, allocator и pixel-sized storage. MAX_SAFE_INTEGER pixels на компактной topology не увеличивают serialized data до pixel count.
11. **Regression/gates:** сохранить 827 baseline tests без изменения expected math; `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:smoke`, `git diff --check`. Новый validation report с candidate SHA, accepted docs baseline, фактическим числом тестов и границей local/CI.

## 16. Deliverables и gates

Текущий deliverable — docs-only acceptance gate: эта спецификация 1.0/Accepted, ADR-023 с amendment к ADR-011 и статус docs-gate в TODO. Commit содержит только `docs/specs/LEDMAP-SERIALIZATION-001.md`, `docs/DECISIONS.md` и `TODO.md`. Он не вводит production, новые executable tests, app Open/Save или изменение закрытых 7A/7B/7C.

Вопросы persisted processorOrder и формата extensions закрыты ADR-023; amendment alias-normalization clause ADR-011 зафиксирован по §5. Остальные положения ADR-011 и принятые runtime contracts 7A/7B/7C не переопределяются. После проверки SHA acceptance-коммита пользователь отдельно разрешает production 7D; принятие документационного контракта само по себе production не разрешает.

Будущая реализация ожидается в `packages/core/src/serialization/`, с отдельными tests/golden fixtures и `docs/serialization-7d-validation.md`; новые runtime dependencies не планируются. Нормативная schema — этот документ; отдельный machine-readable schema artifact, если добавляется, должен точно воспроизводить его правила, а не создавать второй расходящийся контракт.
