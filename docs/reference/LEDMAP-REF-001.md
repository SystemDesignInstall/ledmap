# LEDMAP-REF-001 — canonical reference addressing fixture

Статус: **Normative — Phase 2A, documentation only**. Контракт: [LEDMAP-HARDWARE-ADDRESSING-SPEC-001](../specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md). Этот документ задаёт corrected REF-001 и заменяет прежний [черновик](../test-001/spec.md) как источник ожидаемых адресов. Движки и executable REF-тесты пока не реализованы.

## 1. Geometry and cabinet ordering

| Параметр | Значение |
|---|---|
| Cabinet Grid | columns = 4, rows = 3 |
| Cabinet count | 12 |
| Cabinet pixel size | 128 × 128 |
| Module grid | 4 × 4 |
| Module pixel size | 32 × 32 |
| Module pixel count | 1024 |
| Cabinet pixel count | 16384 |
| Screen resolution | 512 × 384 |
| Screen pixels | 196608 = 12 × 16384 = 512 × 384 |
| Cabinet numbering | Row |
| Start corner | Top Left |
| Direction | Left → Right, ряды сверху вниз |
| Cabinet snake | ON |

Координаты экрана нуль-базовые: origin top-left, X вправо, Y вниз. Кабинеты стоят без зазоров. Mapping Region ≠ Cabinet; fixture задаёт выходную геометрию и addressing, не vendor scan или Input→Output корреляцию.

Физические позиции:

```text
C01 C02 C03 C04
C05 C06 C07 C08
C09 C10 C11 C12
```

Логический сигнальный порядок, строки здесь — последовательные участки обхода:

```text
C01 C02 C03 C04
C08 C07 C06 C05
C09 C10 C11 C12
```

Для этой конфигурации `cabinetIndex = row*4 + (row % 2 == 1 ? 3-column : column)`. Физический лейбл C05 остаётся C05, даже когда его сигнальный cabinetIndex равен 7.

## 2. ReferenceAddressingProfile-001

| Параметр | Значение |
|---|---|
| Module ordering / start | Row Major / Top Left |
| Module direction / snake | Left → Right / Top → Bottom; OFF |
| Pixel ordering inside module / start | Row Major / Top Left |
| Pixel direction / snake | Left → Right / Top → Bottom; OFF |
| Cabinet rotation / flip | 0 / none |
| Vendor physical panel scan | OUT OF SCOPE |

Это reference logical ordering LedMAP, не универсальная разводка receiver-карт. Cabinet snake не меняет порядок внутри модуля или кабинета. M01…M16 — локальные лейблы модулей каждого кабинета; реальные ModuleId должны однозначно указывать модуль и его владельца.

При cabinet-local `(cx, cy)`:

```text
moduleColumn = floor(cx / 32)
moduleRow = floor(cy / 32)
moduleIndex = moduleRow*4 + moduleColumn
pixelX = cx % 32
pixelY = cy % 32
pixelModuleOffset = pixelY*32 + pixelX
cabinetPixelOffset = moduleIndex*1024 + pixelModuleOffset
```

Все индексы нуль-базовые; лейбл модуля = M(moduleIndex+1). Полный обход одного модуля предшествует следующему. Например, cabinet-local `(31,31)` даёт 1023, `(32,0)` — 1024. Формула `cy*128+cx` для обхода целого кабинета по строкам здесь неприменима. `Pixel.logicalIndex` не переопределяется как аппаратный или project-global индекс.

## 3. Hardware assignment

Один Processor **P01**, четыре Port, максимум два Receiver на Port, по четыре Cabinet на Receiver в этой fixture. Это явное reference assignment, не реализация общего алгоритма allocation и не предел реального vendor hardware. Модель Receiver пока не содержит capacity-поля.

| Receiver | Port | Cabinets в сигнальном порядке | Pixels | `receiverPortBase` |
|---|---|---|---|---|
| R01 | P01:01 | C01 C02 C03 C04 | 65536 | 0 |
| R02 | P01:01 | C08 C07 C06 C05 | 65536 | 65536 |
| R03 | P01:02 | C09 C10 C11 C12 | 65536 | 0 |

| Port | Нуль-базовый Port.index | Receivers | Load (pixels) | `dataIndex` range | `portGlobalBase` | `globalRemapIndex` range |
|---|---|---|---|---|---|---|
| P01:01 | 0 | R01, R02 | 131072 | 0..131071 | 0 | 0..131071 |
| P01:02 | 1 | R03 | 65536 | 0..65535 | 131072 | 131072..196607 |
| P01:03 | 2 | unused | 0 | empty | 196608 | empty |
| P01:04 | 3 | unused | 0 | empty | 196608 | empty |

Пустые порты не имеют occupied index 0 и не резервируют пиксели в flattening. Receiver.index в fixture можно обозначить 0,1,2 соответственно R01,R02,R03; таблица явно задаёт порядок на портах, не устанавливая универсальный scope этого поля.

## 4. Port-local and global cabinet bases

Здесь base — адрес первого логического пикселя кабинета (M01, coordinate=(0,0)).

| Cabinet | Physical (column,row) | cabinetIndex | Receiver | Port | `dataIndex` base | `globalRemapIndex` base |
|---|---|---|---|---|---|---|
| C01 | (0,0) | 0 | R01 | P01:01 | 0 | 0 |
| C02 | (1,0) | 1 | R01 | P01:01 | 16384 | 16384 |
| C03 | (2,0) | 2 | R01 | P01:01 | 32768 | 32768 |
| C04 | (3,0) | 3 | R01 | P01:01 | 49152 | 49152 |
| C08 | (3,1) | 4 | R02 | P01:01 | 65536 | 65536 |
| C07 | (2,1) | 5 | R02 | P01:01 | 81920 | 81920 |
| C06 | (1,1) | 6 | R02 | P01:01 | 98304 | 98304 |
| C05 | (0,1) | 7 | R02 | P01:01 | 114688 | 114688 |
| C09 | (0,2) | 8 | R03 | P01:02 | 0 | 131072 |
| C10 | (1,2) | 9 | R03 | P01:02 | 16384 | 147456 |
| C11 | (2,2) | 10 | R03 | P01:02 | 32768 | 163840 |
| C12 | (3,2) | 11 | R03 | P01:02 | 49152 | 180224 |

```text
dataIndex = receiverPortBase + cabinetReceiverBase
          + moduleCabinetBase + pixelModuleOffset
globalRemapIndex = portGlobalBase + dataIndex
```

В этой fixture `cabinetReceiverBase` последовательно равен 0, 16384, 32768, 49152 на каждом Receiver, а `moduleCabinetBase = moduleIndex*1024`. Полный global flatten: Processor → Port → Receiver → Cabinet → Module → Pixel; его диапазон `0..196607`.

Первый пиксель C09 имеет **dataIndex = 0**, **globalRemapIndex = 131072**. Старые глобальные контрольные числа сохранены как `globalRemapIndex`, а не hardware dataIndex.

## 5. Corrected anchor table

Processor во всех строках — P01; `screenPixel` — координата на выходном экране. Значения получены из геометрии и формул reference profile, не из движка.

| Test | screenPixel | cabinet | module | receiver | port | dataIndex | globalRemapIndex |
|---|---|---|---|---|---|---|---|
| T01 | (0,0) | C01 | M01 | R01 | P01:01 | 0 | 0 |
| T02 | (31,31) | C01 | M01 | R01 | P01:01 | 1023 | 1023 |
| T03 | (32,0) | C01 | M02 | R01 | P01:01 | 1024 | 1024 |
| T04 | (128,0) | C02 | M01 | R01 | P01:01 | 16384 | 16384 |
| T05 | (0,128) | C05 | M01 | R02 | P01:01 | 114688 | 114688 |
| T06 | (384,128) | C08 | M01 | R02 | P01:01 | 65536 | 65536 |
| T07 | (127,255) | C05 | M16 | R02 | P01:01 | 131071 | 131071 |
| T08 | (0,256) | C09 | M01 | R03 | P01:02 | 0 | 131072 |
| T09 | (511,383) | C12 | M16 | R03 | P01:02 | 65535 | 196607 |

Сохраняются дополнительные старые якоря: `(127,127)` → C01/M16, `dataIndex=16383`, `globalRemapIndex=16383`; `(511,127)` → C04/M16, `dataIndex=65535`, `globalRemapIndex=65535`. Координата начала C08 — `(384,128)`; `(0,128)` принадлежит C05.

## 6. Required boundary assertions

Эти assertions — требования к будущим тестам, не добавленные executable Engine tests.

| Граница | Последний пиксель | Следующий пиксель | `dataIndex`: last → next | `globalRemapIndex`: last → next |
|---|---|---|---|---|
| Port | P01:01, Screen(127,255) | P01:02, Screen(0,256) | 131071 → 0 | 131071 → 131072 |
| Receiver на одном Port | R01, Screen(511,127) | R02, Screen(384,128) | 65535 → 65536 | 65535 → 65536 |
| Cabinet | C04, Screen(511,127) | C08, Screen(384,128) | 65535 → 65536 | 65535 → 65536 |
| Module в C01 | M01, Screen(31,31) | M02, Screen(32,0) | 1023 → 1024 | 1023 → 1024 |

**Receiver не сбрасывает dataIndex. Port сбрасывает dataIndex.**

## 7. Reverse mapping

Каждый occupied `(processor, port, dataIndex)` определяет ровно один Receiver → Cabinet → Module → module-local Pixel coordinate → Screen coordinate:

```text
(P01, Port01, 114688) → R02 → C05 → M01 → Pixel(0,0) → Screen(0,128)
(P01, Port02,      0) → R03 → C09 → M01 → Pixel(0,0) → Screen(0,256)
```

Port01 здесь означает P01:01, Port02 — P01:02. Bare `dataIndex=0` неоднозначен между занятыми портами и не является допустимым ключом lookup. `(P01, Port02, 65536)` и любой index пустого P01:03 должны отклоняться, а не переноситься на соседний поток.

## 8. Future acceptance and scope

Будущая executable-приёмка проверит полный порядок кабинетов, T01–T09, дополнительные якоря, все границы, 196608 уникальных адресов, полное golden-соответствие и оба направления биекции `Pixel ↔ PixelAddress`. Повторные вычисления должны давать идентичный результат. При реализации serialization отдельно проверяется round-trip stored project без derived индексов.

Physical panel scan, HardwareProfile/vendor encoding, rotation/flip вне profile, REF-002/003, общая auto-allocation и UI не реализуются здесь. Следующий этап требует отдельного одобрения плана Cabinet Engine Phase 1 — REF-001 executable implementation.
