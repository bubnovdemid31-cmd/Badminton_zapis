# Клуб бадминтона

React-сайт, Node.js-сервер и SQLite. PostgreSQL и Docker для запуска на ПК не нужны.

## Где что лежит

```text
Badminton_zapis/
├── frontend/                 Исходники сайта
│   ├── src/                  Страницы, формы, стили
│   ├── public/               Иллюстрации, шрифты, лицензии
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── backend/                  Сервер для Amvera
│   ├── src/                  API, авторизация, запись, SQLite-сессии
│   ├── prisma/               Модели, SQL-миграции, демоданные
│   ├── scripts/              Настройка, миграции, создание администратора
│   ├── tests/                Серверные тесты
│   ├── prisma.config.ts
│   └── tsconfig.json
├── deploy/                   Подготовка к хостингу
│   ├── reg-ru/               Инструкция и упаковка сайта для REG.RU
│   │   └── site/             Появится после npm run package:reg-ru
│   └── amvera/               Dockerfile и инструкция для Amvera
├── tests/                    Браузерные проверки компьютера и телефона
│   ├── e2e/
│   └── playwright.config.ts
├── docs/                     Полная инструкция запуска и размещения
├── .github/workflows/        Автоматические проверки GitHub
├── package.json              Общие команды и зависимости
├── package-lock.json
├── .env.example              Образец настроек без секретов
├── .gitignore
├── .dockerignore
└── README.md
```

`data/` (SQLite), `.env`, `node_modules/`, `dist/` и собранный `deploy/reg-ru/site/` — локальные файлы, они не загружаются в GitHub. Существующая база `data/club.db` и настройки `.env` остаются на прежнем месте.

## Запуск на ПК

Все команды выполняйте **из корня репозитория**, не из `frontend/` или `backend/`:

```powershell
git pull --ff-only
npm ci --ignore-scripts
npm run setup
npm run admin:create
npm run dev
```

Требуется Node.js 22.12+. Откройте **http://localhost:5173**. Если администратор уже создан, повторять `admin:create` не нужно. При последующих запусках достаточно `npm run dev`.

## Что загружать на хостинг

- **REG.RU:** [инструкция](deploy/reg-ru/README.md). Команда `npm run package:reg-ru` собирает сайт в `deploy/reg-ru/site/`. На хостинг загружайте только **содержимое этой папки**.
- **Amvera:** [инструкция](deploy/amvera/README.md). Подключите **весь GitHub-репозиторий**, выберите Dockerfile `deploy/amvera/Dockerfile` и контекст сборки `.` (корень). Серверу нужен постоянный диск `/data` для SQLite.

Исходники `frontend/` нельзя просто загрузить вместо собранного сайта. Файл базы, `.env` и исходники сервера не должны лежать в публичной папке REG.RU.

## Проверки

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Подробности о функциях, настройках, SQLite, миграциях, резервных копиях и границах версии: [docs/SETUP.md](docs/SETUP.md).
