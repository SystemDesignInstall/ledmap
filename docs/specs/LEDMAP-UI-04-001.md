# LEDMAP-UI-04-001 — Selection Tools

**Статус:** Accepted — executable spec, docs-only gate. Production требует отдельного approval.

**Baseline:** ALPHA-UI-004 CLOSED (единая `updateScreenCabinetConfig`, ORDER-контролы, REF-001 safety).

**Upstream:** [LEDMAP-ALPHA-UI-004](LEDMAP-ALPHA-UI-004.md); решение — [ADR-029](../DECISIONS.md#adr-029-selection-tools); vision — [LEDMAP-UI-ARCHITECTURE-001](LEDMAP-UI-ARCHITECTURE-001.md) §12 (Selection model), NOW-пункт 2 backlog.

Главный принцип:

```text
Selection = view-state. Selection MUST NOT become domain state.
```

## 1. Scope

Входит: single/multi/toggle/box/clear selection, delete, duplicate, lock, keyboard nudge, selection rendering, selection repair после edits, tree/canvas/status синхронизация, accessibility-минимум.

Не входит: snap/guides/align/distribute (UI-05), undo/redo, Mapping/Hardware/Signal, persistence (схема `.ledmap` v1 не меняется), project-model v2 integration, bulk property editing (multi-select Properties — summary/read-only, §12).

## 2. Repo inspection summary (факты, не предположения)

1. `selection` живёт в module scope `index.ts:60` как `SelectedObject | null`; в renderer пробрасывается через `View.selection` (`canvas.ts:24-29`); потребители одиночного объекта: `chipText`, `renderTree`/`isSelected`, `renderProperties`, `resizeTargetAt`/`selectedScreenShape` (resize только для single screen), `LedmapHook.selection()` (+ smoke).
2. Keyboard: обработчики только `Space` (pan; guard только `INPUT`) и `Escape` (отмена жеста + clear selection, без focus-guard — уничтожает и uncommitted draft в input через rerender). `Delete/Backspace/arrows/Ctrl+D` не заняты, конфликтов под nudge нет.
3. `addScreen` (`project.ts:134-146`) выдаёт ID как `screen-${screens.length + 1}` / `grid-${next}` — после delete возможны коллизии; кабинеты строятся `buildCabinets(config, null)` с serial от 1. Cabinet ID сегодня scoped на Screen: selection несёт `screenId`, разные Screens уже содержат одинаковые `C01…` (демо-проект), отображение `C01 · #1 · Screen name`. Проектно-уникального namespace кабинетов нет.
4. Box-помощников нет: есть `screenBounds/projectBounds/hitTest` (point), `toScreen/toProject`, `screenRectPx` (private). Нужен чистый `rectsIntersect` + `boxSelect`.
5. `lock` отсутствует везде (код, тесты, модель). `Project` уже содержит view-state (`x/y`), но `locked` туда не входит.
6. Drag (`moveScreen` на каждый `pointermove`) мутирует позицию непрерывно — для group move сохраняется тот же live-паттерн (позиция — app project state), с пометкой «одна logical operation на жест» для будущего undo.
7. Smoke helpers переиспользуемы: `dump/selection/bounds/camera/projectToPx/screenCenterPx/preview/resizeHandlesPx`; для UI-04 hook требует расширений (§13).

## 3. SelectionState contract

```ts
interface SelectionState {
  readonly items: readonly SelectedObject[]
  readonly primary: SelectedObject | null
}
```

Инварианты: `items` без дубликатов (равенство — по `(type,id)` + для cabinet по `(type,screenId,id)`); порядок детерминирован (порядок добавления); `primary` всегда элемент `items` либо `null` при пустом; `items` пуст ⟺ `primary` null. Пустое состояние представляется как `items: []`, а не `null` (упрощает потребителей).

Замена `let selection: SelectedObject | null` на `SelectionState` — обязательная часть production (все потребители §2.1 мигрируют; single-object предположения запрещены).

## 4. Primary-selection semantics

Primary = последний явно выбранный объект (click добавляет в конец и делает primary; Ctrl+click-add аналогично). Primary используется для: заголовка/фокуса Properties, контекстных команд, будущего align/distribute anchor. Primary не означает domain ownership и не хранится в domain.

При удалении primary из набора (Ctrl+click-remove, delete-repair): replacement = последний элемент оставшихся `items` (детерминировано); при пустом — `null`.

## 5. Allowed combinations (v1)

Гомогенные наборы только:

```text
Screen + Screen (Layout top-level)
Cabinet + Cabinet одного Screen (nested cabinet mode)
```

Запрещено в одном наборе: смешивание hierarchy levels (`Screen + Cabinet`), объекты из разных Screens в cabinet-наборе, `cabinetGrid` в multi-наборе (grid остаётся single-selection объектом). Нарушающее действие не мержит, а **заменяет** набор (click-правило §6). Если репо-миграция встретит гетерогенный набор — нормализовать к single (первый валидный item становится selection).

Cabinet multi-select реализуется на том же `SelectionState`, но UI-вход (box по кабинетам внутри Screen / Ctrl+click по кабинетам) — только после top-level; bulk-операции над кабинетами (move/delete) в UI-04 нет — набор влияет только на подсветку, счётчик и inspector-будущее. Group move/delete/duplicate/nudge действуют на Screens.

## 6. Mouse semantics

Click по объекту: заменить набор на `[object]` (primary = он). Ctrl+click по unselected: добавить (primary = он). Ctrl+click по selected: убрать; primary по §4. Click по пустому canvas: очистить (`items: []`). `activeScreenId` следует за primary screen (для cabinet — его `screenId`); при пустом наборе сохраняется последнее значение (camera не прыгает).

## 7. Box select

Жест: `pointerdown` на пустом месте (не handle, не объект, не pan-модификатор) начинает transient rectangle в project-координатах; `pointermove` — только preview (domain неизменён, кандидаты подсвечены); `pointerup` — commit набора; `Escape`/`pointercancel` — отмена с восстановлением предыдущего набора.

Правило containment (фиксировано): **intersection selects** — объект выбран, если его bounds пересекают rectangle (включая касание края). Для Screens сравниваются `screenBounds` в project space через чистый `rectsIntersect`. Нормализация rectangle (drag в любую сторону) обязательна. Пустой результат — валидный commit в `[]`, а не отмена.

Модификатор: plain box заменяет набор; `Ctrl+box` — additive merge без дубликатов (primary = последний добавленный). Поведение без модификатора при старте жеста поверх уже выбранного объекта: приоритет drag (§10), box не начинается.

## 8. Selection + drag / group move

Приоритет начала жеста: resize handle > drag (pointerdown на объекте из набора двигает **весь набор**) > select (pointerdown на unselected заменяет набор и двигает его) > box > pan (Space/middle). Случай «3 selected, drag одного» двигает все три — явно запрещено обратное.

Одна logical operation на жест: `moveScreens(project, ids, dx, dy)` — все выбранные `+= delta`, offsets сохранены; unselected ScreenView — те же ссылки. Live-паттерн (commit на каждый `pointermove`) сохраняется как в текущем drag; пометка для будущего undo: жест группируется вызывающей стороной, движок претензий не имеет.

Locked screens в наборе: жест drag всего набора блокируется целиком при наличии хотя бы одного locked (немое частичное движение запрещено); UI показывает причину в `canvasNote`/статусе.

## 9. Keyboard nudge

Стрелки двигают весь текущий Screen-набор: baseline `1 px`, `Shift` — `10 px` (конфликтов нет, §2.2). Nudge = тот же `moveScreens` (одна logical operation на keypress, autorepeat — серия операций, группировка — будущее undo).

Guard (урок Space/Snake из 004): nudge срабатывает только когда фокус НЕ в `INPUT / SELECT / TEXTAREA / BUTTON` и не идёт pointer-gesture/drag/resize/box. При фокусе в property control стрелки принадлежат control. Nudge при пустом наборе — no-op. Locked: набор с locked не двигается целиком (как drag §8).

## 10. Delete semantics

Domain/application-операция, кандидат `removeScreens(project, screenIds)` (имя финализирует production PR). Удаляет выбранные Screens целиком (Screen/Grid/Cabinets — всё внутри `ScreenView`); unselected ScreenView — те же ссылки. После: repair selection (выбросить отсутствующие ID; primary по §4), repair `activeScreenId` (первый оставшийся Screen либо `null`), camera не перестраивается автоматически.

Impact-note (не механизм): на текущем Alpha scope зависимых Mapping/Hardware-сущностей в renderer нет — cascade не проектируется; будущему Project Document потребуется impact analysis (vision §64) — отдельной спецификацией.

Delete locked: **blocked** (набор с locked не удаляется целиком + причина в UI). Delete при cabinet-only наборе: no-op в UI-04 (bulk cabinet delete нет).

## 11. Duplicate semantics (самый опасный участок)

Duplicate = построить новые `ScreenView` из конфига исходных, никогда не клонируя identity:

* Новые ID: Screen `screen-N` и Grid `grid-N` через max-suffix+1 по проекту (устраняет коллизию `length+1` после delete, §2.3); кабинеты — свежая аллокация `buildCabinets(config, null)` (serial от 1, детерминированные `C01…`), т.е. namespace кабинетов scoped на Screen (§2.3) — явно зафиксировано, проектно-уникального cabinet namespace не вводится.
* Сохраняется: `columns/rows`, модульная геометрия, `ordering` целиком, `nextCabinetSerial`-эквивалент нового билда, относительная структура.
* Не сохраняется: позиция (placement §12), selection, lock (дубликат незалочен; duplicate locked — allowed).
* Кандидат `duplicateScreens(project, screenIds): { project, newIds }` — возвращает и проект, и ID созданных для установки selection.

Placement: детерминированный offset дубликата `+32/+32 px` в project space от исходника (независимо от camera/zoom); при multi-duplicate относительные offsets исходников сохранены, общий сдвиг тот же. После: selection = созданный набор (primary = дубликат исходного primary), `activeScreenId` = primary дубликата.

## 12. Lock semantics и хранение

Решение: lock — **app-state**, не core, не persisted (persistence не авторизована). Хранение — `lockedScreenIds: readonly string[]` рядом с `Project` в том же app-state контейнере (инвариант: только ID существующих Screens; delete вычищает; duplicate не наследует). Расширение `ScreenView` полем `locked` запрещено (смешает snapshot с UI-флагом).

Поведение locked Screen: selectable YES, inspectable YES, move/resize/nudge NO (набор с locked не двигается целиком), delete NO (blocked), duplicate YES (результат unlocked). Визуально: lock badge + состояние (не только цвет), кнопки/контролы для locked показывают причину блокировки. Будущая миграция в persisted composition state — отдельной спецификацией, не этим gate.

## 13. Rendering / tree / status / a11y

Single: primary outline. Multi: selected outline у всех + distinct primary outline. Box: rectangle + candidate highlight. Lock: badge. Цвет никогда не единственный канал (форма/бейдж/текст дублируют).

Tree: все items `aria-selected=true`, primary — дополнительный класс/состояние; клик по дереву — те же правила §6 (Ctrl+click в дереве поддерживается). Status bar: `N Screens selected` / `N Cabinets selected` / primary в chip (`Screen 3 selected · 3 selected`). Properties: single — полный редактор (существующий + 004); multi — summary/read-only (`3 Screens`, общие значения явно, различающиеся — `—`), без bulk editing.

Smoke hook расширения (read-only проекция, не API): `selectionSet()` (items+primary), `locked()` (ids), `boxPreview()` (transient rect или null). Существующие `selection()` сохраняется как primary-алиас на время миграции тестов.

## 14. Escape и interaction priority

Приоритет: активный gesture/drag/resize/box-cancel > transient preview > (focus в editable control → blur с обычным commit/validation, selection НЕ очищается) > clear selection. Подтверждено отличие от поведения до UI-04 (Escape из input и revert делал, и selection чистил): production меняет на blur-first.

Уточнение (acceptance review, без изменения поведения): blur-first действует только для
`INPUT / SELECT / TEXTAREA` (контролы с draft-состоянием). `BUTTON` остаётся guarded для
nudge/Space/Delete, но глобальный Escape-clear при фокусе на BUTTON работает как раньше
(у BUTTON нет draft, blur-first ничего не даёт). Будущий общий keyboard layer (UI-05+)
MUST NOT «исправлять» это обратно без отдельного spec-решения.

Полный hit/gesture priority: resize handle > selected-drag (group) > object select > box select > pan (Space/middle-drag). Space-pan поведение без изменений.

## 15. Domain/view-state boundary

| State | Classification |
|---|---|
| `items`, `primary` | view-state (`index.ts` scope) |
| selection rectangle | transient view-state |
| `lockedScreenIds` | app-state (рядом с Project, не core, не serialized) |
| Screen `x/y` | app project state (существующее) |
| Screen/Grid/Cabinet identity | app snapshot identity (per-screen cabinet namespace) |
| `index/path/resolution` | derived (core engines) |
| ordering/geometry config | stored (domain) |

Никакого selection state внутри core; core-изменений ноль.

## 16. Candidate immutable app APIs (имена финализирует production PR)

```text
moveScreens(project, ids, dx, dy) → Project
removeScreens(project, ids) → Project (+ repair selection/active вне Project)
duplicateScreens(project, ids) → { project, newIds }
setScreenLocked / toggleScreenLocked (app-state рядом с Project)
rectsIntersect(a, b) → boolean (чистая, тестируемая)
boxSelect(project, rect, { additive }) → ScreenView[] (чистая)
nextScreenIndex(project) → number (max-suffix+1 аллокатор ID)
```

Все возвращают новый `Project`, unselected — те же ссылки. Selection repair — обязанность вызывающей стороны в `index.ts` (единое место, не размазывать по операциям).

## 17. Acceptance matrix

SEL-01 click заменяет набор; SEL-02 Ctrl+click добавляет; SEL-03 Ctrl+click убирает (+ primary-replacement детерминирован); SEL-04 empty click очищает; SEL-05 primary всегда последний выбранный; SEL-06 гетерогенный клик нормализует к single.

BOX-01 rectangle по intersection правилу выбирает ожидаемые Screens; BOX-02 plain заменяет; BOX-03 Ctrl+box additive без дубликатов; BOX-04 Escape/pointercancel восстанавливает предыдущий набор; BOX-05 пустой результат = валидный `[]`; BOX-06 drag в любую сторону нормализован.

MOV-01 drag single; MOV-02 drag одного из набора двигает весь набор; MOV-03 offsets сохранены; MOV-04 unselected — те же ссылки; MOV-05 набор с locked не двигается целиком + причина.

NUD-01 стрелки двигают набор на 1 px; NUD-02 Shift — 10 px; NUD-03 фокус в input/select/button/textarea блокирует; NUD-04 locked-набор не двигается; NUD-05 пустой набор — no-op.

DUP-01 новые Screen/Grid ID (max-suffix+1, без коллизий после delete); DUP-02 кабинеты — свежая аллокация, конфигурация/ordering сохранены; DUP-03 относительные позиции + детерминированный +32/+32; DUP-04 selection = дубликаты, primary соответствует; DUP-05 исходники нетронуты (ссылки и identity); DUP-06 duplicate locked allowed, результат unlocked.

DEL-01 выбранные удалены; DEL-02 остальные — те же ссылки; DEL-03 selection/activeScreenId repaired; DEL-04 locked-набор blocked; DEL-05 cabinet-only набор — no-op.

LCK-01 locked selectable/inspectable; LCK-02/03/04 drag/resize/nudge blocked (целиком для набора); LCK-05 delete blocked, duplicate allowed-unlocked; LCK-06 badge видим; LCK-07 lock не попадает в сериализацию (нечем проверить до persistence — проверяется отсутствием поля в Project-источниках сериализации и код-ревью).

## 18. Smoke scenarios (минимум, production PR)

S1 Ctrl+click два Screens → оба подсвечены, статус `2 Screens selected`; S2 drag одного из набора → оба += delta; S3 box → ожидаемый набор; S4 Ctrl+D → дубликаты с новыми ID при равной геометрии/ordering, selection = дубликаты; S5 lock → drag/nudge/resize отклонены с причиной; S6 Delete → project/tree/canvas синхронизированы, selection repaired.

## 19. Expected production files (при approval, не сейчас)

`packages/app/src/renderer/project.ts` (операции §16), `index.ts` (SelectionState, жесты, nudge, lock UI, Properties summary), `canvas.ts` (box preview + multi/primary outlines + lock badge — только отрисовка), `packages/app/test/selection.test.ts` (new, матрица §17), `electron-smoke.mjs` (extend §18), hook-расширения §13. Без изменений: `packages/core/**`, `.ledmap`, IPC/preload, persistence, project-model v2.

## 20. Non-goals

Bulk property editing, snap/guides/align/distribute, undo/redo, project-wide cabinet ID namespace, persisted lock, cabinet bulk move/delete, Mapping/Hardware/Signal UI, любые фреймворки/рефакторинги состояния.
