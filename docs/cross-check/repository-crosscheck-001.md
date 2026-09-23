# LedMAP — Repository Cross-Check №1: Mapping / Remap

Статус: закрыт, без конфликтов. Источник: ручное исследование пользователем реальных open-source проектов LED mapping.

**Уточнение Phase 2A:** ниже сохранены исторические оценки исследования №1, а не нормативные решения LedMAP. Актуальные addressing scope и reference ordering заданы [ADR-015](../DECISIONS.md) и [Hardware Addressing Specification](../specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md). Пометка UNKNOWN означает отсутствие доказательства в том исследовании; она не отменяет последующее нормативное решение о port-local dataIndex. Physical panel scan отделён от logical Module/Pixel ordering.

## Цель

Проверить на внешних реализациях, как устроены **rotation/flip/transforms, ordering (Numbering/Direction/Snake), receiver chain, dataIndex** — до фиксации контракта Cabinet Engine.

## Матрица №1

| # | Правило LedMAP | Статус | Источник / доказательство |
|---|---|---|---|
| A1 | Rotation → Flip (порядок применённых трансформаций) | **CONFIRMED** | XtremeLED: `src/shared/geometry.js` — transform rotation, затем flip; отдельные шаги |
| A2 | Трансформирование = композиция отдельных независимых шагов | **CONFIRMED** | XtremeLED: geometry.js / resolume.js / hippo.js — rotation/flip/output rect как раздельные операции |
| A3 | Snake (serpentine, чередование направления рядов) | **CONFIRMED** | FastLED `XYMatrix` serpentine-альтернирование; `video-to-LED-matrix` — column-oriented serpentine; flip — отдельное |
| A4 | Numbering (Row/Column) | **INFERRED** | XtremeLED не использует cabinet numbering — подтвердить нечем |
| A5 | Direction (L→R / R→L) | **INFERRED** | Отдельных доказательств нет |
| A6 | Start Corner (TL/TR/BL/BR) | **UNKNOWN** | Ни один источник не задаёт corner |
| A7 | Module Ordering | **UNKNOWN** | В источниках отсутствует |
| A8 | Pixel Ordering | **UNKNOWN** | В источниках отсутствует |
| A9 | Receiver Chain (кабинет → receiver, дизайн-цепь) | **UNKNOWN** | XtremeLED не моделирует receiver chain |
| A10 | Precedence Processor→Port→Receiver→Cabinet | **INFERRED** | Общая иерархия видеопроцессоров, прямого доказательства нет |
| A11 | dataIndex | **UNKNOWN** | В источниках отсутствует |
| A12 | Final Remap (пост-коррекция готового маппинга) | **INFERRED** | XtremeLED remap существует, но без LED-специфики |

## Репозитории-кандидаты

| Репозиторий | Статус | Примечание |
|---|---|---|
| MikeXtremeLED/xtremeled-remap-export | CONFIRMED | Использован: geometry.js, resolume.js, hippo.js. НЕ содержит cabinet numbering / snake / receiver chain → для LED-специфики не доказательство |
| FastLED (XYMatrix) | CONFIRMED | Серпентинное чередование рядов |
| video-to-LED-matrix | CONFIRMED | Column-oriented serpentine |
| Pixel Grid | **UNKNOWN** | Есть только имя в ТЗ, URL не сохранён; одноимённые репозитории не подставлялись |
| PolaLED Pro | **UNKNOWN** | URL не сохранён |

## Вывод

- Доказательства, что XtremeLED/FastLED надо «копировать как эталон», нет — они охватывают только геометрические transforms и snake.
- **Module Ordering, Pixel Ordering, Receiver Chain, dataIndex, Start Corner — открытые зоны** → переносятся в Cross-Check №2 (hardware mapping).
- Конфликтов с нашей архитектурой не обнаружено.

## Источник

- `GitHub Repository Inspection.txt` — в репозитории **отсутствует** (внешний файл пользователя, не коммитился).
