# LEDMAP-UI-05-001 — Layout Productivity

**Статус:** Accepted — executable spec, docs-only gate. Production требует отдельного approval.

**Baseline:** UI-04 CLOSED (`SelectionState`, group ops, lock, max-suffix+1 IDs).

**Upstream:** [LEDMAP-UI-04-001](LEDMAP-UI-04-001.md); решение — [ADR-030](../DECISIONS.md#adr-030-layout-productivity); vision — [LEDMAP-UI-ARCHITECTURE-001](LEDMAP-UI-ARCHITECTURE-001.md) §10–11 (toolbar, snap/guides/align), NOW-пункт 3 backlog.

## 1. Scope

Входит: grid snap для drag, guides (создание/перемещение/блокировка/удаление), align (6 режимов), distribute (2 режима), включение/категории snap, взаимодействие с multi-selection и locked, toolbar/UI, acceptance matrix.

Не входит: undo/redo, snap для resize (уже cabinet-discrete в 003/004), snap для nudge (nudge — точный инструмент, §4), rulers в DOM (будущее), bulk property editing, persistence guides/lock (остаются app-state), Mapping/Hardware/Signal, project-model v2, любые изменения `packages/core`.

## 2. Repo inspection summary (факты)

1. Snap/guides/align/distribute отсутствуют полностью (поиск по `snap|guide|ruler|align|distribute` даёт только `textAlign` и имена snapshot-полей). Toolbar — 3 кнопки (`toggle-mode`, `fit-project`, `add-screen`); rulers в `index.html` нет; statusbar имеет `canvas-note` для сообщений блокировок.
2. Позиции Screen — дробные float (`moveScreens` складывает float-дельты указателя; тесты используют tolerance). Любой snap обязан определить rounding-семантику явно.
3. Tolerance-прецедент в screen px уже есть: `RESIZE_HANDLE_HIT_PX = 8`, label-hit боксы в screen px, zoom clamp `0.02…8`. Tolerance snap определяется в screen px с конвертацией в project px делением на zoom.
4. Keyboard занят: arrows (nudge 1/10), Delete/Backspace, Ctrl+D, Space, Escape с guards (UI-04 §Escape). Новых глобальных шорткатов UI-05 не вводит, кроме зарезервированных точек расширения.
5. Lock — app-state `lockedScreenIds`; group move/nudge/delete с locked блокируются целиком (UI-04). `canvasNote` — канал причин блокировки.
6. Hook `__ledmap` — read-only проекция; расширения для UI-05 (§11) тем же порядком.

## 3. Snap unit / origin / negatives (решение)

* Единица: project px (та же единица, что `Screen.x/y`, `screenBounds`, hit-test). Никакой второй coordinate model.
* Grid step: константа `GRID_STEP = 8` project px. Rationale: делитель типичных cabinet-геометрий (128/192), ощутимый на зумах Alpha, не конфликтует с cabinet-discrete resize.
* Origin: `(0, 0)` project space. Сетка бесконечна в обе стороны.
* Формула: `snapped(v) = Math.round(v / 8) * 8` с нормализацией `-0 → 0`. Отрицательные координаты симметричны (`Math.round` — halves от нуля вверх по модулю; фиксируется тестом: `-4 → -8`? нет: `-4/8 = -0.5 → Math.round(-0.5) = -0 → 0`; `−12/8 = −1.5 → Math.round = −1 → −8`). Пограничные `.5` фиксируются тестом, а не интуицией.
* Snap применяется к позиции (drag), не к размеру. Resize остаётся cabinet-discrete и snap-игнорирует grid.

## 4. Где snap действует, а где нет (решение)

Действует: group/single drag указателем (включая multi-set — весь набор сдвигается на один snapped delta, offsets сохранены).

Не действует (явно): keyboard nudge (точный 1/10 px инструмент — snap сломал бы его контракт), canvas resize handles (cabinet-discrete), duplicate/add placement (`+32/+100` детерминированы), box selection, camera/pan/zoom.

Временное отключение: удерживаемый `Alt` во время drag отключает snap целиком (vision-контракт). Master-toggle `Snap ✓` + per-category toggles (§8); при выключенном master drag идёт сырыми float-дельтами как сегодня.

## 5. Snap targets, precedence, tolerance (решение)

Оси X и Y разрешаются независимо. Для каждой оси:

* Движущиеся линии: primary screen box — `left / center / right` (X), `top / middle / bottom` (Y). Только primary (детерминированность из UI-04), не каждый Screen набора.
* Цели: grid-линии (`k*8`), вертикальные guides / горизонтальные guides, edges чужих Screens (`left/right`, `top/bottom`), centers чужих Screens (`centerX`, `centerY`). Своих членов moving set среди целей нет (исключены целиком — иначе self-snap шум). Locked чужие Screens — валидные цели (видимая геометрия). Locked guides — валидные цели (нельзя двигать, можно привязываться).
* Scoring: расстояние в screen px (`|target − moving| * zoom`); кандидат валиден при `≤ SNAP_TOLERANCE_PX = 8` (прецедент `RESIZE_HANDLE_HIT_PX`). Побеждает минимальное расстояние; tie (равенство с точностью до `1e-9`) — фиксированный приоритет: `Guides > Screen Edges > Screen Centers > Grid`. Нет совпадения — ось без сдвига.
* Результат: один delta на ось для всего набора (`moveScreens` с уже-snapped delta). Snap-кандидат показывается визуально (подсветка линии/гайда) во время drag — только отрисовка.

Категории, individually toggleable: `Grid / Screen Edges / Screen Centers / Guides`. Неизвестных категорий нет (закрытый enum).

## 6. Guides (решение)

Rulers в DOM нет, поэтому v1 без drag-from-ruler: создание — toolbar-кнопки `+ V-Guide` / `+ H-Guide` (позиция = центр текущего viewport в project px, округлённая до `GRID_STEP`), перемещение — drag линии на canvas, редактирование — Properties (`Orientation readonly / Position number / Locked checkbox`), удаление — `Delete` при selected guide? Нет: guide selection вне SelectionState (guide — не Screen); удаление — кнопка в Properties гайда + `Del` при guide-focus? Решение: гайд выбирается кликом (отдельный `selectedGuideId` view-state, selection Screens при этом очищается — два набора не смешиваются), `Delete` удаляет выбранный гайд, `Esc` снимает.

Хранение: `guides: readonly Guide[]` в app-state рядом с Project (`{ id, orientation: 'vertical'|'horizontal', position: number, locked: boolean }`; ID — `guide-N` через max-suffix+1 того же семейства). Не core, не serialized. Locked guide: нельзя двигать/удалять (Delete blocked с причиной), остаётся snap-целью. Удаление Screen на guides не влияет.

## 7. Align semantics (решение)

Явное решение по вопросу gate: **primary НЕ является anchor в v1**. Primary остаётся UI-focus (Properties, chip, hook). Anchor для всех align-режимов — bounding box текущего Screen-набора. Будущий explicit anchor mode — отдельная спецификация, не этот gate.

Режимы (набор ≥2 Screens, иначе no-op с причиной): `Left / Center X / Right / Top / Middle / Bottom`. Семантика: все члены набора сдвигаются так, чтобы соответствующий край/центр совпал с краем/центром bbox набора (крайний/центральный не двигается; остальные — только вдоль оси режима). Один logical commit на команду (единая перестройка `Project`, unselected — те же ссылки).

## 8. Distribute semantics (решение)

Режимы: `Horizontal / Vertical`. Набор ≥3 Screens (иначе no-op с причиной). Семантика: крайние по оси (min/max край bbox) неподвижны; внутренние распределяются с равными gaps между соседними краями вдоль оси. Нормативное поведение (acceptance review, обязательно): **`gap` — signed, может быть отрицательным** для исходно перекрывающихся Screens; операция остаётся детерминированной (`gap = (span − Σsizes) / (n−1)`, промежуточные `left` вычисляются последовательно через актуальные ширины плюс `gap`). Геометрический tie стабилизируется project order. Primary не anchor (см. §7). Один logical commit.

## 9. Locked interaction (решение)

* Locked Screens входят в reference geometry: их edges/centers — snap-цели (§5); в align/distribute bbox набора — входят, если выбраны.
* Move-target: набор с locked не двигается целиком — drag, nudge, align, distribute блокируются атомарно с причиной в `canvasNote` (консистентно с UI-04; никаких частичных сдвигов).
* Locked НЕ может быть anchor: anchor-концепции нет (§7), вопрос закрыт отсутствием.
* Delete с locked — blocked (UI-04, без изменений). Duplicate locked — allowed, копии unlocked (без изменений).
* Guides: locked guide — цель, но не target перемещения/удаления.

## 10. Toolbar / Properties / status UI

Toolbar-дополнения (порядок): `[Snap ✓] [Snap ▾] [+V][+H] [Align ▾] [Distribute ▾]` после существующих кнопок. Snap-меню: категории с чекбоксами + `Alt disables while dragging` hint. Align/Distribute-меню: 6+2 пункта, disabled с причиной при `<2` / `<3` выбранных Screens или locked в наборе (причина видна, не молча). Guide Properties: `Orientation / Position / Locked / [Delete Guide]`. Statusbar: snap-индикация (`Snap: Grid+Guides` / `Snap off` / `Alt: off`) в `canvas-note` зоне без конфликта с сообщениями блокировок (блокировка приоритетнее).

## 11. Candidate immutable app APIs (имена финализирует production PR)

```text
GRID_STEP, SNAP_TOLERANCE_PX (константы)
snapAxis(movingLines, targetLines, zoom) → delta (чистая, тестируемая)
snapDelta(primaryBounds, targets, categories, zoom, gridStep) → { dx, dy } (чистая)
moveScreensSnapped(project, ids, dx, dy, snap) → Project (или snap поверх moveScreens в вызывателе — решение production, один путь)
alignScreens(project, ids, mode) → Project
distributeScreens(project, ids, axis) → Project
addGuide / moveGuide / removeGuide / setGuideLocked (app-state рядом с Project)
rectsIntersect/screensInRect — переиспользовать (box UI-04); guides hit-test — новый чистый хелпер
```

Hook-расширения (read-only): `snap()` (категории+master), `guides()`, `alignState()` при необходимости. Никакого selection в core; core-изменений ноль.

## 12. Acceptance matrix

SNAP-01 drag с включённым snap садится на grid (кратно 8, `-0` нормализован); SNAP-02 negatives симметричны по формуле §3 (включая `.5`-кейсы); SNAP-03 Alt отключает (сырые float-дельты); SNAP-04 master-off = поведение до UI-05; SNAP-05 категория-off исключает её цели; SNAP-06 precedence tie → Guides>Edges>Centers>Grid; SNAP-07 tolerance в screen px (тот же delta снапится на zoom 1 и не снапится на zoom 0.02, и наоборот для фиксированного project-расстояния); SNAP-08 движущиеся линии — только primary box; SNAP-09 члены набора исключены из целей; SNAP-10 locked чужой — цель; SNAP-11 nudge/resize/duplicate/add snap игнорируют.

GUIDE-01 создание детерминировано (центр viewport → округление до step); GUIDE-02 drag двигает разлоченный; GUIDE-03 locked нельзя двигать/удалить (причина); GUIDE-04 locked guide — snap-цель; GUIDE-05 выбор гайда очищает Screen-набор и наоборот; GUIDE-06 удаление Screen гайды не трогает; GUIDE-07 guides не сериализуются (код-ревью + отсутствие в Project-источниках сериализации).

ALIGN-01…06 шесть режимов на эталонной тройке (координаты зафиксированы тестом); ALIGN-07 крайний не двигается; ALIGN-08 unselected — те же ссылки; ALIGN-09 <2 = no-op с причиной; ALIGN-10 locked в наборе = atomic block; ALIGN-11 primary не anchor (тест, где primary не на краю bbox, — выравнивание идёт по bbox, primary двигается наравне).

DIST-01/02 rcmodes на эталонной четвёрке (равные gaps, крайние неподвижны); DIST-03 <3 = no-op; DIST-04 locked = atomic block; DIST-05 overlapping input даёт детерминированный signed negative gap (нормативно, не no-op).

LOCK-INT-01 locked в bbox align-reference входит, но оп блокируется; LOCK-INT-02 lock badge/состояние видны; LOCK-INT-03 причины блокировок в `canvasNote`.

## 13. Smoke scenarios (минимум, production PR)

T1 drag с snap → dump кратен 8; T2 Alt-drag → float без snap; T3 guide create/drag/lock/delete; T4 align left тройки → равные left; T5 distribute → равные gaps; T6 locked в наборе → align/distribute/drag отклонены с причиной, dump неизменён.

## 14. Expected production files (при approval, не сейчас)

`packages/app/src/renderer/project.ts` (операции §11), новый `packages/app/src/renderer/productivity.ts` (чистые snap/align/distribute/scoring — без DOM), `index.ts` (toolbar, жесты с Alt, guide UI, меню с disabled-причинами), `canvas.ts` (guides, snap-подсветка, бейджи — только отрисовка), `index.html` (кнопки toolbar), `packages/app/test/productivity.test.ts` (new, матрица §12), `electron-smoke.mjs` (extend §13). Без изменений: `packages/core/**`, `.ledmap`, IPC/preload, persistence, project-model v2, snap для resize/nudge.

## 15. Non-goals

Rulers в DOM, drag-from-ruler, explicit anchor mode, bulk editing, persisted guides/lock, undo/redo, snap engine вне Layout, фреймворки/рефакторинги состояния.
