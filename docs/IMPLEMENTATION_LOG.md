# IMPLEMENTATION LOG — ROOM FACTORY AR

Дата: 2026-10-26. Рабочая директория: `C:\Users\Yakuza\Desktop\monafacture` (не git-репозиторий; коммиты не создавались).

## Итоговый статус

`CODE-COMPLETE`: TypeScript strict, unit-тесты, production build, `verify-dist`, Playwright (desktop + mobile Chromium, включая mock-AR relocalization) проходят локально.
`AR-DEVICE-VERIFIED`: **НЕ достигнут** — физический смартфон и печатный маркер недоступны в среде выполнения. Никаких заявлений о реальной точности relocalization/FPS на телефоне нет.

## Окружение и точные версии

Проверено локально:

- Node.js `24.13.0`, npm `11.6.2`, Windows 10/11, Chromium через Playwright.
- `three` `0.186.1`
- `@8thwall/engine-binary` `1.0.0`
- `typescript` `7.0.2`
- `vite` `8.3.5`
- `vitest` `5.0.5`
- `@playwright/test` `1.64.1`
- `@types/three` `0.186.0`
- `@types/node` `26.6.5`
- `@8thwall/image-target-cli` `1.0.0` (dev, генерация маркера)
- `sharp` `0.34.5` (dev, рендер маркера)

`package-lock.json` фиксирует транзитивные версии. `npm audit` показывает 2 high severity в dev-зависимости `sharp`/цепочке CLI; runtime-код игры их не использует. Ограничение зафиксировано, не скрыто.

## Что сделано по milestone

### M0 — bootstrap

- Vite + TypeScript strict + CSS + стартовый экран + `index.html`.
- Структура `src/core`, `src/ar`, `src/render`, `src/viewer`, `src/app`, `src/persistence`, `src/ui`, `src/styles`.
- npm scripts, GitHub Pages workflow, `scripts/copy-xr-assets.mjs`, `scripts/verify-dist.mjs`.
- Vite dev middleware отдаёт `node_modules/@8thwall/engine-binary/dist` по `/external/xr/*`; production копирует весь dist.

### M1 — FactoryCore

- Типы, константы, сетка 10×10, направление `0=+Z,1=+X,2=-Z,3=-X`.
- `applyCommand`: place/rotate/remove/toggle/pause/reset, атомарные ошибки `Result<T, DomainError>`.
- Стартовый комплект, возврат starter-слота / 50% credits.
- Энергосеть: supply 10/генератор, demand 4/extractor + 5/processor, brownout.
- Двухфазная логистика `read → intents → deterministic resolve → commit`; один предмет — максимум одно ребро за тик.
- `FactoryEngine` + `FixedStepClock` (0.1 c, максимум 5 шагов/кадр, clamp 0.25 c).
- Сериализация с runtime-валидацией, сохранение буферов/progress/starter/credits.
- 83 unit tests (core + AR math + persistence + session).

### M2 — Desktop 3D + UI

- Процедурные модели: генератор, добытчик, конвейер, переработчик; PCB-платформа, сетка, контактные пятна, LED, анимации, sale-flash; ghost-превью здания по локальной сетке и debug-оси/куб маркера.
- `FactoryRenderer` с `contentRoot.scale = cellSizeMeters` и rigid `factoryRoot`.
- Picking: raycast по локальной плоскости сетки через `content.worldToLocal`, поддержка поворота/масштаба.
- `Desktop3DViewer`: собственный Scene/WebGLRenderer/RAF, OrbitControls, tap/drag threshold 6 px, responsive fit, DPR cap, context-loss handlers.
- HUD (credits/energy/production/parts), toolbar с ценами и стартовыми остатками, inspector, меню, settings, help, diagnostics, tutorial, notifications, безопасные зоны, mobile/landscape CSS.
- Save/debounce/autosave/export/import/corrupt recovery; все UI-тексты вынесены в `ui/strings.ts` для ключевых экранов.

### M3 — AR spike

- Runtime загружается локально из `dist/external/xr/xr.js` через `src/ar/xr-loader.ts`; ожидание `xrloaded`/`window.XR8` с timeout 20 с.
- `XR8.XrController.configure({scale:'absolute', imageTargetData:[metadata]})` до `XR8.run`.
- Порядок modules: `GlTextureRenderer`, `Threejs`, `XrController`, app module `room-factory-session`.
- Обработка `reality.imagefound/imageupdated/imagelost`, `reality.trackingstatus`, `onCameraStatusChange`, `onException`.
- `window.THREE` назначается до `XR8.Threejs.pipelineModule()`.
- `imagePath` в JSON переписан на имя файла относительно metadata URL, runtime резолвит его от URL JSON; проверено HTTP 200 под base `/room-factory-ar/`.
- Официальный CLI сгенерировал `PLANAR` target `room-factory-marker` 1200×1600 px; print page с физическим размером 120×160 мм.
- Реальный camera/маркер на телефоне: **not tested**; см. AR_TEST_PLAN.

### M4 — Free placement и гибридный anchor

- `PlacementController`: fallback-плоскость перед камерой, hitTest-подсказка с проверкой горизонтальности, высота ±5 см, yaw ±15°, масштаб 0.5–1.0.
- `MarkerPoseFilter`: окно 30 сэмплов/4 с, минимум 8 обновлений и ≥500 мс, spread ≤3 см / ≤5°, hemisphere-safe quaternion average, отбрасывание NaN/чужого имени/устаревших данных.
- `AnchorManager`: bind/restore/rebind/temporary, SLAM guard, rigid `T_M_F`, сохранение только marker-relative anchor, smoothing display pose 0.45 с, large correction confirmation, anchor никогда не перезаписывается при temporary/autosave.
- `SessionMachine`: STARTING/PERMISSION_REQUIRED/INITIALIZING/SCANNING/FREE_PLACEMENT/FREE_UNBOUND/BINDING/BOUND_TRACKING/NEEDS_RELOCALIZATION/RELOCALIZING/TRACKING_LIMITED/CAMERA_DENIED/UNSUPPORTED/ENGINE_ERROR/DESKTOP_3D, логирование переходов.
- MockAdapter + `?mockAR=1&debug=1` для E2E (в dev `?mockAR=1`); UI badge `MOCK AR`; реальный трекинг никогда не подменяется mock в production-маршруте.
- Переключение AR→3D делает save + reload (избегает второго camera stream/дублирующихся XR модулей); 3D→AR переиспользует один engine.

### M5 — качество и публикация

- Diagnostics: mode/SDK/camera/SLAM/marker/anchor/marker-to-factory/pose error/FPS/frame p95/draw calls/triangles/meshes/buildings/items/production/save/storage/version/commit/device; ring buffer 100; экспорт JSON без кадров камеры и личных данных.
- Playwright desktop + mobile: цепочка, credits, pause, save/reload, export/import, corrupt recovery, mock binding/relocalization/temporary/tracking limited, unsupported fallback, diagnostics, 390×844/844×390 layout.
- README, AR_TEST_PLAN, ACCEPTANCE, TROUBLESHOOTING, THIRD_PARTY_NOTICES, MIT LICENSE.
- GitHub Actions workflow готов; публикация не выполнена (нет доступа к репозиторию).

## Ключевые решения

1. **F = центр площадки** (не юго-западный угол). Задокументировано в README и `grid.cellCenterLocal`.
2. **Масштаб отдельно от rigid pose**: `factoryRoot` хранит только position+quaternion; `contentRoot.scale = cellSizeMeters`. Поэтому `T_M_F` всегда rigid, без двойного масштабирования.
3. **Логистика по правилам из SPEC**: extractor выдаёт по направлению; conveyor принимает только сзади и передаёт вперёд; processor принимает с любой стороны; конфликты разрешаются по ID; буферы 1.
4. **Один engine на сессию**: desktop viewer и AR adapter не создают собственных симуляций; AR→3D использует явный reload, разрешённый спецификацией.
5. **Честный anchor**: `unbound` никогда не сохраняет `T_W_F`; `marker` сохраняет только `T_M_F` и требует повторного image target; temporary не меняет anchor.
6. **Маркер**: официальный CLI, исходный рисунок процедурный, `imagePath` нормализован под subpath; print page контролирует 120×160 мм.
7. **Mock строго отделён**: query flag, badge, собственный класс; E2E не выдаётся за device validation.
8. **Сохранение**: `localStorage` + runtime validation + recovery screen; autosave + pagehide; `sessionStarted` не даёт создать сохранение просто от просмотра стартового экрана.
9. **XR runtime**: динамический локальный loader вместо статического CDN script; один экземпляр скрипта, timeout, удаление модулей при stop/failure.
10. **Повторная выдача marker pose**: если движок не шлёт `imageupdated` каждый кадр, adapter повторно отдаёт последнюю реальную pose с bounded rate (140 мс) до `imagelost`, чтобы фильтр мог набрать окно. Это не выдуманная pose; требует проверки на устройстве.

## Проверки (локально, реально запущены)

| Проверка | Статус |
|---|---|
| `npm ci` | PASS — clean install, 2 high dev-only audit warnings (sharp, no fix) |
| `npm run typecheck` | PASS |
| `npm run test` | PASS — 83 tests / 8 files |
| `npm run build` | PASS |
| `node scripts/verify-dist.mjs` | PASS (base `/room-factory-ar/`) |
| Playwright desktop-chromium | PASS — 10 тестов |
| Playwright mobile-chromium | PASS — 9 тестов, 1 skipped (desktop-only unsupported fallback) |
| Playwright всего | 19 passed, 1 skipped |
| HTTP production assets под subpath | PASS (xr.js, xr-slam.js, marker JSON/luminance/print/icon = 200) |
| iOS Safari device | NOT TESTED |
| Android Chrome device | NOT TESTED |
| Marker physical recognition / relocalization | NOT TESTED |
| GitHub Pages deployment | NOT PERFORMED |

Точные результаты последнего полного прогона обновляются в конце работы; если после правок выполнялся только частичный прогон, это отражено в `docs/ACCEPTANCE.md`.

## Известные проблемы и неопределённости

- **Physical AR pending**: нет телефона/камеры. Нельзя утверждать, что SLAM, image target, абсолютный масштаб и relocalization работают на конкретных iPhone/Android.
- **`imageupdated` frequency**: движок может не присылать событие каждый кадр при неподвижном маркере; добавлен bounded repeat последней pose, требует проверки на устройстве.
- **`XR8.stop()` + повторный `XR8.run()`**: API документирован, но повторный запуск после stop на реальном устройстве не проверен; для переключения AR→3D используется reload, для retry — новая попытка adapter.
- **`hitTest`**: текущая документация описывает синхронный массив и координаты 0..1; реализован fallback на старый callback/NDC. Форма ответа зависит от версии engine binary; TODO verify on device.
- **Масштаб маркера**: `scale:'absolute'` и физический размер 12×16 см требуют проверки линейкой; JSON не кодирует метры. Реализация не добавляет эвристических множителей.
- **Relocalization drift**: измеряется только на устройстве; 5 см — цель, не гарантия.
- **`sharp` audit warnings** в dev-зависимости; runtime не зависит.
- **Sound**: отсутствует, preference `muted` сохраняется; это допустимо по SPEC.
- **Recalibration after first build**: масштаб заблокирован; ручная перекалибровка после застройки не реализована (P1/P2).
- **Rollback схемы**: V2 отсутствует; неизвестные версии отклоняются, а не мигрируются.

## Файлы, которые нельзя потерять

- `public/marker/room-factory-marker.json` + `room-factory-marker_luminance.png` — именно их грузит engine.
- `dist/external/xr/*` — полный runtime, не только `xr.js`.
- `.github/workflows/deploy.yml` — base path и деплой.
- `scripts/verify-dist.mjs` — защита от абсолютных путей под Pages.
