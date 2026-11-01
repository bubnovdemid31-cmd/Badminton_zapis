import "dotenv/config";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
// SQL is generated from Prisma and versioned under prisma/migrations. Applying it
// through pg avoids an external native-engine download in restricted hosts.
export async function migrate() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(48172932)");
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_ClubMigration" (name text PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now())',
    );
    const root = path.resolve("prisma/migrations");
    for (const dir of (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(
          path.join(root, dir.name, "migration.sql"),
          "utf8",
        ),
        checksum = createHash("sha256").update(sql).digest("hex");
      const old = await client.query(
        'SELECT checksum FROM "_ClubMigration" WHERE name=$1',
        [dir.name],
      );
      if (old.rows.length) {
        if (old.rows[0].checksum !== checksum)
          throw new Error("Применённая миграция изменена: " + dir.name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "_ClubMigration" (name,checksum) VALUES ($1,$2)',
          [dir.name, checksum],
        );
        await client.query("COMMIT");
        console.log("Применена миграция: " + dir.name);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("Миграции актуальны");
  } finally {
    await client.end();
  }
}
await migrate();
