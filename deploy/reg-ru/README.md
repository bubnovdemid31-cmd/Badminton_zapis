# REG.RU — сайт

Команды запускайте из корня репозитория, где находится `package.json`.

1. Сначала разместите API на Amvera и получите его HTTPS-адрес.
2. Подставьте настоящий адрес API и соберите пакет:

```powershell
$env:VITE_API_URL="https://api.ТВОЙ-ДОМЕН.ru"
npm run package:reg-ru
```

На Linux/macOS: `VITE_API_URL=https://api.ТВОЙ-ДОМЕН.ru npm run package:reg-ru`.

3. Появится `deploy/reg-ru/site/`:

```text
site/
├── index.html
├── assets/              Все JS, CSS и файлы шрифтов
├── court.svg
├── club-symbols.ttf
├── Golos-Text-OFL.txt
└── ARTWORK.md
```

4. Загрузите **содержимое `site/`**, включая все файлы `assets/`, в публичную папку домена на REG.RU. `index.html` должен лежать в корне сайта. Имя публичной папки смотрите в панели вашего хостинга.

`site/` генерируется заново и не хранится в Git. Не редактируйте его вручную: исходники находятся в `frontend/`. При изменении адреса API или кода сайта повторите сборку и загрузку.

На REG.RU не загружаются `.env`, `data/`, `backend/`, `node_modules/` и Dockerfile.
