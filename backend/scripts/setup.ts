import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
if (process.env.NODE_ENV === "production")
  throw new Error(
    "setup предназначен для локальной разработки. В production задайте переменные в настройках хостинга и выполните db:migrate.",
  );
let text = existsSync(".env")
  ? readFileSync(".env", "utf8")
  : readFileSync(".env.example", "utf8");
let values = parse(text);
if (values.NODE_ENV === "production")
  throw new Error(
    "Для production используйте db:migrate: setup добавляет демоданные и предназначен для локальной разработки.",
  );
if (
  values.DATABASE_URL?.startsWith("postgresql:") ||
  values.DATABASE_URL?.startsWith("postgres:")
) {
  const backup = ".env.postgresql-" + Date.now() + ".bak";
  copyFileSync(".env", backup);
  text = text
    .replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL="file:./data/club.db"')
    .replace(/^POSTGRES_PASSWORD=.*\r?\n?/m, "");
  console.log(
    "Подключение переключено на SQLite. Прежний .env сохранён в " +
      backup +
      ". Данные PostgreSQL не изменены и не импортированы.",
  );
}
values = parse(text);
if (!values.DATABASE_URL) text += '\nDATABASE_URL="file:./data/club.db"\n';
if (
  !values.SESSION_SECRET ||
  values.SESSION_SECRET.startsWith("GENERATE_") ||
  values.SESSION_SECRET.length < 32
) {
  const line = 'SESSION_SECRET="' + randomBytes(48).toString("hex") + '"';
  text = /^SESSION_SECRET=/m.test(text)
    ? text.replace(/^SESSION_SECRET=.*$/m, line)
    : text + "\n" + line + "\n";
}
writeFileSync(".env", text, { mode: 0o600 });
const env = { ...process.env, ...parse(text) };
for (const command of [
  [
    "node_modules/prisma/build/index.js",
    "generate",
    "--config",
    "backend/prisma.config.ts",
  ],
  ["node_modules/tsx/dist/cli.mjs", "backend/scripts/migrate.ts"],
  ["node_modules/tsx/dist/cli.mjs", "backend/prisma/seed.ts"],
]) {
  const result = spawnSync(process.execPath, command, {
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Готово! База SQLite создана, .env настроен. Администратор: npm run admin:create. Запуск: npm run dev.",
);
