import { BookingStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db,
  atomic,
  audit,
  settings,
  AppError,
  admin,
  type Actor,
  type Tx,
} from "./db.js";
export const bookingInput = z.object({
  sessionId: z.string().min(1),
  childName: z.string().trim().min(2).max(80).optional(),
  childAge: z.coerce.number().int().min(3).max(17).optional(),
  userId: z.string().min(1).optional(),
  guestName: z.string().trim().min(2).max(100).optional(),
  guestPhone: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .regex(/^[+\d()\s-]+$/)
    .optional(),
});
export type BookingInput = z.infer<typeof bookingInput>;
const active = { status: BookingStatus.BOOKED };
const clean = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
async function eligible(
  tx: Tx,
  actor: Actor,
  input: BookingInput,
  excludeId?: string,
) {
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
  });
  if (
    !session ||
    session.cancelled ||
    !session.open ||
    +session.startsAt <= Date.now()
  )
    throw new AppError("Запись на это занятие недоступна");
  let userId: string | null = actor.id,
    guestName: string | null = null,
    guestPhone: string | null = null;
  if (actor.role === "ADMIN") {
    if (input.guestName || input.guestPhone) {
      if (!input.guestName || !input.guestPhone || input.userId)
        throw new AppError("Укажите имя и телефон гостя либо аккаунт клиента");
      userId = null;
      guestName = input.guestName;
      guestPhone = input.guestPhone;
    } else if (input.userId) userId = input.userId;
  } else if (input.userId || input.guestName || input.guestPhone)
    throw new AppError("Нельзя записывать другого клиента", 403);
  if (userId && !(await tx.user.findUnique({ where: { id: userId } })))
    throw new AppError("Клиент не найден", 404);
  if (session.format === "KIDS" && (!input.childName || !input.childAge))
    throw new AppError("Укажите имя и возраст ребёнка");
  if (session.format !== "KIDS" && (input.childName || input.childAge))
    throw new AppError("Данные ребёнка нужны только для детского занятия");
  const childName = session.format === "KIDS" ? input.childName! : null;
  const childAge = session.format === "KIDS" ? input.childAge! : null;
  const participantKey =
    (userId ? "user:" + userId : "guest:" + guestPhone!.replace(/\D/g, "")) +
    ":" +
    (childName ? clean(childName) : "adult");
  if (
    await tx.booking.findFirst({
      where: {
        sessionId: session.id,
        participantKey,
        ...active,
        id: { not: excludeId },
      },
    })
  )
    throw new AppError("Этот участник уже записан");
  if (
    (await tx.booking.count({
      where: { sessionId: session.id, ...active, id: { not: excludeId } },
    })) >= session.capacity
  )
    throw new AppError("Свободные места закончились");
  if (
    userId &&
    (await tx.booking.findFirst({
      where: {
        userId,
        ...active,
        sessionId: { not: session.id },
        id: { not: excludeId },
        session: {
          cancelled: false,
          startsAt: { lt: session.endsAt },
          endsAt: { gt: session.startsAt },
        },
      },
    }))
  )
    throw new AppError("У клиента уже есть запись на пересекающееся занятие");
  return {
    sessionId: session.id,
    userId,
    guestName,
    guestPhone,
    childName,
    childAge,
    participantKey,
  };
}
async function ownBooking(tx: Tx, actor: Actor, id: string) {
  const booking = await tx.booking.findUnique({
    where: { id },
    include: { session: true },
  });
  if (!booking) throw new AppError("Запись не найдена", 404);
  if (actor.role !== "ADMIN" && booking.userId !== actor.id)
    throw new AppError("Доступ запрещён", 403);
  return booking;
}
async function editable(
  tx: Tx,
  actor: Actor,
  booking: Awaited<ReturnType<typeof ownBooking>>,
) {
  if (booking.status !== "BOOKED")
    throw new AppError("Запись уже завершена или отменена");
  if (actor.role !== "ADMIN") {
    const club = await settings(tx);
    if (+booking.session.startsAt - Date.now() <= club.cancelHours * 3600000)
      throw new AppError(
        "Срок самостоятельной отмены и переноса истёк. Свяжитесь с администратором.",
      );
  }
}
export async function book(actor: Actor, input: BookingInput) {
  return atomic(async (tx) => {
    const data = await eligible(tx, actor, input);
    const booking = await tx.booking.create({ data });
    await audit(tx, actor.id, "BOOKING_CREATED", booking.id, {
      sessionId: data.sessionId,
    });
    return booking;
  });
}
export async function cancelBooking(actor: Actor, id: string) {
  return atomic(async (tx) => {
    const booking = await ownBooking(tx, actor, id);
    await editable(tx, actor, booking);
    const result = await tx.booking.update({
      where: { id },
      data: {
        status: actor.role === "ADMIN" ? "CANCELLED_CLUB" : "CANCELLED_CLIENT",
      },
    });
    await audit(tx, actor.id, "BOOKING_CANCELLED", id, {
      previous: booking.status,
    });
    return result;
  });
}
export async function transferBooking(
  actor: Actor,
  id: string,
  sessionId: string,
) {
  return atomic(async (tx) => {
    const old = await ownBooking(tx, actor, id);
    await editable(tx, actor, old);
    if (old.sessionId === sessionId)
      throw new AppError("Выберите другое занятие");
    const target = await tx.session.findUnique({ where: { id: sessionId } });
    if (!target || target.format !== old.session.format)
      throw new AppError("Для переноса выберите тот же формат");
    const input = {
      sessionId,
      childName: old.childName ?? undefined,
      childAge: old.childAge ?? undefined,
      ...(actor.role === "ADMIN"
        ? {
            userId: old.userId ?? undefined,
            guestName: old.guestName ?? undefined,
            guestPhone: old.guestPhone ?? undefined,
          }
        : {}),
    };
    const data = await eligible(tx, actor, input, id);
    await tx.booking.update({
      where: { id },
      data: {
        status: actor.role === "ADMIN" ? "CANCELLED_CLUB" : "CANCELLED_CLIENT",
      },
    });
    const result = await tx.booking.create({ data });
    await audit(tx, actor.id, "BOOKING_TRANSFERRED", id, {
      from: old.sessionId,
      to: sessionId,
      newBookingId: result.id,
    });
    return result;
  });
}
export async function attendance(
  actor: Actor,
  id: string,
  status: "ATTENDED" | "MISSED",
) {
  admin(actor);
  return atomic(async (tx) => {
    const booking = await ownBooking(tx, actor, id);
    if (
      booking.status !== "BOOKED" ||
      +booking.session.endsAt > Date.now() ||
      booking.session.cancelled
    )
      throw new AppError(
        "Посещение отмечается после завершения активного занятия",
      );
    await tx.booking.update({ where: { id }, data: { status } });
    await audit(tx, actor.id, "ATTENDANCE", id, { status });
  });
}
export function privateBookingWhere(actor: Actor): Prisma.BookingWhereInput {
  return actor.role === "ADMIN" ? {} : { userId: actor.id };
}
export async function getBooking(actor: Actor, id: string) {
  return ownBooking(db, actor, id);
}
