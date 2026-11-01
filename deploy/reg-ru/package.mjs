import "dotenv/config";
import { cpSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../../", import.meta.url));
let url;
try {
  url = new URL(process.env.VITE_API_URL ?? "");
} catch {
  throw new Error(
    "Укажите HTTPS-адрес API в VITE_API_URL перед упаковкой сайта для REG.RU. Пример команды есть в deploy/reg-ru/README.md.",
  );
}
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error(
    "VITE_API_URL должен содержать только HTTPS-адрес сервера, например https://api.club.ru, без /api, паролей и параметров.",
  );
const build = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL("../../node_modules/vite/bin/vite.js", import.meta.url),
    ),
    "build",
    "--config",
    "frontend/vite.config.ts",
  ],
  { cwd: root, env: process.env, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const source = fileURLToPath(new URL("../../dist/web/", import.meta.url));
const target = fileURLToPath(new URL("./site/", import.meta.url));
// site/ is generated output only; source files are under frontend/.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(
  "Готово: загрузите содержимое deploy/reg-ru/site/ в публичную папку домена на REG.RU.",
);
