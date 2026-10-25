# 🚀 Как собрать TERRALITE под Windows и Linux

Эта игра — веб-приложение (React + Vite), которое собирается в один `dist/index.html`.
Чтобы сделать из него полноценную программу (.exe для Windows и AppImage/deb для Linux),
нужна **оболочка** (wrapper) — рекомендуется **Tauri**.

---

## 🧠 Главное правило кросс-платформы

**Нативный webview каждой ОС отличается**, поэтому сборку под каждую систему
надо делать **«свой-к-своему»** (Windows-сборку — на Windows, Linux-сборку — на Linux).

Два пути:

1. **GitHub Actions (рекомендуется)** — бесплатно, автоматически, в облаке.
   Пушнешь тег `v1.0.0` → получишь готовые `.exe` и `.AppImage` в Releases. ✅
2. **Локально** — нужно собирать на каждой ОС отдельно (или ставить виртуалки).

---

## ✅ Вариант A: Tauri (рекомендуется — лёгкий, ~5–10 МБ)

### 1. Установи Rust
- **Windows**: скачай с https://rustup.rs (нужен ещё Visual Studio C++ Build Tools)
- **Linux**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### 2. Линукс-зависимости (только на Linux)
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### 3. Добавь Tauri в проект
```bash
npm install -D @tauri-apps/cli@latest
npx tauri init
```
При инициализации укажи:
- **frontend dev/build command**: `npm run dev` / `npm run build`
- **frontend dist**: `../dist`
- **app name**: `Terralite`

### 4. Проверь локально
```bash
npx tauri dev      # запустить в окне
npx tauri build    # собрать установщик для текущей ОС
```
- На **Windows** → `src-tauri/target/release/bundle/` появится `.msi` и `.exe`
- На **Linux** → появится `.AppImage`, `.deb`

### 5. Автосборка под обе ОС (через GitHub Actions)
Используй файл `.github/workflows/build.yml` (уже создан в проекте).
Просто закинь код на GitHub и создай тег:
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub сам соберёт обе версии и положит их в раздел **Releases**. 🎉

---

## ✅ Вариант B: Electron (проще в настройке, но тяжелее ~80–150 МБ)

```bash
npm install -D electron electron-builder
```

Добавь в `package.json`:
```json
"main": "main.js",
"scripts": {
  "dist": "electron-builder"
},
"build": {
  "appId": "com.yourname.terralite",
  "files": ["dist/**/*", "main.js"],
  "win": { "target": ["nsis"] },
  "linux": { "target": ["AppImage", "deb"] }
}
```

Создай `main.js` (загрузчик окна):
```js
const { app, BrowserWindow } = require("electron");
const path = require("path");
function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 720 });
  win.loadFile(path.join(__dirname, "dist", "index.html"));
}
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
```

Сборка под текущую ОС:
```bash
npm run build      # сначала веб-билд (vite)
npm run dist       # electron-builder
```
GitHub Actions для Electron — аналогичный (см. ниже).

---

## ☁️ Почему GitHub Actions — лучший выбор

- **Бесплатно** для публичных репозиториев (2000 минут/мес)
- **Не нужен** второй компьютер или виртуалка
- **Воспроизводимо**: одна кнопка → обе версии готовые
- Готовые файлы сразу лежат в **Releases** — удобно для Steam/itch.io

---

## 🎮 Дальше — в Steam

Когда у тебя есть собранные `.exe` (Windows) и `.AppImage`/`.deb` (Linux):
1. Залей их на **Steamworks** через **SteamPipe**
2. Укажи оба депо (Windows + Linux) — Steam сам отдаст игроку нужную версию
3. Steam Deck (Linux!) — огромная аудитория для инди-игр ✅

---

## ⚠️ Что НЕЛЬЗЯ сделать в этом редакторе
- Установить Rust / Tauri / Electron (нет доступа к системе)
- Запустить `tauri build` (только `npm run build`)
- Кросс-скомпилировать

Поэтому: бери эти файлы, повтори шаги на своём ПК — и всё заработает.
Файл `.github/workflows/build.yml` уже готов к использованию.
