# LedMAP — Early Alpha

Cabinet Grid Visualizer: один Screen, одна сетка кабинетов и интерактивный Canvas на базе `@ledmap/core`.

Нужны Node.js 24 LTS (>=24), npm и Git. Из корня репозитория:

```sh
npm install
npm run dev
```

В Windows PowerShell, если запуск `npm.ps1` запрещён политикой, используйте `npm.cmd` вместо `npm`.

Нажмите **Create Screen**. Меняйте размеры сетки и модулей, Numbering, Direction и Snake. Белое `C01` обозначает физический кабинет; зелёное `#1` — его место в логическом порядке (`cabinetIndex + 1`). Зелёные стрелки показывают путь сигнала. Геометрия и ID не меняются при смене ordering.

Разрешение экрана вычисляется из геометрии. Invalid input оставляет последний допустимый preview и показывает ошибку. Preview ограничен 1024 кабинетами и 65 536 модулями суммарно; при мелком масштабе подписи и модульные линии скрываются. ID и логические номера также перечислены в доступном имени Canvas для экранного диктора.

Состояние хранится в памяти и теряется при закрытии. StartCorner — Top Left. Hardware, Mapping Engine, save/load, экспорт и installer в Alpha не входят.

Проверки:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

`build` создаёт Electron main и renderer в `packages/app/out`. `test:smoke` запускает эту сборку в настоящем Electron через Playwright, проверяет настройки, нарисованные на Canvas номера, обработку ошибок, resize и DPR=2, затем закрывает окно. Скриншоты сохраняются в `packages/app/out/smoke` (не коммитятся). Для smoke требуется доступный графический сеанс.

Core остаётся без runtime-зависимостей. App разрешает импорт `@ledmap/core` в существующий public barrel через согласованные aliases TypeScript, electron-vite и Vitest; файлы core не изменяются.

Контракт: [LEDMAP-ALPHA-UI-001](docs/specs/LEDMAP-ALPHA-UI-001.md), [ADR-017](docs/DECISIONS.md#adr-017-early-alpha-ui--cabinet-grid-visualizer).
Инструменты: [electron-vite configuration](https://electron-vite.org/config/), [Playwright Electron API](https://playwright.dev/docs/api/class-electron), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
