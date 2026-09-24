# Phase 7B — identity-only Remap validation

Статус: production candidate для приёмки пользователем; этап ещё не закрыт.

## Baseline и scope

- Принятый docs-gate и непосредственная база production diff: `52395cb9bc2c7d1ae358e838c80a7136ef535dcd`.
- Контракт: `docs/specs/LEDMAP-REMAP-001.md`, версия 1.0 Accepted; ADR-021.
- Upstream production 7A: `0071eeed001ed2e275e3efb827b216a1d49da1f8`; regression baseline — 543 теста.
- Candidate — коммит `feat(core): implement remap phase 7b`, содержащий этот отчёт. Его SHA сообщается отдельно после создания коммита.

Изменения: пять файлов `packages/core/src/remap-engine/`, публичный экспорт в `packages/core/src/index.ts`, три файла `packages/core/test/remap-engine/` и этот отчёт. Всего 10 файлов. Прежние тесты и production-файлы Cabinet/Hardware/Mapping не изменены. Accepted spec, ADR и TODO не меняются этим production-коммитом.

Не входят: concrete rules, Mapping transforms, hardware-final addressing, serialization, 7C validation, UI. Существующее локальное изменение `packages/app/package.json` (только dev-script) не включено в candidate; команды проверок его не используют.

## Реализация

`resolveRemap()` однократно считывает `mapping` и `rules` из caller-owned wrapper, затем проверяет массив `rules` и immutable boundary `mapping` до проверки длины правил. Mutable snapshot или mutable вложенные данные дают `REMAP_INVALID_VALUE`, в том числе при непустом `rules`. Любой непустой массив после успешной проверки boundary даёт `REMAP_UNSUPPORTED_RULE`; элементы массива и их `id/version/type` не интерпретируются.

Проверка immutability обходит компактный граф snapshot, включая non-enumerable и symbol properties, использует локальный `WeakSet` для уже посещённых объектов. Замороженные accessors, функции и объекты с изменяемым внутренним состоянием (`Map`, `Set`, `Date`) не принимаются как immutable snapshot data. Проверка не замораживает вход, не доказывает provenance и не повторяет semantic validation Mapping/Hardware. `resolveMapping()` из production Remap не вызывается.

Результат — `Object.freeze({ source: mapping, rules: Object.freeze([]) })`, где `mapping` — проверенный snapshot. Snapshot 7A разделяется по ссылке; caller-owned wrapper и массив правил не удерживаются. Getter в wrapper не может подменить snapshot между проверкой и сохранением ссылки: поля повторно не читаются. Собственной pixel-sized таблицы, копии snapshot или постоянного validation cache нет. Тест с `Number.MAX_SAFE_INTEGER` проверяет compactness и последний допустимый pixel без полного sweep.

Forward/reverse напрямую делегируют в `mapInputPixel()` / `unmapHardwarePixel()`. Перехвата и переименования upstream errors нет. Production генерирует только два активных `REMAP_*` кода; reserved-коды не используются.

## Acceptance coverage

| Проверка | Объём |
|---|---|
| Identity forward pass-through | Все 196 608 pixels, сравнение с 7A и независимым `expectedReference` |
| Offset forward pass-through | Все 196 608 pixels, source offset `(100,50)`, последний pixel `(611,433)` |
| Независимый reverse traversal | 196 608 занятых keys на каждой fixture: 131 072 на P01:01, 65 536 на P01:02 |
| Anchors | 11 × 2 fixtures: Module/Cabinet/Receiver/Port boundaries, C05 physical-vs-signal distinction |
| Полнота и round-trip | Уникальные hardware keys и обратные input coordinates, обе стороны round-trip, port-local reset и globalRemapIndex |
| Input boundary / error order | Некорректная оболочка/массив; mutable и shallow-frozen mapping; приоритет INVALID_VALUE над UNSUPPORTED_RULE |
| Nonempty rules | Неизвестные/отсутствующие/некорректные descriptor fields, null/undefined/primitive, sparse array; getter элемента не читается |
| Ownership | Mutable wrapper/rules не замораживаются, мутации после вызова не меняют lookup, собственный frozen rules array, shared immutable source |
| Immutability и determinism | Deep-frozen input/output, повторные вызовы, эквивалентные snapshots, compactness при MAX_SAFE_INTEGER |
| Upstream errors | Полные code/message для MAPPING/HARDWARE INVALID_VALUE, UNKNOWN_REFERENCE, OUT_OF_RANGE; bounds offset-region и обоих портов |

Все перечисленные проверки PASS: identity и offset forward — по 196 608 / 196 608, reverse — по 196 608 / 196 608, anchors — 22 / 22. Новых тестов 82: 56 focused contract tests и 26 REF-001 tests (22 anchors + 2 forward sweeps + 2 reverse traversals). Прежние 543 теста сохранены без редактирования.

В sweeps сравниваются все поля `MappedPixel`; ожидания не вычисляются через production Remap API. Reverse traversal независимо перечисляет Cabinet/Module/Pixel ranges, а не использует результат forward sweep как список ключей.

## Локальные quality gates

Среда: Windows, Node.js v24.19.0, npm 11.17.0. Все результаты локальные; CI-подтверждение не заявляется.

| Команда | Результат |
|---|---|
| `npm test` | PASS — 625/625, 29 файлов, 100.04 s |
| `npm run typecheck` | PASS — оба workspaces |
| `npm run lint` | PASS |
| `npm run build` | PASS — Electron renderer/main и core typecheck |
| `npm run test:smoke` | PASS — создание экрана, 8 ordering modes, Canvas labels, rectangular layout, invalid input, limits, degenerate grids, resize, DPR=2 |
| `git diff --check` | PASS; staged diff также проверен |

Приёмка production Phase 7B остаётся отдельным решением пользователя после проверки SHA и diff относительно принятого docs-gate.
