import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export const db = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { onPoolError: () => console.error("Database connection interrupted") },
  ),
});
export type Tx = Prisma.TransactionClient;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
// One short transaction lock serializes all capacity/schedule mutations, including
// across multiple API instances. No network requests or password hashing inside it.
export async function atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(48172931)`;
      return fn(tx);
    },
    { maxWait: 15000, timeout: 15000 },
  );
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
