# AGENTS.md — LedMAP

Проект: **LedMAP** — desktop-приложение для создания, редактирования, проверки и экспорта LED screen mapping.

## Технологический стек (зафиксирован)

- TypeScript (strict) + npm workspaces (монорепо: `packages/core` + `packages/app`)
- Electron + electron-vite + electron-builder
- HTML5 Canvas (renderer), Vitest (unit-тесты), ESLint (flat config)
- Сериализация проектов: версионированный JSON (`.ledmap`)

Требования: Node.js 24 LTS (>= 24) + npm (поставляется с Node.js), Git. Команды запускаются из корня репозитория.

## Железные архитектурные правила (не нарушать)

1. Конвейр данных:
   `Input Canvas → Screen → Mapping Region → Cabinet Grid → Cabinet → Module → Receiver → Processor/Port → Final Remap`
2. **Mapping Region ≠ Cabinet**. Mapping Region — логическое соответствие Input→Output; Cabinet — физическая LED-структура. Это разные понятия, их нельзя смешивать.
3. **Cabinet Engine отделён от Hardware Topology**:
   - Cabinet Engine: physical coordinates → ordering → direction → snake → cabinet index → module order → pixel order.
   - Hardware: Cabinet → Receiver → Port → Processor.
4. **physical position ≠ logical signal order**. Это два разных свойства счётчика кабинетов.
5. Трансформации `Numbering`, `Direction`, `Snake` независимы и тестируются по отдельности.
6. **Core чистый и детерминированный**: `packages/core` не имеет runtime-зависимостей, не импортирует `electron`/`node:fs`/DOM, только immutable-данные и pure functions. Весь I/O (fs, диалоги, IPC, canvas, hardware export) живёт в `packages/app`.
7. Производные данные (логический порядок, сигнальные индексы, PixelMap) в файл проекта **не сохраняются** — они пересчитываются движками при загрузке.

## Команды

| Задача | Команда |
|---|---|
| Установка зависимостей | `npm install` |
| Unit-тесты (core) | `npm test` |
| Тесты в watch-режиме | `npm run test:watch` |
| Typecheck (оба пакета) | `npm run typecheck` |
| Lint | `npm run lint` |
| Dev-запуск приложения | `npm run dev` |
| Сборка Windows | `npm run package` |

## Управление задачами

- Никакого production-кода без явного одобрения плана этапа.
- Каждый этап завершается зелёными тестами и проверкой `typecheck` + `lint`.
- Эталонные тесты (Reference Test Cases 001–004) — приёмные критерии математического ядра. Подробности см. `docs/ARCHITECTURE.md` и `docs/DECISIONS.md`.
- Полный UI — финальный этап; UI является клиентом готового core, а не наоборот. Одобрено узкое исключение Early Alpha UI — Cabinet Grid Visualizer по `docs/specs/LEDMAP-ALPHA-UI-001.md` и ADR-017; план реализации явно одобрен пользователем 2026-09-23. Hardware, Mapping/Remap, сериализация и расширение математики в исключение не входят.

## Reference Test Case 001 (приёмный тест ядра)

- 4 колонки × 3 ряда кабинетов = **12 cabinets**
- Cabinet 128×128 px, 4×4 модуля (модуль 32×32 px)
- Numbering = Row, Direction = Left→Right, Snake = ON
- 4 cabinets на Receiver, 2 Receiver на Port, 4 Port на Processor
- Итого **196 608 px**, разрешение экрана **512×384 px**
- Физическая сетка: `C01 C02 C03 C04 / C05 C06 C07 C08 / C09 C10 C11 C12`
- Логический порядок сигнала: `C01 C02 C03 C04 / C08 C07 C06 C05 / C09 C10 C11 C12`

## Конвенции кода

- Не добавлять комментарии в код, если они не запрошены.
- Следовать существующим паттернам и стилю соседних файлов.
- Не коммитить без явного запроса пользователя.
