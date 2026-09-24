# LEDMAP-HARDWARE-CAPACITY-001 — Phase 6B: capacity и авто-allocation

Статус: **Accepted — Phase 6B одобрена пользователем 2026-09-24 с уточнениями ниже**. Production-код разрешён после отдельного docs-only commit (this spec + ADR-019 + TODO update).

Основание: [Hardware Engine Phase 6A](LEDMAP-HARDWARE-ENGINE-001.md), [Hardware Addressing Specification](LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md) §16, ADR-006/015/018/019, [REF-001](../reference/LEDMAP-REF-001.md). План реализует capacity-модель Receiver и автоматическое распределение Cabinet **без** изменения доказанной 6A-addressing математики.

## 1. Разделение Phase 6

**Phase 6A (закрыта):** явная полная topology, строгий `resolveHardware()`, port-local `dataIndex`, forward/reverse, `globalRemapIndex`, REF-001 sweep. `resolveHardware` не принимает частичные назначения (`HARDWARE_INCOMPLETE`).

**Phase 6B (этот план):** опциональный pixel-limit Receiver, `allocateHardware()` как **генератор explicit topology**, диагностики unused-slot, аддитивный capacity-инвариант в `resolveHardware`, тест-матрица capacity/overflow/partial.

## 2. Границы 6B

- `allocateHardware()` **создаёт только полноценную explicit topology** из входных entity + skeleton + fixed assignments + `cabinetOrder`. Он не создаёт сущности Receiver/Port, не мутирует входные объекты и не возвращает partial-result topology.
- Сущности создаёт фабрика `createReceiver` (существующий паттерн); allocation собирает **новые** immutable `Receiver` (fixed + append) в итоговый `HardwareTopologyInput`.
- **В 6B не входят:** serialization/`.ledmap`, UI/hardware UI, Mapping/Remap, HardwareProfile/vendor encoding, split Cabinet по Module/Pixel, новые Cabinet/Module/Pixel ordering, REF-002…004, изменения `dataIndex`/`globalRemapIndex`/addressing-семантики.
- Machine и heuristics живут только в `allocate.ts`; addressing-математика — только в уже проверенном `resolve.ts`/`address.ts`, который 6B не переписывает.

## 3. Capacity-модель Receiver

В `Receiver` + `CreateReceiverInput` добавляется **опциональное** поле:

```ts
readonly pixelCapacity?: number   // positive safe integer, единица — пиксели
```

- **Отсутствие** `pixelCapacity` означает: «в LedMAP для этого Receiver pixel-limit не задан». Для 6B allocator это эквивалентно отсутствию верхней границы, но **не утверждает**, что реальное устройство физически бесконечно.
- Проверка в `createReceiver`: если поле задано — positive safe integer (`assertPositiveInteger`), иначе поле отсутствует.
- **Аддитивность:** существующие 6A-topology (в т.ч. `referenceTopology()`) остаются валидными без миграции; все 336 тестов остаются регрессией без правок.
- Receiver без `pixelCapacity` не даёт unused-slot диагностику (конечной capacity нет).

## 4. `resolveHardware`: единственное изменение 6A-движка

Фраза «`resolveHardware()` не меняем» означает: **addressing/spans/order семантика неизменна**. Сам код получает **одну аддитивную проверку**:

```text
if receiver.pixelCapacity is defined:
    receiverLoad <= pixelCapacity
```

- `receiverLoad` = сумма фактических `pixelCount` дочерних Cabinet-спанов текущего Receiver (реальные prefix sums существующей geometry/layout).
- Превышение → `HARDWARE_CAPACITY_EXCEEDED` (ADR-008: overflow → ошибка валидации).
- Это инвариант, а не heuristic: он ничего не переразмещает, не доводит и не "чинит" topology.
- Port/Processor capacity-проверки 6A (`Port.receiverCapacity`, `Processor.portCount`) не меняются.

## 5. `allocateHardware()` — генератор explicit topology

Файл: `packages/core/src/hardware-engine/allocate.ts`. Public API в пару к `resolveHardware`:

```ts
interface AllocateHardwareInput {
  readonly processors: readonly Processor[]
  readonly ports: readonly Port[]
  readonly receivers: readonly Receiver[]          // могут уже содержать фиксированные assignments
  readonly cabinets: readonly Cabinet[]
  readonly modules: readonly Module[]
  readonly processorOrder: readonly ProcessorId[]
  readonly receiverOrder: readonly PortReceiverOrder[]   // явный скелет: ресиверы по порту
  readonly cabinetOrder: readonly CabinetId[]      // только ещё НЕ назначенные Cabinets
}

type AllocationDiagnostic =
  | { readonly level: 'receiver'; readonly receiver: ReceiverId; readonly unit: 'pixels'; readonly used: number; readonly capacity: number }
  | { readonly level: 'port'; readonly port: PortId; readonly unit: 'receivers'; readonly used: number; readonly capacity: number }
  | { readonly level: 'processor'; readonly processor: ProcessorId; readonly unit: 'ports'; readonly used: number; readonly capacity: number }

interface AllocationProposal {
  readonly topology: HardwareTopologyInput         // полная явная topology (receivers пересозданы)
  readonly diagnostics: readonly AllocationDiagnostic[]
}

function allocateHardware(input: AllocateHardwareInput): AllocationProposal
```

### Контракт `cabinetOrder`

- Содержит **ровно все ещё не назначенные Cabinets, каждый ровно один раз**.
- Кабинеты, уже находящиеся в `Receiver.cabinets` (fixed assignments), сюда **не включаются**.
- Следующие случаи — ошибка: unknown reference, duplicate, **missing** (не назначен и не в списке), **already-assigned** (назначен в fixed и одновременно указан в `cabinetOrder`).

### Fixed assignments

- Существующие `Receiver.cabinets` фиксированы: их внутренний порядок сохраняется, новые кабинеты только **append**.
- Если суммарная нагрузка фиксированных Cabinet уже превышает заданный `pixelCapacity` — `allocateHardware()` сразу завершается с `HARDWARE_CAPACITY_EXCEEDED`, не пытаясь переразместить или «починить» topology.
- Fixed assignments не пересекаются с `cabinetOrder` (см. контракт выше).

## 6. Алгоритм и пайплайн

Cabinet — **атомарная единица** allocation: split по Module/Pixel в 6B не вводится. First-fit проверяет, помещается ли **весь Cabinet** в текущий Receiver; если нет — переходит к следующему. Если ни один Receiver не подходит — `HARDWARE_CAPACITY_EXCEEDED`. Оставшиеся после полного прохода неразмещённые кабинеты — тот же код ошибки.

Precedence заполнения (явный): `processorOrder` → внутри Processor `Port.index` по возрастанию → внутри Port список Receiver из `receiverOrder`.

```text
entities
+ explicit processor/receiver skeleton
+ fixed assignments
+ cabinetOrder
        ↓
allocateHardware()
        ↓
full explicit HardwareTopologyInput
        ↓
resolveHardware()
        ↓
valid canonical addressing
```

Порядок операций allocator'а:

1. **Валидирует skeleton** (не через строгий `resolveHardware` на частичном входе — он отвергнет неполноту): уникальность/references entity, `Port.index < Processor.portCount` и уникальность внутри Processor, `order.receivers.length ≤ Port.receiverCapacity`, полнота `processorOrder`/`receiverOrder`, контракт `cabinetOrder`, fixed assignments, нагрузки фиксированных Receiver через существующую `resolveCabinetLayout`-геометрию.
2. **Строит полную topology**: пересоздаёт `Receiver` (fixed + append по first-fit), собирает итоговый `HardwareTopologyInput`.
3. **Прогоняет итог через неизменную `resolveHardware()` перед возвратом proposal** — executable-инвариант: allocator физически не может вернуть topology, которую 6A отвергает. Отказ `resolveHardware` → ошибка наружу.
4. Возвращает `{ topology, diagnostics }`.

## 7. Диагностики

`AllocationDiagnostic` — discriminated union по `level`, каждый уровень несёт свою единицу:

| level | unit | used | capacity |
|---|---|---|---|
| `receiver` | `pixels` | суммарный pixel-нагрузка Receiver | `pixelCapacity` (только если задан) |
| `port` | `receivers` | число Receiver на Port | `Port.receiverCapacity` |
| `processor` | `ports` | число Port у Processor | `Processor.portCount` |

- **Receiver без `pixelCapacity` не формирует unused-slot** — конечной capacity нет.
- `used < capacity` → unused-slot диагностика (не ошибка; недозаполненный Port уже допустим в 6A).
- Overflow — всегда `HARDWARE_CAPACITY_EXCEEDED`, никогда не диагностика.

## 8. Валидация

Новые/уточнённые проверки 6B (существующие коды `HARDWARE_*` переиспользуются):

- `Receiver.pixelCapacity` если задан: positive safe integer (фабрика `createReceiver`).
- `resolveHardware`: `receiverLoad ≤ pixelCapacity` при заданном `pixelCapacity` (аддитивный инвариант).
- `allocateHardware` skeleton: references / duplicates / parent mismatch / capacity-поля / полнота явных порядков / module geometry — по существующей layout-логике.
- `cabinetOrder`: unknown / duplicate / missing / already-assigned → ошибка.
- Fixed assignments превышают capacity → immediate `HARDWARE_CAPACITY_EXCEEDED`.
- Single Cabinet не помещается ни в один Receiver / leftover после прохода → `HARDWARE_CAPACITY_EXCEEDED`.

## 9. Приёмка

1. **REF-001 reconstruction.** `pixelCapacity = 65 536 px` для каждого Receiver (одного Cabinet = `128×128 = 16 384 px`, четыре Cabinet'а = `4 × 16 384 = 65 536`). `cabinetOrder` = сигнальный порядок `C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12`, `receiverCapacity = 2`, `portCount = 4`. Результат: `resolveHardware(allocateHardware(input).topology)` полностью равен `resolveHardware(referenceTopology())` — включая независимый sweep всех 196 608 адресов и оба round-trip.
2. **Регрессия:** все существующие 336 тестов остаются зелёными без правок (аддитивность).
3. **Тест-матрица capacity/overflow/partial:** граница `pixelCapacity` ровно впритык и +1 px → overflow; variable-size Cabinets; single oversized Cabinet; fixed assignments поверх capacity → immediate error; append не меняет порядок fixed; unused-slot на уровнях receiver/port/processor с корректной единицей; Receiver без `pixelCapacity` не даёт unused-slot; determinism и immutability (deep-freeze входа, отдельные frozen выходы).
4. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`. Electron smoke остаётся совместимостью barrel — без изменений. Все результаты явно отметить как локальные.

## 10. Public API и файлы

- **New:** `packages/core/src/hardware-engine/allocate.ts` (типы + `allocateHardware`); barrel-export: `AllocateHardwareInput`, `AllocationDiagnostic`, `AllocationProposal`, `allocateHardware`.
- **Model:** `model/receiver.ts` — опциональный `pixelCapacity` + проверка в фабрике.
- **resolve.ts:** единственный аддитивный capacity-инвариант (раздел 4). Addressing/spans/order не трогаются.
- Barrel `hardware-engine/index.ts` = существующие 6A exports + новые.

## 11. Последовательность после одобрения

1. **docs-only commit:** этот spec + ADR-019 (`Accepted`, уточняет ADR-007/008) + TODO-обновление.
2. **`feat(core): implement hardware allocation`:** option `pixelCapacity` в Receiver, аддитивный инвариант в `resolveHardware`, `allocateHardware`, fixtures и тесты по разделу 9.
3. Отчёт: public API, diff, REF-001 reconstruction/equality, границы 6B, статус проверок.

Только после docs-only commit разрешён production-код. Phase 6B не запускает Phase 7.