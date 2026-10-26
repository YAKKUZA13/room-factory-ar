# SPEC.md — ROOM FACTORY AR

**Статус:** спецификация для реализации MVP кодинг-агентом  
**Версия:** 1.0 · 2026-10-26  
**Язык реализации:** TypeScript (strict)  
**Целевая платформа:** мобильный WebAR; обязательный desktop-режим 3D  
**Развёртывание:** статический сайт GitHub Pages  
**Продукт:** миниатюрный AR-завод, который игрок строит на поверхности в своей комнате.

> **Команда агенту.** Реализуй рабочий продукт, а не только сцену-презентацию. Следуй порядку этапов и критериям приёмки. При блокере AR SDK не подменяй реальный трекинг искусственной анимацией: оставь полноценный 3D-режим, изолируй проблему в адаптере, задокументируй и сохрани воспроизводимый диагностический сценарий. Не заявляй о прохождении тестов на физическом телефоне без реального тестирования. Зафиксируй точные версии зависимостей в lockfile. Не добавляй backend, регистрацию, платную инфраструктуру или нативное приложение.

---

## 0. Быстрое резюме решения и приоритеты

Создать **отдельный репозиторий** `room-factory-ar` с играбельным factory-building MVP: генератор энергии, добытчик сырья, конвейер и переработчик; игрок ставит здания на сетку, соединяет их, наблюдает движущиеся предметы, зарабатывает кредиты и расширяет производство. Игровая модель сохраняется локально. Завод визуализируется поверх видео с камеры через 8th Wall SLAM и Three.js. Можно свободно разместить завод; по желанию привязать его к **неподвижному печатному image target** (маркеру). На повторном запуске привязанный завод восстанавливается **после повторного распознавания того же маркера**.

**Порядок приоритетов:**

1. Честная пространственная привязка и точное сохранение/восстановление (без ложных обещаний «вечного якоря»).
2. Полностью играбельная экономическая петля в 3D-режиме и AR.
3. Корректная обработка потери трекинга, разрешений и неподдерживаемых браузеров.
4. GitHub Pages и независимые внешние тесты.
5. Стилизованный визуал и производительность.

**Принятое решение:** Three.js + TypeScript + Vite + `@8thwall/engine-binary` + Image Targets; минимальный DOM UI; Vitest и Playwright; `localStorage` с версионированием. Ни A-Frame, ни Babylon.js, ни PixiJS, ни Voxkera для MVP **не требуются**. UI без обязательного React/Vue.

**Нельзя считать решённой заранее** точность relocalization, корректность совместной работы image targets/SLAM в конкретной версии SDK, обнаружение стола и производительность на iOS/Android. Вначале делается AR-spike с проверкой на телефоне. В дополнение запускается полнофункциональный desktop 3D-режим, не зависящий от него.

---

## 1. Продукт, аудитория, ключевые сценарии

### 1.1. Продуктовая цель

«Фабрика прямо на моём столе»: пользователь за 1–2 минуты получает первый работающий конвейер, а затем может вернуться и продолжить строить там же. Это не симулятор реального производственного предприятия и не фотореализм. Основная эмоция — живой карманный завод и чувство собственного инженерного конструктора.

### 1.2. Пользовательские сценарии

**US-01. Первый запуск без маркера**
1. Открываю публичную HTTPS-ссылку на телефоне.
2. Вижу стартовый экран, кнопку «Играть в AR» и ссылку «3D-режим».
3. После нажатия выдаю разрешение на камеру, получаю инструкцию медленно поводить устройством.
4. Вижу полупрозрачную платформу-превью (ghost) на выбранной поверхности/плоскости.
5. Нажимаю «Разместить завод», затем могу строить и ходить вокруг завода.
6. Получаю предложение «Закрепить место карточкой», но могу продолжить без неё.

**US-02. Первый запуск с последующей привязкой**
1. Размещаю завод в свободном SLAM-режиме.
2. Печатаю/показываю на отдельном физическом носителе уникальную карточку из проекта, оставляю её неподвижной рядом с заводом.
3. Нажимаю «Привязать», навожу камеру на карточку.
4. Система принимает несколько устойчивых измерений, вычисляет положение завода относительно изображения и сохраняет привязку.
5. Получаю индикатор «Привязка сохранена» и инструкции по следующему запуску.

**US-03. Возврат в комнату**
1. Открываю ссылку на **том же устройстве и в том же браузерном профиле**.
2. Сохранённая схема построек не теряется.
3. Если была привязка: игра просит показать ту же карточку. До успешного распознавания завод **не размещается в AR наугад**.
4. После распознавания стабильной карточки завод появляется в прежнем положении (в пределах измеренной точности).
5. Если карточка недоступна, открываю 3D-режим или выбираю **явное** «Временно разместить здесь», не уничтожая старую привязку.

**US-04. Производство**
1. Размещаю генератор, добытчик, конвейеры и переработчик.
2. Электроэнергии достаточно, выход добытчика направлен в цепочку, вход переработчика получает сырьё.
3. Сырьё идёт по ленте, переработчик выпускает продукт и начисляет кредиты.
4. Добавляю оборудование, поворачиваю/удаляю его, исправляю разорванные цепи.

**US-05. Неподдерживаемое устройство / запрет камеры**
1. Вижу объяснение, а не чёрный экран или пустую сцену.
2. Перехожу в 3D-режим с тем же сохранённым заводом.
3. Могу играть без AR; «повторить запуск AR» доступно при устранении причины.

**US-06. Сбои**
1. При ухудшении SLAM появляются «Трекинг потерян» и ненавязчивые инструкции.
2. На время потери устойчивой позы запрещается редактирование в мировых координатах; симуляция продолжает работать.
3. Возврат к уверенной позе возобновляет взаимодействие; при наличии карточки возможно повторное выравнивание.

### 1.3. Вне MVP

Без multiplayer; синхронизации между устройствами; картографирования помещения или визуального VPS; «гарантированно бесшовных persistent anchors» без маркера; автоматического определения всех столов/полок; физического взаимодействия виртуальных предметов с реальной мебелью; Depth Anything/ML-окклюзии; физического движка `cannon-es`; рекламы/платежей; бесконечного техдерева; внешней аналитики. Никаких серверных аккаунтов.

### 1.4. Конкретный объём MVP

- 1 завод/сохранение на устройство, игровая сетка **10×10** (100 ячеек).
- Масштаб: 1 клетка = **0,10 м** в AR, вся площадка ≈ 1×1 м. Пользователь может настроить **масштаб 0,5–1,0** до первого строительства/при ручной перекалибровке; в сохранении хранить физический `cellSizeMeters` и учитывать его при расчёте матриц.
- 4 строящихся типа модулей, 1 ресурс (`ore`), 1 продаваемый продукт (`part`), 1 валюта (`credits`), простая электрическая сеть.
- Поворот зданий кратно 90°, preview, запрещение пересечений, удаление с подтверждением, стоимость строительства.
- Подсказка по первой цепочке, HUD денег/энергии/скорости производства, кнопка паузы и меню.
- Звуки по умолчанию выключены, включаются по нажатию пользователя; допускается сначала без звука.
- Сохранение с версии схемы, экспорт/импорт JSON через UI (обязательно, поскольку localStorage может очищаться).
- AR и независимый 3D-плеер (на компьютере и на телефоне).

---

## 2. Проверенные технологии и источники, которые агент обязан изучить

### 2.1. Референс «Булгаков»

Публичный исходник: <https://github.com/YAKKUZA13/bulgakov_game>.

Перед написанием интеграции открыть актуальные файлы:

- `src/8thwall/bootstrap.ts` — XR8 загрузка, порядок pipeline-модулей, глобальный `window.THREE`.
- `src/8thwall/game-pipeline.ts` — `onStart`, `XR8.Threejs.xrScene()`, `onUpdate`, обработка canvas событий и диагностические метрики.
- `src/8thwall/xr8-scene.ts` — получение сцены/рендерера.
- `src/8thwall/hit-test.ts` — адаптер `XR8.XrController.hitTest`, `recenter`.
- `src/8thwall/globals.d.ts` — существующие определения глобальных SDK-объектов.
- `src/8thwall/depth-occlusion.ts` — **только изучить**, не переносить в MVP.
- `index.html`, `package.json`, `vite.config.ts`, `.github/workflows/*` — пример сборки и загрузки движка.

**Не переносить:** режимы Runner/Angry/Treasure, физику, depth inference, joystick, избыточную глобальную mutable state. В референсе `game-pipeline.ts` есть бизнес-логика и UI внутри AR pipeline — в новой архитектуре строго разделить по слоям.

**Проверенные технические детали (26.10.2026):** в `bootstrap.ts` есть `XR8.GlTextureRenderer.pipelineModule()`, `XR8.Threejs.pipelineModule()`, `XR8.XrController.pipelineModule()`, затем пользовательские модули и `XR8.run({canvas})`; в `game-pipeline.ts` сцена получается через `XR8.Threejs.xrScene()`, а кадр обновляется через `onUpdate`. В `hit-test.ts` используются координаты NDC и callback из hitTest. Перед использованием проверить форму ответа в текущей версии пакета, а не слепо копировать референс.

### 2.2. Официальная документация

- Самостоятельный бинарник со SLAM: <https://github.com/8thwall/engine> и <https://8thwall.org/docs/engine/overview>.
- Открытая часть без SLAM: <https://github.com/8thwall/8thwall>.
- `XR8.XrController.configure`: <https://8thwall.org/docs/api/engine/xrcontroller/configure>.
- `XR8.XrController.pipelineModule`, `trackingStatus`, `reality.imagefound`, `reality.imageupdated`, `reality.imagelost`: <https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule>.
- `XR8.Threejs.xrScene`: <https://8thwall.org/docs/api/engine/threejs/xrscene>.
- Camera pipeline: <https://8thwall.org/docs/api/engine/xr8/addcamerapipelinemodule>.
- Image Target CLI: <https://github.com/8thwall/8thwall/tree/main/apps/image-target-cli>.
- Текст лицензии engine binary: <https://github.com/8thwall/engine/blob/main/LICENSE>.
- GitHub Pages Actions: <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>.

**Не перепутать пакеты:** `@8thwall/engine` — open-source framework **без SLAM**; `@8thwall/engine-binary` — закрытый runtime **со SLAM** по отдельной лицензии. В новом MVP нужен второй.

**Важная деталь API:** корректное имя опции — `imageTargetData`, а не `imageTargets`; `scale: 'absolute'` возвращает координаты в метрах, после оценки масштаба движком. В некоторых описаниях документации есть несовпадения типа `PLANAR`/`FLAT` для маркера: используйте **JSON, сгенерированный официальным CLI**, и не конструируйте это поле вручную.

---

## 3. Архитектура и зависимости

### 3.1. Архитектурный принцип

Игровой мир описывается **детерминированной моделью данных**, не привязанной к Three.js и XR8. Визуализатор читает состояние мира. XR-адаптер задаёт только `T_world_factory` (трансформацию корневого контейнера) и tracking status. UI обращается к командам приложения. AR не должен знать об экономике, а `FactoryCore` не должен импортировать `three`.

```text
                             DOM UI / Input
                                  |
                            Application
                       commands / selectors
                            /           \
                   FactoryCore        SessionController
                 simulation/state     /       |        \
                                  AnchorManager  Storage  Diagnostics
                                      |
                                  TrackingPort
                                 /            \
                         EightWallAdapter    MockAdapter
                                  |
                        FactoryRenderer (Three.js)
                                  |
                          factoryRoot Object3D
```

В AR режиме `FactoryRenderer` добавляется в сцену из `XR8.Threejs.xrScene()`. В desktop 3D-режиме создаются свои `Scene`, `PerspectiveCamera`, `WebGLRenderer`, `OrbitControls`; ядро игры и интерактивная сетка остаются теми же.

### 3.2. Стек

**Runtime**: TypeScript strict, Three.js, Vite, `@8thwall/engine-binary` 1.x (уточнить версию, зафиксировать lockfile), возможно `@8thwall/xrextras`/`@8thwall/landing-page` только если реально нужны и совместимы.  
**Tests**: Vitest для logic/matrices/storage + Playwright desktop для UI и 3D.  
**Styles**: CSS custom properties + обычный CSS; DOM-оверлеи.  
**Хранение**: `localStorage` с ревизиями и валидацией; резервный JSON экспорт/импорт.  
**Assets**: процедурные меши/простые локальные текстуры; нет сторонних CDN в продакшн-критичных путях.  
**Deployment**: GitHub Actions → Pages.

Не вводить state manager, DI-контейнер, ORM, ECS, wasm и shader framework без прямой необходимости. FactoryCore — набор чистых TypeScript функций и управляющий класс/команды.

### 3.3. Структура репозитория (минимально ожидаемая)

```text
room-factory-ar/
├─ SPEC.md
├─ README.md
├─ LICENSE / THIRD_PARTY_NOTICES.md
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ .github/workflows/deploy.yml
├─ public/
│  ├─ icon.svg
│  └─ marker/
│     ├─ room-factory-marker.png
│     ├─ room-factory-marker-print.html
│     ├─ room-factory-marker.json      # generated CLI metadata
│     └─ ...                           # all companion files required by JSON
├─ scripts/
│  ├─ copy-xr-assets.mjs
│  └─ verify-dist.mjs
├─ src/
│  ├─ main.ts
│  ├─ config.ts
│  ├─ styles/
│  │  ├─ global.css
│  │  ├─ hud.css
│  │  └─ dialogs.css
│  ├─ core/
│  │  ├─ types.ts
│  │  ├─ constants.ts
│  │  ├─ grid.ts
│  │  ├─ commands.ts
│  │  ├─ economy.ts
│  │  ├─ logistics.ts
│  │  ├─ simulation.ts
│  │  ├─ serialization.ts
│  │  └─ initial-world.ts
│  ├─ ar/
│  │  ├─ tracking-port.ts
│  │  ├─ eightwall-adapter.ts
│  │  ├─ xr-loader.ts
│  │  ├─ anchor-manager.ts
│  │  ├─ marker-pose-filter.ts
│  │  ├─ placement-controller.ts
│  │  ├─ transforms.ts
│  │  └─ xr8-types.d.ts
│  ├─ render/
│  │  ├─ factory-renderer.ts
│  │  ├─ building-factory.ts
│  │  ├─ conveyor-renderer.ts
│  │  ├─ factory-grid.ts
│  │  ├─ visual-effects.ts
│  │  └─ picking.ts
│  ├─ viewer/
│  │  └─ desktop-3d-viewer.ts
│  ├─ app/
│  │  ├─ app-controller.ts
│  │  ├─ session-machine.ts
│  │  ├─ input-controller.ts
│  │  └─ lifecycle.ts
│  ├─ persistence/
│  │  ├─ save-repository.ts
│  │  ├─ migrations.ts
│  │  └─ import-export.ts
│  ├─ ui/
│  │  ├─ screens.ts
│  │  ├─ toolbar.ts
│  │  ├─ inspector.ts
│  │  ├─ notifications.ts
│  │  └─ diagnostics.ts
│  └─ utils/
│     └─ disposable.ts
├─ tests/
│  ├─ core/*.test.ts
│  ├─ ar/*.test.ts
│  ├─ persistence/*.test.ts
│  └─ e2e/*.spec.ts
└─ docs/
   ├─ AR_TEST_PLAN.md
   ├─ ACCEPTANCE.md
   ├─ IMPLEMENTATION_LOG.md
   └─ TROUBLESHOOTING.md
```

Файлы можно структурировать компактнее при сохранении границ ответственности. Не создавать десятки пустых заглушек ради соответствия дереву: каждый файл должен иметь реальную роль.

---

## 4. Пространства координат и строгая модель привязки

### 4.1. Термины и соглашения

- `W` — текущая система координат SLAM **конкретной AR-сессии**; между сессиями она не сохраняется.
- `M` — система координат **физического image target**, закреплённого в комнате.
- `F` — локальные координаты завода. `(0,0,0)` — центр юго-западного угла сетки **или** центр платформы; выбрать **один** вариант, задокументировать и никогда не смешивать (рекомендуется центр площадки).
- `T_A_B` — 4×4 матрица преобразования координат **из B в A**.
- `T_W_F` — мировая поза корня завода в текущей SLAM-сессии.
- `T_W_M` — обнаруженная XR SDK мировая поза маркера.
- `T_M_F` — сохраняемая поза завода **относительно маркера**.
- Система Three.js правосторонняя, `+Y` вверх, метры (для `scale:'absolute'` после оценки масштаба).
- Вся фабрика: один `THREE.Group factoryRoot`. **Преобразования размещения применяются только к root**, а не к каждой постройке отдельно.

**Формулы:**

```text
Binding:        T_M_F = inverse(T_W_M) * T_W_F
Restoration:    T_W_F = T_W_M * T_M_F
Marker update:  T_W_F_target = T_W_M_observed * T_M_F
```

Для этих операций используйте `THREE.Matrix4`, `Matrix4.invert()`, `multiplyMatrices()`, `decompose(position,quaternion,scale)`. Никаких покомпонентных «вычесть координаты и углы».

Проверить порядок матричного умножения тестом, где маркер **повёрнут на 90° и перенесён** относительно начала координат. Тест на два нулевых трансформа — недостаточен.

### 4.2. Принцип свободного размещения

Игрок **не обязан иметь маркер**, чтобы начать. После нормализации SLAM:

1. Если доступен подходящий `XR8.XrController.hitTest`, использовать его как начальную подсказку; **не считать hitTest гарантированным обнаружением стола**. Перед применением на целевой поверхности протестировать ответ.
2. Если реальная поверхность не обнаружена, показывать **искусственную регулируемую горизонтальную плоскость** в метрах: горизонтальность от текущей ориентации мира, позиция/высота выбирается пользователем, расстояние по умолчанию ~0,8 м перед камерой (горизонтальная проекция направления). Отдельные кнопки `выше/ниже` и/или контрол размещения; явно подписать «Высоту можно отрегулировать».
3. Показывать ghost-платформу и масштаб, вращение по Y (два положения или шаг 15° для корня), кнопку подтверждения.
4. После подтверждения выставить `T_W_F`, состояние `FREE_UNBOUND`.
5. Если игрок нажимает «Закрепить карточкой», получать маркер и сохранять `T_M_F`; плоскость/позиция завода **не должны прыгать** в момент привязки.

**Важно:** при свободном режиме после перезапуска приложение хранит **геометрию и экономику**, но не имеет надёжного физического якоря. Не применять сохранённую прежнюю `T_W_F` как координаты новой сессии. Предлагать новый `T_W_F` через ручное размещение, либо перейти в 3D-viewer.

### 4.3. Использование image target

Сделать 1 уникальный **плоский** физический маркер и включить его распознавание вместе с SLAM.

Маркер:

- Рекомендуемый физический размер — около **12 × 16 см** в портретной ориентации; использовать известную физическую ширину/высоту, контролировать параметры CLI и абсолютный масштаб, а не предполагать, что JSON автоматически знает точный размер в метрах.
- Высококонтрастный, детализированный, **несимметричный** рисунок с множеством уникальных признаков, без повторяющегося паттерна; визуально в стилистике PCB (жёлтый/чёрный/голубой).
- Не использовать обычный QR-код как единственный image target: QR можно добавить для открытия ссылки, но устойчивость распознавания движком тестировать **по иллюстрации**.
- Отдельный `print.html` содержит рисунок при 100% масштабе, физические контрольные размеры в миллиметрах, стрелку верха и инструкцию «не перемещать после привязки».
- Сгенерировать цели через **официальный** CLI `npx @8thwall/image-target-cli@latest`; сохранить все необходимые JSON/изображения. В JSON относительные `imagePath` проверить после копирования в `dist`; если нужно, безопасно переписать пути через `import.meta.env.BASE_URL` **до** передачи в `XR8.XrController.configure`.

Базовая конфигурация (псевдокод: момент инициализации согласовать с SDK):

```ts
XR8.XrController.configure({
  disableWorldTracking: false,
  enableWorldPoints: false,
  scale: 'absolute',
  imageTargetData: [resolvedMarkerMetadata],
});
```

Зарегистрировать `reality.imagefound`, `reality.imageupdated`, `reality.imagelost`, `reality.trackingstatus` через camera pipeline listeners. Поля события и названия сверить по docs. У image target rotation приходит объект **`{w,x,y,z}`**, у Three.js конструктор `Quaternion` принимает **`(x,y,z,w)`**. Обязательно корректная перестановка. Учесть `scale`, измерить на физическом маркере связь масштабов и ориентацию осей; не вводить дополнительные множители на глаз.

### 4.4. Фильтр измерений и «фиксация» маркера

Момент обнаружения не означает готовую привязку. Для `MarkerPoseFilter`:

- хранить последние 15–30 валидных измерений вместе с timestamp (источник времени — `performance.now()`, только в рамках текущей сессии);
- отклонять `NaN`, неконечные значения, нулевые или ненормализуемые quaternion, неизвестное имя image target;
- считать окно стабильным при **условно** небольшом разбросе (`<= 0.03 м` и `<= 5°`) в последовательных измерениях продолжительностью ≥ 0,5 секунды, минимум 8 обновлений; пороги конфигурируемые, в `docs/AR_TEST_PLAN.md` записать наблюдаемые значения;
- усреднять позицию, усреднять quaternion с учётом знака/hemisphere или брать медианный/стабильный sample; не усреднять Euler angles;
- учитывать реальные изменения позы камеры: оценки `T_W_M` относятся к фиксированному физическому маркеру и **должны** быть близки в одной SLAM-системе; если наблюдается сдвиг при неподвижном маркере, это сигнал плохого трекинга;
- стабильное обнаружение не всегда равно точному физическому масштабу; при масштабном расхождении запрашивать повторное сканирование.

Проверять состояние tracking SLAM: `reality.trackingstatus` со значениями `NORMAL`, `LIMITED` и reason. В отличие от старого проекта, не опираться на неподтверждённый `processGpuResult.tracking === true/false`: документированный статус находится в `processCpuResult.reality.trackingStatus`/событии. Сделать защиту от отсутствующих полей.

### 4.5. Алгоритм привязки после размещения

**Preconditions:** `factoryRoot` размещён, SLAM `NORMAL`, маркер найден и стабилен, не было `recenter` или сброса SLAM с момента фиксации свободного `T_W_F`.

```ts
const markerWorld = stableMarkerPoseMatrix; // T_W_M
factoryRoot.updateMatrixWorld(true);
const factoryWorld = factoryRoot.matrixWorld.clone(); // T_W_F
const markerToFactory = markerWorld.clone().invert().multiply(factoryWorld);
// persist stable marker ID + rigid transform T_M_F
```

Если `T_W_F` включает scale, либо сохранять его явно как отдельный `factoryScale`/`cellSizeMeters`, либо обеспечить строго rigid transform (`scale=1`) в матрице якоря. **Не допускать неочевидного двойного масштабирования**. Рекомендуется `T_M_F` хранить как rigid (позиция+quaternion), физический размер сетки — отдельно.

Не принимать привязку, если marker visible был устаревшим, а между его наблюдением и привязкой была потеря/сброс SLAM. Запретить `XR8.XrController.recenter()` во время активной привязанной сессии, либо полностью инвалидировать прежние мировые наблюдения и требовать повторной привязки.

### 4.6. Восстановление после перезапуска

1. Прочесть и валидировать save. Если `anchor.kind='marker'`, включить `NEEDS_RELOCALIZATION` и показать подсказку «Наведите камеру на сохранённую карточку».
2. До устойчивого распознавания маркера **не показывать завод как будто он уже на своём месте**. Допускается мини-превью в UI или 3D.
3. По устойчивому `T_W_M`, вычислить `T_W_F = T_W_M * T_M_F`.
4. Выставить root (position/quaternion), пометить `BOUND_TRACKING`, вернуть взаимодействие.
5. Когда маркер исчезнет из кадра, **не скрывать завод**: пока SLAM `NORMAL`, корень удерживается в системе координат текущей сессии.
6. При повторном наблюдении того же маркера сравнить ожидаемый и фактический `T_W_F` (трансляция/угол). Если различия малы, корректировать плавно; если > 0,15 м или > 15°, заморозить редактирование и предложить «Восстановить привязку» с плавным переходом либо подтверждением. Не делать видимый телепорт в момент перетаскивания объекта.
7. Сильная потеря SLAM или новая world-система координат делает старый `T_W_F` ненадёжным; требовать нового обнаружения маркера для восстановленной привязки, вместо использования старой системы координат.

**Сглаживание:** разделить `requestedWorldTransform` и `displayWorldTransform`, применять lerp/slerp на 0,3–0,6 с с прекращением пользовательских модификаций; не смешивать scale и quaternion. На время анимации correction не записывать новое `T_M_F`: маркерная привязка остаётся неизменной. Для малой погрешности можно установить correction без видимого рывка. Флаг `poseConfidence` не подменяет штатную оценку SDK.

**Перемещение физического маркера:** если пользователь его переложил, восстановленный завод **переедет вместе с ним**. Предупредить пользователя в UI; кнопка «Сменить маркер/перепривязать» должна проходить явный мастер и не стирать постройки.

### 4.7. Ручной fallback после повторного запуска

- `View in 3D` — показывает завод без камеры, ничего не меняет в сохранённом якоре.
- `Place temporarily` — разрешает выбрать новую позицию в текущем AR сеансе, но `anchor.kind='marker'` и `T_M_F` остаются нетронутыми; UI явно обозначает «Временная позиция».
- `Rebind here` — требует явного подтверждения и повторного распознавания маркера, затем пересохраняет `T_M_F`.
- Для непривязанного завода нет «успешной relocalization» по одному локальному storage — только новое свободное размещение.

### 4.8. Tracking state machine

```text
STARTING -> PERMISSION_REQUIRED -> INITIALIZING -> SCANNING
SCANNING -> FREE_PLACEMENT -> FREE_UNBOUND -> BINDING -> BOUND_TRACKING
SCANNING -> NEEDS_RELOCALIZATION -> RELOCALIZING -> BOUND_TRACKING
BOUND_TRACKING -> TRACKING_LIMITED -> BOUND_TRACKING
TRACKING_LIMITED -> NEEDS_RELOCALIZATION   (если world reference утрачен)
* -> CAMERA_DENIED / UNSUPPORTED / ENGINE_ERROR -> DESKTOP_3D
```

Не смешивать трекинг и видимость маркера в один флаг. Установить отдельные значения:

```ts
type SlamStatus = 'unavailable' | 'initializing' | 'limited' | 'normal' | 'lost';
type MarkerStatus = 'not-configured' | 'scanning' | 'visible-unstable' | 'stable' | 'lost';
type PlacementStatus =
  | 'not-placed' | 'free-preview' | 'free-unbound'
  | 'binding' | 'bound-needs-marker' | 'bound-tracking'
  | 'temporarily-placed' | 'relocalization-needed';
```

Все переходы делаются через контроллер состояния с явными guards, события логируются для диагностики.

---

## 5. Контракты TypeScript и границы модулей

Агент обязан создать конкретные типы и написать тесты до интеграции AR. Примеры ниже — **контракты проекта**, не выдавать их за API 8th Wall.

### 5.1. Входные типы и состояние игрового мира

```ts
export type BuildingType = 'generator' | 'extractor' | 'conveyor' | 'processor';
export type Direction = 0 | 1 | 2 | 3; // 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
export type ItemType = 'ore';
export type BuildingId = string;

export interface GridPoint { x: number; z: number }

export interface Building {
  id: BuildingId;
  type: BuildingType;
  x: number;                  // integer grid coordinate
  z: number;                  // integer grid coordinate
  rotation: Direction;
  progress: number;           // seconds in current production operation
  buffer: ItemType[];         // capacity enforced per type
  purchaseSource: 'starter' | 'credits';
  enabled: boolean;
}

export interface FactoryState {
  schemaVersion: 1;
  factoryId: string;
  width: 10;
  height: 10;
  cellSizeMeters: number;
  credits: number;
  totalPartsSold: number;
  buildings: Building[];
  starterInventory: Record<BuildingType, number>;
  simulationTimeSeconds: number;
  isPaused: boolean;
  nextBuildingOrdinal: number;
}
```

**Инварианты:** уникальные ID, валидный тип, grid координаты 0…9, не более одного здания на клетку, `rotation` 0..3, все числовые значения конечные, кредиты целые неотрицательные, `progress >= 0`, buffer в пределах ёмкости. Все команды возвращают `Result<T, DomainError>`, не мутируют state при ошибке. UI показывает локализованную причину отказа.

### 5.2. Команды ядра

```ts
type FactoryCommand =
  | { type: 'place'; buildingType: BuildingType; x: number; z: number; rotation: Direction }
  | { type: 'rotate'; id: BuildingId; clockwise: boolean }
  | { type: 'remove'; id: BuildingId }
  | { type: 'toggle'; id: BuildingId; enabled: boolean }
  | { type: 'pause'; paused: boolean }
  | { type: 'reset-factory' };

interface FactoryEngine {
  readonly state: Readonly<FactoryState>;
  dispatch(command: FactoryCommand): Result<void, DomainError>;
  step(dtSeconds: number): void;
  subscribe(listener: (state: Readonly<FactoryState>) => void): Unsubscribe;
}
```

Рекомендуется сохранять неизменяемую модель для логических тестов, однако допускается внутренний mutable engine при строгой сериализации на границе и отсутствии императивных изменений со стороны renderer/UI. `step()` работает с **фиксированным dt**. Конфликтные команды должны быть атомарны.

### 5.3. Контракт TrackingPort

```ts
interface RigidPose {
  position: [number, number, number];
  quaternion: [number, number, number, number]; // x,y,z,w
}

interface MarkerObservation {
  name: string;
  poseWorld: RigidPose;
  timeMs: number;
  sdkScale?: number;
}

interface TrackingPort {
  start(canvas: HTMLCanvasElement): Promise<void>;
  stop(): Promise<void>;
  getCamera(): THREE.Camera | null;
  getScene(): THREE.Scene | null;
  getStatus(): SlamStatus;
  onTrackingChange(cb: (status: SlamStatus) => void): Unsubscribe;
  onMarkerObservation(cb: (value: MarkerObservation) => void): Unsubscribe;
  onMarkerLost(cb: (markerName: string) => void): Unsubscribe;
  onFrame(cb: (timeMs: number) => void): Unsubscribe;
  tryHitTest(screenX: number, screenY: number): Promise<RigidPose | null>;
}
```

`TrackingPort` — локальный **adapter interface**: 8th Wall не предоставляет его готовым. `EightWallAdapter` единственный модуль, имеющий доступ к XR8; `MockAdapter` выдаёт стабильную искусственную камеру/маркер в тестах, но должен быть маркирован как MOCK, никогда не выдаваться за настоящий AR.

`start()` обязан обрабатывать уже загруженный `window.XR8` и асинхронное событие `xrloaded`, не регистрировать pipeline-модули повторно. На `stop()` удалить все собственные listeners, освободить подписки и остановить SDK через документированный для выбранной версии API (проверить его отдельно). Если конкретный API остановки непригоден/недоступен, сделать одноразовый сеанс с явным reload для переключения режимов; не выдумывать метод и не допускать второго camera stream.

### 5.4. Контракт AnchorManager

```ts
type AnchorState =
  | { kind: 'unbound' }
  | {
      kind: 'marker';
      markerName: string;
      markerToFactory: RigidPose;
      bindingVersion: 1;
    };

interface AnchorManager {
  getAnchor(): AnchorState;
  getWorldFactoryPose(): RigidPose | null;
  beginFreePlacement(): void;
  confirmFreePlacement(worldPose: RigidPose): void;
  bindToMarker(observation: MarkerObservation): Result<AnchorState, AnchorError>;
  requestRelocalization(): void;
  restoreFromMarker(observation: MarkerObservation): Result<RigidPose, AnchorError>;
  placeTemporarily(pose: RigidPose): void;
  rebindToMarker(observation: MarkerObservation): Result<void, AnchorError>;
}
```

Не использовать тип `RigidPose` для сохранения физического масштаба: физический `cellSizeMeters` отдельно. Сохранять quaternion нормализованным. `markerName` должен точно совпадать с обнаруженным image target. `bindToMarker` вызывается **только после** стабильного наблюдения и актуального `factoryWorldPose`, не на первом `imagefound`.

### 5.5. Renderer + input

```ts
interface FactoryRenderer {
  attach(scene: THREE.Scene): void;
  updateFactory(state: Readonly<FactoryState>): void;
  updateVisuals(alpha: number, elapsedSeconds: number): void;
  setWorldPose(pose: RigidPose | null): void;
  setPlacementPreview(pose: RigidPose | null, allowed: boolean): void;
  pickCell(clientX: number, clientY: number, camera: THREE.Camera, viewport: DOMRect): GridPoint | null;
  pickBuilding(clientX: number, clientY: number, camera: THREE.Camera, viewport: DOMRect): BuildingId | null;
  dispose(): void;
}
```

`pickCell()` пересекает **локальную** плоскость сетки под `factoryRoot`, не пол комнаты. Взять raycast в мировых координатах, преобразовать точку через `inverse(factoryRoot.matrixWorld)` и перевести в индексы сетки. Работа корректна при любом повороте/смещении корня, при изменении масштаба и на границах (без off-by-one). UI-элементы не должны активировать canvas picking.

### 5.6. Утилиты трансформаций

Создать отдельно чистые функции:

```ts
function toMatrix(pose: RigidPose): THREE.Matrix4;
function fromMatrix(matrix: THREE.Matrix4): RigidPose;
function relativePose(parentWorld: RigidPose, childWorld: RigidPose): RigidPose;
function composePose(parentWorld: RigidPose, childLocal: RigidPose): RigidPose;
function translationErrorMeters(a: RigidPose, b: RigidPose): number;
function angleErrorDegrees(a: RigidPose, b: RigidPose): number;
```

Матрицы Three.js допускаются только в AR/render/utils слое; при необходимости тесты используют библиотеку, но FactoryCore про неё не знает.

---

## 6. Игровая экономика: однозначная спецификация

### 6.1. Основные правила

Игровые объекты ставятся на клетки; все занимают 1×1. Склад/логистика не требуют полноценной физики. Анимированные предметы отображаются **визуальными спрайтами/простыми мешами**, но их наличие определяется буферами логического симулятора. Экономика не зависит от FPS.

| Модуль | Строительство (credits) | Электропотребление | Поведение |
|---|---:|---:|---|
| `generator` | 60 | Производит 10 единиц | Дает энергию общей сети; не нужен провод |
| `extractor` | 50 | 4 | Создает `ore` в буфере 1 ед. раз в 2,5 с, если есть место |
| `conveyor` | 8 | 0 | Двигает максимум 1 `ore` между соседними клетками за 0,75 с |
| `processor` | 80 | 5 | Принимает `ore`; преобразует за 2,5 с; автоматически продаёт 1 `part` за 12 credits |

Конфигурация в `src/core/constants.ts`, не размазывать числа по коду. Любое успешное действие производства отражается в HUD и в `totalPartsSold`. В UI показывать `energy supply / energy demand`.

**Стартовое состояние:** новая фабрика содержит **0 зданий, 120 credits и один бесплатный стартовый комплект**: 1 `generator`, 1 `extractor`, 1 `processor`, 6 `conveyor` (используются при первом размещении соответствующего количества модулей); после исчерпания стартового комплекта покупки оплачиваются кредитами. Комплект должен сохраняться и отображаться; добавить поле `starterInventory: Record<BuildingType, number>` в `FactoryState`. Первые здания нельзя выдать бесплатно повторно через refresh/reset эксплойт (сброс — новая игра с явным подтверждением).

**Почему выбран комплект:** игрок может собрать первую цепочку даже после нескольких пробных перестановок, не застряв в непроизводительном состоянии без денег. При удалении здания до запуска оно **не восстанавливается в стартовом комплекте**; возвращается 50% денежной стоимости, если куплено за деньги, и **тот же экземпляр стартового набора** при удалении бесплатного здания. Поэтому поле `purchaseSource: 'starter' | 'credits'` в `Building` обязательно и при удалении корректно возвращать starter inventory/кредиты. Игрок не должен получать деньги при удалении бесплатного здания.

**Энергосеть MVP:** генераторы подключены логически к общей заводской сети без проводов; `supply = generators × 10`, `demand = enabled extractors × 4 + enabled processors × 5`. Если `supply < demand`, все потребители временно останавливаются (режим brownout), конвейеры сохраняют содержимое и движение может быть заморожено. В HUD «Не хватает энергии». После добавления генератора производство продолжается с прежними прогрессами. Генератор не требует входного топлива. Конвейер движется только если нет brownout и игра не на паузе — это правило упрощения.

**Направления:** `rotation=0` смотрит к `+Z`; `1` к `+X`; `2` к `-Z`; `3` к `-X`. Задокументировать отображение стрелок. `extractor` выдает из клетки **по своему направлению**; `conveyor` принимает только сзади и передает строго вперед; `processor` принимает из соседнего направленного в него `extractor` или `conveyor` с любой стороны (при собственном повороте меняется только визуальный корпус). `generator` не участвует в логистике.

### 6.2. Пример корректной цепочки

```text
          +Z →
[E→] [C→] [C→] [P]  => продажа 1 part за 12 credits
   [G] в соседней свободной клетке; энергия общая
```

- `E` — extractor, создаёт `ore`.
- `C` — conveyor, направлен вправо.
- `P` — processor, автоматически продаёт готовую деталь.
- `G` — generator, питает extractor и processor.

Подсветка входов/выходов должна показывать корректность ориентации. Если цепь разомкнута, видимые предметы останавливаются в буфере, а кредиты не растут.

### 6.3. Буферы и тик симуляции

- `extractor`: буфер 0..1 `ore`, таймер производства; при заполнении не производит сверх лимита.
- `conveyor`: буфер 0..1 `ore`, внутренний таймер перемещения 0..0,75 c; перенос разрешён только когда следующая клетка может принять предмет.
- `processor`: входной буфер 0..1 `ore`, таймер переработки 0..2,5 c; при завершении ресурс расходуется, `credits += 12`, `totalPartsSold += 1`.
- Прямая соседняя передача `extractor → processor` допускается; конвейер можно и не использовать, но tutorial должен требовать хотя бы 1 ленту ради демонстрации.
- **Нет телепортации:** за один `step` одна единица сырья проходит не более одного ребра логистического графа. Использовать двухфазный расчёт `read state → transfer intents → resolve conflicts deterministically → commit`.
- При конфликте нескольких источников за одну клетку использовать стабильную сортировку по ID / явно определённый порядок; не делать результат зависимым от порядка обхода Three.js объектов.
- Не разрешать «размножение» при одновременном освобождении и заполнении буфера, сохранять число предметов за исключением extractor spawn и processor consume.
- При удалении здания предметы в нём уничтожаются без возмещения, показывать предупреждение, если buffer непуст.
- При вращении конвейера содержащийся в нём предмет остаётся в буфере, направление следующей передачи меняется.
- При паузе нет производства, переноса, списаний или accrual; камера и UI продолжают работать.

### 6.4. Fixed timestep

Использовать базовый шаг **0,10 с** (10 sim ticks/с) с накопителем времени, максимум 5 шагов за UI-кадр (ограничение на сильные лаги); ограничить реальный `delta` максимум 0,25–0,5 с. Если страница скрыта, ставить *симуляцию на паузу по видимости* или сбрасывать accumulator при возвращении (не пытаться симулировать ночь за один кадр). Не делать offline income в MVP.

**Запрет:** писать `credits += dt * k` в renderer, привязывать логику к XR8 `onRender`, создавать отдельный бесконтрольный `requestAnimationFrame` для игры при наличии camera pipeline. В 3D viewer есть собственный RAF; в AR режиме кадрами управляет 8th Wall pipeline.

Реализовать методы:

```ts
const FIXED_DT = 0.1;
const MAX_STEPS_PER_FRAME = 5;

function updateSimulation(frameDelta: number) {
  accumulator += Math.min(frameDelta, 0.25);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    engine.step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
}
```

Реализовать `visibilitychange` без скачков времени. Между 3D-режимом и AR-режимом **один** `FactoryEngine` на игровую сессию, недопустим запуск двух симуляций при переключении.

### 6.5. Команды редактирования

- `place`: проверяет границы, занятость, стоимость/стартовый набор, максимальное количество, валидность направления. При успехе создаёт уникальный ID.
- `rotate`: меняет `rotation` и перестраивает связи при следующем sim step.
- `remove`: требует существующий ID; при обычной покупке возвращает `floor(cost * 0.5)` credits; при starter возвращает ровно 1 в `starterInventory`. Подтверждение UI обязательно для генератора/процессора и модулей с сырьём.
- `toggle`: выключает extractor/processor; generator выключать разрешено (снижает supply); для конвейера enabled управляет его переносом.
- `reset`: удаляет все здания и создаёт **новую** фабрику с первоначальным комплектом, но **не меняет AR-якорь**, если пользователь явно не выбрал «Сбросить и завод, и привязку».

### 6.6. Баланс и минимальная целевая сессия

За первые ~3 минуты пользователь должен: поставить 1 генератор, 1 добытчик, 1–2 конвейера, 1 переработчик, увидеть как минимум 3 продаваемых продукта, заработать 36 credits и поставить дополнительную ленту. Это **продуктовая цель**, а не гарантированное время любого пользователя.

Tutorial — не более 5 кратких шагов: **(1)** размести базу, **(2)** поставь генератор, **(3)** поставь добытчик, **(4)** свяжи переработчик лентой, **(5)** наблюдай первую продажу. Состояние tutorial сохранять/восстанавливать. В 3D-режиме tutorial такой же без AR-инструкций.

---

## 7. Визуальный стиль и реализация Three.js

### 7.1. Арт-дирекшн

Референс пользователя — стилизованная жёлтая плата с чёрными/графитовыми компонентами, голубыми маркировками, винтами, крупными разъёмами. Это **настроение**, а не требование копировать существующий дизайн платы или логотипы.

- Палитра: жёлто-янтарный `#E7AB20`, тёмный графит `#252A2D`, светлый металл `#CBD3D3`, сине-бирюзовый `#238B9B`, нейтральный свет `#F4E9C9`, аварийный `#D75F46`.
- Силуэты: игрушечные тяжёлые модули, большие выступающие кнопки/винты, рёбра, разъёмы, эмиттеры и мини-дымовые трубы.
- Читаемость: высококонтрастные указатели входа/выхода, направление конвейера, маленькие светящиеся индикаторы активности.
- Эмоция: «настольная промышленная электроника», узнаваемость с 1–2 метров на экране.
- Нет чрезмерного PBR и фотореализма; материалы MeshStandard/MeshLambert с лёгкой roughness и одними/двумя источниками света.

### 7.2. Модели модулей, генерируемые геометрически

Создать процедурные низкополигональные модели с реальной геометрической детализацией:

1. **Generator:** толстая жёлтая база, тёмный трансформатор/катушки, светящийся бирюзовый индикатор, анимированный ротор/мигающий LED.
2. **Extractor:** компактный корпус, бур/захват, поршень; при активной добыче движется механическая деталь и загорается LED.
3. **Conveyor:** низкая дорожка с двумя барабанами, поперечными роликами, видимой лентой, крупной стрелкой. Предметы (`ore`) реально едут вдоль клеток; лента визуально движется даже без ресурса, когда питание есть.
4. **Processor:** высокая тёмная печь/пресс, вход с заметной рамкой, поршень/крышка, голубые вентиляционные элементы, короткая вспышка при продаже.

Габариты каждого объекта: ширина/длина не более 0,92 клетки (оставить читаемые зазоры), высота ~0,5–1,3 клетки. Платформа имеет тонкую кромку и слабую сетку, которая может быть скрыта в режиме просмотра.

Создать небольшой набор материалов переиспользуемым; без обязательных внешних моделей и без непроверенных URL на модели. Можно добавлять свои GLB лишь при наличии лицензии и уверенности в мобильной производительности.

### 7.3. Рендеринг и оптимизация

- Использовать объекты Three.js и батчинг/`InstancedMesh` для повторяющихся конвейерных секций/болтов, если повторов много; при MVP допустимы отдельные меши, но не дублировать тяжелые материалы/геометрии.
- Стараться удерживать ~50 активных модулей без заметных тормозов на тестовом среднем телефоне.
- Не включать реальные shadow maps по умолчанию в AR; контакт под объектом — полупрозрачная простая геометрия. В desktop-режиме допускаются лёгкие тени, отключаемые настройкой.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))` применять **только если это допустимо для рендерера 8th Wall**; не нарушать внутреннее управление буфером движка.
- Нет постпроцессинга, HDR environment, depth-ML и ненужных текстур высокого разрешения.
- Один `Raycaster` и переиспользуемые векторы в горячем пути, не создавать сотни `new Vector3` на каждом кадре.
- Разграничить `updateFactory()` (при логических изменениях) и `updateVisuals()` (каждый кадр); не перестраивать геометрию всех зданий 60 раз в секунду.
- Каждый объект/материал/геометрию, созданную игрой, корректно освободить через `dispose()` при смене режима/переинициализации; никогда не dispose shared XR renderer чужого владельца.

### 7.4. Визуальная работа конвейера

`FactoryCore` сообщает о текущих item buffers, `conveyor.progress` и положении в логической цепи. `ConveyorRenderer` отображает по одному простому предмету (`ore`: маленький тёмный кристалл/комплект деталей) с интерполяцией от входа к выходу вдоль локальной оси. Позиция предмета должна зависеть от **времени симуляции**, а не от скорости `requestAnimationFrame`. При остановке производственного процесса предмет замирает. Скрывать визуальный предмет только когда передача подтверждена моделью.

### 7.5. Комфорт в AR

- Не закрывать значительную часть камеры непрозрачными панелями.
- Завод не обязан быть строго «на полу»; визуальная платформа выравнивается по выбранной строительной плоскости.
- Добавить небольшую анимацию установки модулей (`scale` от 0,9 к 1, лёгкое затухание), без screen-shake и без вращения камеры.
- Настройки: `reducedMotion` с respect к `prefers-reduced-motion`, уменьшение эффектов.
- Никакого автозапуска громкой музыки или обязательного звука.

---

## 8. UI/UX, экраны и жесты

### 8.1. Экраны

**Start screen**: название ROOM FACTORY AR, короткий pitch «Построй завод у себя в комнате», `Начать в AR`, `Играть в 3D`, `Как это работает`, `Настройки`, `Powered by 8th Wall` + корректная лицензия. Если обнаружено сохранение — `Продолжить` с пояснением, привязан ли завод к карточке.

**Camera permission**: зачем нужна камера, что видео не сохраняется и не отправляется приложением на сервер; пользовательский вызов запуска после tap. При отказе — помощь и 3D fallback.

**Scanning / placement**: инструкция «Медленно наведите камеру на поверхность», горизонтальный ghost-подиум, интерфейс `− / +` высота, вращение, масштаб до стройки, `Разместить`.

**Binding**: шаги получения карточки: открыть печатный HTML, напечатать без изменения масштаба, положить на поверхность, не перемещать. Статус `Ищем карточку → Стабилизируем → Привязка готова`; при неуспехе — «Продолжить без привязки».

**Relocalization**: камера + рамка подсказки, «Наведите на ту же карточку», `3D-режим`, `Временно разместить`, `Помощь`; не показывать AR-корень в произвольной новой точке.

**Main HUD**: сверху кредиты, энергия, производство; внизу горизонтальная палитра четырёх модулей и их стоимости/наличия бесплатных штук, `Отмена`, `Поворот`; выделенное здание — компактный inspector (`тип, статус, вход/выход, удалить, включить/выключить`).

**Menu**: пауза, `Сохранить`, `Привязать/перепривязать`, `Показать/скрыть сетку`, `Режим 3D`, `Экспорт`, `Импорт`, `Диагностика`, `Сбросить завод`, `Информация об SDK`.

**Unsupported/error**: человеческое описание причины, безопасные повторные попытки, ссылка в 3D-режим, без бесконечного loading spinner.

### 8.2. Состояния выбора

```ts
type EditTool =
  | { mode: 'inspect' }
  | { mode: 'place'; buildingType: BuildingType; rotation: Direction }
  | { mode: 'delete' };
```

Нажатие и выбор через raycaster; ghost строящегося здания строго привязан к локальной сетке. Валидное место — полупрозрачный бирюзовый контур, занято/недостаточно денег/вне сетки — красный; недоступная операция не приводит к мутации. `tap` на UI не проваливается под оверлей в 3D. Два последовательных нажатия по одной клетке не должны строить два здания и дважды списывать деньги.

### 8.3. Сенсорные жесты

**AR:** камера управляется физическим перемещением телефона; один тап — выбор/строительство; кнопка поворота здания — 90°; при свободном размещении доступны drag платформы и separate controls масштаба/высоты. Не пытаться панорамировать AR-камеру пальцем. Плавающие компактные controls крупнее 44×44 CSS px.

**Desktop 3D:** `OrbitControls` (левая кнопка вращает, колёсико масштабирует, правая панорамирует), клик строит/выбирает. Во время установки модуля click/tap приоритетнее OrbitControls; порог перемещения курсора ≥ 6 px отделяет drag от click. На телефоне в 3D — one-finger orbit, two-finger pan/zoom, tap выбор.

Использовать `touch-action: none` на canvas, `pointer-events` и `setPointerCapture` для целевых жестов; не блокировать scroll внутри модальных окон. Учесть safe areas (`env(safe-area-inset-*)`), landscape и portrait, resize, devicePixelRatio.

### 8.4. Доступность/язык

UI первоначально на русском; все подписи вынести в объект строк (позже подключить English без переделки кода). Контраст не менее приблизительного WCAG AA для критичных подписей. Кнопки доступны `keyboard` и имеют `aria-label` там, где иконка без текста. Состояния «не хватает энергии», «трекинг потерян» не различаются только цветом.

---

## 9. Сохранение и восстановление состояния

### 9.1. Формат и ключ

`localStorage` key: `room-factory-ar/save/v1`. Сохранять:

```ts
interface PersistedSaveV1 {
  schemaVersion: 1;
  savedAtISO: string;
  factory: FactoryState;
  anchor: AnchorState; // 'unbound' or marker-relative; НЕ W pose прошлой сессии
  tutorial: { step: number; complete: boolean };
  preferences: {
    showGrid: boolean;
    muted: boolean;
    performanceMode: 'auto' | 'low' | 'high';
  };
}
```

`FactoryState` здесь должен включать `starterInventory`, `purchaseSource` каждого здания и state внутренних буферов, как оговорено в разделе 6. Не хранить в JSON инстансы Three.js, экземпляры SDK, camera pose, media streams, `performance.now()`, функции/ссылки.

### 9.2. Правила записи

- На успешную команду `place/rotate/remove/toggle` — mark dirty и debounce ~500 мс.
- По ходу симуляции автосохранение ~каждые 10 секунд, если состояние изменилось.
- На `visibilitychange: hidden`, `pagehide` попытаться синхронно сериализовать и сохранить уже подготовленную snapshot (API storage синхронное). Не полагаться на `beforeunload` как единственный механизм.
- На ручную кнопку `Сохранить` — моментально и с результатом в UI.
- Проверить quota/ошибки `QuotaExceededError`, private browsing/restricted storage; при ошибке показать экспорт и не терять игру до закрытия вкладки.
- Изолировать Storage в `SaveRepository`.

### 9.3. Валидация / повреждение / миграции

- При загрузке `JSON.parse` в try/catch; валидация runtime типами/guard function (или лёгкой библиотекой, если нужна).
- Все числа finite; никакого `NaN`, отрицательных прогрессов, имён маркера от неизвестной версии и матриц произвольного размера.
- Если одна запись некорректна — не падать с белым экраном: показать `Сохранение повреждено`, `Экспортировать исходные данные`, `Начать заново` с подтверждением.
- Из старых схем мигрировать только явным `migrateV1ToV2`; **не** пытаться «догадаться» и автоматически менять anchor при несовместимой версии.
- Импорт JSON не должен содержать исполняемый код; проверять размер файла, типы, границы и схему. Импорт требует подтверждения перезаписи текущей фабрики.
- Экспорт JSON скачивается стандартным браузерным `Blob`; на iOS предусмотреть `share` или инструкции, если download UX нестабилен.

### 9.4. Сохранённая прогрессия при отсутствии маркера

В `unbound` храним factory, но **не** сохраняем мировой offset как реальное физическое место. При повторном AR запуске запросить свободное размещение. В `marker` восстанавливаем `T_M_F` и **только** после распознавания целевого изображения; геометрия и баланс фабрики доступны сразу в 3D режиме. В «временно размещённом» режиме не перезаписывать якорь при автосохранении.

---

## 10. Готовность 8th Wall SDK и загрузка камеры

### 10.1. Загрузка бинарного движка

Предпочитать локальную поставку runtime из npm, чтобы GitHub Pages не зависел от сторонней CDN для стартового скрипта. На build скопировать **всё содержимое** `node_modules/@8thwall/engine-binary/dist` в `dist/external/xr/`; не выбирать один `xr.js` и забывать связанные chunks. Гарантировать относительные пути внутри SDK. Если runtime использует собственные asset URL, верифицировать фактические network requests на Pages.

Пример подключаемого скрипта (под `base`):

```html
<script src="%BASE_URL%external/xr/xr.js"
        async crossorigin="anonymous" data-preload-chunks="slam"></script>
```

Проверить, что выбранная версия Vite корректно обрабатывает `%BASE_URL%` в HTML, либо вставлять путь из `import.meta.env.BASE_URL` через явный loader (избегая повторной вставки скрипта). Нельзя использовать абсолютные `/external/xr/xr.js`, `/src/main.ts`, `/marker/marker.png` на project Pages — они указывают в корень домена, а не репозитория.

`@8thwall/engine-binary` предоставляет `XR8Promise`, который разрешится при наличии загруженного script tag. Возможно использовать `window.XR8`/`xrloaded`, как в «Булгакове», но **таймаут и сценарий ошибки обязательны**. Не считать CDN-скрипт всегда доступным.

### 10.2. Порядок запуска

1. DOM загружен; UI/Storage и 3D fallback доступны до старта XR SDK.
2. Пользователь нажал «AR», secure context доступен (HTTPS или localhost); проверить media devices/feature availability.
3. Загрузить runtime, дождаться XR8; совместимость текущих extras/landing page проверить отдельно, не использовать одновременно несовместимые дубли.
4. `window.THREE = THREE` только если это действительно требуется текущей интеграции; убедиться, что XR и приложение используют совместимый **один** экземпляр Three.js. При ошибках типов/двойных рендерах сначала проверить версии.
5. Загрузить и резолвить image target metadata + ассеты; вызвать `XR8.XrController.configure({ scale:'absolute', disableWorldTracking:false, imageTargetData:[...] })` **до** активной работы tracking pipeline.
6. Зарегистрировать стандартные XR8 modules и свои `factory-session` / `marker-events` / `diagnostics` modules один раз, в корректном порядке. Минимум: `XR8.GlTextureRenderer.pipelineModule()`, `XR8.Threejs.pipelineModule()`, `XR8.XrController.pipelineModule()` и app module.
7. В `onStart` получить `XR8.Threejs.xrScene()`; подцепить `FactoryRenderer`, создать lights/UI controllers. Переносить app initialized state только после готовности сцены.
8. В `onUpdate` извлекать `processCpuResult` и текущую camera pose, слать marker/tracking события в AnchorManager, тикать симуляцию, обновлять эффекты.
9. Слушать `onCameraStatusChange` / runtime errors; при запрете/недоступности камеры — 3D fallback.
10. На сворачивании приложения аккуратно прерывать накопление игрового времени; на возобновлении повторно проверять состояние трекинга.

**На старте не добавлять `XR8.CameraPixelArray.pipelineModule()`**: в «Булгакове» он был нужен Depth Anything, а здесь создаёт ненужную обработку кадра.

### 10.3. Устойчивость к сбоям

Ограничить ожидание загрузки SDK и камеру разумными таймаутами (например, 20 и 30 секунд), но дать пользователю `Повторить` и `Открыть 3D`. Логировать категорию ошибки без сырого изображения камеры. При пробуждении вкладки Safari камера может прекратить поток; дать clear recovery UI. Проверить выгрузку/повторное создание WebGL контекста, `webglcontextlost` / `webglcontextrestored` (если доступно), не допускать двойной XR инстанции.

### 10.4. Лицензия и атрибуция

8th Wall **Engine Binary не MIT**. До публикации агент обязан прочитать лицензии установленной версии пакета и официальную <https://github.com/8thwall/engine/blob/main/LICENSE>; сохранить copyright и ссылки на текст соглашения и disclaimer. В About/credits указать Niantic Spatial как создателя XR Engine, не создавать впечатление официальной поддержки или партнёрства. Не модифицировать и не reverse-engineer бинарник. Проверить соответствие выбранного способа self-host с актуальными permitted uses (предлагаемая игра — самостоятельный продукт, не SDK-конкурент).

---

## 11. Vite, GitHub Pages, локальная разработка

### 11.1. npm scripts

Ожидаемые команды:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "build": "npm run typecheck && npm run test && vite build && node scripts/copy-xr-assets.mjs && node scripts/verify-dist.mjs",
    "preview": "vite preview --host 0.0.0.0"
  }
}
```

Скрипты можно адаптировать для платформенной совместимости. Зафиксировать минимальную версию Node.js совместимую с Vite и использовать ту же версию в CI. `verify-dist.mjs` проверяет наличие `index.html`, XR8 runtime, marker JSON и всех указанных им картинок, отсутствие ссылок на `/src/*` и URL, которые заведомо ломаются под базовым `/repo/`.

### 11.2. Конфигурация Vite

```ts
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // For https://<owner>.github.io/room-factory-ar/
  base: mode === 'production' ? '/room-factory-ar/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
}));
```

Если имя репозитория иное — не хардкодить: использовать `VITE_BASE_PATH`/`GITHUB_REPOSITORY` в workflow с безопасным дефолтом. Для user-site (`<owner>.github.io`) или custom domain может понадобиться `/`. Все собственные URL `new URL(...)`, `import.meta.env.BASE_URL` либо `base`-aware helper. В production проверка собранного сайта обязательна **по префиксу репозитория**, не только из корня локального сервера.

### 11.3. HTTPS на мобильных

- В GH Pages — нативный HTTPS.
- На `localhost` secure context допустим; при заходе с телефона по LAN `http://192.168.x.x` камера обычно недоступна.
- Для локальных тестов использовать доверенный HTTPS URL/туннель; `@vitejs/plugin-basic-ssl` может дать self-signed сертификат, который на некоторых телефонах потребуется вручную доверить. Задокументировать конкретную процедуру в `README.md`, не утверждать, что простое `https` с недоверенным сертификатом всегда работает.
- Не делать фальшивую проверку AR через эмулятор веб-камеры как замену реальному смартфону.

### 11.4. GitHub Actions

Создать `.github/workflows/deploy.yml` с раздельной сборкой и deploy. Пример, который следует скорректировать под фактические версии actions при реализации:

```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - name: Install
        run: npm ci
      - name: Build + unit tests
        run: npm run build
      - name: Configure Pages
        uses: actions/configure-pages@v5
      - name: Upload dist
        uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        name: Deploy Pages
        uses: actions/deploy-pages@v4
```

Версии actions можно обновить до действующих стабильных на момент выполнения, сохранив семантику; при ошибках CI не «лечить» удалением unit tests/typecheck. В GitHub **Settings → Pages → Source: GitHub Actions**. Публиковать именно содержимое `dist`, не исходники.

### 11.5. Проверки продакшн-сборки

1. HTTP 200 для `https://<owner>.github.io/<repo>/`.
2. Положительные responses на XR script/chunks, JSON image target, его картинки и CSS/JS bundles.
3. Нет MIME/СORS ошибок, смешанного HTTP content, 404 по абсолютному `/src/` и поддиректориям.
4. При ошибке загрузки движка 3D-режим остаётся доступен.
5. При чистом storage пользователь может пройти onboarding.
6. На существующем storage после обновления сайт восстанавливает версию 1.
7. После публикации на настоящем смартфоне открывается camera permission flow (фактическая успешность зависит от устройства).

---

## 12. Диагностика, аналитика производительности и приватность

### 12.1. Отладочная панель

Скрытая по умолчанию панель, открываемая через настройки или `?debug=1`:

```text
mode: AR / desktop 3D / mock
SDK state: unloaded / loading / ready / failed
camera: unavailable / pending / ready / error
SLAM: NORMAL / LIMITED / initializing / lost
marker: name, scanning / visible / stable / lost
anchor: unbound / bound / temporary / relocalizing
marker-to-factory (pos xyz, quat xyzw)
pose error: translation (m) + angle (degrees)
FPS (moving average), frame time p95 (if sampled)
draw calls, triangles, visible meshes
buildings, active items, production/min
save: last success, schema version, storage error
app version / commit hash
```

Логировать кольцевой буфер последних 100 диагностических записей в оперативной памяти. Экспорт diagnostics в JSON **без кадров камеры, без точных физических координат геолокации и без личных данных**. При реализации важно предупреждать, что пользователь может делиться диагностикой добровольно; никакой скрытой отправки.

### 12.2. Приватность

- Камера нужна только для локального AR; само приложение не записывает и не отправляет видеокадры на собственный backend.
- Не загружать сторонние аналитические пиксели без отдельного решения и документации.
- Не сохранять видеокадры/скриншоты автоматически.
- Изменение разрешений можно сделать через системные настройки браузера.
- Поскольку используются сторонние бинарные компоненты, формулировать privacy disclosure аккуратно: «приложение не реализует сохранение/отправку видеокадров»; не делать недоказанных глобальных заявлений о любом внутреннем поведении SDK.
- Пользователь может очистить локальное сохранение из интерфейса.

### 12.3. Целевые бюджеты (не обещания)

| Метрика | Цель MVP | Как проверять |
|---|---|---|
| AR FPS | ≈30+ на целевых средних смартфонах | debug HUD + screen recording |
| Desktop 3D | ≈60 на обычном ПК | browser performance panel |
| Построек | 50 одновременно без деградации UX | stress preset |
| Активных видимых items | ~30 одновременно | visual stress |
| Сохранение | без заметного UI freeze | measure JSON serialize/write |
| Ошибка relocalization | стремиться к <= 5 см около маркера | физическая линейка + повторные запуски |
| Первая работающая линия | целевой сценарий ~3 минуты | модераторский usability test |

5 см — **исследовательская цель**, а не гарантируемая точность SDK. Если реальные показатели хуже, документировать распределение ошибок, устройства, условия, а не изменять результаты тестов. Не интерпретировать FPS в mock как FPS AR.

---

## 13. План реализации агентом: milestones и выходные артефакты

**Правило:** каждый milestone должен завершаться работающим кодом, обновлённым `docs/IMPLEMENTATION_LOG.md`, релевантными тестами и кратким указанием неопределённостей. Следующий этап не должен уничтожать предыдущие возможности.

### M0 — bootstrap и scaffolding

**Задачи**
- Создать Vite TS strict, package scripts, структуру модулей, README.
- Настроить unit tests, типизацию, CSS/reset, responsive layout, стартовый экран.
- Создать GitHub Pages workflow и проверку dist.
- Убедиться, что `npm ci && npm run build` работает без камеры.

**Definition of Done**: открывается стартовый экран, `Играть в 3D` ведёт к пустой сцене/сетки, build/CI проходят. Конфигурация путей совместима с `/repo/`.

### M1 — FactoryCore и тесты (без AR)

**Задачи**
- Реализовать grid, типы, проверки размещения, команды, цены, starter kit, энергосеть.
- Реализовать детерминированную логистику, production, fixed-step и brownout.
- Реализовать serialize/deserialize, import/export, runtime validation.
- Написать unit-тесты всех инвариантов и путей ресурсов.

**Definition of Done**: программно создаётся цепочка, она производит детали, баланс растёт, после roundtrip-save продолжает с прежними буферами и деньгами, логика не требует браузера.

### M2 — 3D-игра и интерфейс

**Задачи**
- Сделать GridRenderer, процедурные модели, OrbitControls, picking.
- Реализовать UI/инструменты, подсветки, tutorial, HUD, pause, settings.
- Сделать анимацию ресурсов, производственных механизмов и состояния энергии.
- Добавить E2E desktop сценарий с проверкой сохранения/загрузки.

**Definition of Done**: на PC/телефоне в обычном браузере можно построить цикл, увидеть движение предметов, заработать кредиты, удалить/повернуть оборудование, перезагрузить страницу и продолжить. Никакой зависимости от камеры.

### M3 — AR-spike: 8th Wall standalone + маркер

**Задачи**
- Локально загрузить engine binary из npm и проверить на Pages.
- Подключить Three.js pipeline, настроить `scale:'absolute'` и tracking status.
- Создать оригинальный маркер, CLI metadata, print.html, распознавание событий.
- Вывести debug-оси и один тестовый куб на обнаруженном маркере.
- Проверить отключение маркера из кадра, движение камеры, повторный запуск.
- Зафиксировать факты работы на устройствах в `docs/AR_TEST_PLAN.md`.

**Definition of Done**: опубликованная WebAR-страница показывает куб в пространстве и маркерные события. Если мобильных устройств у агента нет — пометить `PENDING PHYSICAL DEVICE VALIDATION`, не объявлять AR-spike доказанным. Переходить к интеграции можно, но final acceptance AR останется заблокированным до ручного тестирования.

### M4 — свободное размещение и гибридная привязка

**Задачи**
- Реализовать FreePlacementController с hitTest/horizontal-plane fallback.
- Реализовать AnchorManager, математику, стабильную позу, binding, relocalization, temporary placement.
- Показать 3D фабрику внутри XR scene, оформить мастер привязки.
- Запретить неверное самопроизвольное восстановление свободного якоря.
- Обработать события tracking limited/lost и rebind.

**Definition of Done**: первый запуск — свободная установка; второй — после маркера восстановление той же расстановки; без маркера не создаётся ложный anchor; все матричные unit tests и mock-relocalization проходят; реальные испытания отмечены отдельно.

### M5 — качество, оптимизация, публикация

**Задачи**
- Провести профилирование, починить leaks/дублирующиеся listeners.
- Проверить staging/pages, subpath, imports, ошибки разрешений.
- UI Polish: индикаторы, onboarding, подсказки, responsive layout.
- Добавить README с инструкцией print marker, поддерживаемыми платформами и известными ограничениями.
- Выпустить публичную ссылку и список ручных тестов для друзей.

**Definition of Done**: проверены npm install/build/test, доступность Pages и end-to-end desktop сценарий; есть честная матрица AR-тестов по реальным телефонам (либо явный `not verified`); нет критических необработанных ошибок.

### 13.1. Приоритеты при нехватке времени

Порядок сокращения: звуки → декоративные части моделей → расширенные настройки → UI-анимации. **Нельзя сокращать:** сохранение/восстановление, функциональную игровую петлю, desktop fallback, обработку AR permission/errors, корректную систему координат и тесты. Маркерный режим является ключевой технической гипотезой; если он не работает, честно зафиксировать блокер, не заменять его фиктивным сохранением world-space transform.

---

## 14. Тестовая стратегия

### 14.1. Unit tests: FactoryCore

Все перечисленные проверки автоматизированы, не зависят от real camera:

- Размещение на пустой клетке уменьшает кредиты/starter inventory ровно один раз.
- Второе здание на той же клетке отклоняется **без изменения** баланса и счётчиков.
- Отрицательные, дробные и выходящие за 10×10 координаты отклоняются.
- Первый starter-building бесплатный, повторные сверх starter — за деньги.
- Удаление starter возвращает starter item, **не** кредиты; удаление оплаченного возвращает 50%.
- Недостаток credits не создает building и не меняет state.
- Ротация +Z→+X→−Z→−X→+Z, цепочка после поворота обновляется.
- Генератор 10 энергии, extractor+processor потребляют 9 — производство возможно.
- При недостатке энергии появляется brownout и производство не идёт; после добавления генератора возобновляется.
- Одна цепочка `extractor→conveyor→processor` производит parts и credits за предсказуемое число фиксированных тиков.
- Разорванный конвейер/конвейер задом наперёд останавливает поступление сырья.
- При забитых буферах ресурсы не дублируются.
- При нескольких входах в processor конфликт разрешается стабильно, без изменения общего числа предметов.
- `pause(true)` прекращает логику, но не уничтожает state.
- Два разных FPS (30 и 60 с одинаковым суммарным sim-time) дают одинаковую логику.
- Save/load сохраняет буферы, progress, starter stock, уникальность IDs, валюту и производство.

### 14.2. Unit tests: математика AR

**Обязательные сценарии:**

1. `T_W_M = identity`, `T_W_F = translation(0.3,0,0.4)` → `T_M_F` равен ожидаемому.
2. Маркер повернут вокруг Y на 90°, завод сдвинут/повёрнут; `composePose(M, relativePose(M,F))` возвращает исходный `F` с `epsilon <= 1e-5`.
3. Случайный тест 100 позиций/quaternion: `T_W_M * inverse(T_W_M) * T_W_F ≈ T_W_F` (с фиксированным seed).
4. Неправильный порядок quaternion `{w,x,y,z}` → `x,y,z,w` ловится специальным тестом с ненулевым `w` и ненулевой осью.
5. После новой `T_W_M` при прежнем `T_M_F` восстановленный корень корректно переходит в новую world-систему.
6. Матрица с non-unit scale не допускается в сохраняемый `RigidPose` либо нормализуется по документированному правилу.
7. `MarkerPoseFilter` не принимает единичный всплеск, ошибочное имя, NaN, устаревшую позу, недостаток обновлений.
8. При `SLAM=LIMITED` запретить binding, но не терять уже сохранённый anchor.
9. В новом сеансе unbound factory не получает автоматически старый world transform.
10. В `temporary` anchor V1 не перезаписывается даже после autosave.

### 14.3. UI/E2E в mock и 3D

Использовать Playwright с viewport desktop и типовым мобильным viewport. Mock AR adapter подать через явный dependency injection test entry или feature flag `?mockAR=1` **только для e2e/debug**, исключить из обычного пользовательского маршрута.

- Старт → 3D → размещение стартового комплекта → запуск → рост credits.
- Конвейер неправильной ориентации → output=0; исправление → output>0.
- Пауза/resume.
- Сохранение → reload → те же здания и деньги.
- Экспорт → сброс → импорт → восстановление.
- Повреждённое localStorage → recovery screen, без uncaught exception.
- Mock: free placement → stable marker → binding → reload mock world с другим origin → успешная relocalization.
- Mock: marker не найден → screen не показывает завод в якобы правильном AR месте, но доступен 3D.
- Mock: tracking limited/lost → монтаж заблокирован, затем восстановлен.
- UI на 390×844 и 844×390 не перекрывает критические controls; safe-area есть.

### 14.4. Ручной AR-тест: матрица

Заполнить таблицу в `docs/AR_TEST_PLAN.md`:

| Устройство | ОС | Браузер | Permission | SLAM | Image target | Bind/restart | FPS | Notes |
|---|---|---|---|---|---|---|---|---|
| iPhone (реальное устройство) | версия | Safari версия | pass/fail | pass/fail | pass/fail | pass/fail | измерено | ... |
| Android (реальное устройство) | версия | Chrome версия | pass/fail | pass/fail | pass/fail | pass/fail | измерено | ... |

**Минимальные физические сценарии:**

- A: маркер лежит на столе, положен правильно, светлое помещение; binding → закрыть браузер/вкладку → вновь открыть URL → отсканировать → сравнить с физическим контрольным углом.
- B: отойти/обойти завод на 90–180°, скрыть маркер из кадра на 15–30 с → проверить устойчивость.
- C: снова показать маркер → измерить величину коррекции и наличие визуальных рывков.
- D: открыть сайт со слабым светом, текстурно-бедной плоскостью и бликами → проверить честное сообщение об ограничениях.
- E: перезапуск без карточки → завод **не возникает случайно**, есть 3D и ручной fallback.
- F: убрать физический маркер на 10 см после привязки → зафиксировать, что виртуальная позиция следует **новой** позиции маркера; предупреждение в UX; не обещать неизменности.
- G: сменить ориентацию телефона, свернуть приложение, вернуть → проверить восстановление без двойных canvas.
- H: отсутствие камеры / отказ permission / CDN-runtime ошибка → 3D fallback.
- I: проверка точности при 5–10 последовательных перезапусках: записывать медиану, худший случай и типичное отклонение (см + градусы).

**Протокол ошибки:** закрепить физическую точку на столе (риска/линейка), для каждого повторного запуска снять положение угла виртуальной платформы относительно риски и записать расстояние. Без пользовательских замеров нельзя писать в README «точность 5 см».

### 14.5. Регрессии и качество

- `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` — без ошибок.
- Проверить source maps только если не нарушают безопасную публичную конфигурацию.
- В консоли не должно быть необработанных promise rejections, неконтролируемого spam `onUpdate`, постоянной пересборки сцены.
- Несколько последовательных переходов в 3D не должны накапливать listeners/WebGL объекты.
- Проверить страницу с заблокированным localStorage, offline after load (3D должен работать из кэша браузера по возможности, полноценное offline-PWA не обязательно), отсутствующим script/chunk.
- Не считать эмулятор телефона доказательством реальной поддержки iOS Safari.

---

## 15. Приёмочные критерии (Definition of Done для всего MVP)

### P0 — MUST (без этого задача не завершена)

- [ ] Отдельный TypeScript-репозиторий с `SPEC.md`, README, запуском `npm ci / dev / build / test`.
- [ ] Полностью доступный самостоятельный **3D-режим**, где можно строить и запускать экономическую цепь.
- [ ] Четыре работоспособных модуля с правилами из раздела 6, управлением, ценами, буферами и визуально движущимися предметами.
- [ ] Валидный редактируемый завод 10×10, grid picking, понятный HUD, tutorial.
- [ ] Версионированное сохранение, восстановление, импорт/экспорт, обработка повреждённой записи.
- [ ] Реально подключённый `@8thwall/engine-binary` с world tracking в отдельном адаптере; обработка permission/unsupported и fallback.
- [ ] Подключены image target metadata и события `imagefound`/`imageupdated`/`imagelost`.
- [ ] Free placement и **реальная формула** marker-relative binding/restoration, тесты matrix math.
- [ ] Нет ложного обещания persistent world anchor без маркера: bound требует relocalization, unbound требует повторного размещения.
- [ ] State machine отслеживает loss/limited/relocalization, учитывает невозможность трекинга.
- [ ] Продакшн-build под subpath GitHub Pages, рабочий GitHub Actions pipeline; assets XR и маркера публикуются корректно.
- [ ] Сохранены лицензии/атрибуция 8th Wall, не копируются чужие необязательные модели и бренды.
- [ ] Unit tests для экономики, конвейеров, сохранения, координат и фильтра маркера.
- [ ] Есть инструкция печати карточки и контрольного тестирования на реальном телефоне.
- [ ] Ни один неизвестный SDK API не выдан за подтверждённый: неверифицированные места обозначены `TODO: verify on device` с трассировкой.

### P1 — SHOULD

- [ ] Плавная коррекция небольшого drift при повторном появлении маркера.
- [ ] Диагностика FPS/draw calls/pose error в debug panel.
- [ ] Процедурные модели со световыми индикаторами и анимациями.
- [ ] Full mobile UX с безопасными зонами, поворотом экрана и разумными touch targets.
- [ ] Desktop Playwright smoke test и тест marker relocalization в mock.

### P2 — NICE TO HAVE

- [ ] Декоративные частицы при переработке, деликатные звуки.
- [ ] Система достижений, несколько цветовых тем, скриншот-захват по нажатию.
- [ ] Более подробные performance metrics и график FPS.

**Статус приёмки:** `CODE-COMPLETE` (логика, рендер, тесты, сборка работают) отличается от `AR-DEVICE-VERIFIED` (пройдены реальные тесты с камерой). Нельзя маркировать второе, если разработчик/агент видел только desktop/mock. Если из-за SDK несовместимости AR не заработал, задача остаётся с открытым P0-блокером, даже если desktop-игра готова.

---

## 16. Инженерные риски и правила принятия решений

| Риск | Вероятность / влияние | Действие |
|---|---|---|
| SLAM нормальный в одной сессии, но не восстанавливает координаты после reload | ожидаемое ограничение / высокое | marker-relative transform; запрет fake persistent anchor |
| Изображение плохо распознаётся | средняя / высокое | уникальный рисунок, корректный physical target, стабильные samples, повторный print/test |
| 8th Wall runtime не работает в конкретном браузере | неизвестная / высокое | AR spike, docs/API checks, fallback 3D |
| Масштаб/ориентация image pose некорректны | средняя / высокое | абсолютный масштаб, маркер линейкой, тест перестановки quaternion, явные оси |
| Стол не распознан native hitTest | высокая / среднее | ручная горизонтальная плоскость/регулировка высоты |
| При смене положения камеры AR плавно дрейфует | средняя / среднее | камера/world tracking status, повторное измерение target и коррекция |
| Mobile GPU загружается из-за 3D объектов | средняя / среднее | упрощённые материалы, throttling DPR, reuse geometry, без теней/depth ML |
| localStorage очищен | средняя / среднее | экспорт/импорт и предупреждение о локальном хранении |
| Ресурсы XR отсутствуют под GH Pages subpath | средняя / высокое | verify-dist, smoke test deployed URL |
| Маркер перемещён человеком | высокая / среднее | предупреждение, rebind flow, не обещать абсолютное место |
| Права на XR runtime/ассеты | высокое влияние | проверить текущую лицензию и notices до публикации |

**Правило реализации:** сначала подтверждать на устройстве гипотезы SDK, затем строить над ними UX. Если API 8th Wall не даёт нужной функции, допустима адаптация алгоритма и README с объяснением, но нельзя подменять feature mock-данными в production или удалять ключевое требование без отчёта.

---

## 17. Что именно агент должен передать в конце работы

1. **Исходный код** со структурой из раздела 3, рабочими npm scripts и package-lock.
2. **README.md**, содержащий установку, запуск на компьютере, HTTPS-доступ с телефона, dev/prod URLs, ссылки на docs, распечатку/использование карточки, ограничения и советы по трекингу.
3. **Публичную ссылку GitHub Pages**, **если** агент располагает разрешённым доступом к репозиторию и публикация реально выполнена; иначе полностью готовый workflow и инструкции владельцу в три шага. Нельзя сочинять URL и утверждать, что deployment состоялся.
4. `docs/IMPLEMENTATION_LOG.md`: что написано, номера коммитов (если доступны), точные версии пакетов, ключевые решения, известные проблемы.
5. `docs/AR_TEST_PLAN.md`: проверенные устройства/результаты и статусы `passed / failed / not tested`; отдельная таблица relocalization accuracy.
6. `docs/ACCEPTANCE.md`: пункты P0/P1/P2 с честным статусом и ссылкой на код/тест для каждого.
7. `docs/TROUBLESHOOTING.md`: как лечить отказ камеры, низкий FPS, потерю SLAM, непечатаемый target и GH Pages 404.
8. Печатный image target и обработанные image target файлы, которые действительно работают с выбранным движком (или ясное описание P0-блокера, если физическая проверка не сделана).
9. Общее тестовое резюме: `typecheck`, `unit tests`, `build`, `desktop e2e`, `mobile AR` — отдельные статусы; не скрывать неуспехи.
10. Короткое демонстрационное описание сценария: «войти → поставить цепочку → обработать 3 ore → перезагрузить → отсканировать тот же marker → продолжить».

### Форма итогового отчёта агента

```markdown
## Что готово
- ...

## Проверки
- npm run typecheck: PASS/FAIL (реально запущено?)
- npm run test: PASS/FAIL
- npm run build: PASS/FAIL
- Playwright desktop: PASS/FAIL/NOT RUN
- iOS Safari device: PASS/FAIL/NOT TESTED
- Android Chrome device: PASS/FAIL/NOT TESTED
- Marker relocalization physical test: PASS/FAIL/NOT TESTED

## Публикация
- Репозиторий: <реальный URL либо 'не опубликован'>
- GitHub Pages: <реальный URL либо 'не опубликован'>

## Блокеры, ограничения и дальнейшие шаги
- ...
```

---

## 18. Инструкция агенту на первое выполнение (можно копировать прямо в Codex)

> Прочитай `SPEC.md` полностью и выполни его как технический контракт. Твоя задача — полноценное MVP AR factory-builder для GitHub Pages, а не 3D макет. Сначала изучи указанные upstream-файлы `YAKKUZA13/bulgakov_game`, официальные docs 8th Wall и лицензию. Раздели FactoryCore, Renderer, TrackingPort/8th Wall и AnchorManager. Начни с работающих unit tests для deterministic FactoryCore и матричной логики; затем обеспечь полноценный desktop 3D gameplay. Только после этого подключай AR и печатный image target, реализуй `T_M_F = inverse(T_W_M) * T_W_F` и честное восстановление после повторного сканирования. Пройди milestone M0…M5; не удаляй критичные требования ради скорости. Автоматизируй build/test/deploy для GitHub Pages. Все вызовы SDK сверяй с текущей версией, не выдумывай методы, не выдавай mock или desktop-эмуляцию за настоящий SLAM. Перед завершением заполни `docs/ACCEPTANCE.md`, `docs/AR_TEST_PLAN.md` и `docs/IMPLEMENTATION_LOG.md`, явно отделив проведённые проверки от требующих физического смартфона. Если у тебя есть право создавать коммиты — делай логичные атомарные коммиты после milestone; если нет — оставь полностью готовые изменения в рабочей директории.

---

## 19. Контрольная памятка владельцу проекта: как отдать друзьям на тест

1. После успешного `M5` получить рабочую GitHub Pages HTTPS-ссылку и убедиться, что она открывается на **реальном телефоне**.
2. Напечатать marker через `/marker/room-factory-marker-print.html` при масштабе 100%, положить на стол и **не двигать после привязки**. Маленький QR-код для входа в игру можно добавить рядом, но он не должен уничтожать уникальную картинку image target.
3. Попросить тестера открыть URL, разрешить камеру, поставить завод, разместить из стартового набора генератор + добытчик + минимум 1 конвейер + переработчик, дождаться дохода, закрепить завод карточкой.
4. Закрыть вкладку, запустить вновь, навести на **тот же** marker и сравнить положение завода с местом до закрытия.
5. В тест-форме собирать **не** личные данные, а модель смартфона, ОС/браузер, работала ли камера, работал ли маркер, было ли смещение, FPS по ощущениям/diagnostics, удалось ли получить первую деталь.
6. Если iOS/Android AR отказал, предложить 3D-режим и запросить диагностический отчёт с явного согласия пользователя.

**После MVP:** только на основе измерений рассматривать безмаркерную визуальную релокализацию, VPS-аналог, локальную 3D-карту комнаты, occlusion с Depth Anything и синхронизацию заводов через backend. Эти направления не являются частью первой реализации.

---

## 20. Источники и границы достоверности

Официальные страницы и репозиторий проекта были проверены при подготовке спецификации **26 октября 2026 года**. API, версии npm, лицензии и поддержка браузеров могут меняться, поэтому агент обязан перепроверить их перед реальной сборкой.

- `bulgakov_game`: <https://github.com/YAKKUZA13/bulgakov_game>
- `bootstrap.ts`: <https://raw.githubusercontent.com/YAKKUZA13/bulgakov_game/main/src/8thwall/bootstrap.ts>
- `game-pipeline.ts`: <https://raw.githubusercontent.com/YAKKUZA13/bulgakov_game/main/src/8thwall/game-pipeline.ts>
- `hit-test.ts`: <https://raw.githubusercontent.com/YAKKUZA13/bulgakov_game/main/src/8thwall/hit-test.ts>
- 8th Wall standalone engine binary: <https://github.com/8thwall/engine>
- 8th Wall overview / loading: <https://8thwall.org/docs/engine/overview>
- XR Controller configuration: <https://8thwall.org/docs/api/engine/xrcontroller/configure>
- Pipeline events/tracking status: <https://8thwall.org/docs/api/engine/xrcontroller/pipelinemodule>
- Three.js XR scene: <https://8thwall.org/docs/api/engine/threejs/xrscene>
- Image target CLI: <https://github.com/8thwall/8thwall/blob/main/apps/image-target-cli/README.md>
- XR Engine License: <https://github.com/8thwall/engine/blob/main/LICENSE>
- GitHub Pages actions: <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>

**Заключительное правило:** когда документация или поведение конкретного телефона расходятся с этой спецификацией, фиксировать воспроизводимое расхождение и предлагать минимальное технически корректное изменение. Конечный критерий качества — реальная работоспособность и измеряемое AR-восстановление, а не соответствие одной красивой демонстрации.
