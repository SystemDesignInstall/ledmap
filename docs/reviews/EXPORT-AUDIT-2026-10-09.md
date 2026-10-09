# Export audit — full report (P0+P1+P2+P3)

Дата: 2026-10-09. База: `origin/master` = `c9f7af9`, ветка `master`, статус чистый.
Решения пользователя: отчет один по всему экспорту; PNG → WYSIWYG с тенью; SVG → оставить
`feDropShadow`; проверка — golden-файлы + теория, без живого Arena/Hippo.
Метод: временные headless-зонды vitest (удалены после прогона) + чтение кода + существующие
тесты. Прод-код не менялся.

Базовый прогон перед отчетом (зеленый):
`png-export, composition-chart, export-engine, v2-export-engine, media-output-adapters,
resolume-native, test-engine` → **7 файлов / 94 теста PASS**.

## 1. Инвентарь экспорта

| # | Канал | Формат / имя | Источник |
|---|---|---|---|
| 1 | PNG TestFrame (`renderer/export-workspace.ts:213 exportPng` → `renderer/export-image.ts:12 renderPngJob` → `renderer/test-canvas.ts:462 drawTestFrameAtActualPixels`) | `image/png`, actual-pixel `job.bounds`, лимит `32767px / 64Мп` (`shared/png-export.ts:47-51`), режимы `composition/current-scope/screen/batch-screens` | `TestFrame` (`shared/test-engine.ts:evaluateTestPattern` + `shared/chart-engine.ts:buildCompositionChartFrame`) |
| 2 | SVG Screen drawing (`export-workspace.ts:237 exportSvg` → `shared/svg-export.ts:44 renderFrameSvg`) | `*.svg` (`job.name .png→.svg`), только `composition-chart/mask` (гейт `export-workspace.ts:202,238`) | Тот же `TestFrame`/те же `plan.jobs`, что PNG |
| 3 | Generic Mapping JSON/CSV (`export-workspace.ts:263` → IPC `writeGenericMapping` → `main/export-files.ts:114` → `shared/v2-export-engine.ts:252`) | `ledmap-generic-mapping{-screen}.json/csv`, 16 колонок, `dataIndex = portBase + offset` (port-local) | `resolveGeometryMapping + resolveHardware + unmapGeometryCabinetPixel` |
| 4 | Resolume slice XML (`export-workspace.ts:312` → `shared/media-output-adapters.ts:54 buildResolumeXml`) | `ledmap-output-slices.xml`, собственный `<LedMapResolume>` | `content.mediaOutputs + outputMappings` в `mappingOrder` |
| 5 | Hippo CSV (`export-workspace.ts:312` → `media-output-adapters.ts:88 buildHippoCsv`) | `ledmap-output-slices.csv`, 17 колонок `HIPPO_CSV_COLUMNS` | Тот же источник, что №4 |
| 6 | Resolume Arena native (`export-workspace.ts:290` → `shared/resolume-project.ts:19 planResolumeProjectExport` → `shared/resolume-export.ts:18 buildResolumeNativePreset`) | `ledmap-arena-preset.xml`, `XmlState/ScreenSetup`, Arena 7.27.0 sample, лимиты `250 screens+slices / 2MiB`, staged write tmp+rename, общий лимит файла `512MB` (`main/export-files.ts:43,121`) | `screenRect→compositionRaster` + `outputRect` |
| R | Эталоны: Preview (`test-canvas.ts:378 drawTestFrame`), Live (`renderer/output.ts:19 drawClippedTestFrame` → `test-canvas.ts:435`, defaults `pixelPerfect=false`), Composition canvas | — | Тот же `TestFrame` |

IPC: `shared/ipc.ts:156-171`, `main/index.ts:278-279`. JSON Generic идет отдельным каналом
`writeGenericMapping` (whitelist `writeFiles` — только `.png/.svg/.xml/.csv`, `export-files.ts:103`).

## 2. P0 — тень (подтверждено зондами)

Зонд 1 (фикстура 2 скрина + `textShadow:true`, `offsetMarkers:true`, `logoText:'Composition'`):

```text
TEXTS:[{A1,shadow:true,cabinet-label}, {X -100 · Y 20,shadow:true},
  {Composition,shadow:true}, {Left · 200×200,shadow:true,screen-title},
  {Right · 200×200,shadow:true,screen-title}]
SVG_HAS_FILTER:true  SVG_HAS_FONTWEIGHT:false  SVG_HAS_FEDROPSHADOW:true
PNG_READY:true JOBS:1
STRIP_SHADOW_FALSE:true  PNG_EXPORT_USES_PIXELPERFECT:true  CANVAS_SHADOW_PARAMS:true
```

* Модель `shared/test-engine.ts:114 text.shadow?`; ставят `shared/chart-engine.ts:133,152,165,182`
  (`cabinet-label/screen-title ← style.textShadow`; `offsetMarkers/logoText` всегда `true`);
  дефолт `shared/chart-settings.ts:303 textShadow:true`.
* Preview `test-canvas.ts:267-271` (`#000, blur 3, 1,1`) и Live (`output.ts:19`, `pixelPerfect=false`)
  тень рисуют.
* PNG `test-canvas.ts:479 pixelPerfect=true` → `test-canvas.ts:139 {…shadow:false}` в
  `drawHardPrimitive` + `261-262` ранний возврат до блока тени → **тени нет по построению**.
  Маска тени не касается: `MASK_TEXTS:0` (зонд 3), там расхождения нет.
* SVG фильтр есть, но параметры `feDropShadow dx1 dy1 dev2 op0.8` (`svg-export.ts:63`) ≠
  Canvas `blur3 op1`; плюс нет `font-weight` (см. P1.5).
* Вердикт: **баг паритета** `Preview=Live≠PNG≠SVG`. Решение пользователя: PNG → WYSIWYG с тенью,
  SVG фильтр оставить. Сложность: `drawHardPrimitive 152-160` бинаризует alpha
  (`<128 skip, else 255`) — полупрозрачный blur этим путем не пройдет; для `text+shadow`
  в `pixelPerfect` нужен прямой проход без hard-mask (деталь — Этап C).

## 3. P1 — расхождения рендеров (все подтверждено)

| ID | Место | Preview/Live | PNG (`pixelPerfect=true`) | SVG | Вердикт |
|---|---|---|---|---|---|
| P1.1 | `pixel` address-walk | `test-canvas.ts:292 size=max(4,zoom)` → 4×4 | 4×4 | `svg-export.ts:41` 1×1 (зонд: `SVG_PIXEL_FALLBACK_1x1:true`) | Документировать как известное отличие (предложение плана); не менять сейчас, чтобы не ломать видимость/golden |
| P1.2 | `cabinet-border` | `cabinet-border.ts:24 strokeRect(+0.5)`, тени/blur сброшены `15-18` (по `CABINET-BORDER-CORRECTIVE-001`) | тот же `drawCabinetBorder`, 1px внутрь / 2px стык | 4×`rect` по 1px (`svg-export.ts:15-20`, зонд `SVG_BORDER_4RECTS:true`, `BORDER_COUNT:2` в chart) | Паритет геометрии 1px/2px — принять; расхождение только на дробных координатах (viewer-зависимо) |
| P1.3 | `line screen-center-guide` | двойной штрих с подложкой при `viewportLabels=true` (`test-canvas.ts:227-241`) | одинарный (`viewportLabels=false`) | одинарный (роли нет, зонд `SVG_GUIDE_SINGLESTROKE:true`) | Preview≠Export по построению; задокументировать |
| P1.4 | `text viewport-culling` | `screen-title` прячется при `cellHeight*zoom<48`, `cabinet-label` через `drawViewportCabinetLabel` (`253-259`) | всегда рисует | всегда рисует | Preview≠Export по построению; задокументировать |
| P1.5 | шрифт | `600 ${size}px`, clamp `8..48` (`test-canvas.ts:89-94`, зонд `CANVAS_TEXTFONT_CLAMP:true`) | то же при `zoom=1` | без `font-weight`, без clamp (зонд `SVG_NO_FONTWEIGHT:true`) | **Баг**: добавить `font-weight="600"` в `svg-export.ts:36`; clamp при `zoom=1` совпадает — не трогать |
| P1.6 | `image smoothing` | `true` | `false` (`test-canvas.ts:286`, зонд true) | на вьювере | Preview≠PNG по построению (crisp для LED); задокументировать; `opacity` паритетен (тест `composition-chart.test.ts:92-93`) |
| P1.7 | `rect pixelAligned/opacity` | `fillPixelAlignedRect` при `pixelPerfect \|\| pixelAligned` (`193`) | то же | игнор `pixelAligned` | Не баг для `rgb-bars` (там `pixelAligned:true` + целочисленные бэнды); задокументировать |
| P1.8 | `clip` | `ctx.clip` | `ctx.clip` | `clipPath` с ключом по ссылке (`svg-export.ts:56-62`) — дубли при равных но не `===` массивах | Косметика (раздувание), не ошибка рендера; не трогать |
| P1.9 | `gradient` | `createLinearGradient` | то же | `id="gradient-${index}"`, `y2=100%` vertical (зонд `GRADIENT_ID:true`) | Паритет; не трогать |
| P1.10 | фон | `transparent` → checkerboard/прозрачность; Live композит на черном (`COMPOSITION-CHART-001:32`) | прозрачный PNG | без фона | Паритет; не трогать |

## 4. P2 — дата-экспорты (потерь тени нет по определению)

* **Hippo теряет геометрию маски** (подтверждено): `HIPPO_ROW:0,FOH,Slice A,true,…,90,true,false,3`,
  `HIPPO_MASK_IS_COUNT_ONLY:true`, при этом intermediate `INTERMEDIATE_HAS_MASK_POINTS:true`.
  Тест `media-output-adapters.test.ts:32-40` закрепляет count-only как контракт →
  **документировать**, формат не менять без отдельного gate.
* **Native реджектит transforms** (подтверждено):
  `NATIVE_READY_WITH_ROT_FLIP_MASK:false`,
  `NATIVE_DIAG:["Slice Slice A: native export supports zero rotations/flips and no active mask"]`.
  Текст четкий; кнопка disabled + диагностика (`export-workspace.ts:205-209`). Не баг.
* Generic Mapping: детерминизм, JSON≡CSV семантически, граница `65535→65536`, `screen-scope`
  без ребаза покрыты (`export-engine.test.ts:93-126`, `v2-export-engine.test.ts:23-37`).
  В зондах не дублировалось — полагаемся на эти тесты (зеленые в базовом прогоне).
* Native golden `resolume-native.test.ts:143-160` + `RESOLUME_COMPATIBILITY` «has not been verified»
  (`resolume-types.ts:57`, UI `export-workspace.ts:302`) — по решению №4 достаточно.

## 5. P3 — проводка/лимиты

* Whitelist `export-files.ts:103` + отдельный IPC для JSON — корректно; smoke-dir
  `LEDMAP_SMOKE_EXPORT_DIR` обходит диалоги (`export-files.ts:145-150`).
* `safeName` (`png-export.ts:36-39`) vs `fileSegment` (`export-workspace.ts:63-65`): тексты bodies
  идентичны с точностью до `trim` (зонд вывел оба тела); проверка кейсов
  (`Screen, "A"→Screen-A`, `a/b\c→a-b-c`) расхождений не дала — **дублирование, не баг**;
  предложение: унифицировать при касании, отдельно не чинить.
* SVG-гейт `pattern !== chart && !== mask` (`export-workspace.ts:202,238`, зонд
  `SVG_GATE_CHART_MASK:true`) — корректно.
* PNG-лимиты/лого-fit/frame-crop покрыты `composition-chart.test.ts:209-274`, `png-export.test.ts`.

## 6. Что предлагается на Этап B (docs-gate, без кода)

1. PNG WYSIWYG: `text` с `shadow:true` при `pixelPerfect` идет прямым проходом с тенью
   (как Preview), без `drawHardPrimitive`; `shadow:false`, `rect/circle/line`, `cabinet-border`
   без тени — без изменений.
2. SVG: добавить `font-weight="600"`, фильтр не менять (решение пользователя).
3. P1.1, P1.3, P1.4, P1.6, P1.7, P2-Hippo, P3-дубль — зафиксировать как контракт/известные
   отличия в спеке, кода не менять.
4. Этап C после аппрува B: правки только `renderer/test-canvas.ts` (текст+тень в pixelPerfect)
   и `shared/svg-export.ts` (вес шрифта) + unit-тесты на моках Canvas2D и SVG-строке;
   `core`, схема `.ledmap`, IPC, лимиты, golden native — без изменений.

## 7. Воспроизводимость

Временные зонды `__export-audit-probe{,2,3}.test.ts` удалены (`git status` чистый на момент
отчета). Все строки `Зонд:` выше — вывод их прогонов. Повторная проверка — существующими
тестами из §0 и новыми unit-тестами Этапа C.
