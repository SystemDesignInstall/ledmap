# Phase 7D — Serialization report

Статус: **production 7D реализован** на `410ba7fcc830968b615058fe33b6bbea12fb2272` (`feat(core): implement serialization phase 7d`) относительно принятого docs-gate `2a3e08e8379191f3f2e73286361bf04ca6f05f7b` (`docs: accept phase 7d serialization contract`). Приёмка пользователем и docs-only closure ещё не выполнены. 1087/1087 = 836 baseline + 251 новых теста и quality gates ниже — локальные результаты, без CI-подтверждения.

## Baseline и scope

- Принятый docs-gate и непосредственная база production diff: `2a3e08e8379191f3f2e73286361bf04ca6f05f7b`.
- Контракт: `docs/specs/LEDMAP-SERIALIZATION-001.md`, версия 1.0 Accepted; ADR-023 с amendment к ADR-011.
- Закрытые этапы: 7A production `0071eeed001ed2e275e3efb827b216a1d49da1f8`, 7B `2b589ac326ab6bc066d0a55cd295bae05e9fc380`, 7C `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9`.
- Между docs-gate 7D и этим production-коммитом закрыта легализованная Early Alpha UI итерация Project Canvas: docs-gate `0c72dff`, production `ab71ca2`, closure `49d17d7`. Она добавила 9 app-тестов, поэтому фактический regression baseline — 836 тестов вместо 827, указанных в §15.11 спецификации. Математика ядра этим не менялась.
- Изменения production-коммита: девять файлов `packages/core/src/serialization/{types,errors,json,schema,migrate,canonical,reconstruct,api,index}.ts`, одна строка публичного export в `packages/core/src/index.ts`, десять test-файлов и `fixtures.ts` в `packages/core/test/serialization/` и этот отчёт. Всего 21 файл, +2932. Прежние tests, движки 6A/6B/7A/7B/7C, domain types, app, Accepted spec, ADR и TODO этим коммитом не изменены.

Вне scope: file I/O, app Open/Save и IPC, concrete remap rules, реальные migrations, derived-data persistence, hardware profiles/addressers, новая математика и изменения чистоты core (нет `node:*`, Electron, DOM, файловых операций и новых runtime-зависимостей).

## Реализация

Публичный API — `parseProject`, `migrateProjectDocument`, `loadProject`, `serializeProject` и класс `SerializationError` с `path` и опциональным `validation`; типы DTO v1 и `SerializeProjectInput`/`LoadedProject` экспортированы из `@ledmap/core`.

JSON text разбирается собственным strict-парсером без reviver и user callbacks: BOM, comments, trailing commas и trailing text отклоняются как `SERIALIZATION_INVALID_JSON` с path `[]`; обычный JSON whitespace, escapes, surrogate pairs и любой порядок object keys допустимы. Member names сравниваются после decoding, поэтому `"id"` и `"\u0069d"` в одном object дают `SERIALIZATION_DUPLICATE_KEY` с object path и первым повторённым именем. Object properties создаются через `Object.defineProperty`, поэтому `__proto__` остаётся обычным собственным ключом и прототипы не меняются. Non-finite результат парсинга (`1e400`) откладывается до конца чтения и даёт `SERIALIZATION_INVALID_SCHEMA` с path числа; syntax остаётся приоритетнее.

`migrateProjectDocument` проверяет plain JSON tree, discriminator `format`, затем `schemaVersion` как non-negative safe integer: отсутствие, дробь, string, отрицательное и unsafe значение — `SERIALIZATION_INVALID_SCHEMA`, `0` и любое `> 1` — `SERIALIZATION_UNSUPPORTED_VERSION` с path `['schemaVersion']`. Payload неподдерживаемой версии не интерпретируется. Для v1 выполняется закрытый schema walk §5 в нормативном порядке полей, массивы обходятся по возрастанию index, unknown keys проверяются в лексикографическом порядке UTF-16 после known fields. Результат — detached deeply immutable DTO; входной mutable document не замораживается, не мутируется и не удерживается. Реальных migrations нет: только centralized identity path v1.

`loadProject` выполняет parse/version dispatch, затем reconstruct c `as*Id`-преобразованием и восстановлением `Module.localX = column * width`, `localY = row * height`, после чего ровно один `validateProject(project)`. `valid: false` даёт `SERIALIZATION_PROJECT_INVALID` с path `['project']` и неизменённым report 7C. Source values, references и array orders сохраняются; rules передаются в 7C без трактовки. Никакой дополнительной layout/capacity/addressing validation и никаких defaults не добавлено.

`serializeProject` проверяет runtime argument и точное JSON-представительство (plain records, dense arrays без лишних own properties, только data properties, без symbols/functions/bigint/non-finite/undefined/cycle/class instances — `SERIALIZATION_INVALID_INPUT`), затем closed field set: wrapper содержит только `project` и optional `extensions`; runtime Module требует `localX`/`localY`; extensions и optional `Receiver.pixelCapacity` могут быть `undefined` и опускаются. Вызывается ровно один `validateProject` на исходных значениях, и только после успеха создаётся persisted DTO без derived `localX`/`localY`. Caller-owned объекты не мутируются, не замораживаются и не удерживаются; `toJSON` и getters не вызываются. Shared acyclic references сериализуются как повторённые значения, циклы отклоняются.

Canonical output: два пробела, LF, ровно один финальный LF, без BOM; поля §5 в нормативном порядке, отсутствующий `pixelCapacity` не превращается в `null`; extensions keys сортируются рекурсивно по UTF-16 code units, включая numeric-looking и Unicode keys, без reliance на enumeration integer-like keys; JSON arrays не сортируются никогда, включая entity collections и explicit orders; отдельные scalar values сериализуются как `JSON.stringify`, `-0` канонизируется в `0`, без Unicode normalization и округления.

## Acceptance coverage

| Область §15 | Проверки |
|---|---|
| 1. Schema/golden | `golden.test.ts`: exact canonical text минимального документа §14, порядок ключей на каждом уровне, LF/final newline/отсутствие BOM, omission optional capacity, отсутствие derived полей; `schema.test.ts`: unknown fields на всех entity levels, missing required fields, wrong kinds, enum aliases, порядок обхода, known-before-unknown, UTF-16 порядок unknown |
| 2. Source vs derived | `roundtrip.test.ts` и `semantic-load.test.ts`: `localX`/`localY` не пишутся и восстанавливаются, несогласованные runtime local coordinates дают `SERIALIZATION_PROJECT_INVALID` с `HARDWARE_LAYOUT_MISMATCH` без «лечения», derived `cells`/`spans`/`dataIndex`/diagnostics вне extensions отвергаются |
| 3. Syntax | `syntax.test.ts`: malformed JSON, trailing comma/text, comments, BOM, escaped member names и escapes значений, surrogate pairs, duplicate keys на root/nested, escaped-name duplicate, первый duplicate, необычный whitespace и shuffled key order с канонизацией |
| 4. Numbers/strings | parsed overflow с точным path, приоритет syntax, non-finite/NaN/undefined/bigint/function/symbol на save и migrate, `-0 → 0`, MAX_SAFE_INTEGER capacity, fractional и unsafe geometry через 7C, IDs с пробелами и Unicode без normalization |
| 5. Extensions | `extensions.test.ts`: deep preservation, рекурсивная UTF-16 сортировка numeric-looking/Unicode keys, сохранение array order, opaque значения без интерпретации по именам, `__proto__`/`constructor` без изменения прототипов; циклы, accessors и `toJSON` отклоняются и не исполняются |
| 6. Boundary | `semantic-load.test.ts`: parse структурно валидного semantic defect, load/save `SERIALIZATION_PROJECT_INVALID` с точным report 7C, `REMAP_UNSUPPORTED_RULE` внутри report, блокировка Remap при failed Mapping, frozen input, accessors без вызова |
| 7. Versions | `versions.test.ts`: missing/incorrect discriminator, неправильные версии, unsupported 0/2/3/99/MAX_SAFE_INTEGER без интерпретации payload, identity clone без удержания и замораживания входа, non-finite runtime version, class instance/accessor/symbol roots |
| 8. Round-trip | `roundtrip.test.ts`: byte-identical повторные save, source equality с оговорённой normalization, неизменность caller input, deeply immutable loaded document/project/extensions/report, стабильная канонизация эквивалентного текста |
| 9. Behavior reconstruction | `reference-001.test.ts`: REF-001 identity и offset после load, 11 anchors × 2 с forward/reverse сравнением против исходной конфигурации, полный sweep 196 608 pixels для каждого offset, C05/C08 receiver boundary, Port reset на `P01:02` и byte-identical второй save |
| 10. Orders/scale | `orders.test.ts`: multi-processor orders, нетривиальный `Receiver.cabinets`, shuffled entity collections, отсутствие сортировки и allocation, MAX_SAFE_INTEGER capacity при компактном тексте |
| 11. Regression/gates | 836 baseline тестов сохранены без редактирования; полный suite, typecheck, lint, build, Electron smoke и `git diff --check` — ниже |

Новые tests не меняют expected math существующих этапов: файлы 6A/6B/7A/7B/7C не редактировались, их sweeps и anchors остаются в regression suite. Production не перебирает pixels — полный sweep выполняется только в test-файле 7D.

Добавлено 251 тест 7D в 10 файлах; прежние 836 сохранены. Итог: 1087/1087, 43 test-файла.

## Локальные quality gates

Среда: Windows, Node.js v24.19.0, npm 11.17.0. Все результаты ниже локальные; CI-подтверждение не заявляется.

| Команда | Результат |
|---|---|
| `npm test` | PASS — 1087/1087 (836 baseline + 251 новых), 43 файла, 75.46 s |
| `npm run typecheck` | PASS — оба workspaces |
| `npm run lint` | PASS |
| `npm run build` | PASS — Electron main/renderer и core typecheck |
| `npm run test:smoke` | PASS — demo project, selection, properties edit, cabinet hit, drag, REF-001 safety, view modes, add screen, Escape clear |
| `git diff --check` | PASS |

Производный 7D не заявляет приёмки пользователя. Следующий шаг — пользовательская проверка diff относительно `2a3e08e` и отдельное решение о приёмке; после неё выполняется docs-only closure в TODO и ADR-023. File I/O и UI Open/Save остаются Phase 8.
