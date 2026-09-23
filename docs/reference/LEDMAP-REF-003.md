# LEDMAP-REF-003 — Column cabinet ordering

Статус: **Normative — Phase 4C**. Спецификация фиксирует Column numbering, совместимость Direction с осью traversal и независимый Snake для Cabinet Engine.

Примечание Phase 4D: `vertical + bottom-to-top` реализован и нормативно описан в [LEDMAP-REF-004](LEDMAP-REF-004.md). Ниже сохранены исторические ограничения Phase 4C; начиная с Phase 4D остаются четыре несовместимые пары Numbering/Direction.

## 1. Конфигурация и физическая сетка

| Параметр | Значение |
|---|---|
| Cabinet Grid | columns = 4, rows = 3 |
| Cabinet count | 12 |
| Cabinet size | 128 × 128 px |
| Numbering | `column` |
| Start corner | `top-left` |
| Direction | `top-to-bottom` |
| Snake | `true`; контрольный вариант — `false` |

Координаты и индексы нуль-базовые: origin top-left, column растёт вправо, row растёт вниз. Физические лейблы кабинетов сохраняются при изменении логического порядка:

```text
C01 C02 C03 C04
C05 C06 C07 C08
C09 C10 C11 C12
```

## 2. Независимые преобразования

Конвейр: physical position → Numbering → Direction → Snake → cabinetIndex.

Numbering создаёт `TraversalPosition` с полями `axis`, `line`, `offset`, `lineLength`:

| Numbering | axis | line | offset | lineLength |
|---|---|---|---|---|
| `row` | `horizontal` | row | column | columns |
| `column` | `vertical` | column | row | rows |

При `top-left` линии Row идут сверху вниз, линии Column — слева направо. Numbering не применяет Direction или Snake. Ось передаётся явно: числовые line/offset/lineLength сами по себе не определяют её.

Direction проверяет ось и преобразует только offset:

| axis | Direction | Результат Phase 4C |
|---|---|---|
| `horizontal` | `left-to-right` | identity |
| `horizontal` | `right-to-left` | offset = lineLength - 1 - offset |
| `horizontal` | `top-to-bottom` | `UNSUPPORTED_ORDERING` |
| `horizontal` | `bottom-to-top` | `UNSUPPORTED_ORDERING` |
| `vertical` | `top-to-bottom` | identity |
| `vertical` | `bottom-to-top` | `UNSUPPORTED_ORDERING`; отложено до REF-004 |
| `vertical` | `left-to-right` | `UNSUPPORTED_ORDERING` |
| `vertical` | `right-to-left` | `UNSUPPORTED_ORDERING` |

Direction сохраняет axis, line и lineLength. Snake получает уже обработанный Direction traversal и применяет универсальное правило к его offset:

```text
snakedOffset = snake && line % 2 == 1
  ? lineLength - 1 - directedOffset
  : directedOffset

cabinetIndex = line * lineLength + snakedOffset
```

Snake не проверяет Row/Column или Direction; axis, line и lineLength сохраняются. Для REF-003 нечётные линии — столбцы 1 и 3. Все преобразования детерминированы и не меняют входные данные. Traversal и cabinetIndex — производные данные, в проект не сохраняются.

## 3. Snake OFF

Полный логический порядок; каждая строка ниже — последовательный обход одного физического столбца сверху вниз:

```text
C01 C05 C09
C02 C06 C10
C03 C07 C11
C04 C08 C12
```

Матрица cabinetIndex в физической сетке (строки — physical row, столбцы — physical column):

```text
00 03 06 09
01 04 07 10
02 05 08 11
```

Формула: `cabinetIndex = column * 3 + row`.

## 4. Snake ON

Полный логический порядок; столбцы 0 и 2 идут сверху вниз, 1 и 3 — снизу вверх:

```text
C01 C05 C09
C10 C06 C02
C03 C07 C11
C12 C08 C04
```

Матрица cabinetIndex в физической сетке:

```text
00 05 06 11
01 04 07 10
02 03 08 09
```

Формула: `cabinetIndex = column * 3 + (column % 2 == 1 ? 2 - row : row)`.

## 5. Приёмка и границы этапа

- Точный порядок всех 12 физических позиций и лейблов при Snake OFF и ON.
- Все 12 соответствий physical position → cabinetIndex для обеих контрольных матриц.
- Column decomposition: axis = vertical, line = column, offset = row, lineLength = rows; Row сохраняет прежнюю математику и получает axis = horizontal.
- TTB как identity независимо от Snake, включая чётные и нечётные линии.
- Snake независимо поверх готового vertical TTB traversal: OFF сохраняет все линии, ON инвертирует только 1 и 3.
- Все пять неподдерживаемых пар Numbering/Direction отклоняются с `UNSUPPORTED_ORDERING` при Snake OFF и ON; проверяются как Direction отдельно, так и cabinetIndex/cabinetOrder.
- Start corner, отличный от `top-left`, остаётся `UNSUPPORTED_ORDERING`.
- REF-001 и REF-002 сохраняют прежние математические результаты.

Module/Pixel ordering, Hardware Engine, Processor/Port/Receiver, dataIndex, globalRemapIndex, HardwareProfile и UI не входят в Phase 4C.
