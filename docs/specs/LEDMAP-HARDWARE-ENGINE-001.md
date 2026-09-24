# LEDMAP-HARDWARE-ENGINE-001 — Phase 6 implementation plan

Статус: **Accepted — Phase 6A одобрена пользователем 2026-09-24 с уточнениями ниже**. Production-код разрешён после отдельного documentation commit. Early Alpha UI принята на `88f110d15f06a86f7c277ef61979520218140720`; Phase 4E закрыта на `67fd975` + `6013e02`.

Основание: [Hardware Addressing Specification](LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md), [REF-001](../reference/LEDMAP-REF-001.md), ADR-006/015/016. Этот план предлагает реализацию канонической адресации поверх готового Cabinet Engine.

## 1. Разделение Phase 6

**Phase 6A — Explicit topology and canonical addressing:** проверка явных назначений, port-local dataIndex, прямой и обратный lookup, отдельный derived globalRemapIndex и полная executable-приёмка REF-001.

**Phase 6B — Capacity and allocation:** отдельный будущий план для capacity Receiver, автоматического распределения, частичных назначений и политики overflow/unused slots. Одобрение Phase 6A не разрешает Phase 6B.

Причина разделения: ADR-007/008 пока Proposed; Receiver не имеет capacity-поля, универсальный scope Receiver.index не определён. Четыре кабинета на Receiver в REF-001 — явное назначение fixture, не универсальное ограничение движка.

## 2. Вход Phase 6A и явный порядок

Вход — readonly-наборы существующих Processor, Port, Receiver, Cabinet и Module, дополненные явным порядком ProcessorId и явными списками ReceiverId для каждого Port. Все идентификаторы берутся из модели; лейблы не разбираются и не сортируются.

| Уровень | Источник порядка |
|---|---|
| Processor | Обязательный `processorOrder`: каждый входной ProcessorId ровно один раз |
| Port | Возрастание `Port.index` внутри Processor; индексы уникальны и меньше `Processor.portCount` |
| Receiver | Обязательный список ReceiverId для каждого входного Port, включая пустой список; каждый Receiver ровно один раз на своём Port |
| Cabinet | Существующий `Receiver.cabinets`, без пересортировки |
| Module | Физические module row/column и существующий `moduleIndex()` |
| Pixel | Существующий module-first Cabinet pixel layout |

`Receiver.index` остаётся метаданными модели и не определяет порядок. Изменение порядка входных коллекций сущностей не меняет результат, если явные порядки и назначения прежние. ProcessorOrder нужен для global flattening; его перестановка не меняет port-local dataIndex.

Списки порядка — вход вычисления, а не новая схема `.ledmap`. Их будущее хранение относится к serialization. Формат данных не использует CabinetEngineConfig целиком и не передаёт Numbering/Direction/Snake в Hardware Engine.

Назначения уже разрешены вызывающим кодом. Cabinet Engine может дать порядок для построения fixture или будущего allocation, но Hardware Engine не переписывает Receiver.cabinets при смене cabinet ordering.

## 3. Геометрия и идентичность пикселя

Кабинеты одного Receiver могут иметь разные размеры. Внутри каждого кабинета модули образуют полную прямоугольную сетку одинаковых модулей в пределах поддержанного Phase 4E layout. Проверяются принадлежность Module к Cabinet, уникальность module position, полное заполнение сетки и совпадение размеров с Cabinet.

ModuleId — реальный уникальный идентификатор из входа, не глобальный лейбл M01. Существующий PixelAddress сохраняет структуру: hardware, cabinet, module, module-local coordinate, dataIndex. Тип Pixel не переопределяется.

Геометрическая арифметика переиспользует `moduleIndex`, `pixelIndexWithinModule`, `decomposeCabinetPixel`, `cabinetPixelCoordinate`. Rotation/flip, которые не поддерживаются текущим layout-контрактом, явно отклоняются; они не игнорируются.

Hardware lookup возвращает cabinet/module-local положение. В REF-001 тестовая композиция переводит его в Screen coordinate по известной геометрии выходного экрана. Общий Input→Output Mapping Engine этим не реализуется.

## 4. Расчёт и предлагаемый API

Предлагаемые публичные операции:

| Операция | Контракт |
|---|---|
| `resolveHardware(input)` | Валидирует вход целиком и возвращает readonly derived mapping с диапазонами и нагрузками; при ошибке бросает DomainError |
| `addressPixel(mapping, pixelReference)` | Принимает CabinetId и cabinet-local coordinate; возвращает существующий PixelAddress с module-local coordinate |
| `locatePixel(mapping, portPixelKey)` | По processor, port, dataIndex возвращает cabinet, module, module-local coordinate и cabinet-local coordinate |
| `globalRemapIndex(mapping, portPixelKey)` | Отдельно вычисляет project-wide offset; не добавляет его в PixelAddress |

`portPixelKey` всегда содержит processor и port; lookup по одному dataIndex отсутствует. Forward не принимает ScreenPixel: Screen/Mapping Region остаются за границей Hardware Engine.

Контракты входов:

```ts
interface HardwareTopologyInput {
  readonly processors: readonly Processor[]
  readonly ports: readonly Port[]
  readonly receivers: readonly Receiver[]
  readonly cabinets: readonly Cabinet[]
  readonly modules: readonly Module[]
  readonly processorOrder: readonly ProcessorId[]
  readonly receiverOrder: readonly PortReceiverOrder[]
}
interface PortReceiverOrder {
  readonly port: PortId
  readonly receivers: readonly ReceiverId[]
}
interface CabinetPixelReference {
  readonly cabinet: CabinetId
  readonly coordinate: PixelCoordinate
}
interface PortPixelKey {
  readonly processor: ProcessorId
  readonly port: PortId
  readonly dataIndex: number
}
interface LocatedHardwarePixel {
  readonly cabinet: CabinetId
  readonly module: ModuleId
  readonly coordinate: PixelCoordinate
  readonly cabinetCoordinate: PixelCoordinate
}
```

`ResolvedHardwareMapping` содержит `pixelCount` и `ports: readonly HardwarePortSpan[]` в порядке flattening. Port span содержит processor, port, index, globalBase, pixelCount и receivers. Receiver span содержит receiver, portBase, pixelCount и cabinets. Cabinet span содержит cabinet, receiverBase, portBase, pixelCount, layout и moduleIds в module-first порядке. Bases относятся к началу соответствующего потока; диапазон — `[base, base + pixelCount)`. Пустые spans имеют нулевую длину. Типы span и результат resolve readonly; возвращённые объекты и массивы замораживаются и не ссылаются на изменяемые входные объекты.

Новые коды DomainError: `HARDWARE_UNKNOWN_REFERENCE`, `HARDWARE_DUPLICATE`, `HARDWARE_INCOMPLETE`, `HARDWARE_PARENT_MISMATCH`, `HARDWARE_INVALID_VALUE`, `HARDWARE_CAPACITY_EXCEEDED`, `HARDWARE_LAYOUT_MISMATCH`, `HARDWARE_UNSUPPORTED_TRANSFORM`, `HARDWARE_OUT_OF_RANGE`, `HARDWARE_OVERFLOW`. Ошибки геометрии существующего Cabinet Engine сохраняют его коды.

```text
receiverPortBase    = sum(actual pixel counts of earlier receivers on this port)
cabinetReceiverBase = sum(actual pixel counts of earlier cabinets on this receiver)
cabinetPixelOffset  = result of the existing Cabinet Engine

dataIndex = receiverPortBase + cabinetReceiverBase + cabinetPixelOffset

portGlobalBase   = sum(actual pixel counts of earlier ports in explicit project order)
globalRemapIndex = portGlobalBase + dataIndex
```

Каждый занятый Port начинает с нуля. Receiver не сбрасывает счётчик. Пустые Receiver/Port и неиспользованные capacity-слоты не создают padding. Пустой Port не имеет допустимого dataIndex=0.

Resolve строит диапазоны на уровнях topology, Cabinet и Module без массива всех LED-пикселей. Forward/reverse lookup используют эти диапазоны и готовую геометрию. Все размеры, количества, суммы, bases и конечные границы проверяются на safe integer; bases могут быть нулевыми.

## 5. Валидация

- Уникальные ID внутри каждого типа сущности; существование всех ссылок и согласованность Processor/Port/Receiver, Cabinet/Module.
- Полнота и отсутствие повторов в явных порядках; никаких неявных fallback по входным массивам или именам.
- Каждый Cabinet входного набора назначен ровно одному Receiver. Неполные или повторные назначения не дают resolved mapping.
- Безопасные неотрицательные индексы, положительные capacity-поля; уникальные Port.index в пределах Processor.portCount.
- Число Receiver на Port не превышает Port.receiverCapacity. Ограничение пикселей Receiver не выдумывается: его модель и проверка отнесены к Phase 6B.
- Полная согласованная module geometry; отсутствие потерянных/дублированных module positions; безопасные произведения и prefix sums.
- Неизвестные processor/port/cabinet/module, несовместимый владелец, невалидные координаты, пустой порт и out-of-range dataIndex отклоняются. Clamp/wrap и переход на соседний Port запрещены.
- Пустая нагрузка допустима, если все входные назначения согласованы. Недозаполненный Port не считается ошибкой.

Диагностики — стабильные коды DomainError с контекстом ID/поля. Частичный успешный результат resolve при ошибке не возвращается. Resolved в Phase 6A означает валидную каноническую topology/addressing, а не проверку возможностей реального vendor hardware.

## 6. Приёмка

1. Все существующие 252 теста остаются регрессией; Cabinet Engine и Alpha UI не меняются.
2. REF-001: явные Processor/Port/Receiver/Cabinet/Module fixtures; T01–T09 и дополнительные якоря; полное сравнение всех 196608 адресов с независимым module-by-module oracle. Ожидания не генерируются проверяемыми функциями движков.
3. Обязательные границы:

   | Переход | dataIndex | globalRemapIndex |
   |---|---|---|
   | M01 → M02 в C01 | 1023 → 1024 | 1023 → 1024 |
   | R01/C04 → R02/C08 на первом Port | 65535 → 65536 | 65535 → 65536 |
   | Первый → второй Port | 131071 → 0 | 131071 → 131072 |

4. Уникальность всех `(processor, port, dataIndex)`, покрытие обоих занятых портов без пропусков, global range 0…196607; оба полных round-trip для всех пикселей/ключей, детерминизм и immutability.
5. Отдельные малые fixtures: несколько Processor, пустые и недозаполненные Port/Receiver, прямоугольные модули и разные размеры Cabinet; bases зависят от фактической нагрузки, не от capacity.
6. Перестановка коллекций сущностей сохраняет адреса; перестановка processorOrder меняет только global flattening; одинаковый dataIndex на разных Port/Processor корректно различается.
7. Негативные тесты каждого класса ошибок, включая дублирование назначений, пропущенные модули, неверных родителей, границы и переполнение сумм даже при безопасных отдельных Cabinet pixel counts.

Проверки завершения: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`. Существующий Electron smoke остаётся проверкой совместимости Alpha с расширенным barrel core. Все результаты явно отмечаются как локальные.

## 7. Последовательность после одобрения

1. Уточнить TypeScript-контракты входа, диапазонов и кодов ошибок в этой спецификации; зафиксировать принятые решения в ADR, обновить актуальную точку TODO. Исторические документы Phase 2A не переписывать как будто реализация существовала тогда.
2. Реализовать чистый `packages/core/src/hardware-engine` и добавить его public exports; сохранить существующую доменную модель и Cabinet Engine.
3. Добавить независимые fixtures и целевые тесты из раздела 6.
4. Выполнить проверки и представить diff, public API, результаты REF-001 и ограничения Phase 6A.

Пользователь разрешил последовательные commits `docs: define hardware engine phase 6a` и `feat(core): implement hardware address resolver`. После реализации и отчёта работа останавливается; Phase 6B автоматически не начинается.

## 8. Вне Phase 6A

Auto-allocation, доводка частичных назначений, новый capacity-контракт Receiver, hardware UI, изменение Alpha, serialization, Mapping/Remap, HardwareProfile, драйверы, vendor formats, экспорт и новые режимы Cabinet/Module/Pixel ordering.
