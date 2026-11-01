import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const directory = mkdtempSync(path.join(tmpdir(), "badminton-test-"));
const url = pathToFileURL(path.join(directory, "club-test.db")).href;
const env = {
  ...process.env,
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  NODE_ENV: "test",
};
try {
  for (const args of [
    ["backend/scripts/migrate.ts"],
    [
      "--test",
      "--test-concurrency=1",
      ...readdirSync("backend/tests")
        .filter((f) => f.endsWith(".test.ts"))
        .map((f) => "backend/tests/" + f),
    ],
  ]) {
    const r = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", ...args],
      { env, stdio: "inherit" },
    );
    if (r.status !== 0) process.exitCode = r.status ?? 1;
    if (r.status !== 0) break;
  }
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
