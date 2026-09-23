# LEDMAP-REF-004 — Bottom-to-Top cabinet ordering

Статус: **Normative — Phase 4D**. Спецификация расширяет Column ordering из [REF-003](LEDMAP-REF-003.md) направлением Bottom→Top и фиксирует независимую композицию Direction и Snake.

## 1. Конфигурация и физическая сетка

| Параметр | Значение |
|---|---|
| Cabinet Grid | columns = 4, rows = 3 |
| Cabinet count | 12 |
| Cabinet size | 128 × 128 px |
| Numbering | `column` |
| Start corner | `top-left` |
| Direction | `bottom-to-top` |
| Snake | `true`; контрольный вариант — `false` |

Координаты и индексы нуль-базовые: origin top-left, column растёт вправо, row растёт вниз. Физические лейблы не меняются при изменении логического порядка:

```text
C01 C02 C03 C04
C05 C06 C07 C08
C09 C10 C11 C12
```

## 2. Независимые преобразования

Конвейр: physical position → Numbering → Direction(BTT) → Snake → cabinetIndex.

Для Column + Top Left Numbering задаёт `axis = vertical`, `line = column`, `offset = row`, `lineLength = rows`. Линии идут слева направо. Numbering не применяет Direction или Snake.

Direction(BTT) инвертирует offset на каждой вертикальной линии, независимо от её чётности:

```text
directedOffset = lineLength - 1 - offset
```

Direction сохраняет axis, line и lineLength. StartCorner остаётся `top-left`: начало обхода снизу получается преобразованием Direction, а не изменением физической системы координат или StartCorner.

Snake получает уже обработанный Direction traversal и независимо применяет:

```text
snakedOffset = snake && line % 2 == 1
  ? lineLength - 1 - directedOffset
  : directedOffset

cabinetIndex = line * lineLength + snakedOffset
```

Snake сохраняет axis, line и lineLength. На нечётных столбцах 1 и 3 вторая инверсия возвращает исходный row. Все преобразования детерминированы и не меняют входные данные. Traversal, логический порядок и cabinetIndex — производные данные, в проект не сохраняются.

## 3. Snake OFF

Полный логический порядок; каждая строка ниже — обход одного физического столбца снизу вверх:

```text
C09 C05 C01
C10 C06 C02
C11 C07 C03
C12 C08 C04
```

Матрица cabinetIndex в физической сетке (строки — physical row, столбцы — physical column):

```text
02 05 08 11
01 04 07 10
00 03 06 09
```

Формула: `cabinetIndex = column * 3 + (2 - row)`.

## 4. Snake ON

Полный логический порядок; столбцы 0 и 2 идут снизу вверх, 1 и 3 — сверху вниз:

```text
C09 C05 C01
C02 C06 C10
C11 C07 C03
C04 C08 C12
```

Матрица cabinetIndex в физической сетке:

```text
02 03 08 09
01 04 07 10
00 05 06 11
```

Формула: `cabinetIndex = column * 3 + (column % 2 == 1 ? row : 2 - row)`.

## 5. Матрица поддержки после Phase 4D

| Numbering / axis | LTR | RTL | TTB | BTT |
|---|---|---|---|---|
| `row` / `horizontal` | identity | инверсия offset | unsupported | unsupported |
| `column` / `vertical` | unsupported | unsupported | identity | инверсия offset |

Поддерживается только StartCorner `top-left`. `top-right`, `bottom-right`, `bottom-left` остаются unsupported. Все неподдерживаемые варианты отклоняются с `UNSUPPORTED_ORDERING` при Snake OFF и ON.

## 6. Приёмка и границы этапа

- Точный порядок всех 12 физических позиций и лейблов при Snake OFF и ON.
- Все 12 соответствий physical position → cabinetIndex для обеих контрольных матриц.
- BTT отдельно инвертирует offset на чётных и нечётных вертикальных линиях, сохраняя остальные поля и входные данные.
- Snake отдельно поверх BTT traversal: OFF сохраняет directedOffset, ON инвертирует только нечётные линии.
- Детерминизм, неизменность frozen inputs и взаимная согласованность cabinetOrder/cabinetIndex.
- Вырожденные сетки 1×1, 1×3 и 4×1 сохраняют корректный порядок при Snake OFF и ON.
- Четыре несовместимые пары Numbering/Direction и три неподдерживаемых StartCorner продолжают отклоняться.
- REF-001, REF-002 и TTB-раскладки REF-003 сохраняют прежние результаты.

Production-изменение ограничено `direction.ts`; `numbering.ts` и `snake.ts` не меняются. Module/Pixel ordering, Hardware Engine, Processor/Port/Receiver, dataIndex, globalRemapIndex, HardwareProfile и UI не входят в Phase 4D.
