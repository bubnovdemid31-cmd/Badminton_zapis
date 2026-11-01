import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { databaseUrl } from "../src/database-path.js";
export async function migrate() {
  const client = createClient({ url: databaseUrl, concurrency: 1 });
  try {
    await client.execute("PRAGMA journal_mode=WAL");
    await client.execute("PRAGMA foreign_keys=ON");
    await client.execute("PRAGMA busy_timeout=5000");
    const root = path.resolve("backend/prisma/migrations");
    for (const dir of (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(
          path.join(root, dir.name, "migration.sql"),
          "utf8",
        ),
        checksum = createHash("sha256").update(sql).digest("hex");
      // BEGIN IMMEDIATE prevents parallel migrators from applying the same file.
      const tx = await client.transaction("write");
      try {
        await tx.execute(
          'CREATE TABLE IF NOT EXISTS "_ClubMigration" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, "appliedAt" INTEGER NOT NULL)',
        );
        const old = await tx.execute({
          sql: 'SELECT checksum FROM "_ClubMigration" WHERE name=?',
          args: [dir.name],
        });
        if (old.rows.length) {
          if (old.rows[0].checksum !== checksum)
            throw new Error("Применённая миграция изменена: " + dir.name);
        } else {
          await tx.executeMultiple(sql);
          await tx.execute({
            sql: 'INSERT INTO "_ClubMigration" (name,checksum,"appliedAt") VALUES (?,?,?)',
            args: [dir.name, checksum, Date.now()],
          });
          console.log("Применена миграция: " + dir.name);
        }
        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      } finally {
        tx.close();
      }
    }
    console.log("SQLite: миграции актуальны");
  } finally {
    client.close();
  }
}
await migrate();
