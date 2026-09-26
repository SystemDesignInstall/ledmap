# Phase 7 — Headless Integration Closure Gate

Статус: **PASS — Phase 7 закрыт как единый блок.** Последний пункт Phase 7 («все тесты движков зелёные и выполняются headless независимо от Alpha UI») подтверждён воспроизводимой core-only командой. Результаты локальные, без CI-подтверждения.

Закрытые подэтапы: 7A Mapping `0071eeed001ed2e275e3efb827b216a1d49da1f8`, 7B Remap `2b589ac326ab6bc066d0a55cd295bae05e9fc380`, 7C Validation `d2f2aea60bde2e526f5a96fa00ed3d5d6b6f94d9`, 7D Serialization `410ba7fcc830968b615058fe33b6bbea12fb2272` (docs-only closure `6ea15c06cdce08f4794fbe25a2af40019196d68d`), Early Alpha UI Project Canvas `ab71ca2` (closure `49d17d7`).

## Scope

- `package.json`: добавлен один script `"test:core": "vitest run packages/core/test"`.
- Этот отчёт и `TODO.md`.
- `packages/core/src/**`, `packages/core/test/**`, `packages/app/**`, engine math, Accepted specs, ADR и docs-контракты не изменялись. Новых тестов не добавлено: gate доказывает воспроизводимость уже существующего покрытия, а не расширяет его.

## Gate

Прогон выполнен в чистом worktree, созданном на `6ea15c0` (`git worktree add --detach`) с применением только изменения `package.json`, чтобы результат зависел от содержимого коммита, а не от локального рабочего дерева. Среда: Windows, Node.js v24.19.0, npm 11.17.0.

| Команда | Результат |
|---|---|
| `npm run test:core` | PASS — 41 test-файл, 1051 тест, 76.29 s |
| `npm run typecheck -w @ledmap/core` | PASS — `tsc --noEmit` |
| `npm run build -w @ledmap/core` | PASS — `tsc --noEmit` |
| `npx eslint packages/core` | PASS — exit 0, без замечаний |
| `npm test` | PASS — 43 test-файла, 1087 тестов, 76.12 s (full regression) |
| `git diff --check` | PASS — exit 0 |

## Headless-факты

```text
Electron runtime required: NO
packages/app runtime required: NO
Alpha UI state required: NO
core tests execute headless: YES
```

- `test:core` запускает только `packages/core/test/**`: 41 файл / 1051 тест. Два app unit-файла (36 тестов) и Electron smoke в прогон не входят, поэтому 1051 + 36 = 1087 совпадает с full suite.
- Все engines покрыты core-прогоном: Cabinet (6A), Hardware (6B), Mapping (7A), Remap (7B), Validation (7C), Serialization (7D), плюс model/domain и REF-001.
- Core-only baseline до 7D — 800 тестов / 31 файл (полный baseline `49d17d7` = 836 = 800 core + 36 app); 800 + 251 (7D) = 1051 core / 1087 full, что независимо подтверждает принятые в отчёте 7D числа.
- `packages/core/package.json` не объявляет `dependencies`. Скан `packages/core/src` не нашёл импортов `electron`, `node:*`, `fs`, `path`, `os` и обращений к DOM globals; шесть совпадений оказались локальными переменными `document` в модулях serialization.
- Core-тесты работают в default node environment: ни одного `@vitest-environment`, `jsdom` или `happy-dom` в `packages/core/test`.
- Electron smoke (`test:smoke`) намеренно не запускался: смысл gate — доказать работоспособность core и engines **без** Electron, поэтому его успех не является частью этого gate.

## Наблюдение о локальном рабочем дереве

В `C:\Code\LedMap` присутствует незакоммиченный refactor-поток, не относящийся к этому gate: 30 изменённых core-файлов (включая `packages/core/src/serialization/*` и engine tests), четыре новых source-файла (`mapping-engine/transform.ts`, `model/mapping-transform.ts`, `model/output-surface.ts`, `model/slice.ts`), два новых core test-файла (`test/domain/spatial-contracts.test.ts`, `test/mapping-engine/spatial.test.ts`) и новые `docs/architecture/`, `docs/migrations/`, `docs/refactor-baseline.md`. Локальный запуск в этом дереве даёт 1092 core / 1128 full (34 теста из двух незакоммиченных файлов), поэтому замеры выше взяты из чистого checkout. Коммит gate затрагивает только `package.json`, `docs/phase-7-headless-validation.md` и `TODO.md`; содержимое refactor-потока не изменялось и не включалось.

## Итог Phase 7

```text
7A Mapping        CLOSED
7B Remap          CLOSED
7C Validation     CLOSED
7D Serialization  CLOSED
Headless Gate     CLOSED
────────────────────────
Phase 7           CLOSED
```

Следующий плановый этап — Hardware Profile implementation gate по последовательности, уже зафиксированной в [LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001](specs/LEDMAP-HARDWARE-PROFILE-ADDRESSING-SPEC-001.md): Hardware Profile implementation → Address Encoder → `LEDMAP-FINAL-REMAP-REVERSEINDEX-SPEC-001` → Final Remap / ReverseIndex. UI и Open/Save остаются Phase 8; строить интерфейс поверх незавершённой аппаратной адресации не следует.
