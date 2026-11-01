import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { databaseUrl } from "./database-path.js";
class ClubSQLite extends PrismaLibSQL {
  async connect() {
    const adapter = await super.connect();
    await adapter.queryRaw({
      sql: "PRAGMA foreign_keys=ON",
      args: [],
      argTypes: [],
    });
    await adapter.queryRaw({
      sql: "PRAGMA busy_timeout=5000",
      args: [],
      argTypes: [],
    });
    return adapter;
  }
}
export const db = new PrismaClient({
  adapter: new ClubSQLite(
    { url: databaseUrl, concurrency: 1 },
    { timestampFormat: "unixepoch-ms" },
  ),
});
export const searchText = (...values: (string | null | undefined)[]) =>
  values
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .trim();
export type Tx = Prisma.TransactionClient;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
// Acquire SQLite's writer lock before reading capacity. The adapter serializes
// queries in one process; this first write also protects competing API processes.
// Retry the entire transaction only for temporary writer-lock contention.
export async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`UPDATE "WriteLock" SET value=value WHERE id=1`;
          return fn(tx);
        },
        { maxWait: 15000, timeout: 15000 },
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (
        attempt >= 8 ||
        !/SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(
          text,
        )
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 40 * (attempt + 1) + Math.random() * 30),
      );
    }
  }
}
export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entityId: string,
  details: object = {},
) {
  await tx.audit.create({
    data: {
      actorId,
      action,
      entityId,
      details: JSON.parse(JSON.stringify(details)),
    },
  });
}
export async function settings(tx: Tx | PrismaClient = db) {
  return tx.settings.upsert({
    where: { id: "club" },
    update: {},
    create: { id: "club" },
  });
}
export type Actor = { id: string; role: "CLIENT" | "ADMIN" };
export function admin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new AppError("Доступ запрещён", 403);
}
