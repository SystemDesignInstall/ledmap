# LedMAP — Repository Cross-Check №2: Hardware Mapping

Статус: исторический отчёт исследования (сент. 2026), согласован с Phase 2A. Продолжение №1. Первоначальные выводы B5–B7 уточнены: наличие hardware topology не доказывает числовую семантику dataIndex или универсальное vendor addressing. Нормативный источник — [ADR-015](../DECISIONS.md) и [Hardware Addressing Specification](../specs/LEDMAP-HARDWARE-ADDRESSING-SPEC-001.md).

## Цель

Проверить, как устроены **Module scan order, Pixel ordering, Receiver (receiving card) chain, Port→Receiver allocation, dataIndex** в реальных LED-контроллерах/панелях — до фиксации математического контракта Cabinet Engine.

## Матрица №2

| # | Правило LedMAP | Статус | Источник / доказательство |
|---|---|---|---|
| B1 | Snake / Serpentine — отдельная трансформация от направления | **CONFIRMED** | HUB75-реализации: serpentine как отдельный режим цепи панелей. Так же, как №1 (FastLED XYMatrix), но теперь на hardware-уровне |
| B2 | Receiver Chain (кабинет → receiver, daisy-chain) | **CONFIRMED** | NovaLCT/руководства: receiving card принимает данные ПЕРВОГО в цепочке и релеит следующим через jumpered connection; chain order = физическая последовательность подключения; количество receiver'ов и их W×H на порт задаётся конфигом (sender mapping: «вход 1 → receiver 0..N») |
| B3 | Port → Receiver allocation (порт управляет N receiver'ов, каждый своей ёмкостью W×H) | **CONFIRMED** | NovaLCT: порт = группа receiver'ов, receiver = собственная нагрузка (width×height пикселей) + своя позиция в chain. Структурно совпадает с нашей архитектурой Port.receiverCapacity + Receiver.cabinets |
| B4 | Receiver ёмкость — NUMBER (пиксели), не только W×H | **CONFIRMED** | Receiving cards: capacity как число пикселей = загрузка на карту (например 512×256, 384×256 — ограничение по числу точек) |
| B5 | `dataIndex` — канонический pixel offset внутри одного Processor Port stream | **LEDMAP NORMATIVE, ADR-015** | Прежняя пометка CONFIRMED (семантика) отозвана: topology не доказывает scalar representation. Сброс на Port, без сброса на Receiver; это не vendor physical address и не logicalIndex |
| B6 | Processor/Port/Receiver topology отдельно от project-global flattening | **TOPOLOGY подтверждается; flattening — LEDMAP NORMATIVE** | NovaLCT задаёт receiving-card connections выбранного output port. Порядок Processor → Port → Receiver → Cabinet → Module → Pixel в ADR-006 определяет globalRemapIndex, не универсальный packet order |
| B7 | Logical Module/Pixel Ordering отдельно от physical panel scan | **BOUNDARY подтверждается; reference order — LEDMAP NORMATIVE** | rpi-rgb-led-matrix предоставляет multiplexing, row-address и panel mapping настройки. Cabinet Engine использует явный логический профиль LedMAP; аппаратные scan/wiring детали относятся к будущему HardwareProfile |
| B8 | Cabinet Numbering, Direction, Start Corner | **INFERRED / UNKNOWN** | Реальные контроллеры нумеруют receiver в chain по физическому подключению, но дефолт «порядок чтения» — наша логика; start corner остаётся baseline top-left |

## Что это значит для LedMAP

1. **Receiver Chain = физическая связка** (а не математика): порядок receiver'ов и их принадлежность порту — конфигурация/данные, а не производное от сетки кабинетов. Наша модель (Port.receiverCapacity, Receiver.processor/port/cabinets) этому уже соответствует.
2. **`dataIndex`** — zero-based canonical pixel offset inside one Processor Port stream по решению LedMAP. `globalRemapIndex` — отдельный проектный flattening. Первоначальное утверждение, что исследование доказывает оба смысла ADR-006, исправлено.
3. **ModuleOrdering / PixelOrdering** — явная логическая конфигурация LedMAP; для REF-001 ReferenceAddressingProfile-001 задаёт module-first row-major, start top-left, snake OFF на обоих уровнях. Физические scan/wiring и vendor encoding вынесены в будущий HardwareProfile. TypeScript-конфигурация профилей ещё не реализована.
4. Обнаруженные при Phase 2A смешения logical ordering, global flattening и physical scan устранены; отчёт не является доказательством единой адресации всех vendors.

## Source list

Непосредственно перепроверенные источники для границ Phase 2A:

- [NovaLCT V5.4.7.1, официальный manual, §5.2.2](https://oss.novastar.tech/uploads/2023/06/NovaLCT-LED-Configuration-Tool-for-Multimedia-Player-User-Manual-V5.4.7.1.pdf): receiving-card connection в контексте выбранного output port.
- [rpi-rgb-led-matrix, документация настроек](https://github.com/hzeller/rpi-rgb-led-matrix/blob/master/utils/README.md): отдельные multiplexing / row-address / pixel-mapping параметры.

Исторический список исходного исследования ниже сохранён для provenance; его остальные утверждения не объявляются заново проверенными в Phase 2A:

- Open-source HUB75 driver: JuPfu/hub75 (расхождение с «row-major»: колонки, несколько строк за такт)
- rpi-rgb-led-matrix (hzeller): pixel mappers, zigzag/odd-header, multiplexing/row-addr type
- Notebooks/manuals: NovaLCT и руководство серии (chain highlight, receiver order), быстрые старты (B-series)
- Vendor: SREDA, RainbowLED, тыс. Pitch (вспомогательно)
