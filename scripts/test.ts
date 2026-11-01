import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const url = new URL(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
);
if (!process.env.TEST_DATABASE_URL)
  url.pathname = url.pathname.replace(/\/$/, "") + "_test";
const name = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z0-9_]+_test$/.test(name))
  throw new Error("Для тестов нужна отдельная БД с суффиксом _test");
const control = new URL(url);
control.pathname = "/postgres";
const client = new pg.Client({ connectionString: control.toString() });
await client.connect();
try {
  if (
    !(await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
      .rowCount
  )
    await client.query('CREATE DATABASE "' + name + '"');
} finally {
  await client.end();
}
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  TEST_DATABASE_URL: url.toString(),
  NODE_ENV: "test",
};
for (const args of [
  ["scripts/migrate.ts"],
  [
    "--test",
    "--test-concurrency=1",
    ...readdirSync("tests")
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => "tests/" + f),
  ],
]) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", ...args],
    { env, stdio: "inherit" },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}
