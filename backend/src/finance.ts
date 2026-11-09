import { z } from "zod";
import { admin, atomic, audit, AppError, type Actor, type Tx } from "./db.js";
export const adjustmentInput = z.object({
  amount: z
    .number()
    .int()
    .min(-100000000)
    .max(100000000)
    .refine((v) => v !== 0),
  reason: z.string().trim().min(3).max(500),
  method: z.enum(["CASH", "TRANSFER", "CORRECTION", "REFUND"]),
  operationKey: z.string().uuid(),
});
export async function ledger(
  tx: Tx,
  actorId: string,
  userId: string,
  amount: number,
  kind: string,
  reason: string,
  method: string,
  operationKey: string,
) {
  const previous = await tx.ledgerEntry.findUnique({ where: { operationKey } });
  if (previous) {
    if (
      previous.userId !== userId ||
      previous.amount !== amount ||
      previous.reason !== reason ||
      previous.method !== method ||
      previous.actorId !== actorId
    )
      throw new AppError(
        "Ключ операции уже использован с другими данными",
        409,
      );
    return previous;
  }
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Участник не найден", 404);
  const balanceAfter = user.balance + amount;
  if (
    !Number.isSafeInteger(balanceAfter) ||
    Math.abs(balanceAfter) > 2000000000
  )
    throw new AppError("Превышен допустимый размер баланса");
  await tx.user.update({
    where: { id: userId },
    data: { balance: balanceAfter },
  });
  const entry = await tx.ledgerEntry.create({
    data: {
      userId,
      amount,
      balanceAfter,
      kind,
      reason,
      method,
      actorId,
      operationKey,
    },
  });
  await audit(tx, actorId, "BALANCE_OPERATION", entry.id, {
    userId,
    amount,
    balanceAfter,
    reason,
    method,
  });
  return entry;
}
export async function adjustBalance(
  actor: Actor,
  userId: string,
  input: z.infer<typeof adjustmentInput>,
) {
  admin(actor);
  if (
    (input.method === "CASH" ||
      input.method === "TRANSFER" ||
      input.method === "REFUND") &&
    input.amount < 0
  )
    throw new AppError(
      "Для пополнения или возврата укажите положительную сумму",
    );
  return atomic((tx) =>
    ledger(
      tx,
      actor.id,
      userId,
      input.amount,
      input.method === "CORRECTION"
        ? "CORRECTION"
        : input.method === "REFUND"
          ? "REFUND"
          : "TOPUP",
      input.reason,
      input.method,
      input.operationKey,
    ),
  );
}
