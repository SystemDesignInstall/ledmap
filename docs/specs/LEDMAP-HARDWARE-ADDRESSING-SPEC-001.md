# LEDMAP-HARDWARE-ADDRESSING-SPEC-001

## 1. Status and Scope

Статус: **Normative — Phase 2A, documentation / contract only**. Контракт задаёт требования к будущей реализации; executable-проверки движков ещё не добавлены. Согласован с [ADR-015](../DECISIONS.md#adr-015-port-local-dataindex-и-граница-hardwareprofile) и [LEDMAP-REF-001](../reference/LEDMAP-REF-001.md).

Основание проверки репозитория: `4a4d469` (`fix(core): clarify domain addressing model`). Существующие типы сохраняются. Mapping Region ≠ Cabinet; Cabinet Engine независим от vendor hardware.

## 2. Terminology

| Термин | Значение |
|---|---|
| Geometry | Физическое положение кабинета и координаты пикселя, без сигнальных индексов |
| Logical ordering | Детерминированный порядок кабинетов, модулей и пикселей по явной конфигурации LedMAP |
| Hardware topology | Явные Processor, Port, Receiver и назначения кабинетов |
| Physical panel scan / wiring | Аппаратные multiplexing, scan ratio, row mapping, driver-IC addressing, shift-register order |
| `dataIndex` | Zero-based canonical pixel offset inside one Processor Port stream |
| `globalRemapIndex` | Deterministic zero-based flattened order across the complete LedMAP mapping |
| Resolved mapping | Полностью разрешённые назначения и порядки с однозначным соответствием каждого выходного Pixel его PixelAddress |

Все индексы и смещения — целые, нуль-базовые. Единица `dataIndex` — пиксель, не байт, RGB-компонент, бит или такт сканирования. Лейблы P01, R01, C01, M01 — человекочитаемые обозначения, не числовые индексы.

## 3. Addressing Layers

| Слой | Ответственность |
|---|---|
| Geometry | Screen, CabinetGrid, Cabinet, Module, локальные и экранные координаты |
| Cabinet Engine / logical ordering | Геометрия кабинетов, Numbering, StartCorner, Direction, Snake, cabinet index; логический порядок Module/Pixel только по явной конфигурации LedMAP/reference |
| Hardware addressing | Назначения и порядок Receiver на Port, Port на Processor, кабинетов на Receiver; построение port-local `dataIndex` |
| Project flattening | Отдельный derived `globalRemapIndex` поверх resolved mapping |
| HardwareProfile / vendor encoding | Будущий перевод канонического PixelAddress в адрес конкретного receiver/panel/vendor |

Numbering, Direction и Snake остаются независимыми трансформациями. Изменение topology не должно изменять физическую геометрию или конфигурацию Cabinet Engine. I/O, драйверы, пакеты и экспорт живут в `packages/app`; `packages/core` остаётся чистым и детерминированным.

## 4. Pixel vs PixelAddress

**Pixel ≠ PixelAddress.** Pixel описывает физический/логический пиксель: cabinet, module, module-local coordinate, physical, logicalIndex. PixelAddress — отдельная derived addressing-структура. Для valid resolved mapping требуется биекция `Pixel ↔ PixelAddress` по `(cabinet, module, coordinate)`.

Концептуально адрес содержит:

```text
PixelAddress {
    processor
    port
    receiver
    cabinet
    module
    coordinate
    dataIndex
}
```

В существующем TypeScript первые три поля сгруппированы в `hardware: HardwareAddress`; `coordinate` обозначает пиксель внутри указанного модуля. `HardwareAddress` содержит только processor, port, receiver. `globalRemapIndex` не входит ни в HardwareAddress, ни в PixelAddress. В этой фазе типы не меняются, `PixelAddress.dataIndex: number` сохраняется.

## 5. Logical Ordering vs Physical Scan

**Logical Pixel Ordering ≠ Physical Panel Scan / Wiring.** Cabinet Engine не определяет HUB75 multiplexing, scan ratio, row mapping, driver-IC addressing, shift-register order или vendor packet address encoding. Эти детали относятся к будущему HardwareProfile / vendor encoding.

Row-major в reference profile — правило логического обхода. Оно не утверждает универсальную разводку receiver-карт или LED-панелей и не задаёт физический протокол.

## 6. Processor / Port / Receiver topology

Processor / Port / Receiver — явные сущности. Port — граница независимого выходного потока. Receiver принадлежит одному Port конкретного Processor; Cabinet в valid resolved mapping назначен ровно одному Receiver. Ссылки Receiver.processor и Port.processor должны согласовываться.

Для вычисления адреса обязательны разрешённые порядки: Processor в проекте, Port внутри Processor, Receiver внутри Port, Cabinet внутри Receiver, Module внутри Cabinet, Pixel внутри Module. В REF-001 они явно заданы таблицами; порты следуют по возрастанию нуль-базового Port.index, receiver — R01, R02 на первом порту и R03 на втором. Кабинеты следуют в указанном порядке Receiver.cabinets. Лейблы не сортируются для получения сигнального порядка.

Общий способ хранения порядка Processor и scope Receiver.index остаются OPEN (§16); нельзя неявно подменять их порядком обхода коллекций. Auto-allocation не определяется этой спецификацией: формулы используют уже разрешённые назначения.

## 7. dataIndex

Нормативное определение: **zero-based canonical pixel offset inside one Processor Port stream**.

- Каждый занятый Port начинает `dataIndex` с 0.
- Receiver, Cabinet и Module внутри того же Port продолжают счётчик, не сбрасывая его.
- `dataIndex` не processor-global, не HUB75 physical scan index, не vendor packet address, не Pixel.logicalIndex и не физическая координата экрана. Возможное численное совпадение не делает эти понятия тождественными.
- Ключ канонического потока — `(processor, port, dataIndex)`. Голого `dataIndex` недостаточно.
- Для Port с N назначенными пикселями занятый диапазон — `0 .. N-1`, без пропусков. При N=0 диапазон пуст; адреса 0 у пустого порта нет.

Неиспользованные capacity-слоты не добавляют padding. Аппаратные промежутки или выравнивание будущего vendor stream не меняют канонический `dataIndex`.

## 8. globalRemapIndex

`globalRemapIndex` — отдельный derived проектный порядок:

```text
Processor → Port → Receiver → Cabinet → Module → Pixel
```

Он нужен для диагностики, golden reference fixtures, детерминированного сравнения и generic flattened remap export. Это не аппаратный адрес. Индекс непрерывен по всем занятым пикселям проекта; пустые порты не занимают диапазон. При M пикселях диапазон `0 .. M-1`.

Полный порядок проекта должен быть явно определён и воспроизводим. Для будущих multi-processor проектов добавляется порядок процессоров; это влияет только на project flattening. `globalRemapIndex`, PixelAddress, логические индексы и PixelMap не сохраняются в `.ledmap`, а пересчитываются из конфигурации/назначений. Golden fixtures — отдельные тестовые данные, не сериализованный проект.

## 9. Address construction

Концептуальные формулы для resolved mapping:

```text
receiverPortBase = sum(pixelCount(previous receivers on same port))
cabinetReceiverBase = sum(pixelCount(previous cabinets on same receiver))
moduleCabinetBase = sum(pixelCount(previous modules in selected logical module ordering))
pixelModuleOffset = logical pixel offset inside module

dataIndex = receiverPortBase
          + cabinetReceiverBase
          + moduleCabinetBase
          + pixelModuleOffset

portGlobalBase = sum(pixelCount(previous ports according to deterministic project ordering))
globalRemapIndex = portGlobalBase + dataIndex
```

Сумма по пустому префиксу равна 0. Считаются реальные pixelCount, не максимальные ёмкости; разные размеры элементов допускают те же prefix-sum формулы.

Здесь `portGlobalBase` уже включает все предыдущие порты всех предыдущих Processor. Эквивалентная будущая multi-processor декомпозиция: `processorGlobalBase + portProcessorBase + dataIndex`, где portProcessorBase считает только предыдущие порты текущего Processor. Нельзя прибавлять processor base повторно к уже project-global portGlobalBase. Ни один глобальный base не входит в `dataIndex`.

## 10. ReferenceAddressingProfile-001

Нормативный **test-only/reference profile** для REF-001:

| Параметр | Значение |
|---|---|
| Module ordering | Row Major |
| Module start | Top Left |
| Module direction | Left → Right / Top → Bottom |
| Module snake | OFF |
| Pixel ordering inside module | Row Major |
| Pixel start | Top Left |
| Pixel direction | Left → Right / Top → Bottom |
| Pixel snake | OFF |
| Cabinet rotation | 0 |
| Cabinet flip | none |
| Vendor physical panel scan | OUT OF SCOPE |

Сначала полностью обходится один модуль, затем следующий. Для модулей 32×32 в сетке 4×4: `moduleIndex = moduleRow*4 + moduleColumn`, `pixelModuleOffset = pixelY*32 + pixelX`, `cabinetPixelOffset = moduleIndex*1024 + pixelModuleOffset`. Обход целого кабинета формулой `cabinetY*128 + cabinetX` не эквивалентен этому порядку: `(32,0)` внутри кабинета даёт 1024, а не 32.

Cabinet snake из REF-001 меняет порядок кабинетов, но не включает snake модулей или пикселей. Эти правила описывают reference logical ordering LedMAP, а не универсальную разводку receiver-карт. Формат конфигурации Module/Pixel ordering в TypeScript остаётся за рамками этой фазы.

## 11. HardwareProfile boundary

```text
PixelAddress → HardwareProfile.encode(...) → Vendor / receiver / panel-specific address
```

Это только архитектурная граница, не сигнатура готового API. Профиль позднее сможет учитывать scan/wiring, возможности receiver, кодирование пакетов и ограничения vendor. Канонический адрес остаётся независимым от этих преобразований; интерфейс HardwareProfile сейчас не создаётся. Работа с устройствами и экспортом остаётся в app.

Проверенные границы и нормативные решения различаются:

- **Репозиторий:** `signal-path.ts` разделяет HardwareAddress, SignalPath, PixelAddress; `pixel.ts` отдельно определяет Pixel. `receiver.ts`, `port.ts`, `processor.ts` задают явную topology. Это подтверждает структуру, но само по себе не определяет смысл `dataIndex: number`.
- **Hardware research:** NovaLCT описывает настройку receiving cards по выбранному output Ethernet port ([официальное руководство V5.4.7.1, §5.2.2](https://oss.novastar.tech/uploads/2023/06/NovaLCT-LED-Configuration-Tool-for-Multimedia-Player-User-Manual-V5.4.7.1.pdf)). rpi-rgb-led-matrix отдельно предоставляет panel-specific multiplexing, row-address и pixel-mapper настройки ([документация проекта](https://github.com/hzeller/rpi-rgb-led-matrix/blob/master/utils/README.md)). Это свидетельства отдельных hardware concerns, не доказательство универсального скалярного адреса.
- **LedMAP normative decision:** порт как scope/reset для канонического `dataIndex`, отсутствие сброса на Receiver, отдельный `globalRemapIndex`, reference ordering и HardwareProfile boundary устанавливаются этим контрактом и ADR-015. Все LED vendors не обязаны использовать такую representation.

## 12. Invariants

1. Mapping Region ≠ Cabinet; geometry ≠ logical ordering ≠ topology ≠ physical panel scan.
2. Pixel ≠ PixelAddress; для valid resolved mapping связь один-к-одному и обратима.
3. Каждый occupied `(processor, port, dataIndex)` определяет ровно один Pixel; пересечение двух адресов по этому ключу недопустимо.
4. Port сбрасывает `dataIndex`; Receiver на том же Port не сбрасывает.
5. Сумма pixelCount модулей равна pixelCount кабинета, кабинетов — нагрузке Receiver, receiver — нагрузке Port; каждый назначенный пиксель встречается ровно один раз.
6. Для фиксированных конфигурации и topology прямое, обратное отображения и global flattening детерминированы.
7. Производные адреса/индексы не персистятся; отсутствие vendor profile не мешает каноническому reference mapping.

## 13. Reverse Mapping requirements

По `(processor, port, dataIndex)` resolved mapping обязан находить ровно один receiver, cabinet, module и module-local pixel coordinate для каждого occupied index, затем его геометрическую позицию на Screen. Bare-dataIndex lookup без processor+port запрещён.

```text
(P01, Port01, 114688) → R02 → C05 → M01 → Pixel(0,0) → Screen(0,128)
(P01, Port02,      0) → R03 → C09 → M01 → Pixel(0,0) → Screen(0,256)
```

В этих примерах Pixel(0,0) — координата внутри модуля. Обратимость проверяется в обе стороны: `reverse(forward(pixel)) = pixel`, `forward(reverse(key)) = key`. Неизвестные processor/port, пустой порт, отрицательный/дробный/выходящий за диапазон индекс отклоняются; нельзя clamp, wrap или переходить на соседний Port. Конкретные API/diagnostic codes определяются позже.

## 14. Validation requirements

Будущая реализация должна проверять валидность ссылок и согласованность родителей, отсутствие повторных назначений/коллизий, bounds координат, полноту покрытия, допустимость явных порядков, непрерывность диапазонов и ёмкости, заданные конфигурацией. Неоднозначный/неполный mapping не получает статус valid resolved mapping. Промежуточные частичные назначения могут существовать до resolve.

Обязательные документальные boundary assertions REF-001 (пока без executable Engine tests):

| Граница | Последний пиксель: `dataIndex` / `globalRemapIndex` | Следующий пиксель: `dataIndex` / `globalRemapIndex` |
|---|---|---|
| P01:01 → P01:02 | 131071 / 131071 | 0 / 131072 |
| R01 → R02 на P01:01 | 65535 / 65535 | 65536 / 65536 |
| C04 → C08 на P01:01 | 65535 / 65535 | 65536 / 65536 |
| M01 → M02 внутри C01 | 1023 / 1023 | 1024 / 1024 |

Все T01–T09 из REF-001 обязательны. Полная будущая проверка охватывает 196608 пикселей, уникальность адресов, оба reverse round-trip и детерминизм; обратимость не выводится только из девяти якорей. Существующие фабрики ещё не реализуют эти addressing-проверки.

## 15. Out of Scope

Cabinet/Hardware/Mapping/Remap Engines, address calculators, исполняемые REF-тесты, REF-002/003, UI, драйверы, экспортеры, интерфейс HardwareProfile и изменения TypeScript-модели в этой фазе не реализуются. Универсальные правила physical scan не задаются.

## 16. Open Questions

- Хранение/serialization явного `processorOrder` в persisted `.ledmap` проекте. Runtime-порядок Processor и его влияние только на project flattening зафиксированы Phase 6A / ADR-018; REF-001 использует явные списки, порядок нельзя получать из случайного расположения сущностей. Scope/уникальность Receiver.index остаётся отдельным открытым вопросом.
- Модель явной конфигурации логического Module/Pixel ordering вне reference profile, семантика rotation/flip и остальных Direction/StartCorner/Numbering комбинаций.
- Auto-allocation, capacity-модель Receiver (в текущем типе её нет), частичное заполнение и diagnostic codes для некорректных назначений.
- API HardwareProfile, ограничения конкретных vendors и обратимость vendor encoding, отдельная от канонического reverse mapping.
- Корреляция Input→Output для пересекающихся/повёрнутых Mapping Regions; биекция здесь относится к выходному Pixel и его каноническому адресу, а не к выборке входного изображения.

Scope/reset `dataIndex`, разделение `globalRemapIndex` и reference profile REF-001 закрыты нормативно; математическая реализация и её executable-приёмка ещё впереди.
