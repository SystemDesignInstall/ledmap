# LedMAP — Architecture

Статус: **черновик контракта** (фиксируется по результатам аудита). Никакого production-кода на этом этапе ещё нет.

## 1. Цель

Desktop-приложение для создания, редактирования, проверки и экспорта LED screen mapping (видеопроцессорная геометрия). Математическое ядро отделено от UI и hardware-обвязки.

## 2. Пайплайн данных (не менять)

```
Input Canvas
  → Screen
    → Mapping Region
      → Cabinet Grid
        → Cabinet
          → Module
        → Receiver
        → Processor / Port
    → Final Remap
```

- `Mapping Region` — логическая сущность: соответствие Input → Output (ссылка на rect входного канваса + целевой Grid + корреляция).
- `Cabinet Grid` — физическая LED-структура и её геометрия + конфигурация упорядочивания (Numbering / Direction / Snake).
- `Cabinet Engine` отвечает за: physical coordinates → ordering → direction → snake → cabinet index → module order → pixel order.
- Hardware-слой отделён: Cabinet → Receiver → Port → Processor.
- **Physical position ≠ logical signal order** — разные свойства.

## 3. Границы и ответственность модулей

| Модуль | Где | Отвечает за | Вход → Выход |
|---|---|---|---|
| Domain model | `core/model` | Screen, InputCanvas, MappingRegion, CabinetGrid, Cabinet, Module, Receiver, Port, Processor, enums | — |
| Cabinet Engine | `core/cabinet-engine` | numbering → direction → snake → cabinet order index → module order → pixel order. Каждая трансформация — отдельная композируемая функция | physical grid → упорядоченная логическая последовательность cabinets + per-cabinet порядок модулей/пикселей |
| Hardware Engine | `core/hardware-engine` | allocate (авто-разметка по ёмкости), resolve (доводка явных назначений), precedence Processor→Port→Receiver | упорядоченные cabinets → SignalPath[] |
| Mapping Engine | `core/mapping-engine` | корреляция rect входного канваса → логическая позиция экрана | screen + signal order + regions → PixelMap |
| Remap Engine | `core/remap-engine` | пост-обработка построенного PixelMap: swap/rotate/invert субрегионов, dead-LED | PixelMap + rules → PixelMap |
| Validation | `core/validation` | по-правильные проверки + агрегированные диагностики (code, severity, path) | project → Diagnostic[] |
| Serialization | `core/serialization` | версия, схема, parse/serialize, миграции, round-trip. Чистый текст в/из | JSON-строка ↔ модель |
| I/O + IPC + окно | `app/main` | fs, диалоги, экспорт, IPC-мост | side effects |
| Canvas | `app/renderer/canvas` | отрисовка из read-only снапшота модели + PixelMap | side effects |
| UI state | `app/renderer/state` | selection, инструменты, undo — никогда доменная логика | UI-only |

Зависимость: `renderer → state → adapters → core`. `core` ничего не импортирует из `app`. Кросс-пакетные импорты — только через barrel `@ledmap/core`.

## 4. Целевая структура репозитория

```
LedMap/
├─ package.json              # корень: workspaces, scripts (test/lint/typecheck/dev/package)
├─ tsconfig.base.json        # strict, noEmit, verbatimModuleSyntax, exactOptionalPropertyTypes
├─ vitest.workspace.ts
├─ eslint.config.mjs         # import-restriction: core не импортирует electron/node builtins
├─ AGENTS.md
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DECISIONS.md
│  └─ test-001/spec.md       # спецификация Reference Test 001 (создаётся на этапе тестов)
├─ packages/
│  ├─ core/                  # ЧИСТЫЙ ДОМЕН: runtime-зависимостей нет
│  │  ├─ src/
│  │  │  ├─ index.ts         # только явный public API barrel
│  │  │  ├─ model/           # units, geometry, screen, mapping-region, cabinet-grid, cabinet, module, hardware, ordering
│  │  │  ├─ cabinet-engine/  # numbering.ts, direction.ts, snake.ts, module-order.ts, pixel-order.ts, index.ts
│  │  │  ├─ hardware-engine/ # allocate.ts, resolve.ts, index.ts
│  │  │  ├─ mapping-engine/  # index.ts → PixelMap (компактно, диапазонами, не попиксельно)
│  │  │  ├─ remap-engine/    # index.ts
│  │  │  ├─ validation/      # rules.ts, validator.ts, codes.ts
│  │  │  └─ serialization/   # schema.ts, parse.ts, serialize.ts, migrations/
│  │  └─ test/
│  │     ├─ helpers/         # buildCabinet(), assertPixelIndex(), assertRoundTrip()
│  │     ├─ fixtures/        # test-001/ (project.json, expected.json), test-002..004, malformed/
│  │     └─ …engine tests
│  └─ app/                   # SIDE EFFECTS: Electron main/preload/renderer
│     ├─ electron.vite.config.ts
│     ├─ electron-builder.yml
│     └─ src/
│        ├─ main/            # index.ts, window.ts, services/{project-store,file-dialog,export,ipc}.ts
│        ├─ preload/index.ts
│        └─ renderer/        # index.html, canvas/ (layers), state/, ui-adapters/, components/, api/
```

## 5. Pure vs Side effects

**Pure (детерминированные, без I/O/часов/RNG/глобального состояния):** весь `core` — модель, нормализаторы, Cabinet Engine, Hardware Engine, Mapping Engine, Remap Engine, Validation, parse/serialize. Идемпотентны и потокобезопасны.

**Side effects (только в `app`):**
- `main/services/*` — fs, диалоги, экспорт.
- IPC-каналы и безопасность (contextIsolation).
- Обработчики DOM/событий (тонкий слой: событие → pure-функция core → публикация результата).
- Любые вызовы Canvas 2D (не воспроизводимы в CI).
- Сериализация в `main` (вызов) — side-effectful; сами parse/serialize — pure.

Правило, закрепляемое в eslint: *pure-модуль не может импортировать ничего вне `core`; всё, что трогает Electron/fs/DOM, живёт в `app`.*

## 6. Стратегия тестов

- **Vitest по `packages/core`**; никакого webdriver/electron в unit-тестах.
- **Reference Test 001** — fixture-driven приёмочный тест (`fixtures/test-001/`):
  1. Ассерт порядка cabinets: `[C01 C02 C03 C04 C08 C07 C06 C05 C09 C10 C11 C12]`.
  2. Ассерт пиксельных индексов в контрольных точках (выведены вручную, не взяты из движка):
     - `(0,0)` → 0
     - `(127,127)` → 16383
     - `(128,0)` → 16384
     - `(0,128)` → 65536  (C08 — голова ряда 2 после snake)
     - `(384,127)` → 65535 (конец C04)
     - `(0,256)` → 131072 (C09)
     - `(511,383)` → 196607 (последний; итог 12×16384 = 196608 = 512×384)
  3. Полное равенство `expected.json` (золотой файл), причём п.2 — независимые якоря, валидирующие сам `expected.json`.
  4. Границы сигнальных путей: 4 cabinets на Receiver; 3 receiver; 2-й receiver в port 1; всё в processor 0.
  5. Round-trip: `parse(serialize(model))` глубоко равен модели.
  6. Детерминизм: каждый движок вызывается дважды, выходы идентичны.
- Pipeline-тесты трансформаций: Numbering, Direction, Snake по отдельности + попарные комбинации; падение называет сломавшуюся трансформацию.

## 7. Сериализация

- Формат: версионированный JSON. Верхний уровень:
  ```json
  { "schemaVersion": 1, "appVersion": "0.1.0", "project": { … }, "extensions": {} }
  ```
- `schemaVersion` — целое, драйвер миграций; `appVersion` — информационно.
- Строгая схема: `additionalProperties: false` на известных объектах; опечатки ловятся при валидации при открытии.
- `extensions` — passthrough-мешок для редакторских/неизвестных ключей: parse сохраняет verbatim, serialize возвращает → **стабильный round-trip**.
- Хранится только **пользовательский** in/output: геометрия, конфиги упорядочивания, ёмкости hardware, явные назначения. Производное (логический порядок, индексы, PixelMap) **не сохраняется**.
- Каноническая сериализация: фиксированный порядок ключей, отступ 2 пробела → стабильные git-diff.
- Миграции `migrations/vN-to-vN+1.ts` — pure-функции; незнакомые будущие версии → `UnsupportedSchemaError`.

## 8. Инструменты (Phase 0)

- `electron-vite` — dev/build (main/preload/renderer, HMR).
- `electron-builder` — Windows packaging (NSIS).
- `vitest` — unit-тесты.
- `tsc --noEmit` — typecheck.
- ESLint flat config + typescript-eslint; import-restriction правил границ core/app.

## 9. Оценённые противоречия контракта → см. `docs/DECISIONS.md`

Координатная система, precedence сигнальных индексов, explicit/auto назначения, частичная заполненность ёмкостей, порядок скана модулей/пикселей, владение Mapping Region/Cabinet Grid, границы Remap Engine.