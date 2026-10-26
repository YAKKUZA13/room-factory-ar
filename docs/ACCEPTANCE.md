# ACCEPTANCE — ROOM FACTORY AR

Дата: 2026-10-26.

## Общий статус

- **`CODE-COMPLETE`** — исходники, strict typecheck, unit-тесты, production build, `verify-dist`, desktop/mobile E2E и mock-AR relocalization проходят локально.
- **`AR-DEVICE-VERIFIED`** — **НЕ достигнут**. Пользователь проверил предыдущую версию на телефоне и предоставил ошибки URL/размера камеры. Исправления проверены автоматически; повторный физический тест камеры, SLAM и маркера остаётся **OPEN (device)**.
- Предыдущая версия опубликована пользователем на GitHub Pages. Мобильная редакция с этажами проверена локально; её deployment ещё не выполнен.

## P0 — MUST

| # | Требование | Статус | Доказательство / комментарий |
|---|---|---|---|
| 1 | Отдельный TypeScript-проект, SPEC.md, README, `npm ci/dev/build/test` | **PASS** | `package.json`, `package-lock.json`, `SPEC.md`, `README.md`; Git-репозиторий `YAKKUZA13/room-factory-ar`. |
| 2 | Полностью доступный standalone 3D-режим с экономической цепью | **PASS** | `src/viewer/desktop-3d-viewer.ts`, `src/app/app-controller.ts`; E2E desktop/mobile. |
| 3 | 4 рабочих модуля с правилами, ценами, буферами, движущимися предметами | **PASS** | `src/core/constants.ts`, `economy.ts`, `logistics.ts`, `simulation.ts`; `src/render/*`; unit + E2E. |
| 4 | Редактируемый завод 10×10, grid picking, HUD, tutorial | **PASS** | `grid.ts`, `factory-renderer.pickCell`, `ui/*`; E2E placement/rotate. |
| 5 | Версионированное сохранение/восстановление/import/export/corrupt | **PASS** | `persistence/*`; unit `tests/persistence/save.test.ts`; E2E export/reset/import, corrupt recovery. |
| 6 | Реальный `@8thwall/engine-binary` world tracking в адаптере; permission/unsupported/fallback | **CODE-COMPLETE, OPEN (device)** | `src/ar/eightwall-adapter.ts`, `xr-loader.ts`; runtime копируется в `dist/external/xr`; desktop unsupported fallback E2E PASS. Реальная камера/SLAM на телефоне не проверялись. |
| 7 | Image target metadata и события `imagefound/imageupdated/imagelost` | **CODE-COMPLETE, OPEN (device)** | `public/marker/room-factory-marker.json` из официального CLI; HTTP 200 под subpath; listeners в adapter. Распознавание напечатанного маркера не проверено. |
| 8 | Free placement и реальная формула marker-relative binding/restoration, тесты матриц | **PASS (logic), OPEN (device)** | `placement-controller.ts`, `anchor-manager.ts`, `transforms.ts`; 7 matrix tests + 9 anchor tests; mock E2E relocalization. |
| 9 | Нет ложного persistent anchor без маркера; bound требует relocalization, unbound — нового размещения | **PASS** | Anchor только `unbound`/`marker`; `requestRelocalization`; unit + E2E marker-not-found. |
| 10 | State machine loss/limited/relocalization, блокировка редактирования | **PASS** | `session-machine.ts`, `handleTrackingChange`; unit + mock E2E tracking limited. |
| 11 | Production build под subpath GitHub Pages, CI pipeline, XR/marker assets | **PASS (build), NOT DEPLOYED** | `npm run build`, `verify-dist` PASS для `/room-factory-ar/`; `.github/workflows/deploy.yml`. Реальный GitHub deployment не выполнен. |
| 12 | Сохранены лицензии/атрибуция 8th Wall, нет чужих моделей/брендов | **PASS** | `THIRD_PARTY_NOTICES.md`, `LICENSE`, About dialog; все модели/маркер процедурные. |
| 13 | Unit tests экономики, конвейеров, сохранения, координат, фильтра маркера | **PASS** | 101 tests / 11 files; также URL маркера, размер AR-canvas, этажи, рецепты и подъёмники. |
| 14 | Инструкция печати карточки и контрольного теста на телефоне | **PASS (doc), NOT TESTED** | `public/marker/room-factory-marker-print.html`, `README.md`, `docs/AR_TEST_PLAN.md`. |
| 15 | Неизвестные SDK API не выданы за подтверждённые; TODO: verify on device | **PASS** | `docs/AR_TEST_PLAN.md` §7; комментарии в `eightwall-adapter.ts`/`xr-loader.ts`. |

**Вывод по P0:** все пункты, не требующие физического устройства, закрыты. P0 №6, №7, №8 (device), №14 (device) остаются открытыми до ручной проверки на реальном смартфоне. Нельзя маркировать задачу как `AR-DEVICE-VERIFIED`.

## P1 — SHOULD

| # | Требование | Статус | Доказательство |
|---|---|---|---|
| 1 | Плавная коррекция small drift при повторном маркере | **PASS (logic)** | `AnchorManager.applyMarkerCorrection` + `update` slerp; unit test. Device drift не измерен. |
| 2 | Diagnostics FPS/draw calls/pose error в debug panel | **PASS** | `src/ui/diagnostics.ts`, `?debug=1`; E2E diagnostics. |
| 3 | Процедурные модели, LED, анимации | **PASS** | `building-factory.ts`, `conveyor-renderer.ts`, `visual-effects.ts`. |
| 4 | Full mobile UX, safe-area, orientation, touch targets | **PASS (layout)** | CSS + Playwright 390×844/844×390; реальный iOS/Android browser не проверен. |
| 5 | Desktop Playwright smoke и mock marker relocalization | **PASS** | `tests/e2e/desktop.spec.ts`, `mock-ar.spec.ts`. |

## P2 — NICE TO HAVE

| # | Требование | Статус | Комментарий |
|---|---|---|---|
| 1 | Декоративные частицы, деликатные звуки | **PARTIAL** | Sale ring flash реализован; звука нет (preference `muted` сохраняется). |
| 2 | Достижения, темы, скриншот | **NOT IMPLEMENTED** | Вне MVP. |
| 3 | Подробные performance metrics/график FPS | **PARTIAL** | FPS, frame p95, draw calls, triangles, meshes в diagnostics; графика нет. |

## Тестовое резюме (локально, реально запущено)

| Проверка | Статус | Детали |
|---|---|---|
| `npm ci` | **PASS** | clean install 56 packages, lockfile; 2 high dev-only audit warnings (sharp, no fix) |
| `npm run typecheck` | **PASS** | `tsc --noEmit`, strict |
| `npm run test` | **PASS** | 101 tests / 11 files |
| `npm run build` | **PASS** | typecheck + tests + vite build + copy XR + verify |
| `scripts/verify-dist.mjs` | **PASS** | base `/room-factory-ar/`, marker companions, XR runtime |
| Playwright desktop-chromium | **PASS** | 12 tests |
| Playwright mobile-chromium | **PASS** | 11 tests, 1 skipped (desktop-only unsupported fallback) |
| Playwright всего | **PASS** | 23 passed, 1 skipped; 3,6 мин |
| Production HTTP assets под subpath | **PASS** | xr.js, xr-slam.js, marker JSON/luminance/print/icon — 200 |
| iOS Safari device | **NOT TESTED** | нет устройства |
| Android Chrome device | **NOT TESTED** | нет устройства |
| Marker physical recognition | **NOT TESTED** | нет печати/камеры |
| Marker relocalization accuracy | **NOT TESTED** | см. AR_TEST_PLAN §5 |
| GitHub Pages deployment | **PREVIOUS VERSION ONLY** | предыдущая версия опубликована пользователем; новая редакция локальна |

> Точные числа E2E в этой таблице должны соответствовать финальному полному прогону. Если после последнего прогона менялся код, запустите `npm run build` и `npx playwright test` заново.

### Исправление URL маркера при запуске с телефона

При первом запуске по локальному HTTPS обнаружена ошибка построения URL: относительный путь JSON использовался как абсолютная база `new URL()`. Теперь адрес JSON сначала разрешается относительно текущей страницы, затем относительно него вычисляется адрес изображения. Добавлены 6 regression-тестов, включая локальный HTTPS с production subpath. Проверка собранной страницы в мобильном Chromium с настоящим XR8 runtime и искусственной камерой подтвердила передачу полного URL изображения в SDK, HTTP 200 изображения и вызов `XR8.run()` без ошибки разбора URL. Это не подтверждает работу физической камеры, SLAM или распознавание маркера на телефоне.

### Мобильная мастерская и вертикальное производство

- Шесть этажей, парные подъёмники, добыча руды/меди, рецепты с двумя ингредиентами и отдельным выходным буфером; совместимость старых сохранений. Детерминированный пример из 24 модулей начинает с пустых буферов и продаёт собранные модули через три этажа: unit и desktop/mobile E2E PASS.
- Макет перед списанием средств, подтверждение установки, поворот ±90° до установки и после выбора тапом, этажи и сохранение проверены E2E. Блокировка редактирования при потере трекинга сохранена.
- Светлая монохромная тема и контурные инструменты по референсу. Скриншоты desktop/mobile: `docs/screenshots/`; горизонтальное переполнение отсутствует.
- Перед настоящим `XR8.run()` SDK получает canvas `585×996` для CSS/окна `390×664`. Размеры при повороте и освобождение обработчиков проверены unit-тестом. Это проверка контракта размера canvas, не успешной SLAM-сессии или изображения с физической камеры.

## Что осталось для полного acceptance

1. Напечатать маркер и пройти сценарии A–I из `docs/AR_TEST_PLAN.md` на iPhone Safari и Android Chrome.
2. Заполнить матрицу устройств и таблицу точности relocalization.
3. Проверить повторный `XR8.run()`/retry и частоту `imageupdated` на устройстве; при необходимости скорректировать adapter.
4. Опубликовать `dist` через готовый workflow и проверить URL под `/repo/` на реальном телефоне.
5. Только после этого можно присвоить `AR-DEVICE-VERIFIED`.
