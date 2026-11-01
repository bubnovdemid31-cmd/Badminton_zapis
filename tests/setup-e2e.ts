import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.endsWith("/browser-test.db"))
    throw new Error("Browser tests require their own browser-test.db");
  const filename = fileURLToPath(url);
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(filename + suffix, { force: true });
  for (const script of [
    "backend/scripts/migrate.ts",
    "backend/prisma/seed.ts",
  ]) {
    const r = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", script],
      { env: process.env, stdio: "inherit" },
    );
    if (r.status !== 0) throw new Error("Browser fixture setup failed");
  }
  const { db } = await import("../backend/src/db.js");
  try {
    await db.court.create({
      data: { id: "e2e-court", name: "Тестовый зал", venueId: "club-youth" },
    });
    const startsAt = new Date(Date.now() + 48 * 3600000);
    await db.session.create({
      data: {
        id: "e2e-session",
        startsAt,
        endsAt: new Date(+startsAt + 5400000),
        trainerId: "club-polina-t",
        courtId: "e2e-court",
        format: "GROUP",
        level: "BEGINNER",
        price: 65000,
        capacity: 26,
      },
    });
  } finally {
    await db.$disconnect();
  }
}
