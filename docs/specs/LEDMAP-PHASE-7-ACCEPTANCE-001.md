# LEDMAP-PHASE-7-ACCEPTANCE-001

**Название:** Phase 7A Mapping — Production Acceptance & Integration Gate
**Проект:** LedMAP
**Версия:** 1.0 Draft
**Статус:** Normative Acceptance Contract
**Target:** Phase 7A — Mapping
**Upstream contract:** `LEDMAP-MAPPING-001`
**Semantic baseline:** `247ed4abb499394f8a49ab58b1d3340166769241`
**Previous accepted production baseline:** `63f340a5e181f98b93713cafcdc2d56ebd37ce1f`
**Следующий подэтап после успешного Gate:** Phase 7B — Remap contract

---

# 1. Назначение

Этот документ определяет обязательные критерии приёмки production-реализации:

```text
Phase 7A — Mapping
```

Он не определяет новую Mapping-математику.

Нормативная Mapping-семантика задаётся:

```text
LEDMAP-MAPPING-001
ADR-020
```

Этот документ отвечает только на вопрос:

```text
реализован ли принятый контракт 7A
полностью, корректно и без регрессии?
```

---

# 2. Gate semantics

Gate имеет бинарный результат:

```text
PASS
```

или:

```text
FAIL
```

Частично зелёная реализация не считается принятой.

Не допускается:

```text
PASS WITH WARNINGS
PARTIAL PASS
PASS EXCEPT ...
```

Если хотя бы один обязательный критерий нарушен:

```text
Gate = FAIL
```

до исправления либо отдельного изменения нормативного контракта.

---

# 3. Что закрывает этот Gate

Успешный Gate закрывает:

```text
Phase 7A — Mapping
```

и подтверждает production-реализацию:

```text
InputCanvas
InputCanvasId

MappingRegion.inputCanvas

resolveMapping()

mapInputPixel()

unmapHardwarePixel()

ResolvedPixelMap

physical Cabinet cell lookup

Mapping validation

Mapping ↔ Hardware integration
```

---

# 4. Что этот Gate НЕ закрывает

Успешный Phase 7A Gate НЕ означает завершение всей Phase 7.

Отдельными подэтапами остаются:

```text
7B — Remap
7C — Project Validation
7D — Serialization
```

Gate также не принимает:

```text
OutputRect

Input → Output transforms

scale / resampling

rotation / flip mapping

multi-region composition

multi-grid composition

clipping

wrap

dead-LED rules

HardwareProfile

vendor export

UI Mapping editor

serialization / migration
```

---

# 5. Scope freeze

Production-кандидат Phase 7A MUST оставаться в границах принятого `LEDMAP-MAPPING-001`.

Разрешено реализовать:

```text
InputCanvas / InputCanvasId

required MappingRegion.inputCanvas

mapping-engine

resolveMapping

mapInputPixel

unmapHardwarePixel

compact immutable ResolvedPixelMap

physical cell lookup

mapping validation

tests / fixtures

Phase 7A validation report
```

Mapping Engine MUST переиспользовать существующие:

```text
resolveHardware()
addressPixel()
locatePixel()
```

---

# 6. Forbidden scope changes

В рамках Phase 7A production commit запрещено без отдельного дефекта, обоснования и нового решения изменять математику:

```text
Cabinet Engine

Hardware Engine 6A

Hardware allocation 6B

Receiver ordering

Port-local dataIndex

globalRemapIndex

capacity semantics

Module addressing

Pixel addressing
```

Также запрещено вводить:

```text
Remap 7B

serialization

новый UI

OutputRect

Mapping transforms

HardwareProfile implementation
```

---

# 7. Candidate revision

Для приёмки MUST быть предоставлен конкретный:

```text
Candidate SHA
```

Например:

```text
feat(core): implement mapping phase 7a
```

Acceptance выполняется для конкретного SHA, а не для working tree вообще.

Если `LEDMAP-PHASE-7-ACCEPTANCE-001` коммитится отдельным docs-only commit перед production-кодом:

```text
semantic baseline
=
247ed4abb499394f8a49ab58b1d3340166769241
```

остаётся неизменным,

а mechanical diff base MAY быть последним docs-only SHA перед production commit.

---

# 8. Required domain model

Production MUST содержать:

```ts
InputCanvasId
```

и:

```ts
interface InputCanvas {
  readonly id: InputCanvasId
  readonly resolution: Size
}
```

Также `MappingRegion` MUST иметь обязательный:

```ts
inputCanvas: InputCanvasId
```

Не допускается:

```text
optional inputCanvas
```

или implicit default InputCanvas.

---

# 9. Required Mapping API

Production MUST экспортировать принятые API:

```ts
function resolveMapping(
  input: ResolveMappingInput
): ResolvedPixelMap
```

```ts
function mapInputPixel(
  mapping: ResolvedPixelMap,
  inputPixel: InputPixel
): MappedPixel
```

```ts
function unmapHardwarePixel(
  mapping: ResolvedPixelMap,
  key: PortPixelKey
): MappedPixel
```

Имена или semantic responsibility не должны тихо заменяться альтернативным API.

---

# 10. Identity-translation invariant

Phase 7A реализует:

```text
source rect
        ↓
identity translation
        ↓
full CabinetGrid
```

Target origin:

```text
Screen (0,0)
```

Для:

```text
Input = (ix, iy)
Region.position = (sx, sy)
```

должно выполняться:

```text
gx = ix - sx
gy = iy - sy
```

и:

```text
ScreenCoordinate = (gx, gy)
```

В Phase 7A отсутствуют:

```text
scale
rotate
flip
output offset
arbitrary OutputRect
```

---

# 11. Physical cell invariant

Cabinet выбирается исключительно по physical Grid cell:

```text
column = floor(gx / cabinetPixelWidth)
row    = floor(gy / cabinetPixelHeight)
```

Cabinet-local coordinate:

```text
localX = gx mod cabinetPixelWidth
localY = gy mod cabinetPixelHeight
```

Physical lookup MUST NOT использовать:

```text
cabinetIndex
cabinetOrder
displayNumber
signal order
lexicographic CabinetId order
array order
```

---

# 12. Ordering independence invariant

Mapping geometry MUST быть независима от:

```text
Numbering
Direction
Snake
```

при неизменной explicit hardware topology.

То есть изменение:

```text
Grid.ordering
```

не должно переставлять physical Cabinet cells.

Mapping Engine не имеет права повторно применять hardware/signal ordering.

---

# 13. Hardware boundary

После определения physical Cabinet Mapping Engine MUST передать:

```text
CabinetId
+
Cabinet-local coordinate
```

в существующий:

```text
addressPixel()
```

Reverse MUST начинаться через:

```text
locatePixel()
```

Mapping Engine не должен самостоятельно вычислять:

```text
Receiver prefix
Port prefix
dataIndex
globalRemapIndex
Cabinet signal index
```

---

# 14. REF-001 fixtures

Обязательны две fixtures.

## Identity fixture

```text
InputCanvas:       512 × 384
Region.position:   (0,0)
Region.size:       512 × 384
Screen:            512 × 384
Grid:              4 × 3
Cabinet:           128 × 128 px
```

Source rect:

```text
[0,512) × [0,384)
```

## Offset fixture

```text
InputCanvas:       1920 × 1080
Region.position:   (100,50)
Region.size:       512 × 384
Screen:            512 × 384
Grid:              4 × 3
Cabinet:           128 × 128 px
```

Source rect:

```text
[100,612) × [50,434)
```

---

# 15. Mandatory 11 anchors

Следующие 11 anchors являются обязательными acceptance anchors.

Processor:

```text
P01
```

для всех строк.

|   # | Identity Input / Screen | Offset Input | Cabinet/local     | Module/local        | Receiver / Port | dataIndex |
| --: | ----------------------- | ------------ | ----------------- | ------------------- | --------------- | --------: |
| A01 | `(0,0)`                 | `(100,50)`   | C01 / `(0,0)`     | C01/M01 / `(0,0)`   | R01 / P01:01    |         0 |
| A02 | `(31,31)`               | `(131,81)`   | C01 / `(31,31)`   | C01/M01 / `(31,31)` | R01 / P01:01    |      1023 |
| A03 | `(32,0)`                | `(132,50)`   | C01 / `(32,0)`    | C01/M02 / `(0,0)`   | R01 / P01:01    |      1024 |
| A04 | `(127,127)`             | `(227,177)`  | C01 / `(127,127)` | C01/M16 / `(31,31)` | R01 / P01:01    |     16383 |
| A05 | `(128,0)`               | `(228,50)`   | C02 / `(0,0)`     | C02/M01 / `(0,0)`   | R01 / P01:01    |     16384 |
| A06 | `(511,127)`             | `(611,177)`  | C04 / `(127,127)` | C04/M16 / `(31,31)` | R01 / P01:01    |     65535 |
| A07 | `(384,128)`             | `(484,178)`  | C08 / `(0,0)`     | C08/M01 / `(0,0)`   | R02 / P01:01    |     65536 |
| A08 | `(0,128)`               | `(100,178)`  | C05 / `(0,0)`     | C05/M01 / `(0,0)`   | R02 / P01:01    |    114688 |
| A09 | `(127,255)`             | `(227,305)`  | C05 / `(127,127)` | C05/M16 / `(31,31)` | R02 / P01:01    |    131071 |
| A10 | `(0,256)`               | `(100,306)`  | C09 / `(0,0)`     | C09/M01 / `(0,0)`   | R03 / P01:02    |         0 |
| A11 | `(511,383)`             | `(611,433)`  | C12 / `(127,127)` | C12/M16 / `(31,31)` | R03 / P01:02    |     65535 |

Все поля `MappedPixel` MUST совпадать с expected result, а не только `dataIndex`.

---

# 16. Snake boundary anchors

Особенно обязательны:

```text
A07 — C08
A08 — C05
```

Physical row остаётся:

```text
C05 C06 C07 C08
```

в то время как signal order REF-001:

```text
C08 → C07 → C06 → C05
```

Acceptance MUST доказать:

```text
Snake changes signal order
but does not change physical cell
```

---

# 17. Port boundary invariant

A09:

```text
P01:01
dataIndex = 131071
```

A10:

```text
P01:02
dataIndex = 0
```

Таким образом Port boundary MUST сбрасывать:

```text
dataIndex
```

но отдельный существующий:

```text
globalRemapIndex
```

продолжает:

```text
131071 → 131072
```

`globalRemapIndex` не добавляется в `MappedPixel`.

---

# 18. Sweep 1 — Identity fixture

MUST быть выполнен полный forward sweep:

```text
512 × 384
=
196608 Input pixels
```

Для каждого pixel внутри Identity source rect:

```text
InputPixel
        ↓
mapInputPixel()
        ↓
MappedPixel
```

Expected result MUST вычисляться независимо от production Mapping API.

Проверяются:

```text
inputCoordinate
screenCoordinate

cabinet
cabinetCoordinate

module
moduleCoordinate

processor
port
receiver
dataIndex

full PixelAddress
```

---

# 19. Sweep 2 — Offset fixture

Второй независимый полный sweep:

```text
196608 Input pixels
```

для:

```text
Region.position = (100,50)
```

должен доказать:

```text
Input coordinate changes
```

но:

```text
Screen/Grid geometry
Cabinet selection
Module selection
Hardware address
```

соответствуют Identity fixture после удаления input offset.

То есть:

```text
Identity (gx,gy)
```

и:

```text
Offset (gx+100,gy+50)
```

MUST приводить к одной и той же:

```text
Screen coordinate
Cabinet
Cabinet local pixel
Module
Hardware key
```

---

# 20. Hardware key uniqueness

Для каждого full sweep MUST быть собрано:

```text
196608
```

уникальных:

```text
(processor, port, dataIndex)
```

для REF-001.

Не допускаются два разных Input pixels с одинаковым Hardware Key.

---

# 21. Reverse traversal

Для обеих fixtures MUST независимо выполняться полный reverse traversal по всем занятым Port-local диапазонам topology.

```text
PortPixelKey
        ↓
unmapHardwarePixel()
        ↓
MappedPixel
```

Expected reverse result не должен строиться вызовом forward production Mapping API.

Reverse traversal должен покрыть:

```text
196608 mapped pixels
```

ровно один раз.

---

# 22. Forward → Reverse invariant

Для каждого Input pixel:

```text
input
 ↓
mapInputPixel
 ↓
hardware key
 ↓
unmapHardwarePixel
 ↓
input'
```

обязательно:

```text
input' == input
```

Сравнивается также весь `MappedPixel`.

---

# 23. Reverse → Forward invariant

Для каждого занятого Hardware Key:

```text
key
 ↓
unmapHardwarePixel
 ↓
InputPixel
 ↓
mapInputPixel
 ↓
key'
```

обязательно:

```text
key' == key
```

---

# 24. Source bounds

Для Offset fixture следующие coordinates MUST быть отклонены:

```text
(99,50)
(100,49)
(612,433)
(611,434)
```

Потому что source rect:

```text
[100,612) × [50,434)
```

имеет:

```text
left/top    inclusive
right/bottom exclusive
```

---

# 25. Invalid coordinates

MUST быть протестированы:

```text
negative

fractional

NaN

Infinity

unsafe integer
```

для применимых query/model coordinates.

Ошибки не должны приводить к:

```text
clamp
wrap
rounding
silent coercion
```

---

# 26. Arithmetic overflow

MUST существовать отдельные tests для safe-integer overflow:

```text
grid dimensions multiplication

pixel count multiplication

source boundary addition

coordinate addition
```

Overflow MUST быть обнаружен до использования повреждённого derived value.

Expected code:

```text
MAPPING_OVERFLOW
```

где нарушение относится к Mapping Engine.

---

# 27. Mapping error taxonomy

Нормативные Mapping codes:

```text
MAPPING_INVALID_VALUE

MAPPING_OVERFLOW

MAPPING_UNKNOWN_REFERENCE

MAPPING_DUPLICATE

MAPPING_INCOMPLETE

MAPPING_SIZE_MISMATCH

MAPPING_OUT_OF_RANGE

MAPPING_UNSUPPORTED_PROFILE
```

Production MUST различать их от существующих Hardware errors.

---

# 28. MAPPING_DUPLICATE vs HARDWARE_DUPLICATE

Это отдельный обязательный acceptance case.

## MAPPING_DUPLICATE

Два **разных CabinetId** претендуют на одну physical Grid cell:

```text
Cabinet A → cell (x,y)
Cabinet B → cell (x,y)
```

Expected:

```text
MAPPING_DUPLICATE
```

## HARDWARE_DUPLICATE

Один и тот же CabinetId дублируется во входной HardwareTopology:

```text
Cabinet A
Cabinet A
```

Expected:

```text
HARDWARE_DUPLICATE
```

Ошибка должна исходить из существующего `resolveHardware()` и не переименовываться Mapping Engine.

---

# 29. Geometry acceptance

Обязательные negative geometry cases:

```text
missing physical cell

out-of-range physical cell

duplicate physical cell

Cabinet belonging to another Grid

invalid Screen reference

invalid Region reference

invalid Grid reference

invalid InputCanvas reference

incomplete Screen membership

additional unsupported Grid

additional unsupported MappingRegion

different Cabinet pixel size

Region/Grid dimension mismatch

Screen/Grid dimension mismatch
```

---

# 30. Physical size must not drive pixel geometry

MUST существовать валидная fixture, в которой:

```text
Cabinet.width / height
```

отличаются по семантике/значениям от:

```text
Cabinet.pixelWidth / pixelHeight
```

Mapping geometry MUST рассчитываться по:

```text
pixelWidth
pixelHeight
```

а не по physical mm geometry.

---

# 31. Grid shape coverage

Обязательны дополнительные валидные cases:

```text
1 × 1

1 × N

N × 1
```

и rectangular Cabinet/module pixel geometry.

Реализация не должна предполагать square Grid или square Cabinet.

---

# 32. Ordering independence test

При одинаковой explicit HardwareTopology:

```text
reorder entity arrays
change labels
change supported Grid.ordering
```

не должно менять:

```text
physical Cabinet lookup
Screen coordinate
Cabinet-local coordinate
Hardware key
```

если сама explicit topology остаётся неизменной.

---

# 33. Alternative explicit topology test

Если explicit HardwareTopology изменена корректно:

```text
physical geometry
```

MUST остаться той же,

а:

```text
Hardware Address
```

MAY измениться строго согласно результату Hardware Engine 6A.

Mapping Engine не имеет права компенсировать или повторно преобразовывать Hardware result.

---

# 34. No implicit allocation

`resolveMapping()` MUST NOT запускать:

```text
allocateHardware()
```

Неполная topology должна быть отклонена существующими Hardware validations.

Mapping resolver не заполняет отсутствующие assignments автоматически.

---

# 35. Multi-processor acceptance

Обязательна topology одного Grid, распределённого между несколькими Processors.

Test MUST включать ситуацию, где два разных Processor имеют одинаковый численный:

```text
dataIndex = 0
```

на своих Port streams.

Hardware key остаётся уникальным благодаря:

```text
processor
+
port
+
dataIndex
```

Mapping Engine не имеет права рассматривать bare `dataIndex` как глобальный адрес.

---

# 36. Empty / unknown hardware lookup

Reverse MUST корректно отвергать:

```text
unknown Processor

unknown Port

dataIndex outside occupied span

dataIndex inside empty Port
```

с существующей Hardware error semantics.

Mapping Engine не должен переименовывать эти ошибки в Mapping-specific codes.

---

# 37. Hardware regression boundary

Phase 7A MUST сохранять без изменения semantics:

```text
Receiver boundary behavior

Port boundary behavior

port-local dataIndex

globalRemapIndex

Processor ordering

Receiver ordering

Cabinet ordering inside topology

capacity rules

Hardware validation
```

Никакие новые Mapping tests не являются основанием менять expected Hardware Engine results.

---

# 38. ResolvedPixelMap compactness

`ResolvedPixelMap` MUST оставаться compact.

Разрешены структуры масштаба:

```text
Cabinets
Modules
Receivers
Ports
Processors
```

Запрещены production structures масштаба:

```text
one object per LED pixel

PixelAddress[totalPixelCount]

MappedPixel[totalPixelCount]

pixel-sized reverse table
```

Full pixel sweeps существуют только в tests.

---

# 39. Cell table size

Для REF-001:

```text
cells.length == 12
```

а не:

```text
196608
```

Изменение pixel resolution при неизменном количестве Cabinet entities не должно линейно увеличивать число stored mapping cells.

---

# 40. Snapshot immutability

MUST быть доказано:

```text
deep-frozen input принимается
```

и одновременно:

```text
resolveMapping()
не замораживает входной объект пользователя
```

Resolved snapshot должен владеть своими immutable копиями необходимых данных.

---

# 41. No mutable reference retention

После:

```text
mapping = resolveMapping(input)
```

мутация разрешённого mutable source object после вызова не должна изменять уже построенный:

```text
mapping
```

Не допускается удержание изменяемых nested references:

```text
resolution
position
size
ordering
membership arrays
cells
```

---

# 42. Immutable lookup outputs

Результаты:

```text
mapInputPixel()

unmapHardwarePixel()
```

и вложенные coordinate objects должны быть immutable согласно принятому contract.

---

# 43. Determinism

Для одного и того же validated input:

```text
resolveMapping(input)
```

повторно должен давать семантически идентичный snapshot.

Повторные:

```text
mapInputPixel()
unmapHardwarePixel()
```

MUST давать идентичные результаты.

---

# 44. Existing regression baseline

До Phase 7A существующая принятая регрессия:

```text
425 / 425
```

тестов.

После production 7A:

```text
all previous 425 tests MUST remain green
```

плюс добавляются новые 7A tests.

Нельзя обновлять старые expected results только для того, чтобы новый Mapping code стал зелёным, если изменение не было отдельно утверждено.

---

# 45. Regression count report

Acceptance report MUST содержать:

```text
Previous regression baseline: 425
Current total tests: N
Passed: N
Failed: 0
Skipped: ...
New Phase 7A tests: ...
```

Любое изменение количества существующих regression tests должно быть объяснено.

---

# 46. Required test classes

Phase 7A test suite MUST явно содержать coverage для:

```text
domain InputCanvas tests

MappingRegion inputCanvas tests

resolveMapping validation

Identity REF-001 sweep

Offset REF-001 sweep

11 anchors

reverse traversal

forward → reverse

reverse → forward

bounds

geometry

error taxonomy

ordering independence

multi-processor

snapshot compactness

snapshot immutability

determinism

Hardware regression
```

---

# 47. Required quality gates

Для Candidate SHA MUST пройти:

```text
npm test
```

```text
npm run typecheck
```

```text
npm run lint
```

```text
npm run build
```

---

# 48. Electron smoke

Existing Electron application MUST быть smoke-tested после production Phase 7A.

Smoke минимум подтверждает:

```text
application starts

main window opens

existing Early Alpha UI remains usable

no immediate runtime exception caused by core API changes
```

Phase 7A не требует нового Mapping UI.

---

# 49. Git whitespace gate

Обязательно:

```text
git diff --check
```

Result:

```text
PASS
```

---

# 50. Production diff review

Acceptance MUST включать просмотр diff относительно approved base.

Проверяется отсутствие случайных изменений в:

```text
Cabinet Engine math

Hardware Engine math

Capacity/allocation math

UI behavior

serialization

Remap

Output transforms

vendor/hardware profile code
```

---

# 51. Expected implementation surface

Ожидаемый scope включает примерно:

```text
core/model/input-canvas.ts

core/model/ids.ts

core/model/mapping-region.ts

model barrel exports

core/mapping-engine/types.ts

core/mapping-engine/resolve.ts

core/mapping-engine/lookup.ts

mapping validation helpers

core/mapping-engine/index.ts

core barrel exports

tests

identity / offset fixtures

Phase 7A validation report
```

Конкретная файловая декомпозиция MAY отличаться, если semantic contract сохраняется.

---

# 52. No runtime dependency requirement

Phase 7A SHOULD не требовать новых runtime dependencies.

Если production commit добавляет dependency, acceptance report MUST отдельно объяснить:

```text
why it is required
why existing platform/core utilities are insufficient
```

---

# 53. Validation report

После завершения production-кода должен появиться implementation validation report.

Рекомендуемое имя:

```text
docs/mapping-7a-validation.md
```

Report MUST отражать фактически выполненные проверки, а не будущий план.

---

# 54. Mandatory acceptance report header

```text
Phase:              7A — Mapping
Candidate SHA:      <sha>
Semantic baseline:  247ed4abb499394f8a49ab58b1d3340166769241
Previous production:
                    63f340a5e181f98b93713cafcdc2d56ebd37ce1f

Result:
PASS | FAIL
```

---

# 55. Mandatory REF-001 report

Report MUST отдельно показать:

```text
Identity forward sweep
196608 / 196608 PASS

Offset forward sweep
196608 / 196608 PASS

Identity reverse traversal
196608 / 196608 PASS

Offset reverse traversal
196608 / 196608 PASS

Forward → Reverse
PASS

Reverse → Forward
PASS

Unique hardware keys
196608 / 196608

11 anchors
11 / 11 PASS
```

Если числа отличаются, Gate не проходит без изменения нормативного контракта.

---

# 56. Mandatory validation report

Report MUST содержать status для:

```text
source bounds

invalid coordinates

overflow

geometry completeness

MAPPING_DUPLICATE

HARDWARE_DUPLICATE

size mismatch

unsupported profile

ordering independence

multi-processor

unknown hardware keys

immutability

compactness

determinism
```

---

# 57. Mandatory regression report

```text
Previous tests: 425
New total:      <N>

Passed:         <N>
Failed:         0
Skipped:        <N>
```

Skipped tests MUST быть перечислены и объяснены.

Новый mandatory Phase 7A acceptance test не может быть skipped.

---

# 58. Mandatory tool report

```text
npm test             PASS
npm run typecheck    PASS
npm run lint         PASS
npm run build        PASS
Electron smoke       PASS
git diff --check     PASS
```

Если CI не запускался:

```text
Execution environment: local
CI status: not run
```

должно быть указано прямо.

Нельзя представлять local result как CI result.

---

# 59. Failure conditions

Gate автоматически FAIL при любом из следующего:

```text
< 196608 pixels в обязательном sweep

неуникальный hardware key

forward/reverse mismatch

ошибка хотя бы одного anchor

Snake меняет physical cell

bare dataIndex используется как global hardware key

Port boundary не сбрасывает dataIndex

Mapping повторно применяет Numbering/Direction/Snake

auto-allocation внутри resolveMapping

pixel-sized production snapshot

mutable snapshot

MAPPING_DUPLICATE/HARDWARE_DUPLICATE смешаны

старый Hardware/Cabinet expected result изменён без отдельного решения

регрессионный test failure

typecheck failure

lint failure

build failure

Electron smoke failure

git diff --check failure

scope leak в 7B/UI/serialization/transforms
```

---

# 60. Acceptance authority

Автоматические tests доказывают техническое соответствие.

Но окончательное закрытие Gate требует:

```text
Candidate SHA
+
validation report
+
scope diff review
+
явного acceptance
```

Production commit сам по себе не переводит Phase 7A в Accepted.

---

# 61. Result of PASS

После явного принятия Candidate SHA:

```text
Phase 7A — Mapping = CLOSED / ACCEPTED
```

Тогда разрешено перейти к следующему docs gate:

```text
Phase 7B — Remap
```

и подготовить:

```text
LEDMAP-REMAP-001
```

Это логический remap/post-processing контракт (Phase 7B), отдельный от Final Hardware Remap. Имя `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` остаётся зарезервированным для этапа после Hardware Profiles + AddressEncoder (InputPixel ↔ HardwareAddress через ReverseIndex).

---

# 62. What PASS does not authorize

Phase 7A PASS сам по себе не разрешает production-код:

```text
Remap 7B

Validation 7C

Serialization 7D

Output transforms

Power

Stage 3D

Device Map

Hardware Profiles

vendor export
```

Для следующего production subsystem требуется его собственный утверждённый contract/gate.

---

# 63. Definition of Done

Phase 7A считается технически готовой к приёмке только если одновременно:

```text
✓ InputCanvas/InputCanvasId реализованы

✓ MappingRegion.inputCanvas обязателен

✓ resolveMapping реализован

✓ mapInputPixel реализован

✓ unmapHardwarePixel реализован

✓ ResolvedPixelMap compact

✓ snapshot immutable

✓ physical cells независимы от ordering

✓ Hardware Engine переиспользуется без переопределения math

✓ Identity sweep = 196608 / 196608

✓ Offset sweep = 196608 / 196608

✓ Identity reverse traversal complete

✓ Offset reverse traversal complete

✓ 11 / 11 anchors

✓ Forward → Reverse exact

✓ Reverse → Forward exact

✓ 196608 unique hardware keys

✓ bounds tests

✓ geometry tests

✓ error taxonomy tests

✓ MAPPING_DUPLICATE ≠ HARDWARE_DUPLICATE

✓ ordering independence tests

✓ multi-processor tests

✓ compactness tests

✓ immutability tests

✓ determinism tests

✓ previous 425 regression tests remain green

✓ all new Phase 7A tests green

✓ typecheck PASS

✓ lint PASS

✓ build PASS

✓ Electron smoke PASS

✓ git diff --check PASS

✓ production diff contains no unexplained scope expansion

✓ Candidate SHA provided

✓ validation report provided
```

Только после этого Candidate SHA может быть представлен на окончательный Phase 7A acceptance.

---

# 64. Final Gate

Нормативная последовательность:

```text
LEDMAP-MAPPING-001
        ↓
Docs-only Gate 7A
        ↓
247ed4abb499394f8a49ab58b1d3340166769241
        ↓
Production authorization
        ↓
Phase 7A implementation
        ↓
LEDMAP-PHASE-7-ACCEPTANCE-001
        ↓
Candidate SHA
        ↓
Acceptance report
        ↓
INTEGRATION GATE 7A
        ↓
PASS
        ↓
Phase 7A CLOSED
        ↓
Phase 7B Remap specification
```

Главное правило:

```text
не количество реализованных функций закрывает Phase 7A,
а доказанное соответствие принятому Mapping contract
без изменения предыдущей математики LedMAP.
```