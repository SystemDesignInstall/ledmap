# LEDMAP-ALPHA-UI-002 — Early Alpha UI: Project Canvas (multi-screen layout)

Статус: **Accepted — ретроактивная легализация реализованного этапа одобrena пользователем 2026-09-25**. Основание: расширение исключения [ADR-017](../DECISIONS.md#adr-017-early-alpha-ui--cabinet-grid-visualizer) решением [ADR-024](../DECISIONS.md#adr-024-early-alpha-ui--project-canvas). Базовый контракт [LEDMAP-ALPHA-UI-001](LEDMAP-ALPHA-UI-001.md) сохраняется в части границ core/app, интеграции и лимитов preview.

## 1. Цель и границы

Вторая итерация Early Alpha UI: одиночный Cabinet Grid Visualizer развивается в **Project Canvas** — один бесконечный 2D canvas с несколькими Screen, размещаемыми пользователем. Назначение — визуальная компоновка проекта (layout экранов), навигация и выбор объектов до начала Phase 8. Состояние живёт в памяти до закрытия приложения; demo-проект из трёх Screen — презентационное начальное состояние, не доменные данные.

Вне этапа (сохраняются запреты ALPHA-UI-001 и TODO): Open/Save `.ledmap`, привилегированный IPC и preload API, сериализация, UI для Hardware/Mapping/Remap/Validation, экспорт, packaging, undo/redo, попиксельный preview. `packages/core`, его public API, математика и reference-тесты не изменяются.

## 2. Пользовательский сценарий

1. Окно открывается с demo-проектом: три Screen на canvas, camera вписывает общие границы проекта.
2. Toolbar: **Active Screen / All Screens** (режим видимости), **Fit to Project**, **+ Screen** (добавляет экран с настройками по умолчанию рядом с последним).
3. Левая панель — project tree (Screen → Cabinet Grid), клик выбирает объект. Правая панель — Properties выбранного объекта. Status bar показывает границы проекта, zoom и подсказки навигации.
4. Canvas: фон-сетка, контуры Screen с подписью (имя, cabinets, разрешение px), cabinet grid с физическими ID `C01…` и логическими номерами `#1…`, направленный путь сигнала, границы модулей. При мелком масштабе подписи и линии модулей скрываются с пояснением.
5. Выбор: клик по кабинету выбирает Cabinet, по границе экрана — Screen; клик по дереву выбирает Screen или Cabinet Grid. Escape снимает выбор.
6. Навигация: wheel — pan, Ctrl+wheel — zoom к курсору (clamp 0.02…8), middle-drag или Space+drag — pan, drag левого экрана — перемещение Screen.

## 3. Модель представления и состояние

- `ScreenView` (app) = readonly snapshot core (`Screen`, `CabinetGrid`, `CabinetEngineConfig`, cabinets, path) плюс **презентационные** `x/y` позиции на canvas. Позиция Screen на layout — состояние представления app; в доменную модель и core она не добавляется.
- `Project` — readonly список `ScreenView`; все операции (`addScreen`, `moveScreen`, `setScreenPosition`) возвращают новый immutable объект.
- Каждый Screen строится через существующий адаптер snapshot (`buildSnapshot`, бывший `applyDraft`) с параметризованными `SnapshotIds`; лимиты preview ALPHA-UI-001 (1024 кабинета, 65 536 модулей на grid) сохраняются на каждый Screen.
- Renderer импортирует только public barrel `@ledmap/core`; путь — `cabinetOrder()`, логические номера — `cabinetIndex()`. Формулы Numbering/Direction/Snake в app не повторяются.
- Перемещение Screen не меняет cabinet IDs, логический порядок, геометрию и path — гарантируется unit-тестами (REF-001 sweep сохраняется на Screen 1).

## 4. Properties и редактирование

- **Screen:** имя (readonly), редактируемые X/Y позиции, размеры и grid-сводка (readonly). Пустой/невалидный ввод X/Y помечает поле `aria-invalid` и сохраняет последнее допустимое значение; молчаливого округления нет.
- **Cabinet Grid:** readonly сводка (columns/rows, cabinets, cabinet size, ordering Numbering · Direction · Snake).
- **Cabinet:** readonly Physical ID, логический номер, column/row, Screen.
- Форма создания Screen из ALPHA-UI-001 (редактор геометрии и ordering) в этой итерации заменена на **+ Screen** с настройками по умолчанию; редактор geometry/ordering возвращается в Phase 8 вместе с полным редактором. Ordering остаётся видимым readonly.

## 5. Интеграция и безопасность

- Electron main отвечает за окно и lifecycle; renderer — за canvas и панели. Node integration отключена, context isolation включена, CSP сохранена. Привилегированный IPC и preload API не добавляются.
- Для smoke-проверки renderer публикует только diagnostic hook `window.__ledmap` (dump/bounds/camera/selection/viewMode/координатные хелперы) — read-only проекция состояния представления, не API продукта и не канал в main process.
- Стек: TypeScript strict, Electron + electron-vite, HTML5 Canvas, без нового UI framework.

## 6. Приёмка

| Проверка | Ожидаемый результат |
|---|---|
| Demo-проект | 3 Screen: позиции (0,0)/(700,120)/(320,620), разрешения 512×384 / 384×256 / 512×256, границы проекта 1084×876 px |
| REF-001 на Screen 1 | 12 кабинетов `C01…C12`, порядок `1 2 3 4 8 7 6 5 9 10 11 12`, path равен `cabinetOrder()` |
| Выбор | Клик по дереву/canvas выбирает Screen/Grid/Cabinet; chip, properties-title и aria-состояния согласованы; Escape снимает выбор |
| Редактирование X | Ввод 120 перемещает Screen и пересчитывает bounds; пустой ввод → `aria-invalid`, значение сохраняется |
| Drag | Перемещение мышью на (40, 20) px экрана меняет x/y с учётом zoom; IDs, порядок и геометрия кабинетов не меняются |
| View modes | Active Screen показывает один экран и его подписи; All Screens — все; Fit пересчитывает camera |
| + Screen | Добавляет Screen 4 рядом с последним, выбирает его |
| Регрессия | `npm test` (включая новые unit-тесты project-состояния), `npm run typecheck`, `npm run lint`, `npm run build` проходят; Electron smoke проверяет таблицу выше в реальном окне |

Локальные проверки не объявляются результатом CI.
