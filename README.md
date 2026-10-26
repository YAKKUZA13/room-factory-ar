# ROOM FACTORY AR

Миниатюрный завод, который игрок строит на столе в своей комнате. MVP: генератор, добытчик, конвейер и переработчик; игрок ставит модули на сетку 10×10, соединяет их, видит движущуюся руду, продаёт детали и расширяет производство. Завод хранится локально и виден в WebAR через 8th Wall SLAM + image target, а также в полноценном desktop/mobile 3D-режиме без камеры.

**Статус:** `CODE-COMPLETE` — логика, рендер, сохранения, unit-тесты, production build и Playwright-сценарии проходят. `AR-DEVICE-VERIFIED` **не достигнут**: физический смартфон и печатный маркер в этой среде не тестировались. Подробности — [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) и [docs/AR_TEST_PLAN.md](docs/AR_TEST_PLAN.md).

---

## Что уже работает

- Полная экономическая петля: `generator → extractor → conveyor → processor`; энергосеть, brownout, фиксированный шаг 0,1 с, детерминированная логистика.
- 10×10 сетка, 4 типа зданий, поворот на 90°, preview, запрет пересечений, удаление с подтверждением, возврат 50% стоимости / стартового слота.
- Стартовый комплект: 1 генератор, 1 добытчик, 1 переработчик, 6 конвейеров; 120 кредитов.
- Процедурные модели в стилистике жёлтой PCB, анимации механизмов, движущаяся руда, индикаторы, sale-flash.
- Desktop 3D (OrbitControls, picking, hover, выделение, мобильные touch-жесты) и мобильный 3D.
- Версионированное `localStorage`-сохранение, autosave, ручное сохранение, экспорт/импорт JSON, восстановление после повреждённой записи, обработка quota/unavailable.
- WebAR-адаптер: локальный runtime `@8thwall/engine-binary`, SLAM, image target, marker-relative anchor `T_M_F = inverse(T_W_M) * T_W_F`, relocalization только после повторного распознавания карточки, temporary placement без перезаписи anchor.
- `MockAdapter` и `?mockAR=1&debug=1` для E2E (в dev достаточно `?mockAR=1`): явно помечается `MOCK AR`, не выдаётся за настоящий SLAM.
- Диагностика (`?debug=1`), экспорт диагностического JSON без кадров камеры и личных данных.
- GitHub Pages workflow с subpath и проверкой `dist`.

## Требования

- Node.js **>= 22** (проверено на Node 24.13.0).
- npm (lockfile включён).
- Для реального AR: HTTPS (GitHub Pages или ngrok) и мобильный браузер с камерой.
- Для 3D-режима камера не нужна.

## Установка и локальный запуск

```bash
npm ci
npm run dev
# http://localhost:5173/
```

Production-сборка и предпросмотр под subpath:

```bash
npm run build
npm run preview
# http://localhost:4173/room-factory-ar/
```

`npm run build` выполняет `typecheck → unit tests → vite build → copy-xr-assets → verify-dist`. XR runtime копируется целиком из `node_modules/@8thwall/engine-binary/dist` в `dist/external/xr/`, маркер и его companion-файлы — в `dist/marker/`.

### npm scripts

| Скрипт | Что делает |
|---|---|
| `npm run dev` | Vite dev server, локальный XR runtime отдаётся middleware-плагином |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run test` | Vitest: core, логистика, сохранения, матрицы, фильтр маркера, anchor |
| `npm run test:watch` | Vitest watch |
| `npm run test:e2e` | Playwright (нужен собранный `dist` и запущенный preview; см. ниже) |
| `npm run build` | полный production build с проверками |
| `npm run preview` | статический preview `dist` |
| `npm run marker:generate` | перегенерировать оригинальный маркер и JSON официальным image-target-cli |
| `npm run verify:dist` | проверить `dist` на отсутствующие XR/marker assets и абсолютные `/src` пути |

Playwright использует `http://127.0.0.1:4173/room-factory-ar/`; перед первым запуском:

```bash
npm run build
npm run preview       # отдельный терминал
npx playwright install chromium
npm run test:e2e
```

## Публикация на GitHub Pages

1. Создайте репозиторий (например, `room-factory-ar`) и запушьте содержимое проекта в ветку `main`.
2. В GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` сам определит base path:
   - project site → `/<repo-name>/`;
   - репозиторий `*.github.io` → `/`;
   - при необходимости задайте `VITE_BASE_PATH` вручную.
4. После успешного workflow сайт будет доступен по `https://<owner>.github.io/<repo>/`.

Публичный URL в этом проекте **не создавался**: у агента нет доступа к GitHub-репозиторию. Workflow и инструкции готовы; не считайте deployment выполненным, пока он реально не прошёл.

Проверка production-сборки под subpath:

```bash
VITE_BASE_PATH=/room-factory-ar/ npm run build
npm run preview
# открыть http://localhost:4173/room-factory-ar/
```

`verify-dist.mjs` проверяет `index.html`, JS/CSS bundles, XR runtime + SLAM chunk, marker JSON, luminance/original/thumbnail, print page и отсутствие абсолютных `/src/` ссылок. Все пути к XR и маркеру строятся от `import.meta.env.BASE_URL`; runtime загружается динамически из `src/ar/xr-loader.ts`, без жёсткого `<script src="/external/...">`.

## HTTPS на телефоне

GitHub Pages даёт нормальный HTTPS. Для локальной разработки:

- `http://localhost:5173` — secure context, но с телефона по LAN `http://192.168.x.x` камера обычно недоступна.
- Рекомендуется туннель: `ngrok http 5173`, открыть выданный HTTPS URL на телефоне.
- `@vitejs/plugin-basic-ssl` может дать self-signed сертификат; некоторые телефоны потребуют вручную доверить его. Это не гарантирует «просто работает».
- Эмулятор веб-камеры и desktop-браузер **не являются** доказательством поддержки реального AR на iOS/Android.

## Маркер и AR-сценарий

Файлы:

- `public/marker/room-factory-marker.png` — оригинальный рисунок;
- `public/marker/room-factory-marker-print.html` — печать при 100% масштабе;
- `public/marker/room-factory-marker.json` — метаданные, сгенерированные официальным CLI;
- `public/marker/room-factory-marker_luminance.png` и companion-файлы — то, что реально загружает движок.

Печать:

1. Откройте `marker/room-factory-marker-print.html` (из `dist` или dev-сервера).
2. Печать **100%**, без «fit to page». Проверьте линейкой: 120 × 160 мм.
3. Матовая бумага, ровный свет, без бликов; карточку не ламинировать.
4. После привязки не перемещайте карточку.

Сценарий на телефоне:

1. Открыть HTTPS URL → «Начать в AR» → разрешить камеру.
2. Медленно осмотреть стол; ghost-подиум можно поднять/опустить, повернуть и отмасштабировать (0.5×–1.0×) до первой постройки.
3. «Разместить завод» → построить цепочку из стартового комплекта.
4. «Привязать карточкой» → навести на напечатанный маркер, держать 1–2 секунды.
5. Закрыть вкладку, открыть снова → «Продолжить в AR» → показать **ту же** карточку. Завод появится в прежнем положении относительно карточки.
6. Если карточки нет: доступны 3D-режим и «Временно разместить здесь» (старый marker anchor не стирается).

Маркер генерируется скриптом, который вызывает установленный `@8thwall/image-target-cli`:

```bash
npm run marker:generate
```

Скрипт также переписывает `imagePath` в JSON на имя файла относительно metadata URL (CLI по умолчанию пишет URL `image-targets/...`, который ломается под GitHub Pages subpath). Runtime дополнительно резолвит относительный `imagePath` от URL JSON.

## Правила модулей

| Модуль | Цена | Энергия | Вход | Выход |
|---|---:|---:|---|---|
| Генератор | 60 | +10 | — | общая сеть, провода не нужны |
| Добытчик | 50 | −4 | — | 1 `ore` за 2,5 с по направлению стрелки |
| Конвейер | 8 | 0 | только сзади | строго вперёд, 1 `ore` за 0,75 с |
| Переработчик | 80 | −5 | с любой стороны | 1 `part` за 2,5 с, автоматическая продажа за 12 credits |

Направление: `0 = +Z`, `1 = +X`, `2 = −Z`, `3 = −X`; поворот кратен 90°. Стрелка/рамки на модели показывают вход и выход. Экстрактор можно подключить к переработчику напрямую, но tutorial просит поставить хотя бы одну ленту. При brownout все потребители останавливаются, конвейеры замирают; прогресс сохраняется.

## Управление

### Desktop 3D

- ЛКМ — вращение камеры; колесо — масштаб; ПКМ — панорама.
- Клик по клетке — поставить/выбрать; клик по зданию — инспектор.
- «Поворот» — 90° для выбранного здания или будущей постройки; «Удалить» — режим удаления.
- Пауза останавливает производство, но не рендер/UI.

### Мобильный 3D

- Один палец — орбита; два пальца — pan/zoom; tap — действие.
- Кнопки toolbar не меньше 44–50 CSS px, safe-area учтена.

### AR

- Камера управляется физическим движением телефона.
- Tap по клетке — выбор/строительство; кнопки «Поворот», «Удалить», инспектор.
- В режиме размещения — drag подиума, кнопки высоты, поворот ±15°, масштаб.

## Архитектура

```text
DOM UI / pointer input
        │
   AppController ───────────────┐
        │ commands/selectors    │
   FactoryEngine (core)          │ SessionMachine
        │ state                 │ AnchorManager ── MarkerPoseFilter
   FactoryRenderer (Three.js)    │       │
        │                       │   TrackingPort
   Desktop3DViewer          EightWallAdapter / MockAdapter
                                 │
                         XR8.Threejs scene
```

- `src/core/*` — чистый TypeScript, без Three.js/DOM/XR. Детерминированная симуляция, команды, сериализация.
- `src/render/*` — процедурные модели, платформа, picking, визуальные эффекты. Модели строятся в единицах клетки, `contentRoot.scale = cellSizeMeters`; anchor pose остаётся rigid.
- `src/viewer/*` — собственный Scene/WebGLRenderer/RAF только для 3D-режима. AR-кадром владеет 8th Wall pipeline.
- `src/ar/*` — TrackingPort, 8th Wall adapter, mock adapter, фильтр стабильности, AnchorManager, матричная математика, free placement.
- `src/persistence/*` — версионированное сохранение, миграции, импорт/экспорт, защита от повреждений.
- `src/ui/*` — DOM-экраны, HUD, toolbar, inspector, диалоги, уведомления, диагностика. Строки в `ui/strings.ts`.

### Математика привязки

- `T_M_F = inverse(T_W_M) * T_W_F` при привязке.
- `T_W_F = T_W_M * T_M_F` при восстановлении.
- Используются `THREE.Matrix4.invert()/multiplyMatrices()`; quaternion 8th Wall `{w,x,y,z}` переставляется в Three.js `(x,y,z,w)`.
- В сохранении нет мировой позы прошлой сессии. Для `unbound` завода после перезапуска требуется новое свободное размещение; для `marker` — повторное распознавание карточки.
- Физический `cellSizeMeters` хранится отдельно; `T_M_F` — rigid (без масштаба).
- Smoothing: `requestedWorldTransform` и `displayWorldTransform` разделены, slerp/lerp ~0.45 с; большая коррекция (>15 см или >15°) требует подтверждения и не перезаписывает `T_M_F`.

## Сохранение

- Ключ: `room-factory-ar/save/v1`.
- Формат: `schemaVersion: 1`, `factory`, `anchor` (только `unbound` или marker-relative), `tutorial`, `preferences`.
- Autosave каждые 10 с при изменениях, debounce 500 мс после команд, синхронная запись на `visibilitychange/pagehide`.
- При повреждении: экран восстановления, экспорт сырых данных, «Начать заново». Неизвестная версия схемы не «угадывается».
- Экспорт/импорт JSON с проверкой размера, типов, границ и обязательным подтверждением перезаписи.
- `localStorage` может быть очищен браузером или недоступен в private mode — экспорт остаётся резервным путём.

## Тесты

```bash
npm run typecheck
npm run test
npm run build
npx playwright test
```

Покрыто unit-тестами:

- размещение/занятость/границы/стартовый комплект/возвраты;
- ротация, энергосеть, brownout и сохранение прогресса;
- цепочки, неправильная ориентация, direct extractor→processor, конфликты, сохранение количества предметов;
- pause, детерминизм 30/60 FPS, save/load roundtrip;
- матрицы с поворотом/переносом маркера, quaternion order, random 100 поз, non-unit scale;
- MarkerPoseFilter: spike/NaN/чужое имя/устаревшие данные/мало обновлений;
- anchor: bind/restore, SLAM LIMITED, временное размещение, большая коррекция;
- persisted save: corrupt, schema version, quota, import/export, marker anchor.

Playwright (desktop + mobile Chromium) проверяет:

- старт → 3D → цепочка → рост credits;
- неверная ориентация конвейера и исправление;
- pause/resume, save/reload, export/reset/import, corrupt recovery;
- mock AR: free placement → stable marker → binding → reload с другим SLAM origin → relocalization;
- marker not found → завод не размещён наугад; temporary placement сохраняет anchor; tracking limited блокирует монтаж;
- layout 390×844 и 844×390, размеры touch-targets, diagnostics.

**Реальный AR на телефоне не проверялся.** `docs/AR_TEST_PLAN.md` содержит матрицу устройств, физические сценарии и протокол измерения relocalization.

## Ограничения MVP

- 1 завод на устройство, без backend/аккаунтов/синхронизации.
- Нет markerless persistent anchors, VPS, карты комнаты, depth/ML occlusion, физического движка.
- Нет звука (preference `muted` уже сохраняется) и достижений.
- Масштаб 0.5×–1.0× меняется в AR-сканировании или в настройках до первой постройки; после первой постройки заблокирован.
- Relocalization точность зависит от SLAM, освещения, печати и расстояния; 5 см — исследовательская цель, не гарантия.
- 8th Wall Engine Binary — закрытый компонент; если движок перестанет поддерживаться новыми iOS/Safari, AR-режим может деградировать. 3D-режим от него не зависит.
- Печать маркера и физические проверки должен выполнить владелец на реальном телефоне.

## Лицензии и атрибуция

- Код проекта — MIT, см. [LICENSE](LICENSE).
- XR Engine Binary © 2026 Niantic Spatial, Inc., распространяется по отдельной лицензии; **не MIT**. См. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) и [текст лицензии](https://github.com/8thwall/engine/blob/main/LICENSE). Niantic Spatial не поддерживает и не одобряет этот проект.
- Three.js — MIT. `@8thwall/image-target-cli` — MIT. `sharp` — Apache-2.0. Остальные dev-зависимости — по лицензиям пакетов.
- Все модели и рисунок маркера созданы процедурно в этом проекте; ассеты из `bulgakov_game` не копировались.

## Документация

- [docs/IMPLEMENTATION_LOG.md](docs/IMPLEMENTATION_LOG.md) — что сделано, версии, решения, известные проблемы.
- [docs/AR_TEST_PLAN.md](docs/AR_TEST_PLAN.md) — физические тесты, матрица устройств, точность.
- [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) — P0/P1/P2 со статусами и ссылками.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — камера, маркер, GitHub Pages, storage, FPS.
- [SPEC.md](SPEC.md) — исходный технический контракт.
