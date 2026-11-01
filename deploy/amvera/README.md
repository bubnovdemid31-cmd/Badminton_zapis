# Amvera — Node.js и SQLite

Подключите **весь репозиторий GitHub**, а не только папку `backend/`: общие зависимости и команды лежат в корневом `package.json`.

Для Docker-сборки выберите:

- Dockerfile: `deploy/amvera/Dockerfile`;
- контекст сборки: `.` — корень репозитория;
- внутренний порт: `3001`.

Для самостоятельной проверки образа команда из корня: `docker build -f deploy/amvera/Dockerfile .`. На хостинге можно также использовать режим Node.js с командами ниже. Сам Docker на вашем ПК не требуется.

В настройках задайте:

```dotenv
DATABASE_URL=file:/data/club.db
SESSION_SECRET=СЛУЧАЙНАЯ_СТРОКА_НЕ_МЕНЕЕ_32_СИМВОЛОВ
WEB_ORIGIN=https://ТВОЙ-ДОМЕН.ru
NODE_ENV=production
PORT=3001
TRUST_PROXY=1
```

`TRUST_PROXY=1` применяется при одном доверенном reverse proxy. Подключите постоянный диск `/data`, доступный пользователю процесса на запись. Используйте один экземпляр API. Файл БД нельзя класть в публичный сайт REG.RU.

Dockerfile сам собирает приложение и применяет миграции. Для размещения в режиме Node.js:

```sh
npm ci --ignore-scripts
npm run build
node dist/backend/scripts/migrate.js && node dist/backend/src/index.js
```

Создание администратора в консоли запущенного приложения:

```sh
node dist/backend/scripts/create-admin.js
```

Для деморасписания при необходимости: `node dist/backend/prisma/seed.js`. На рабочей базе без необходимости демоданные не добавляйте.

Подключите HTTPS и адрес API, например `api.club.ru`. Проверка готовности: `/api/health`. Для доменов `club.ru` и `api.club.ru` оставьте `COOKIE_SAME_SITE=lax`.

Подробнее: [настройка и резервное копирование](../../docs/SETUP.md).
