# LedMAP — состояние интеграции на 2026-10-06

Этот документ фиксирует каноническую последовательность после upstream inventory. Отдельные прототипы исходного `feat/composition-calculation` не считаются интегрированными автоматически: новая разработка идёт от `origin/master` короткими ветками и PR.

| Этап | Состояние | Подтверждение |
|---|---|---|
| P0-1: зависимости, лицензии, provenance gate | Merged | [PR #16](https://github.com/SystemDesignInstall/ledmap/pull/16), [отчёт](DEPENDENCY-LICENSE-GATE-2026-10-06.md) |
| P0-2: фактические нагрузки Hardware, partial allocation и диагностика | Merged | [PR #17](https://github.com/SystemDesignInstall/ledmap/pull/17), [отчёт](PROJECT-HARDWARE-PLANNING-2026-10-06.md) |
| P0-3: координатные пространства и native Resolume subset | Merged | [PR #18](https://github.com/SystemDesignInstall/ledmap/pull/18), [отчёт](COORDINATE-RESOLUME-2026-10-06.md) |
| P1-1: native XML import UI, bindings, atomic Apply | Merged | [PR #19](https://github.com/SystemDesignInstall/ledmap/pull/19), [отчёт](RESOLUME-IMPORT-UI-2026-10-06.md) |
| P1-2: профили / режимы / transport limits, Hardware Inspector, v6 | Реализовано; локальные gates зелёные, публикация и CI фиксируются в PR этой ветки | [план](../specs/LEDMAP-HARDWARE-CAPACITY-PROFILES-001.md), [отчёт](HARDWARE-CAPACITY-PROFILES-2026-10-06.md), 1770 тестов |

## Следующий порядок работ

1. Экспорт отчёта проекта: конфигурация, реальные нагрузки и лимиты, provenance профилей, назначения, unpatched кабинеты, ошибки / предупреждения. Отчёт должен пользоваться каноническими selectors; производные результаты не входят в `.ledmap`.
2. Профилирование крупных проектов: согласованные размеры fixtures, p95 core / renderer, frame time и memory; оптимизации только по измеренным проблемам с теми же приёмными тестами.
3. Подтверждённый каталог vendor modes — отдельный evidence review каждого режима и источника. Текущий этап даёт ручные снимки профилей; тип manufacturer сам по себе не подтверждает числа.
4. Продуктовая приёмка и правила распространения: полный P1 закрывается после оставшихся задач, а не по наличию отдельных прототипов. Вопрос лицензии самого LedMAP остаётся отдельным от сохранённых лицензий upstream.

Live-проверка в Resolume Arena исключена пользователем («не проверяй»). Native fixtures и внутренний round trip проходят проверки, но не заменяют подтверждение в Arena. Power / NDI / 3D относятся к отдельным P2 задачам.
