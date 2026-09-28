# LEDMAP-PRODUCT-V1-CONVERGENCE-001

**Статус:** Product convergence plan / docs gate  
**Дата:** 2026-09-28  
**Цель:** довести LedMAP до устанавливаемого пользовательского продукта, прекратив развитие изолированных слоёв без end-to-end workflow.

## 1. Определение готового Product V1

Product V1 считается готовым только когда пользователь может в установленном desktop-приложении пройти один непрерывный сценарий:

```text
New / Open .ledmap
  ↓
Create / edit Screens
  ↓
Cabinet Grid + module geometry + ordering
  ↓
Input / Mapping Region
  ↓
Receiver / Port / Processor topology
  ↓
Auto allocation + manual correction
  ↓
Validate
  ↓
Forward / reverse Inspector
  ↓
Save
  ↓
Generic Export
  ↓
Re-open saved project and obtain the same validated result
```

Отдельно обязательны Windows package/installer и CI gate.

## 2. Что уже готово и не проектируется заново

В `packages/core` уже существуют и покрыты тестами:

- Cabinet Engine;
- Hardware Engine allocation/resolve и canonical port-local addressing;
- Mapping Engine;
- Remap Engine v1;
- Project Validation;
- Serialization v1;
- Hardware Profile v1.

В `packages/app` уже существуют:

- Electron shell;
- multi-screen Project Canvas;
- pan/zoom/fit;
- Project Tree и contextual Properties;
- Screen move/resize;
- Cabinet Grid resize;
- Cabinet geometry & ordering editor;
- Electron smoke tests.

Эти слои переиспользуются. Переписывание core ради UI запрещено без доказанного incompatibility.

## 3. Главный integration blocker

Сейчас renderer использует app-level `Project { screens[] }` и запускается из `createDemoProject()`.

При этом wire model `.ledmap` v1 хранит один `StoredProjectV1.mapping`, а внутри него ровно один `inputCanvas`, `screen`, `grid`, `region` и одну `hardwareTopology`.

Следствие: прямое подключение кнопок Open/Save к существующему preview-state не является корректной интеграцией. Multi-screen состояние приложения не представимо в v1 без потери данных или использования `extensions` как обходного канала.

**Решение Product V1:** ввести единый project aggregate и версионированную сериализацию, которая действительно представляет multi-screen workspace. Renderer становится представлением этого aggregate, а не отдельным источником истины.

## 4. Product critical path

### P1 — Project Aggregate + Serialization v2

Обязательный результат:

- единый runtime `LedmapProject`;
- project metadata + canvas/workspace;
- `screens[]` с layout position;
- screen-owned grid/mapping data;
- project-level hardware topology там, где topology должна быть общей;
- migration `.ledmap` v1 → v2;
- canonical v2 serialize/load/round-trip;
- adapters к существующим single-screen core engines без дублирования математики;
- fixtures минимум для 1-screen legacy и 3-screen workspace.

Acceptance: multi-screen project round-trip сохраняет IDs, positions, geometry, ordering, mappings и hardware references.

### P2 — Desktop Project Lifecycle

Обязательный результат:

- preload с узким typed API;
- IPC только для разрешённых file operations;
- New;
- Open;
- Save;
- Save As;
- dirty state;
- recent/current filename в title/status;
- safe error reporting;
- close-with-unsaved-changes guard.

Acceptance: create → edit → save → close → open воспроизводит тот же project aggregate.

### P3 — Mapping + Hardware UI Integration

Обязательный результат:

- Input Canvas;
- Mapping Region editor;
- Processor / Port / Receiver nodes в Project Tree;
- contextual properties;
- hardware view на Canvas;
- `allocateHardware()` как Auto Map/Auto Allocate;
- ручные assignment actions только через pure project mutations.

Acceptance: пользователь строит topology без редактирования JSON.

### P4 — Validation + Inspector + Generic Export

Обязательный результат:

- `validateProject()` diagnostics в UI;
- Export disabled при error;
- forward inspector: Input/Screen pixel → Cabinet → Module → Receiver → Port → Processor/dataIndex;
- reverse inspector по canonical hardware key;
- generic machine-readable export (canonical JSON и/или CSV mapping table);
- deterministic export tests.

Vendor-specific packet/address encoding не блокирует Product V1, пока для него нет отдельного принятого hardware contract.

### P5 — Undo/Redo + UX completion

Обязательный результат:

- snapshot/history на project mutations;
- Ctrl/Cmd+Z / Shift+Z;
- selection survives valid mutations where possible;
- destructive operations confirm or are undoable;
- toolbar states and empty/loading/error states;
- keyboard navigation baseline.

### P6 — Packaging / Release Candidate

Обязательный результат:

- electron-builder;
- Windows installer artifact;
- app version surfaced;
- CI builds release candidate;
- clean-machine smoke checklist;
- no demo-only startup path in production build.

## 5. Что не должно блокировать первый готовый продукт

Не блокируют Product V1:

- vendor-specific binary/network protocol exporters;
- MODULE/PIXEL_BLOCK split;
- arbitrary Cabinet rotation/flip, если core contract их ещё не поддерживает;
- advanced remap rules beyond accepted v1;
- cloud sync/collaboration;
- plugin ecosystem.

Эти функции идут после того, как Product V1 end-to-end workflow стабилен.

## 6. Engineering rules на convergence phase

1. Каждая production-итерация обязана завершать пользовательский workflow, а не только внутренний API.
2. Не создавать второй project state рядом с aggregate.
3. Domain calculations остаются в core; Electron main содержит только side effects.
4. Любая persisted сущность должна иметь round-trip test.
5. Любая UI mutation должна иметь pure unit test и хотя бы один Electron smoke path.
6. Merge в `master` только при зелёных `test`, `typecheck`, `lint`, `build`, Electron smoke.
7. Новые документы допускаются только если они разблокируют следующий production slice; документация не считается самостоятельным прогрессом.

## 7. Ближайший production slice

После merge PR с Cabinet Geometry & Ordering следующий кодовый этап — **P1 Project Aggregate + Serialization v2**.

Это приоритетнее новых visual controls и приоритетнее кнопок Open/Save: сначала файл обязан уметь корректно представить то состояние, которое UI уже позволяет создать.
