import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
export function sqlitePath(
  value = process.env.DATABASE_URL ?? "file:./data/club.db",
) {
  if (
    !value.startsWith("file:") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes(":memory:")
  )
    throw new Error(
      "Используется SQLite. Замените DATABASE_URL в .env на file:./data/club.db. PostgreSQL-данные автоматически не импортируются.",
    );
  const result = value.startsWith("file://")
    ? fileURLToPath(value)
    : path.resolve(value.slice(5));
  mkdirSync(path.dirname(result), { recursive: true });
  return result;
}
process.env.DATABASE_URL ??= "file:./data/club.db";
export const databasePath = sqlitePath();
// libsql 0.8 (used by Prisma 6) expects C:/... rather than /C:/... on Windows.
const fileUrl = pathToFileURL(databasePath).href;
export const databaseUrl =
  process.platform === "win32"
    ? fileUrl.replace(/^file:\/\/\//, "file:")
    : fileUrl;
