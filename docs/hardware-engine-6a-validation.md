# Phase 6A — Hardware Engine validation

Дата локальной проверки: 2026-09-24. Контракт принят пользователем и зафиксирован отдельным commit `7f3826a1dec4da3fd1767308482572e8fdc8ade7` (`docs: define hardware engine phase 6a`). Спецификация: [LEDMAP-HARDWARE-ENGINE-001](specs/LEDMAP-HARDWARE-ENGINE-001.md), ADR-018.

## Реализация и public API

Новый чистый `packages/core/src/hardware-engine` экспортирован из корневого barrel core. Cabinet Engine, доменные сущности, app и существующие тесты не изменены.

| Функция | Вход → выход |
|---|---|
| `resolveHardware` | `HardwareTopologyInput` → `ResolvedHardwareMapping` |
| `addressPixel` | Mapping + `CabinetPixelReference` (CabinetId и cabinet-local coordinate) → существующий `PixelAddress` |
| `locatePixel` | Mapping + `PortPixelKey` (processor, port, dataIndex) → `LocatedHardwarePixel` |
| `globalRemapIndex` | Mapping + `PortPixelKey` → отдельный project-wide index |

Новые публичные типы: `HardwareTopologyInput`, `PortReceiverOrder`, `CabinetPixelReference`, `PortPixelKey`, `LocatedHardwarePixel`, `HardwareCabinetSpan`, `HardwareReceiverSpan`, `HardwarePortSpan`, `ResolvedHardwareMapping`.

Input содержит наборы Processor/Port/Receiver/Cabinet/Module, полный `processorOrder` и `receiverOrder` для каждого Port. Порядок Port определяется Port.index, порядок Cabinet — Receiver.cabinets. Receiver.index не управляет порядком. Модули идентифицируются реальными ModuleId и располагаются по module row/column.

Результат содержит замороженные Port → Receiver → Cabinet spans, layout и массив ModuleId на Cabinet. PixelAddress вычисляется по запросу; попиксельного массива адресов нет. Входные коллекции не мутируются и не сохраняются как изменяемые ссылки. Reverse возвращает CabinetId, ModuleId, module-local coordinate и cabinet-local coordinate. Screen/Mapping Region не входят в API.

## Локальные проверки

| Проверка | Результат |
|---|---|
| `npm test` | **336/336**: 252 прежних + 84 новых; 19 файлов |
| `npm run typecheck` | PASS, оба пакета |
| `npm run lint` | PASS |
| `npm run build` | PASS, Electron main/renderer и core typecheck |
| `npm run test:smoke` | PASS, реальное окно Electron и все существующие сценарии Alpha |
| `git diff --check`, staged diff check | PASS |

В Windows команды запускались через `npm.cmd`. Результаты локальные, не GitHub Actions. Ожидаемое сообщение electron-vite об отсутствующем preload сохраняется: Alpha не требует preload API.

## REF-001 full sweep

Проверены все **196608 пикселей** независимым module-by-module обходом с явной последовательностью кабинетов и receiver/port assignment. Проверяется полный PixelAddress, включая реальные ModuleId и module-local coordinates, оба round-trip, уникальность полного ключа и непрерывный global flatten. Oracle не вызывает проверяемые функции Cabinet/Hardware Engine.

- P01:01: 131072 уникальных ключа, dataIndex 0…131071.
- P01:02: 65536 уникальных ключей, dataIndex 0…65535.
- P01:03 и P01:04: пустые, lookup dataIndex=0 отклоняется.
- Global range: 0…196607.
- Resolved representation: 4 Port spans, 3 Receiver spans, 12 Cabinet spans и 192 ModuleId; 196608 PixelAddress не хранятся.

| Граница | dataIndex | globalRemapIndex |
|---|---|---|
| M01 → M02 в C01 | 1023 → 1024 | 1023 → 1024 |
| R01/C04 → R02/C08 | 65535 → 65536 | 65535 → 65536 |
| P01:01 last → P01:02 first | 131071 → 0 | 131071 → 131072 |

T01–T09 и дополнительные screen anchors проверяются тестовой композицией с геометрией REF-001. Production API принимает только cabinet-local координаты.

## Multi-processor и разные размеры Cabinet

Multi-processor fixture содержит P и Z с Port.index=0 и dataIndex=0 у обоих. PortId различны и уникальны по модели. Reverse возвращает Cabinet A для P и Cabinet D для Z; несогласованная пара Processor/Port отклоняется.

Входная коллекция Processor идёт P, Z, а явный порядок — Z, P. При таком порядке global index первого пикселя Z равен 0, первого пикселя P — 6. При явной перестановке P, Z они становятся 217 и 0 соответственно. Port-local адреса и reverse-результаты для всех 223 пикселей остаются прежними.

Variable-size fixture: Cabinet A — 3×2 модуля по 5×7 px (210 пикселей), B — один модуль 2×3 (6 пикселей), C — 1×1 (1 пиксель). Все находятся на одном Port, A/B на первом Receiver, C на втором. Cabinet bases: **0, 210, 216**, Port load **217**. Переход Receiver продолжает счётчик 215 → 216. Полный reverse/forward проверен на всех 217 ключах. Пустые Receiver и Port не добавляют padding.

## Валидация и границы

Проверены unknown/duplicate/missing references и assignments, согласованность родителей, существующие capacity-ограничения, пропущенные и повторные модули, несовместимая геометрия, неподдержанные rotation/flip, некорректные координаты и lookup без полного ключа. Проверены отдельные переполнения Receiver load, Port load и project count при безопасных размерах каждого Cabinet; суммарная граница `Number.MAX_SAFE_INTEGER` принимается, последний global index равен `Number.MAX_SAFE_INTEGER - 1`.

Resolved mapping в 6A доказывает полноту канонических назначений и адресации. Возможности реальных vendor hardware не проверяются. Auto-allocation, новая pixel-capacity Receiver/Port, partial assignments, HardwareProfile, Mapping/Remap, serialization и hardware UI остаются за пределами этапа. Phase 6B не начата.
