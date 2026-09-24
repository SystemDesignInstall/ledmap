# LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001

**Название:** Hardware Profile & Addressing Specification
**Проект:** LedMAP
**Версия:** 1.0 Draft
**Статус:** Normative Architecture / Mathematical Contract
**Зависимости:** Cabinet Engine → Module Engine → Receiver & Processor Engine
**Следующий документ:** Final Remap & ReverseIndex Specification

---

# 1. Назначение

Этот документ определяет формальный контракт между:

```text
PHYSICAL LED MODEL
        ↓
MODULE / PIXEL TRANSPORT
        ↓
RECEIVER
        ↓
PORT
        ↓
PROCESSOR
        ↓
ADDRESS ENCODER
        ↓
HARDWARE ADDRESS
```

Hardware-specific правила **не должны быть зашиты непосредственно** в Cabinet Engine, Receiver Engine, Port Allocator или Remap Engine.

Текущая архитектура LedMAP уже требует выделить отдельные:

```text
Receiver Profile
Processor Profile
Port Profile
Addressing Profile
```

поскольку именно конкретное оборудование определяет capacity, chain rules, split rules и Final Address Encoding.

---

# 2. Главный архитектурный принцип

```text
ENGINE ≠ HARDWARE KNOWLEDGE
```

Engine знает:

```text
как выполнить правило
```

Hardware Profile знает:

```text
какое правило использовать
```

Например, Receiver Engine не должен содержать:

```text
if manufacturer == "X":
    maxPixels = ...
```

Вместо этого:

```text
ReceiverEngine
        ↓
ReceiverProfile
        ↓
constraints
```

То же относится к:

```text
Processor
Port
Pixel Scan
Receiver Chain
Addressing
Transport Pixels
Split Rules
```

---

# 3. Что уже считается установленным

В текущей архитектуре уже зафиксированы отдельные ограничения для Port, Receiver и Processor.

`PortProfile` должен поддерживать как минимум:

```text
maxPixels
maxReceivers
maxWidth
maxHeight
maxCabinets
```

`ReceiverProfile`:

```text
maxPixels
maxModules
maxCabinets
maxWidth
maxHeight
chainLimit
allowedSplitLevel
```

`ProcessorProfile`:

```text
maxPorts
maxPixels
maxWidth
maxHeight
portProfiles[]
```



Этот документ не отменяет эту модель, а формализует и расширяет её.

---

# 4. Hardware Profile Bundle

Основной объект:

```text
HardwareProfileBundle
{
    id
    version

    manufacturer
    family
    model

    processorProfile
    portProfiles[]
    receiverProfiles[]
    moduleProfiles[]

    addressingProfile
}
```

`HardwareProfileBundle` является полным набором правил, необходимым для расчёта hardware topology и HardwareAddress.

---

# 5. Profile Identity

Каждый профиль MUST иметь стабильный идентификатор.

```text
ProfileIdentity
{
    id
    version
}
```

Например:

```text
id      = "generic.receiver.ref001"
version = "1.0"
```

Изменение параметров профиля, способное изменить FinalRemap, MUST приводить к изменению версии профиля.

---

# 6. Processor Profile

```text
ProcessorProfile
{
    id
    version

    manufacturer
    model

    maxPorts

    maxPixels?
    maxWidth?
    maxHeight?

    portProfileIds[]

    addressingProfileId
}
```

`?` означает, что ограничение может отсутствовать.

Processor MUST проверяться независимо от ограничений Ports.

То есть допустимость всех Ports ещё не означает автоматически допустимость Processor.

---

# 7. Port Profile

```text
PortProfile
{
    id
    version

    maxPixels

    maxReceivers?
    maxCabinets?

    maxWidth?
    maxHeight?

    receiverProfileIds[]

    addressingMode
}
```

Минимальное условие capacity:

```text
usedTransportPixels <= maxPixels
```

Не:

```text
usedLogicalPixels <= maxPixels
```

Причина этого различия определена далее через Transport Pixel Model.

---

# 8. Receiver Profile

```text
ReceiverProfile
{
    id
    version

    manufacturer
    model

    maxPixels

    maxModules?
    maxCabinets?

    maxWidth?
    maxHeight?

    chainLimit?

    allowedSplitLevel

    moduleProfileIds[]

    outputOrderMode
    dataDirection

    addressingMode
}
```

Receiver constraints остаются независимыми от Port constraints.

Например:

```text
Receiver = valid
Port     = invalid
```

является допустимым состоянием Validation Engine.

---

# 9. Split Level

Нормативные значения:

```text
WHOLE_CABINET
MODULE
PIXEL_BLOCK
```

### WHOLE_CABINET

Cabinet является atomic allocation unit.

```text
Cabinet → exactly one Receiver
```

### MODULE

Cabinet может быть распределён между несколькими Receivers, но Module остаётся atomic.

```text
Module → exactly one Receiver
```

### PIXEL_BLOCK

Допускается более глубокое hardware-specific разделение.

По умолчанию профиль MUST использовать наиболее консервативный разрешённый уровень.

---

# 10. Module Profile

Вводится отдельный аппаратный контракт Module:

```text
ModuleProfile
{
    id
    version

    logicalResolution
    physicalResolution

    pixelScan

    transportProfile

    rotationSupport
    flipSupport
}
```

Module Geometry остаётся частью физической модели проекта.

`ModuleProfile` описывает то, **как эта геометрия транспортируется hardware**.

---

# 11. Pixel Scan

```text
PixelScan =
    ROW_MAJOR
    COLUMN_MAJOR
    SERPENTINE_ROW
    SERPENTINE_COLUMN
    CUSTOM
```

При `CUSTOM` профиль MUST содержать явную lookup-функцию либо таблицу преобразования:

```text
physicalPixel
        ↓
transportIndex
```

Текущий Cabinet Engine уже оставляет конкретный module pixel scan аппаратно-зависимым параметром, а не универсальным предположением.

---

# 12. Новая абстракция: Pixel Domains

Начиная с этой спецификации LedMAP MUST различать три понятия:

```text
LOGICAL PIXELS
PHYSICAL PIXELS
TRANSPORT PIXELS
```

Они могут совпадать:

```text
Logical = Physical = Transport
```

но Engine не имеет права предполагать это всегда.

---

# 13. Logical Resolution

```text
logicalResolution
{
    width
    height
}
```

Это разрешение, которое участвует в пространственной модели LedMAP:

```text
Input
→ Mapping Region
→ Screen
→ Cabinet
→ Module
```

---

# 14. Physical Resolution

```text
physicalResolution
{
    width
    height
}
```

Это физическая LED-матрица устройства.

Для обычного Cabinet:

```text
logicalResolution == physicalResolution
```

Но это не является обязательным глобальным инвариантом.

---

# 15. Transport Pixels

`transportPixelCount` — число адресных/передаваемых элементов, которые фактически занимают hardware transport capacity.

```text
PixelTransportProfile
{
    transportPixelCount
    scanMode

    activePixelMask?
    customLookup?
}
```

Таким образом:

```text
logicalPixelCount
physicalPixelCount
transportPixelCount
```

являются разными величинами.

Это **новое расширение LedMAP**, добавленное после анализа production LED workflows. Оно не было определено в предыдущем Cabinet Engine contract.

---

# 16. Active Pixel Mask

Опционально:

```text
activePixelMask
```

определяет, какие физические/logical pixel positions реально участвуют в transport stream.

Концептуально:

```text
activePixelMask(x, y)
→ true | false
```

Если:

```text
false
```

pixel существует в logical/physical geometry, но не получает отдельный transport address согласно данному Hardware Profile.

---

# 17. Transport Lookup

Для каждого physical pixel профиль MUST позволять определить:

```text
ResolveTransportPixel(x, y)
```

результат:

```text
{
    active,
    transportIndex?
}
```

Если pixel является transport-active:

```text
active = true
transportIndex >= 0
```

Если нет:

```text
active = false
transportIndex = null
```

---

# 18. Главное правило Capacity

Начиная с этой спецификации аппаратная capacity считается через:

```text
Transport Pixels
```

а не автоматически через:

```text
Screen Width × Screen Height
```

Поэтому:

```text
Receiver.usedPixels
```

семантически означает:

```text
Receiver.usedTransportPixels
```

Старое имя может временно сохраняться в коде ради совместимости, но внутренняя семантика должна быть зафиксирована именно так.

---

# 19. Physical Pixel остаётся неизменным

Transport mapping не имеет права разрушать физическую геометрию.

```text
Physical Pixel Position
        ≠
Transport Order
```

Это продолжает уже принятый фундаментальный принцип LedMAP:

```text
Physical Position
        ≠
Signal Order
```

---

# 20. Receiver Chain Rules

Hardware profile MUST определять модель receiver chain.

```text
ReceiverChainProfile
{
    maxReceivers?
    orderingMode
    baseAddressMode
}
```

`orderingMode`:

```text
EXPLICIT
PHYSICAL_ORDER
ASSIGNMENT_ORDER
```

---

# 21. Receiver Base Address Mode

Поддерживаются как минимум два режима.

### RESERVED_CAPACITY

```text
receiverBase =
Σ capacity(previous receivers)
```

### PACKED_USED

```text
receiverBase =
Σ actualUsedTransportPixels(previous receivers)
```

Необходимость такого различия уже следует из существующей Receiver & Processor specification, где base address может вычисляться по capacity либо по фактически использованному address space.

---

# 22. Port Addressing Mode

Аналогично Port MUST поддерживать профильное поведение.

Например:

```text
PORT_CUMULATIVE
PORT_LOCAL_RECEIVER
CUSTOM
```

Текущая архитектура уже допускает:

```text
portBase + receiverAddress
```

либо другой вариант, задаваемый Hardware Profile.

---

# 23. Addressing Profile

```text
AddressingProfile
{
    id
    version

    receiverBaseMode
    portBaseMode
    processorBaseMode

    addressSpaceMode

    encoderType

    supportsReverseDecode
}
```

---

# 24. Canonical Hardware Address

LedMAP MUST иметь vendor-independent структурированный адрес:

```text
HardwareAddress
{
    processorId
    processorIndex

    portId
    portIndex

    receiverId
    receiverIndex

    cabinetId
    moduleId

    physicalPixelIndex
    transportPixelIndex

    receiverLocalIndex
    portLocalIndex

    canonicalDataIndex
}
```

Это является **каноническим адресом LedMAP**.

---

# 25. Vendor Encoded Address

Не следует предполагать, что у каждого производителя Final Address всегда является одним integer.

Поэтому отдельно вводится:

```text
EncodedHardwareAddress
{
    profileId

    canonicalAddress

    encodedValue
}
```

`encodedValue` может концептуально быть:

```text
integer
tuple
string
byte sequence
vendor-specific structure
```

Remap Engine работает прежде всего с `HardwareAddress`.

Vendor exporter/encoder работает с:

```text
EncodedHardwareAddress
```

---

# 26. AddressEncoder

Контракт:

```text
AddressEncoder
{
    encode(context) -> EncodedHardwareAddress

    decode(encodedAddress)
        -> HardwareAddress
}
```

если профиль поддерживает reverse decode.

Конкретный AddressEncoder должен зависеть от hardware protocol; это уже было оставлено аппаратно-зависимым в предыдущей архитектуре.

---

# 27. Encoder Context

```text
AddressEncoderContext
{
    hardwareProfile

    processorAssignment
    portAssignment
    receiverAssignment

    cabinet
    module

    physicalPixel
    transportPixel
}
```

Encoder не должен самостоятельно вычислять Cabinet Geometry или topology.

Он получает уже разрешённую структуру.

---

# 28. Responsibility Boundary

```text
Cabinet Engine
    ↓
physical geometry

Module Engine
    ↓
module geometry / base scan

Pixel Transport Resolver
    ↓
transport pixels

Receiver Engine
    ↓
receiver assignment / chain

Port Allocator
    ↓
port assignment / capacity

Processor Engine
    ↓
processor topology

Address Encoder
    ↓
hardware-specific address
```

Ни один слой не должен повторно вычислять ответственность предыдущего слоя.

---

# 29. Forward Address Resolution

Главная функция:

```text
ResolveHardwareAddress(inputPixel)
```

концептуально:

```text
InputPixel
    ↓
MappingRegion
    ↓
ScreenPixel
    ↓
Cabinet
    ↓
Module
    ↓
PhysicalPixel
    ↓
TransportPixel
    ↓
Receiver
    ↓
Port
    ↓
Processor
    ↓
HardwareAddress
    ↓
AddressEncoder
    ↓
EncodedHardwareAddress
```

Существующая архитектура уже задаёт forward chain вплоть до Final Address.

---

# 30. Reverse Address Resolution

Обратный контракт:

```text
ResolveInputPixel(hardwareAddress)
```

```text
HardwareAddress
    ↓
Processor
    ↓
Port
    ↓
Receiver
    ↓
TransportPixel
    ↓
PhysicalPixel
    ↓
Module
    ↓
Cabinet
    ↓
ScreenPixel
    ↓
MappingRegion
    ↓
InputPixel
```

Практическая реализация MAY использовать:

```text
ReverseIndex
```

что уже предусмотрено текущей архитектурой Remap.

---

# 31. Round-Trip Invariant

Для каждого адресуемого pixel:

```text
Reverse(
    Forward(pixel)
) == pixel
```

И для каждого валидного канонического HardwareAddress:

```text
Forward(
    Reverse(address)
) == address
```

с учётом семантики конкретного Hardware Profile.

---

# 32. Transport Round Trip

Для transport-active pixel:

```text
PhysicalPixel
→ TransportIndex
→ PhysicalPixel
```

MUST быть однозначным.

Если профиль использует many-to-one либо other non-bijective mapping, это MUST быть явно объявлено отдельной capability.

Default:

```text
transport mapping = bijective for active pixels
```

---

# 33. Capacity Validation

Validation MUST выполняться минимум на трёх уровнях:

```text
Receiver
Port
Processor
```

Для каждого проверяются применимые:

```text
maxTransportPixels
maxWidth
maxHeight
maxModules
maxCabinets
maxReceivers
chainLimit
splitLevel
```

Уже существующий `ValidateTopology()` проверяет наличие Port/Receiver, capacity, chain validity и assignment validity.

---

# 34. Validation Severity

Минимум:

```text
ERROR
WARNING
INFO
```

### ERROR

Примеры:

```text
Receiver capacity exceeded
Port capacity exceeded
Processor capacity exceeded

Unsupported Module Profile
Unsupported Receiver Profile

Invalid split
Invalid receiver chain

Duplicate transport address
Duplicate hardware address

Missing transport address
Invalid AddressEncoder result
```

### WARNING

```text
Cabinet split across receivers
High capacity utilization
Sparse transport mapping
Unused transport capacity
Custom pixel scan
```

---

# 35. No Duplicate Address

Для обычного non-mirrored topology:

```text
HardwareAddress(pixelA)
!=
HardwareAddress(pixelB)
```

если:

```text
pixelA != pixelB
```

Mirror/backup topology в эту спецификацию пока не входит.

---

# 36. No Missing Transport Address

Для transport-active set:

```text
ExpectedTransportPixels
==
MappedTransportPixels
```

если Hardware Profile не объявляет sparse address space.

---

# 37. Determinism

Одинаковые:

```text
Project Model
+
Hardware Profiles
+
Assignments
```

MUST всегда выдавать идентичные:

```text
TransportOrder
ReceiverAllocation
PortAllocation
HardwareAddress
FinalRemap
```

---

# 38. Hardware Profile не является Project State

Hardware Profile описывает возможности оборудования.

Project хранит ссылку на:

```text
profileId
profileVersion
```

и пользовательские assignments/configuration.

Не следует копировать всю hardware business logic внутрь каждого Project.

---

# 39. Source of Truth

Существующая архитектура уже определяет как primary:

```text
Project
Screen geometry
Cabinet geometry
Module geometry
Numbering
Direction
Snake
Receiver assignment
Processor assignment
Port configuration
```

а как derived:

```text
CabinetOrder
ModuleOrder
PixelOrder
PortAllocation
MappingRegions
FinalRemap
Validation
```



Начиная с этой спецификации добавляем:

### Primary / referenced

```text
HardwareProfileId
HardwareProfileVersion
```

### Derived

```text
TransportPixelOrder
HardwareAddress
EncodedHardwareAddress
ReverseIndex
```

---

# 40. Profile Change Invalidation

Изменение любого параметра:

```text
maxPixels
maxWidth
maxHeight

pixelScan
activePixelMask
transportPixelCount

chainRules
splitLevel
addressingMode
encoder
```

MUST инвалидировать зависящие derived data.

Минимальный pipeline:

```text
Hardware Profile Change
        ↓
Transport Resolver
        ↓
Receiver Allocation
        ↓
Port Allocation
        ↓
Address Resolution
        ↓
Final Remap
        ↓
ReverseIndex
        ↓
Validation
```

---

# 41. Generic Reference Profile

Для unit/integration tests MUST существовать vendor-neutral профиль:

```text
LEDMAP-GENERIC-REF001
```

Он не представляет реального производителя.

Он нужен только для deterministic reference tests.

---

# 42. GENERIC-REF001 Module

Для существующего `LEDMAP-REF-001`:

```text
logicalResolution:
128 × 128 per Cabinet

Modules:
4 × 4

Module:
32 × 32

pixelScan:
ROW_MAJOR

transport:
1 logical pixel = 1 transport pixel

activePixelMask:
all active
```

То есть:

```text
logicalPixelCount
=
physicalPixelCount
=
transportPixelCount
```

---

# 43. GENERIC-REF001 Receiver

```text
ReceiverProfile
{
    maxCabinets = 4

    allowedSplitLevel = WHOLE_CABINET

    outputOrderMode = ASSIGNMENT_ORDER

    addressingMode = PACKED_USED
}
```

Это соответствует существующему reference case, где 12 cabinets распределяются на три Receivers по четыре Cabinet.

---

# 44. GENERIC-REF001 Port

```text
PortProfile
{
    maxReceivers = 2

    addressingMode = PACKED_USED
}
```

В REF-001:

```text
Port 01
    R01
    R02

Port 02
    R03
```

---

# 45. GENERIC-REF001 Processor

```text
ProcessorProfile
{
    maxPorts = 4
}
```

Этот профиль является **тестовым**, а не production hardware profile.

---

# 46. Addressing REF-001

Для REF-001:

```text
ReceiverBaseMode = PACKED_USED
PortBaseMode     = PACKED_USED
ProcessorBase    = 0
```

Поэтому последовательность остаётся:

```text
C01 → 0
C02 → 16384
...
C08 → 65536
...
C05 → 114688
...
C12 → 180224
```

и последний address:

```text
196607
```

Это сохраняет уже существующий эталон без изменения его результатов.

---

# 47. Backward Compatibility Rule

Введение Transport Pixels MUST NOT менять результаты существующих reference cases, если профиль задаёт:

```text
logical == physical == transport
activePixelMask = ALL
```

То есть REF-001 / REF-002 / REF-003 должны продолжать проходить без изменений.

---

# 48. Unsupported Hardware

Если необходимый профиль отсутствует, LedMAP MUST NOT подставлять предполагаемые значения.

Состояние:

```text
UNSUPPORTED_HARDWARE_PROFILE
```

лучше, чем молчаливо сгенерированный неправильный mapping.

---

# 49. Unknown Constraints

Если конкретный hardware parameter неизвестен:

```text
null / undefined
```

означает:

```text
constraint unknown / not declared
```

а не:

```text
unlimited
```

Validation должна уметь отличать эти состояния.

---

# 50. Profile Confidence

Рекомендуемая metadata:

```text
ProfileMetadata
{
    source
    verified

    verifiedBy?
    verifiedAt?

    notes?
}
```

Production profile SHOULD иметь подтверждённый источник технических параметров.

---

# 51. Out of Scope v1.0

Этот документ пока НЕ определяет:

```text
Power topology

Primary / backup signal paths

Stage 3D

Device Map

Pack List

NDI

manufacturer-specific binary export format

actual production profiles
без подтверждённых hardware specifications
```

---

# 52. Что этот документ блокирует от преждевременной реализации

До утверждения конкретного Hardware Profile разработчик НЕ должен предполагать:

```text
все pixels занимают одинаковый transport space;

pixel count всегда равен width × height;

receiver address всегда linear integer;

port base всегда cumulative;

receiver base всегда cumulative-used;

все modules имеют Row Major;

Cabinet всегда принадлежит одному Receiver;

Receiver capacity автоматически определяет Port capacity.
```

---

# 53. Final Contract

После реализации этого контракта LedMAP должен уметь выполнить:

```text
                    INPUT PIXEL
                         │
                         ▼
                   MAPPING REGION
                         │
                         ▼
                    SCREEN PIXEL
                         │
                         ▼
                       CABINET
                         │
                         ▼
                       MODULE
                         │
                         ▼
                   PHYSICAL PIXEL
                         │
                         ▼
                  TRANSPORT PIXEL
                         │
                         ▼
                      RECEIVER
                         │
                         ▼
                        PORT
                         │
                         ▼
                     PROCESSOR
                         │
                         ▼
                 HARDWARE ADDRESS
                         │
                         ▼
                  ADDRESS ENCODER
                         │
                         ▼
               ENCODED HARDWARE ADDRESS
```

и обратно:

```text
HARDWARE ADDRESS
        ↓
Processor
        ↓
Port
        ↓
Receiver
        ↓
Transport Pixel
        ↓
Physical Pixel
        ↓
Module
        ↓
Cabinet
        ↓
Screen Pixel
        ↓
Mapping Region
        ↓
Input Pixel
```

---

# 54. Главный инвариант

```text
Input Pixel
        ↔
Hardware Address
```

должен оставаться:

```text
deterministic
traceable
validatable
reversible
```

для каждого Hardware Profile, который объявляет обратимое addressing.

---

# 55. Следующий шаг

После утверждения этого документа следующим нормативным документом становится:

```text
LEDMAP-PHASE-7-ACCEPTANCE-001
```

Он определит обязательный Acceptance / Integration Gate для завершения Phase 7:

```text
REF-001
REF-002
REF-003

Numbering / Direction / Snake combinations

Rotation / Flip

Receiver / Port boundaries

Capacity overflow

Incomplete final Receiver / Port

Manual locked assignments

No duplicate addresses

No missing addresses

Forward Mapping

Reverse Mapping

Round Trip:
Input Pixel
→ Hardware Address
→ Input Pixel
```

Phase 7A считается завершённой только после прохождения этого Acceptance Gate.

После успешного прохождения Gate следующим архитектурным документом становится:

```text
LEDMAP-REMAP-001 — Phase 7B Remap (logical post-processing layer)
```

который определит:

```text
RemappedPixelMap
identity-remap invariant
deterministic immutable post-processing pipeline
REMAP_* error namespace
```

Затем:

```text
7C Validation
7D Serialization
```

Имя `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` резервируется для отдельного hardware-final этапа после Hardware Profiles + AddressEncoder. Он замкнёт:

```text
Forward Map

ReverseIndex

FinalRemap data model

cache / rebuild policy

invalidations

pixel inspector lookup

hardware → canvas selection

canvas → hardware selection
```

Таким образом нормативная последовательность:

```text
PHASE 7A MAPPING
        ↓
LEDMAP-PHASE-7-ACCEPTANCE-001
        ↓
INTEGRATION GATE 7A
        ↓
LEDMAP-REMAP-001 (7B logical remap)
        ↓
7C Validation / 7D Serialization
        ↓
Hardware Profile implementation
        ↓
Address Encoder
        ↓
LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001
        ↓
Final Remap / ReverseIndex implementation
```

---

# 56. Definition of Ready

`Hardware Profile & Addressing` считается готовым к реализации, когда:

```text
✓ Profile schemas утверждены

✓ logical / physical / transport semantics утверждены

✓ PixelScan contract утверждён

✓ SplitLevel contract утверждён

✓ Capacity считается через transport domain

✓ Receiver chain modes утверждены

✓ Addressing modes утверждены

✓ Canonical HardwareAddress утверждён

✓ AddressEncoder boundary утверждён

✓ REF-001 не изменился

✓ Forward/Reverse invariants определены

✓ неизвестные hardware параметры
  не подменяются предположениями
```

После этого следующий кодовый блок может реализовываться без изменения базовых контрактов Cabinet / Receiver / Port / Processor Engines.