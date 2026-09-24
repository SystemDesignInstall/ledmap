# Phase 6B — Hardware allocation validation

Дата локальной проверки: 2026-09-24. Утверждённый контракт: [LEDMAP-HARDWARE-CAPACITY-001](specs/LEDMAP-HARDWARE-CAPACITY-001.md), ADR-019; docs-commit `a8c6fb0`. Реализация готова к приёмке; пользовательская приёмка реализации ещё не выполнена.

## Реализация и public API

`allocateHardware(input: AllocateHardwareInput): AllocationProposal` экспортирован через существующий barrel core вместе с типами `AllocateHardwareInput`, `AllocationProposal` и `AllocationDiagnostic`.

Input расширяет `HardwareTopologyInput` явным `cabinetOrder` только для неназначенных кабинетов. Allocator проверяет entities, skeleton, references, уникальность и полноту порядков, fixed assignments и фактическую Cabinet/Module geometry через существующий `resolveCabinetLayout`.

First-fit для каждого целого Cabinet начинает поиск по `processorOrder → Port.index → receiverOrder`. Fixed assignments сохраняют владельца и внутренний порядок; новые кабинеты добавляются в конец. Непоместившийся Cabinet или перегрузка fixed assignments вызывают `HARDWARE_CAPACITY_EXCEEDED`, без частичного результата и переразмещения.

Результат содержит отдельную замороженную explicit topology. Receiver пересоздаются через `createReceiver`, массивы и вложенные Cabinet.origin копируются и замораживаются. Входные объекты не мутируются и не замораживаются allocator'ом. Перед возвратом proposal обязательно вызывается `resolveHardware(topology)`.

`Receiver` и `CreateReceiverInput` получили опциональный `pixelCapacity` — positive safe integer. При отсутствии лимита поле не добавляется фабрикой и Receiver не выдаёт unused-pixel диагностику. `resolveHardware` получил только аддитивную проверку заданного лимита относительно суммы Cabinet-спанов; он по-прежнему отвергает частичные назначения.

Диагностики сообщают недозаполнение с единицами по уровню: Receiver — `pixels`, Port — `receivers`, Processor — `ports`. Они вычисляются из полной topology и не записываются в сущности как состояние загрузки.

## REF-001 reconstruction

Вход: существующая reference topology со снятыми назначениями, лимитом 65 536 pixels на Receiver и явным порядком `C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12`.

| Receiver | Назначенные Cabinets | Нагрузка |
|---|---|---|
| R01 | C01 C02 C03 C04 | 65 536 px |
| R02 | C08 C07 C06 C05 | 65 536 px |
| R03 | C09 C10 C11 C12 | 65 536 px |

`resolveHardware(allocateHardware(input).topology)` полностью равен `resolveHardware(referenceTopology())`. Независимый ожидаемый обход проверяет все 196 608 адресов, оба round-trip, уникальность полных ключей `(processor, port, dataIndex)` и непрерывный `globalRemapIndex`. Port-local нагрузки: 131 072 и 65 536 pixels; индекс второго Port начинается с нуля.

## Локальные проверки

Команды npm выполнены через `npm.cmd` из-за политики PowerShell для `npm.ps1`.

| Проверка | Результат |
|---|---|
| `npm test` | 425/425, 23 test files; прежние 336 тестов сохранены без правок, добавлено 89 |
| `npm run typecheck` | PASS, оба workspace |
| `npm run lint` | PASS |
| `npm run build` | PASS, Electron app и core |
| `npm run test:smoke` | PASS, существующий Electron smoke без изменений |
| `git diff --check` | PASS |

Сборка сообщает существующее предупреждение `preload config is missing`; Electron smoke проходит. Все результаты локальные, подтверждение CI не заявляется.

Новые тесты покрывают точный лимит и превышение на 1 px, variable-size Cabinets, first-fit с возвратом к раннему Receiver, невозможность split/backtracking, fixed overload, append, явные порядки, отсутствие лимита, пустые сущности, диагностики всех уровней, некорректный skeleton/geometry, safe-integer overflow, детерминизм и независимость frozen результатов от изменяемых входов.

## Границы diff

Production: новый `hardware-engine/allocate.ts`, дополнительные exports в `hardware-engine/index.ts`, optional capacity в `model/receiver.ts`, аддитивная проверка в `hardware-engine/resolve.ts`.

Тесты: новый `domain/receiver.test.ts`, allocation fixtures и три allocation test-файла. Существующие тесты, `address.ts`, `layout.ts`, Cabinet Engine и app не изменены. Обновлён TODO и добавлен этот отчёт.

Семантика `dataIndex`/`globalRemapIndex`, addressing/spans/order сохранена. Создание новых Receiver/Port, split Cabinet, serialization, Mapping/Remap, HardwareProfile, hardware UI и Phase 7 не входят в реализацию.
