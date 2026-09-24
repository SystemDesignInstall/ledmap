# Phase 7A — Mapping Engine validation

Дата локальной проверки: 2026-09-24. Контракт: [LEDMAP-MAPPING-001](specs/LEDMAP-MAPPING-001.md), ADR-020. Docs-only gate принят на `247ed4abb499394f8a49ab58b1d3340166769241`; после проверки этого SHA пользователь отдельно разрешил production-реализацию 7A. Реализация представляется к приёмке, пользовательская приёмка ещё не выполнена.

## Реализация и public API

Добавлены `InputCanvas`, `CreateInputCanvasInput`, `InputCanvasId`, `asInputCanvasId` и `createInputCanvas`. В `MappingRegion` и её фабрике обязательна ссылка `inputCanvas`; `position/size` обозначают source rect. Фабрики проверяют safe-integer размеры и координаты. Новые exports доступны через корневой barrel core.

| API | Контракт |
|---|---|
| `resolveMapping` | Один InputCanvas/Screen/Grid/Region и полная HardwareTopologyInput → компактный immutable ResolvedPixelMap |
| `mapInputPixel` | InputCanvasId и Input coordinate → полный MappedPixel |
| `unmapHardwarePixel` | Полный `(processor, port, dataIndex)` → тот же MappedPixel |

Публичные типы Mapping: `ResolveMappingInput`, `InputPixel`, `MappedPixel`, `MappingCabinetCell`, `ResolvedPixelMap`.

`resolveMapping` проверяет references/membership, safe-integer bounds, полное покрытие physical cells, одинаковый Cabinet pixel size, размеры Region/Screen/Grid. Hardware snapshot строится из того же входа через существующий строгий `resolveHardware`. Partial topology не дополняется, allocation не вызывается.

Forward вычитает Region.position, находит физическую cell по column/row и Cabinet-local coordinate по pixel geometry; `addressPixel` возвращает аппаратный адрес. Reverse вызывает `locatePixel`, восстанавливает Grid coordinate из cell и Cabinet-local coordinate, затем добавляет Region.position. `globalRemapIndex` остаётся отдельным API 6A.

Physical lookup не использует `cabinetIndex`, `cabinetOrder`, Numbering/Direction/Snake или physical width/height/origin. В output snapshot физические cells расположены row-major независимо от порядка входных массивов и сигнальных назначений.

## REF-001 acceptance

| Fixture | InputCanvas | Source rect | Screen/Grid |
|---|---|---|---|
| Identity | 512×384 | origin (0,0), size 512×384 | 4×3 Cabinets по 128×128 px |
| Offset | 1920×1080 | origin (100,50), size 512×384 | тот же Grid и hardware topology |

Обе fixtures используют Row/LTR/Snake ON metadata и принятую explicit topology REF-001. Ожидаемые значения вычисляются из независимых reference tables/formulas, без production lookup в expected data.

- Для каждой fixture forward sweep охватывает все 196 608 Input pixels и сравнивает все поля MappedPixel; reverse lookup возвращает тот же результат. Проверяется 196 608 уникальных аппаратных ключей.
- Для каждой fixture отдельный reverse traversal проходит занятые диапазоны Port по независимому Cabinet/Module/Pixel обходу. Проверяются input coverage, forward round-trip, Port-local нагрузки 131 072/65 536 и непрерывный globalRemapIndex.
- Все 11 нормативных anchors проверены на обеих fixtures и в обоих направлениях: 11 × 2 fixtures = 22 PASS. Они покрывают Module/Cabinet/Receiver/Port boundaries и различие physical position/signal order у C05/C08.
- Offset endpoints: `(100,50)` → C01 local `(0,0)`; `(611,433)` → C12 local `(127,127)`. Внешние `(99,50)`, `(100,49)`, `(612,433)`, `(611,434)` отклоняются без clamp/wrap.

Всего четыре полных обхода: два forward sweep и два независимых reverse traversal по 196 608 pixels каждый. Попиксельные коллекции существуют только в тестах для проверки уникальности/coverage.

## Validation, независимость ordering и snapshot

Новые тесты отдельно проверяют:

- `MAPPING_DUPLICATE` для разных CabinetId в одной cell; `HARDWARE_DUPLICATE` от 6A для повторного CabinetId.
- Missing/out-of-range cells, foreign references, Screen membership, source bounds, неодинаковый Cabinet pixel size, размеры Region/Screen, NaN/Infinity/unsafe значения и переполнение арифметики.
- Передачу ошибок 6A/6B: incomplete assignments, Receiver capacity, Module geometry, unsupported Cabinet transforms, unknown/out-of-range hardware keys и пустой Port.
- Все восемь поддерживаемых Row/Column/Direction/Snake комбинаций при фиксированной topology: geometry и hardware address не меняются. Изменение Receiver.cabinets меняет только ожидаемый hardware address.
- Перестановки entity arrays и произвольные Cabinet labels; физические и pixel размеры различаются; прямоугольные Cabinet/Module pixels; сетки 1×1, 1×N, N×1. Разные Module grids допустимы при одинаковом Cabinet pixel size.
- Один Grid на двух Processor: одинаковый численный dataIndex различается полным ключом; явный processorOrder определяет отдельный globalRemapIndex.
- Deep-frozen вход, детерминизм, глубоко immutable resolved/lookup outputs и отсутствие изменяемых ссылок на вход. Последующие изменения входных моделей, вложенных объектов и аппаратных массивов не меняют snapshot.
- Компактность: при одном Cabinet/Module коллекции имеют одинаковые размеры для одного pixel и `Number.MAX_SAFE_INTEGER` pixels; последний допустимый pixel проходит forward/reverse.

## Локальные проверки

Команды запускаются через `npm.cmd` из-за политики PowerShell для `npm.ps1`.

| Проверка | Результат |
|---|---|
| `npm test` — полный прогон | 543 passed (27 files), 0 failed, 0 skipped |
| Regression baseline без новых mapping тестов | 425 passed (23 files), 0 failed |
| Новые Phase 7A tests | 118 (543 − 425), из них 14 domain + 104 mapping-engine |
| Identity/Offset forward sweep | 196608 / 196608 каждая, в обоих fixture |
| Identity/Offset reverse traversal | 196608 / 196608 каждая |
| 11 anchors | 11 normative anchors × 2 fixtures = 22/22 PASS |
| Unique hardware keys | 196608 / 196608 |
| `npm run typecheck` | PASS, оба workspace |
| `npm run lint` | PASS |
| `npm run build` | PASS, Electron app и core |
| `npm run test:smoke` | PASS, существующий Electron smoke |
| `git diff --check` | PASS |

Сборка сохраняет предупреждение `preload config is missing`; Electron smoke проходит. Все результаты локальные; подтверждение CI не заявляется.

Финальный полный прогон 2026-09-24: 543 tests, 27 files, duration ~47s.

## Границы изменений

Изменены только Mapping/InputCanvas domain additions, новый `mapping-engine`, связанные barrel exports, новые tests/fixtures и этот отчёт. Существующие 425 тестов не редактировались по содержанию; в двух REF-001 hardware тестах (`hardware-engine/reference-001.test.ts`, `hardware-engine/allocation-reference-001.test.ts`) таймаут полного пиксельного свипа поднят с 60000 до 120000 ms: assertion'ы и ожидаемые значения не менялись, правка вызвана параллельным прогоном дополнительных mapping-свипов в полном наборе. Production Hardware Engine и Cabinet Engine, их математика и addressing API не изменены.

Remap 7B, serialization, UI, OutputRect/transforms, allocation, HardwareProfile и vendor addressing не входят в production-изменения 7A. Посторонние рабочие изменения app package и новые документы других направлений не включаются в коммит 7A.
