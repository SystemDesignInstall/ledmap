# LedMAP — Reference Test 001: математическая спецификация

Статус: **Legacy draft, согласован с Phase 2A**. Нормативный источник ожидаемых адресов — [LEDMAP-REF-001](../reference/LEDMAP-REF-001.md) и [Hardware Addressing Specification](../specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md). Ниже сохранены ранние геометрические выводы и дополнительные якоря с исправленной семантикой. Executable Engine tests ещё не добавлены.

Связано: `ARCHITECTURE.md` §6 (стратегия тестов), AGENTS.md «Reference Test Case 001», ADR-004 (координаты/логический порядок), ADR-006 (global flattening), ADR-015 (port-local addressing), ADR-011 (токены), ADR-013 (спека 001 как образец), cross-check №1/№2 (исторические исследования, не нормативный контракт).

## 1. Входная модель (fixture)

| Параметр | Значение |
|---|---|
| Addressing profile | ReferenceAddressingProfile-001; vendor physical panel scan OUT OF SCOPE |
| Screen resolution | 512×384 px (выходной экран) |
| CabinetGrid | columns=4, rows=3 → **12 cabinets** |
| Cabinet | width=height=128 px, pixelWidth=pixelHeight=128 |
| Module grid | moduleColumns=4, moduleRows=4; module width=height=32 px, pixel=32 px |
| Per-cabinet pixels | 128×128 = **16384** px |
| GridOrdering | numbering=`row`, startCorner=`top-left`, direction=`left-to-right`, snake=`true` |
| Hardware | 4 cabinets / Receiver · 2 Receivers / Port · 4 Ports / Processor |

Итого пикселей: `12 × 16384 = 196608 = 512 × 384` ✓ (совпадает с разрешением экрана).

## 2. ReferenceAddressingProfile-001

Row-Major L→R, T→B — **логический reference profile REF-001**, не универсальный порядок всех панелей:

- Module ordering и Pixel ordering внутри модуля: row-major, start Top Left, direction Left→Right / Top→Bottom, snake OFF на обоих уровнях.
- Cabinet rotation=0, flip=none. Cabinet snake ON действует только на порядок кабинетов.
- Профиль задаётся документационным контрактом; типы конфигурации Module/Pixel ordering пока не добавлены в TypeScript.
- Physical panel scan, HUB75 multiplexing, row mapping, driver-IC/shift-register order и vendor encoding принадлежат будущему HardwareProfile, вне Cabinet Engine.

## 3. Координатная система

- Origin — верхний левый угол; ось **X → +вправо**, ось **Y → +вниз** (пиксель в координатах экрана).
- `physical(x, y)`: глобальная координата на выходном экране.
- `local(x, y)`: координата внутри кабинета, `0 ≤ x,y < 128`.

## 4. Порядок кабинетов (Cabinet Engine: numbering → direction → snake)

StartCorner=`top-left`, Numbering=`row`:

- Ось чтения — ряды сверху вниз (`row = 0..2`).
- Между рядами: baseline направление `left-to-right`.
- Snake=`true` → **каждый нечётный ряд читается справа налево** (ряды 0-базовые: row 1 инвертирован, row 2 снова L→R).

`cabinetIndex(physicalCol: 0..3, physicalRow: 0..2)`:

| row | physical col order | ordinal | cabinetIndex | cabinet |
|---|---|---|---|---|
| 0 | 0,1,2,3 (L→R) | 0..3 | **0,1,2,3** | C01,C02,C03,C04 |
| 1 | 3,2,1,0 (R→L) | 0..3 | **4,5,6,7** | C08,C07,C06,C05 |
| 2 | 0,1,2,3 (L→R) | 0..3 | **8,9,10,11** | C09,C10,C11,C12 |

Общая формула: `cabinetIndex = row×columns + ord(col, row)`, где `ord(col,row) = (snake && row нечётное) ? (columns−1−col) : col`.

**Физическая сетка** (X→, Y↓):
```
C01 C02 C03 C04
C05 C06 C07 C08
C09 C10 C11 C12
```
**Логический порядок сигнала**: `C01 C02 C03 C04 / C08 C07 C06 C05 / C09 C10 C11 C12`.

## 5. Порядок пикселей в кабинете (reference profile)

Сначала модуль целиком, затем следующий модуль; row-major L→R/T→B на каждом из двух уровней:

```
cabinetPixelOffset = moduleIndex×1024 + pixelIndexWithinModule   (0..16383)
globalRemapIndex = cabinetIndex×16384 + cabinetPixelOffset      (только эта fixture)
```

Модульная сетка (4×4 модуля по 32 px):

```
moduleIndex(moduleRow, moduleColumn) = moduleRow×4 + moduleColumn          (0..15)
pixelIndexWithinModule = (localY mod 32)×32 + (localX mod 32)               (0..1023)
```

В раннем черновике равенство pixelCount ошибочно трактовалось как равенство порядков. Полный cabinet row-major и module-first порядок различаются: local `(32,0)` даёт 1024 по reference profile, а не 32. Итого по-прежнему `16×1024=16384` пикселей. `Pixel.logicalIndex` — отдельное понятие, не определяется здесь как `dataIndex` или `globalRemapIndex`.

## 6. Сигнальная топология (Hardware Engine): receiver / port / processor

Global flattening (ADR-006): `Processor → Port → Receiver → Cabinet → Module → Pixel`. Следующие диапазоны обозначают **globalRemapIndex**, не port-local dataIndex. Старые Receiver0/1/2 соответствуют R01/R02/R03, Port0/1 — P01:01/P01:02, Processor0 — P01.

- 4 cabinets на receiver, режем **логический порядок** кабинетов по 4:
  - `Receiver0` = `[C01,C02,C03,C04]` → пиксели **0..65535**
  - `Receiver1` = `[C08,C07,C06,C05]` → пиксели **65536..131071**
  - `Receiver2` = `[C09,C10,C11,C12]` → пиксели **131072..196607**
- 2 receiver на порт:
  - `Port0` = {Receiver0, Receiver1} → **0..131071**
  - `Port1` = {Receiver2} → **131072..196607**
- Processor0 = {Port0, Port1} → **0..196607** (полный диапазон).

`dataIndex` — zero-based canonical pixel offset inside one Processor Port stream. На P01:01 диапазон 0..131071 (R01 base=0, R02 base=65536), на P01:02 диапазон 0..65535 (R03 base=0). Port сбрасывает dataIndex; Receiver на том же Port — нет. `globalRemapIndex = portGlobalBase + dataIndex`, где portGlobalBase=0 для P01:01 и 131072 для P01:02. У C09 `dataIndex=0`, `globalRemapIndex=131072`. Прежнее утверждение о равенстве dataIndex и logicalIndex отозвано.

## 7. Контрольные пиксельные якоря (ANCHORS)

Все значения выведены вручную по формулам §4–§5.

| # | physical (x,y) | cabinet | local (x,y) | cabinetPixelOffset | cabinetIndex | globalRemapIndex |
|---|---|---|---|---|---|---|
| A1 | (0,0) | C01 | (0,0) | 0 | 0 | **0** |
| A2 | (127,127) | C01 | (127,127) | 16383 | 0 | **16383** |
| A3 | (128,0) | C02 | (0,0) | 0 | 1 | **16384** |
| A4 | (384,128) | C08 | (0,0) | 0 | 4 | **65536** |
| A5 | (511,127) | C04 | (127,127) | 16383 | 3 | **65535** |
| A6 | (0,256) | C09 | (0,0) | 0 | 8 | **131072** |
| A7 | (511,383) | C12 | (127,127) | 16383 | 11 | **196607** |

Ключевая особенность snake-шва: **A4 (65536) следует сразу за A5 (65535)** — конец первого логического ряда (последний пиксель C04) стыкуется с началом второго (первый пиксель C08 на оборотном ряду).

Проверки границ: максимальный `globalRemapIndex = 12×16384 − 1 = 196607`; отдельные `dataIndex`-диапазоны receiver/port см. §6. Нормативная таблица T01–T09 дополнительно проверяет module boundary и port reset.

### ⚠ Расхождение с ранее зафиксированными якорями

В прежнем ARCHITECTURE.md §6 два globalRemapIndex-якоря имели ошибочные координаты:

- `(0,128) → 65536 (C08)` — неверная координата: C08 физически находится на `(384,128)`. Запись `(0,128)` математически не соответствует 65536 (при физическом прочтении `(0,128)` = голова C05 → 114688).
- `(384,127) → 65535 (конец C04)` — неверная координата: последний пиксель C04 находится на `(511,127)`.

**Корректные якоря** (выше): `(384,128) → 65536` и `(511,127) → 65535`. Значения (65535/65536) верны, координаты исправлены по формулам §4–§5.

## 8. Ожидаемые производные (assay цели приёмки)

1. Порядок кабинетов: `[C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12]` (по cabinetIndex).
2. Все якоря §7 (A1–A7) точны (не берутся из движка).
3. Границы SignalPath: receiver/port/processor по §6.
4. Receiver-кластеры: каждый receiver содержит ровно 4 cabinets в логическом порядке.
5. Round-trip: `parse(serialize(model)) ≡ model`.
6. Детерминизм: каждый движок вызывается дважды → выходы идентичны.
7. Port reset: P01:01 last dataIndex=131071 → P01:02 first dataIndex=0; globalRemapIndex при этом 131071 → 131072. Reverse lookup требует processor+port+dataIndex и однозначно восстанавливает Pixel.
8. Module-декомпозиция: первый пиксель модуля `(moduleIndex m)` = `m×1024`; последний = `m×1024 + 1023`.

## 9. Не покрыто (вне scope REF-001)

- StartCorner ≠ top-left, Right-to-Left, Column numbering — покрываются REF-002…004 (ADR-013).
- Physical panel scan / wiring и vendor encoding — будущий HardwareProfile, не ordering-параметры Cabinet Engine.
- Partial fills / overflow receiver/port — Hardware Engine (Phase 6), отдельная тестовая матрица.
- Конфигурации за пределами ReferenceAddressingProfile-001 и multi-processor ordering — отдельные будущие контракты; dataIndex и logicalIndex уже сейчас семантически различны.
