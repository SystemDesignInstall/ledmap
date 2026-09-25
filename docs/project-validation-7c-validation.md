# Phase 7C — Project Validation report

Статус: production candidate для приёмки пользователем; Phase 7C ещё не закрыта.

## Baseline и scope

- Принятый docs-gate и непосредственная база production diff: `a795717a877130b3667420e89790186b876e0e35`.
- Контракт: `docs/specs/LEDMAP-PROJECT-VALIDATION-001.md`, версия 1.0 Accepted; ADR-022.
- Закрытая 7B: production `2b589ac326ab6bc066d0a55cd295bae05e9fc380`, closure `fb02d53101af1fdb6ceefe3ea162252221da64b8`.
- Regression baseline: 625 тестов. Candidate — коммит `feat(core): implement project validation phase 7c`, содержащий этот отчёт; SHA сообщается после создания коммита.

Изменения: четыре production-файла `packages/core/src/validation/{types,input,validate,index}.ts`, публичный export в `packages/core/src/index.ts`, четыре test-файла в `packages/core/test/validation/` и этот отчёт. Всего 10 файлов. Прежние tests, Cabinet/Hardware/Mapping/Remap, domain types, Accepted spec, ADR, TODO и app не изменяются этим коммитом.

Реализация и все финальные проверки выполнены в отдельном worktree от принятого docs-gate. Независимые локальные изменения Alpha UI в основном рабочем дереве в candidate и проверки не включались. Worktree использует установленные npm dependencies через directory junctions; исходники и конфигурация проверялись из worktree.

## Реализация

`validateProject()` принимает single-profile runtime-контекст `ValidateProjectInput`, выполняет shape check, затем один `resolveMapping()` и один `resolveRemap()` при успешном предыдущем этапе. Отдельного вызова `resolveHardware()` нет — Hardware проверяется внутри 7A. Allocator и pixel lookup не вызываются.

Shape check использует закрытое описание полей в нормативном порядке §5. Читаются собственные property descriptors, включая элементы entity/reference arrays; accessors не вызываются. Runtime-kind и string unions отделены от numeric/geometry/capacity semantics движков. Неизвестные поля не обходятся и не удаляются. `rules` проверяется только как обычный массив; его элементы не читаются. Optional `pixelCapacity` может отсутствовать или быть undefined.

Структурные ошибки накапливаются в depth-first schema order, array indices идут по возрастанию; после неверного container descendants пропускаются. При shape errors обе зависимые стадии blocked by input. Первый Mapping DomainError блокирует Remap. Remap DomainError завершает последнюю стадию failed.

Upstream code/message сохраняются буквально. Mapping errors получают path `['mapping']`, REMAP_UNSUPPORTED_RULE — `['rules']`, остальные Remap DomainError — `[]`. Парсинга message нет. Unexpected exceptions повторно выбрасываются, включая объекты с похожим полем code, не являющиеся DomainError.

Результат содержит только `valid`, `diagnostics`, `checks`. Report, каждый diagnostic/check/path и содержащие их массивы заморожены. Mutable input не замораживается, не мутируется и не удерживается. Derived snapshots остаются временными.

`valid` сохраняет ограниченное значение принятого контракта: структурная корректность и работоспособность текущего Mapping/Remap профиля, без сертификата всех инвариантов будущего проекта/монтажа/export. Нет warning/info, semantic all-errors aggregation, исправления входа, новой Project model, serialization или новой математики.

## Acceptance coverage

| Область | Проверки |
|---|---|
| Structure | Missing required fields/elements всех существующих entity fixtures; wrong kinds, enum tokens, optional capacity, sparse reference arrays; точные paths, порядок и отсутствие descendant noise |
| Descriptors | Getters на wrapper, nested fields, entity/reference array elements и optional capacity не вызываются; inherited fields не подменяют собственные; non-enumerable data fields и null-prototype record |
| Mapping/Hardware | Изолированные reference/membership, source bounds, size/overflow, cells, duplicate CabinetId vs physical collision, layout, unsupported transform, assignments/orders, parent mismatch; capacities Receiver/Port/Processor |
| Upstream identity | Code/message сравниваются с прямым resolveMapping на том же входе; Cabinet Engine code без namespace также сохраняется |
| Remap | Empty, malformed/unknown/primitive/sparse rules; getters элементов и descriptor fields не читаются; реальный REMAP_INVALID_VALUE от shared extra field получает root path |
| Mixed defects | Shape блокирует semantic stages; первая Mapping error блокирует непустой Remap; нет фиктивных downstream diagnostics |
| Unexpected exceptions | Exact exception identity сохраняется для Mapping/Remap; произвольный объект с code не маскируется под DomainError |
| Ownership | Mutable/frozen inputs и все четыре исхода pipeline; frozen checks, diagnostics и paths; мутации source после проверки не меняют report |
| Determinism / orders | Повторные проверки, валидные entity-array permutations, multi-processor explicit order и Port-local reset сохраняются; входные массивы не сортируются |
| Scope | Известная, но неподдерживаемая ordering API комбинация не добавляет semantic checks; physical origins не валидируются заново; unused capacity не создаёт warnings/auto-allocation |
| Compactness | MAX_SAFE_INTEGER pixels на одной Cabinet/Module entity и Grid с миллиардом columns без списка missing cells; только компактный report |
| REF-001 | Identity и offset проходят три стадии; spies подтверждают один Mapping и Remap, Hardware внутри 7A, отсутствие allocator и pixel lookup |

Новые tests не выполняют новый полный pixel sweep: прежние 7A/7B forward/reverse sweeps и anchors остаются в неизменённом regression suite. Production не перебирает pixels.

Вся указанная coverage прошла. Добавлены 202 теста 7C; прежние 625 тестов сохранены без редактирования. Итог: 827/827, 32 test-файла.

## Локальные quality gates

Среда: Windows, Node.js v24.19.0, npm 11.17.0. Все результаты ниже локальные; CI-подтверждение не заявляется.

| Команда | Результат |
|---|---|
| `npm test` | PASS — 827/827 (625 baseline + 202 новых), 32 файла, 119.09 s |
| `npm run typecheck` | PASS — оба workspaces |
| `npm run lint` | PASS |
| `npm run build` | PASS — Electron main/renderer и core typecheck |
| `npm run test:smoke` | PASS — creation, 8 ordering modes, Canvas labels, rectangular layout, invalid input, limits, degenerate grids, resize, DPR=2 |
| `git diff --check` | PASS; staged diff также проверен |

Приёмка production Phase 7C остаётся отдельным решением пользователя после проверки SHA и diff относительно принятого docs-gate.
