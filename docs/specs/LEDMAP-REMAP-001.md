# LEDMAP-REMAP-001 — Phase 7B Remap Specification

**Название:** Phase 7B — Logical Remap / Post-Processing Specification
**Проект:** LedMAP
**Версия:** 1.0 Draft
**Статус:** Draft — documentation only
**Phase:** 7B — Remap
**Upstream contract:** `LEDMAP-MAPPING-001` (Phase 7A), ADR-020
**Production baseline 7A:** `0071eeed001ed2e275e3efb827b216a1d49da1f8`
**Doc gate 7A:** `08c0c387c9dbbaae91c5fa26cd676d914eba4c3f`
**Reserved (не этот документ):** `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` — hardware-final этап после Hardware Profiles + AddressEncoder
**Следующее:** 7C Validation, 7D Serialization; затем Hardware Profile implementation → Address Encoder → Final Hardware Remap

---

# 1. Purpose / place after 7A

Phase 7B — **логический remap / post-processing слой**, работающий над уже готовым результатом Phase 7A.

```text
ResolvedPixelMap (7A)
        ↓
Remap Rules
        ↓
RemappedPixelMap (7B)
```

Phase 7B **не переопределяет Mapping** и **не переопределяет Hardware Addressing**.

Главный принцип документа:

```text
Phase 7B operates on the result of Mapping.
It does not redefine Mapping.
It does not redefine Hardware Addressing.
```

---

# 2. Terminology: Mapping vs Remap vs Final Hardware Remap

| Термин | Слой | Ответственность |
|---|---|---|
| Mapping | 7A | Source rect → полный Grid, identity translation, 1:1, forward/reverse `MappedPixel` |
| Remap | 7B | Логическая постобработка готового `ResolvedPixelMap` → `RemappedPixelMap` без повторного Mapping |
| Final Hardware Remap | LATER | `HardwareProfile → AddressEncoder → HardwareAddress → ReverseIndex`; vendor-independent canonical address и vendor encoded address. Имя зарезервировано за `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` |

Эти три понятия **не взаимозаменяемы**. Термин `Remap` в этом документе означает только 7B-слой.

---

# 3. Input

Вход 7B — принятый immutable результат 7A:

```text
ResolvedPixelMap
```

Производный объект строится движками из исходной модели (`Project Model`). Непривилегированная ручная сборка недоверенного `ResolvedPixelMap` не является способом обхода validation.

```text
Source Project Model
        ↓
ResolvedPixelMap (7A, derived)
        ↓
Remap Rules
        ↓
RemappedPixelMap (7B, derived)
```

Project Model не мутируется.

---

# 3.1 Public API / v1 data model

Набор типов и функций v1:

```ts
interface RemapRuleDescriptor {
  readonly id: string
  readonly version: string
  readonly type: string
}

interface ResolveRemapInput {
  readonly mapping: ResolvedPixelMap
  readonly rules: readonly RemapRuleDescriptor[]
}

interface RemappedPixelMap {
  readonly source: ResolvedPixelMap
  readonly rules: readonly RemapRuleDescriptor[]
}

function resolveRemap(input: ResolveRemapInput): RemappedPixelMap

function mapRemappedInputPixel(
  remap: RemappedPixelMap,
  inputPixel: InputPixel
): MappedPixel

function unmapRemappedHardwarePixel(
  remap: RemappedPixelMap,
  key: PortPixelKey
): MappedPixel
```

`ResolvedPixelMap`, `InputPixel`, `PortPixelKey`, `MappedPixel` — типы принятого Mapping contract 7A (`LEDMAP-MAPPING-001`). Project Model не является прямым API input 7B.

## Empty-only v1 rule set

Phase 7B v1 поддерживает только пустой production rule set:

```text
rules.length == 0
    → valid identity remap

rules.length > 0
    → REMAP_UNSUPPORTED_RULE
      until a concrete rule-type contract is accepted
```

Ненулевой набор правил в v1 не «применяется» по наитию: неизвестный `type` возвращает `REMAP_UNSUPPORTED_RULE`, а не молчаливый passthrough.

---

# 4. Remap must not mutate Project or Mapping snapshot

```text
resolveRemap({ mapping, rules })
```

MUST NOT:

```text
мутировать входной ResolvedPixelMap
мутировать Source Project Model
повторно вычислять Mapping-геометрию
переопределять hardware addressing
вызывать resolveMapping
изменять Project файл
```

Результат — новый immutable `RemappedPixelMap`.

---

# 5. Identity-remap invariant

Без активных Remap Rules (`rules.length == 0`) соблюдается **semantic identity**:

```text
remap = resolveRemap({ mapping, rules: [] })

mapRemappedInputPixel(remap, P)
==
mapInputPixel(mapping, P)
```

для каждого допустимого `P`, и:

```text
unmapRemappedHardwarePixel(remap, K)
==
unmapHardwarePixel(mapping, K)
```

для каждого занятого `K`.

Это **equality на уровне pixel lookup**, а не literal object equality: `ResolveRemapInput.mapping` имеет тип `ResolvedPixelMap`, а результат — `RemappedPixelMap`. `RemappedPixelMap` может быть лёгким immutable wrapper над уже immutable snapshot 7A; полное копирование Mapping не требуется.

Требование "тождественно по всем полям `RemappedPixelMap`" из ранней формулировки снято: дублирование структуры snapshot не является контрактом.

---

# 6. Determinism

Одинаковые входы:

```text
эквивалентный ResolvedPixelMap
+
одинаковый rules (включая array order, §7)
```

MUST всегда давать идентичный `RemappedPixelMap`.

Повторный:

```text
resolveRemap({ mapping, rules })
```

должен возвращать семантически идентичный результат.

---

> **Sections 7–15 define mandatory extension constraints for future
> concrete `RemapRule` contracts. Phase 7B v1 does not yet expose
> a non-empty production rule set.**

# 7. Ordering of multiple rules

Порядок правил определён однозначно как **array order**: `rules` применяются строго в порядке следования элементов массива.

```text
RemapRules (array order)
    ordered execution
        ↓
final result
```

Порядок является частью контракта вызова и должен быть воспроизводим. Неявная сортировка правил по другим ключам не разрешается.

---

# 8. Rule identity

Каждый `RemapRuleDescriptor` MUST иметь стабильный `id`, обязательную `version` и `type`:

```text
RemapRuleDescriptor
{
    id
    version
    type
}
```

Отдельного поля `order` нет: порядок задаётся array order (§7), а не значением поля. Правило без `version` в v1 не принимается.

Изменение семантики правила, способное изменить результат, MUST приводить к изменению `version` (или `id`, если изменение фундаментальное).

---

# 9. Conflict semantics between rules

Для будущих concrete rules: правила могут конфликтовать по влиянию на один и тот же pixel/диапазон. Поведение при конфликте MUST быть явно определено в контракте соответствующего rule-type (или rule-set).

Допустимые политики для будущего контракта:

```text
первый-выигрывает
последний-выигрывает
конфликт является ошибкой
```

Эти политики являются **требованиями к будущим rule-type контрактам**, а не утверждением, что v1 уже поддерживает все три режима. Недетерминированное поведение запрещено. В v1 (empty-only, §3.1) конфликтов не существует.

---

# 10. Forward application

Для каждого будущего concrete rule MUST быть определён:

```text
domain  — что правило читает
        (пространство, над которым оно задано: input coordinate,
         hardware key, logical destination и т.п.)
codomain — что правило производит
```

Иначе pipeline формально не реализуем. До появления конкретных rule-types:

```text
forward(mapping, [])
→ RemappedPixelMap
```

является чистым identity-wrapper application (см. §5). Разрешение domain/codomain, которым мапятся выходы одного правила во входы следующего, является частью контракта rule-set, а не свободного выбора реализации. Промежуточные состояния — derived, не персистятся.

---

# 11. Reverse application requirement

Публичный reverse контракт v1 — **pixel-level reverse lookup**, а не восстановление целого snapshot:

```text
unmapRemappedHardwarePixel(remap, K)
→ MappedPixel
```

для каждого занятого hardware key `K`. Восстановление целого `ResolvedPixelMap` из `RemappedPixelMap` (whole-snapshot recovery) **не является обязательной операцией 7B**: двухсторонняя корректность выражается через обратный lookup (§5), а не через регенерацию snapshot.

Для будущих concrete rules: если набор правил объявляет обратимость, соответствие `MappedPixel ↔ MappedPixel` восстанавливается по правилам §22. Требование обратимости задаётся per-rule или per-rule-set capability; identity-only v1 обратим тривиально.

---

# 12. Bijective vs non-bijective rules

- v1 (empty-only, identity) является **тривиально биективным**: lookup не изменяет соответствия 7A.
- Свойства биективности будущих concrete rules (bijective / non-bijective) определяются их отдельным контрактом, а не этим документом.
- non-bijective правила MAY быть объявлены capability за пределами v1.

---

# 13. Duplicate destination handling

Требование относится к будущим concrete rules: если результат набора правил назначает двум source pixel один destination:

```text
DUPLICATE_DESTINATION
```

должен быть ошибкой `REMAP_DUPLICATE`, если контракт набора не объявляет иное явно. В v1 (empty-only) недостижимо.

---

# 14. Missing destination handling

Требование относится к будущим concrete rules: если после применения набора правил существует destination без source (или source без destination) при объявленном полном покрытии:

```text
REMAP_INCOMPLETE
```

MUST быть ошибкой. Частичное покрытие допускается только если это явно объявлено контрактом набора. В v1 (empty-only) недостижимо.

---

# 15. Bounds

For Phase 7B v1, `mapRemappedInputPixel()` and `unmapRemappedHardwarePixel()` delegate `InputPixel` / `PortPixelKey` validation and bounds checks to the accepted 7A Mapping/Hardware APIs.

Their `MAPPING_*` / `HARDWARE_*` errors MUST propagate unchanged.

`REMAP_OUT_OF_RANGE` is reserved for bounds introduced by a future concrete `RemapRule` contract; identity-only v1 does not generate it for upstream Mapping/Hardware lookup bounds.

Clamp / wrap / rounding / silent coercion remain prohibited.

---

# 16. Immutability and reference ownership

`RemappedPixelMap` и его вложенные объекты MUST быть immutable. Входные объекты не замораживаются и не мутируются.

```text
RemappedPixelMap MAY retain references to immutable objects
owned by ResolvedPixelMap.

It MUST NOT retain mutable references supplied by Remap Rules
or other caller-owned mutable state.

7B MUST NOT mutate or freeze upstream objects.
```

Так как 7A уже гарантирует immutable `ResolvedPixelMap`, 7B **имеет право безопасно разделять immutable references** с 7A — полное копирование snapshot не требуется. Запрещается mutable aliasing: изменение входного объекта после вызова не должно менять уже построенный результат.

---

# 17. Compactness — no mandatory pixel-sized primary storage

`RemappedPixelMap` не должен содержать обязательного попиксельного primary-хранилища.

Разрешены структуры масштаба:

```text
Cabinets
Modules
Receivers
Ports
Processors
Remap Rules
rule-результаты (per-rule derived)
```

Запрещены production-структуры масштаба:

```text
MappedPixel[totalPixelCount]
PixelAddress[totalPixelCount]
pixel-sized reverse table
```

Полные pixel sweeps существуют только в tests.

---

# 18. Cache is derived / rebuildable

Любой кэш — derived. Он MAY существовать для ускорения lookup, но MUST быть пересобираемым из входных данных.

```text
cache
    rebuild
        ↓
идентичный результат
```

В v1 кэш также не может быть обязательной pixel-sized таблицей (§17): например, не допускается `MappedPixel[totalPixelCount]` или pixel-sized reverse table как обязательная структура `RemappedPixelMap`. Обёртка над immutable snapshot 7A кэшем не является и кэшировать её не требуется.

---

# 19. Invalidation policy

Инвалидация строго слоистая:

```text
Project Model change
        ↓
Mapping 7A invalidated
        ↓
new ResolvedPixelMap
        ↓
Remap 7B invalidated
        ↓
new RemappedPixelMap
```

7B **не отслеживает Project Model напрямую**: его зависимостями являются только:

```text
ResolvedPixelMap snapshot
(the immutable instance/value supplied to resolveRemap)

Remap Rules
```

Непосредственной зависимости от Project Model нет — 7B реагирует только на «новый» `ResolvedPixelMap` (другой immutable snapshot). Если позднее появится explicit rebuild token/version — это отдельное аддитивное решение, не требование 7B v1. Любое изменение ResolvedPixelMap или Remap Rules инвалидирует зависимые derived data (промежуточные состояния, кэш, результат) в порядке pipeline.

---

# 20. Error namespace

Новые ошибки 7B используют существующий `DomainError` с отдельными кодами:

```text
REMAP_INVALID_VALUE

REMAP_OVERFLOW

REMAP_UNKNOWN_REFERENCE
```

Отдельная группа, зарезервированная под правило:

```text
REMAP_OUT_OF_RANGE

REMAP_DUPLICATE

REMAP_INCOMPLETE

REMAP_SIZE_MISMATCH
```

является **reserved for future rule extensions** — в identity-only v1 без concrete rule types эти коды недостижимы; bounds upstream Mapping/Hardware lookup в v1 возвращают `MAPPING_*` / `HARDWARE_*`, переданные без переименования (§15, §21). Коды группы используются только при появлении соответствующего утверждённого rule-type контракта.

```text
REMAP_UNSUPPORTED_RULE
```

— уже достижим в v1 при `rules.length > 0` (§3.1).

---

# 21. Mapping / Hardware errors preserved

Существующие ошибки `MAPPING_*` и `HARDWARE_*` передаются без переименования.

Remap не должен превращать ошибку Mapping/Hardware в `REMAP_*` код только для того, чтобы изменить namespace.

---

# 22. Round-trip guarantees for reversible rule sets

Round-trip формулируется как **pixel-level round-trip**, а не literal object equality. Форма `mapping' == mapping` допустима только как shorthand для "все lookup-соответствия индивидуально идентичны" (семантическое сравнение), не как сравнение двух разных типов (`ResolvedPixelMap` vs `RemappedPixelMap`).

Для identity-only v1 (§5), для каждого допустимого `P`:

```text
mapped = mapInputPixel(mapping, P)

K = {
    processor: mapped.address.hardware.processor,
    port:      mapped.address.hardware.port,
    dataIndex: mapped.address.dataIndex
}

unmapRemappedHardwarePixel(remap, K)
==
unmapHardwarePixel(mapping, K)
==
mapped
```

`unmapRemappedHardwarePixel()` принимает `PortPixelKey`, а не целый `MappedPixel`: key извлекается из результата forward lookup для сравнения round-trip по одному объекту `mapped`.

Для будущих обратимых rule sets: после forward application и последующего применения обратного набора правил каждому занятому `P` присваивается тот же `MappedPixel`, что и до forward. Обратимость — capability per-rule-set, не автоматическое свойство всех правил.

---

# 23. Explicitly unsupported rule types in v1

v1 НЕ утверждает следующих rule types (не определяются и не реализуются):

```text
manual pixel swap

dead-pixel replacement

address overrides

mirroring

pixel permutation

mask

receiver correction

scale / resampling

rotation / flip

OutputRect

clipping

wrap

hardware addressing overrides
```

`dead-LED rules` исключены из 7A, но это **не** делает их автоматически частью 7B. Отсутствие rule types в v1 — сознательное решение: контракт сначала фиксирует безопасный детерминированный инфраструктурный pipeline, а не предполагаемые функции.

---

# 24. Scope boundary with 7C Validation

Проектная валидация (7C) — отдельный этап. 7B не заменяет 7C. Remap MAY выполнять собственные внутренние проверки целостности своего результата, но не берёт на себя типовой набор проектных diagnostic-кодов.

---

# 25. Scope boundary with 7D Serialization

Сериализация `.ledmap` и миграции — 7D. Граница жёсткая:

```text
7D MAY serialize Remap Rule configuration.

RemappedPixelMap is derived data and MUST NOT become
the canonical persisted source of truth.

Any serialized remap cache, if ever introduced by a later
contract, remains disposable and rebuildable.
```

`RemappedPixelMap` никогда не становится canonical persisted source of truth. Сериализация конфигурации правил допустима; сам 7B не создаёт сериализационный формат.

---

# 26. Scope boundary with future Hardware Profile / AddressEncoder

```text
HardwareProfile → AddressEncoder → HardwareAddress → ReverseIndex
```

— hardware-final этап, зарезервированный за `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001`. 7B не реализует vendor encoding, не вводит канонический `HardwareAddress` расширения и не принимает аппаратные profile constraints.

---

# 27. REF-001 identity fixture

REF-001 identity fixture (производится из принятой 7A identity fixture):

```text
InputCanvas:    512 × 384
Region.position: (0,0)
Region.size:    512 × 384
Screen:         512 × 384
Grid:           4 × 3
Cabinet:        128 × 128 px
```

С пустым набором правил (`rules: []`) identity-инвариант проверяется по §5:

```text
mapRemappedInputPixel(remap, P) == mapInputPixel(mapping, P)
unmapRemappedHardwarePixel(remap, K) == unmapHardwarePixel(mapping, K)
```

---

# 28. Offset fixture

Фикстура на offset:

```text
InputCanvas:    1920 × 1080
Region.position: (100,50)
Region.size:    512 × 384
Screen:         512 × 384
Grid:           4 × 3
Cabinet:        128 × 128 px
```

С пустым набором правил — то же identity-неподвижность.

---

# 29. Full 196608 identity pass-through sweep

Для обеих fixtures полный sweep по 196 608 Input/Grid pixels:

```text
remap = resolveRemap({ mapping, rules: [] })
```

для каждого допустимого `P` сравнить **через публичный API** (§3.1):

```text
mapRemappedInputPixel(remap, P)
==
mapInputPixel(mapping, P)
```

сравнение по всем полям `MappedPixel`, без регенерации ожиданий через production Remap API и без literal object equality на snapshot.

---

# 30. Reverse traversal

Обратный обход по занятым Port-local диапазонам для обеих fixtures через публичный API:

```text
unmapRemappedHardwarePixel(remap, K)
```

для каждого занятого `K` (см. §3.1):

```text
unmapRemappedHardwarePixel(remap, K)
==
unmapHardwarePixel(mapping, K)
```

identity-remap не меняет hardware keys и reverse lookup результат.

---

# 31. Immutability / determinism / regression

Обязательные проверки:

```text
deep-frozen вход принимается
mutable вход не замораживается
последующая мутация входа не меняет результат
repeated calls детерминированы
вход и результат не разделяют mutable references
вход и результат могут разделять immutable references (§16)
```

**Regression baseline для 7B — принятый набор 7A = `543` тестов** (425 — pre-7A regression baseline, покрыт внутри 543). Сохранение 543 PASS — обязательное требование gates 7B.

---

# 32. Production gate procedure

Gate 7B — аналог 7A:

```text
Candidate SHA
+
remap-7b-validation.md
+
diff относительно approved baseline
+
фактические результаты acceptance
```

Минимальный пакет:

```text
Identity pass-through    196608 / 196608
Offset pass-through      196608 / 196608
Reverse traversal        complete
API-specific acceptance  mapRemappedInputPixel / unmapRemappedHardwarePixel
                         на обеих fixtures через public API (§3.1, §29–§30)
Regression               PASS (baseline = 543 тестов 7A)
typecheck / lint / build / Electron smoke / diff-check
```

API-specific acceptance обязателен: тесты не специфицированы на абстрактном уровне, они вызывают конкретную публичную функцию (§29–§30).

Gate бинарный: PASS / FAIL. Production-код 7B стартует только после отдельного разрешения; настоящий production-набор `RemapRule` типов, если он появится позднее, требует собственного утверждённого контракта (не является автоматическим расширением v1).

---

# 33. Definition of Ready

Phase 7B v1 считается готовым к реализации, когда контракт фиксирует:

```text
✓ Точные public types/API (§3.1): RemapRuleDescriptor, ResolveRemapInput,
  RemappedPixelMap, resolveRemap, mapRemappedInputPixel,
  unmapRemappedHardwarePixel

✓ Identity semantics (§5): pixel-level semantic equality, не object equality

✓ Empty-only v1 rule set (§3.1): rules.length == 0 → identity;
  rules.length > 0 → REMAP_UNSUPPORTED_RULE

✓ Ownership (§16): разрешено shared immutable references,
  запрещено mutable aliasing

✓ Layered invalidation (§19): 7B зависит от ResolvedPixelMap и rules,
  не от Project Model напрямую

✓ Вход = принятый immutable ResolvedPixelMap

✓ Выход = immutable RemappedPixelMap

✓ Project Model не мутируется

✓ Детерминизм

✓ Именование: 7B ≠ Mapping ≠ Final Hardware Remap

✓ v1 не вводит production rule types без отдельного контракта

✓ REMAP_* namespace определён; Mapping/Hardware ошибки не переименовываются

✓ Граница с 7C/7D и Final Hardware Remap определена; RemappedPixelMap
  не становится canonical source of truth (§25)

✓ REF-001 identity/offset pass-through инварианты + regression base 543
```

После этого следующий кодовый блок может реализовываться без изменения базовых контрактов Cabinet / Mapping / Hardware Engines.