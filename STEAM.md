# 🎮 Как выложить TERRALITE в Steam (Windows + Linux одной игрой)

## ⚠️ Главное правило
В Steam это **ОДНА игра** с **двумя депо** (depots):
- Депо 1 → сборка для Windows
- Депо 2 → сборка для Linux

Игрок покупает один раз — Steam сам отдаёт ему нужную версию.
Это правильно и так делают все кроссплатформенные игры.

---

## Шаг 0. Подготовьте сборки (это вне Steam)
У вас должны быть две собранные папки (через Tauri, см. BUILD.md):
```
C:\TerraliteBuilds\
├── windows\     ← результат `npx tauri build` на Windows (.exe + ресурсы)
├── linux\       ← результат `npx tauri build` на Linux (.AppImage + ресурсы)
├── output\      ← пустая папка (SteamPipe положит туда логи)
└── scripts\     ← .vdf конфиги (уже созданы в проекте: steam/scripts/)
```
> Файлы из `steam/scripts/` этого проекта скопируйте в `C:\TerraliteBuilds\scripts\`.

---

## Шаг 1. Зарегистрируйтесь в Steamworks ($100)
1. Идите на **partner.steamgames.com** → «Join Steamworks»
2. Заполните документы, заплатите **$100** (вернут после $1000 продаж)
3. Создайте игру: **Steamworks → Administration → «Create»** → название «TERRALITE»
4. Запишите выданный **App ID** (например, 1234560)

---

## Шаг 2. Создайте два депо
В Steamworks откройте вашу игру → **Installation** → **Depots**:
1. «Add a new depot» → имя `Windows` → тип `Content` → **создать**
   - Запишите его **Depot ID** (например, 1234561)
2. Ещё раз «Add a new depot» → имя `Linux` → **создать**
   - Запишите **Depot ID** (например, 1234562)

### ↳ Впишите эти ID в конфиги
- В `steam/scripts/app_build.vdf` → замените `"appid" "480"` на ваш App ID
- В `steam/scripts/depot_windows.vdf` → `"DepotID" "1000001"` → ваш Windows Depot ID
- В `steam/scripts/depot_linux.vdf` → `"DepotID" "1000002"` → ваш Linux Depot ID

---

## Шаг 3. Привяжите депо к платформам
В Steamworks → **Installation** → **Depots** → откройте каждое депо:
- Windows-депо → **OS** = `Windows`
- Linux-депо → **OS** = `Linux`

И включите оба депо в разделе **General** (Launch options) — добавьте конфигурации запуска:
- Windows: путь `Terralite.exe`, ОС Windows
- Linux: путь `terralite` (или AppImage), ОС Linux

---

## Шаг 4. Загрузите сборки через SteamPipe

### Вариант A — графически (проще для новичка)
1. Скачайте **SteamPipe GUI**: https://partner.steamgames.com/doc/sdk/uploading/tools
2. Введите App ID, логин Steamworks-аккаунта
3. Укажите папки со сборками → нажмите Upload

### Вариант B — через консоль (steamcmd)
1. Скачайте **steamcmd**: https://developer.valvesoftware.com/wiki/SteamCMD
2. Запустите и залогиньтесь:
   ```
   steamcmd
   login <ваш_steamworks_логин>
   ```
3. Загрузите сборку:
   ```
   run_app_build_http C:\TerraliteBuilds\scripts\app_build.vdf
   ```
4. Готово — сборки загрузятся в черновик.

> ⚠️ При первом логине Steam пришлёт код подтверждения (Steam Guard) на почту.

---

## Шаг 5. Проверьте и опубликуйте
1. Steamworks → **your app** → **Builds** — увидите загруженный билд
2. Нажмите **Set Live** → выберите ветку `default` (это публичный релиз)
3. **Скачайте свою игру из Steam** и проверьте, что запускается!
4. Заполните страницу магазина (капсулы, скриншоты, описание, ценник)
5. Отправьте на модерацию → после одобрения = релиз! 🎉

---

## 💰 Про деньги
- Steam берёт **30%** с каждой продажи
- Выплаты — **раз в месяц** на банковский счёт, указанный при регистрации
- При цене $5 вы получаете ~$3.50 с копии

## ⚠️ Честно про РФ/СНГ
- Оплата Steam для игроков из РФ сейчас затруднена
- **Вывод денег разработчику из РФ** сильно ограничен санкциями
- Реалистичный путь: юр.лицо за рубежом (Казахстан, Кипр, Грузия) + иностранный счёт
- Пока копится аудитория — публикуйтесь на **itch.io / VK Play** (бесплатно, без $100)

---

## 📁 Что есть в этом проекте (в папке steam/)
| Файл | Что это |
|---|---|
| `steam/scripts/app_build.vdf` | Главный конфиг загрузки (сюда впишите App ID) |
| `steam/scripts/depot_windows.vdf` | Описание Windows-сборки (впишите Depot ID) |
| `steam/scripts/depot_linux.vdf` | Описание Linux-сборки (впишите Depot ID) |
| `steam/steam_appid.txt` | App ID (впишите свой вместо 480) |

> 480 — это тестовый App ID от Steam (игра SpaceWar), используется только для примера.
> Обязательно замените на свой перед публикацией!
