import { z } from "zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  db,
  atomic,
  audit,
  settings,
  AppError,
  admin,
  type Tx,
  type Actor,
} from "./db.js";
export const sessionInput = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    trainerId: z.string().min(1),
    courtId: z.string().min(1),
    format: z.enum(["GROUP", "PERSONAL", "KIDS"]),
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    price: z.coerce.number().int().min(0).max(100000000),
    capacity: z.coerce.number().int().min(1).max(100),
    open: z.boolean().default(true),
    confirmParticipants: z.boolean().optional(),
  })
  .superRefine((v, c) => {
    if (v.format === "PERSONAL" && v.capacity !== 1)
      c.addIssue({
        code: "custom",
        message: "Вместимость индивидуального занятия — 1",
        path: ["capacity"],
      });
    if (
      new Date(v.endsAt) <= new Date(v.startsAt) ||
      +new Date(v.endsAt) - +new Date(v.startsAt) > 8 * 3600000
    )
      c.addIssue({
        code: "custom",
        message: "Длительность занятия должна быть от 1 минуты до 8 часов",
        path: ["endsAt"],
      });
  });
export type SessionInput = z.infer<typeof sessionInput>;
async function check(tx: Tx, input: SessionInput, id?: string) {
  const startsAt = new Date(input.startsAt),
    endsAt = new Date(input.endsAt);
  if (+startsAt <= Date.now())
    throw new AppError("Выберите будущее время занятия");
  const trainer = await tx.trainer.findUnique({
    where: { id: input.trainerId },
  });
  const court = await tx.court.findUnique({
    where: { id: input.courtId },
    include: { venue: true },
  });
  if (
    !trainer ||
    trainer.archived ||
    !court ||
    court.archived ||
    court.venue.archived
  )
    throw new AppError("Выберите действующего тренера и корт");
  if (
    await tx.session.findFirst({
      where: {
        id: { not: id },
        cancelled: false,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [{ trainerId: input.trainerId }, { courtId: input.courtId }],
      },
    })
  )
    throw new AppError("В это время тренер или корт уже занят");
  return {
    startsAt,
    endsAt,
    trainerId: input.trainerId,
    courtId: input.courtId,
    format: input.format,
    level: input.level,
    price: input.price,
    capacity: input.capacity,
    open: input.open,
  };
}
export async function saveSession(
  actor: Actor,
  input: SessionInput,
  id?: string,
) {
  admin(actor);
  return atomic(async (tx) => {
    const data = await check(tx, input, id);
    const old = id
      ? await tx.session.findUnique({
          where: { id },
          include: { bookings: { where: { status: "BOOKED" } } },
        })
      : null;
    if (id && !old) throw new AppError("Занятие не найдено", 404);
    if (old?.cancelled)
      throw new AppError("Отменённое занятие нельзя редактировать");
    const count = old?.bookings.length ?? 0;
    if (input.capacity < count)
      throw new AppError("Вместимость меньше числа активных записей");
    if (count && old?.format !== input.format)
      throw new AppError("Нельзя менять формат занятия с участниками");
    if (
      count &&
      (+old!.startsAt !== +data.startsAt || +old!.endsAt !== +data.endsAt)
    ) {
      if (!input.confirmParticipants)
        throw new AppError(
          "У занятия есть участники. Подтвердите изменение времени.",
          409,
        );
      const userIds = old!.bookings.flatMap((b) =>
        b.userId ? [b.userId] : [],
      );
      if (
        await tx.booking.findFirst({
          where: {
            userId: { in: userIds },
            status: "BOOKED",
            sessionId: { not: id },
            session: {
              cancelled: false,
              startsAt: { lt: data.endsAt },
              endsAt: { gt: data.startsAt },
            },
          },
        })
      )
        throw new AppError(
          "Новое время пересекается с другой записью участника",
        );
    }
    const session = id
      ? await tx.session.update({ where: { id }, data })
      : await tx.session.create({ data });
    await audit(
      tx,
      actor.id,
      id ? "SESSION_UPDATED" : "SESSION_CREATED",
      session.id,
      { before: old, after: data },
    );
    return session;
  });
}
export async function cancelSession(
  actor: Actor,
  id: string,
  confirmed: boolean,
) {
  admin(actor);
  return atomic(async (tx) => {
    const old = await tx.session.findUnique({ where: { id } });
    if (!old) throw new AppError("Занятие не найдено", 404);
    const count = await tx.booking.count({
      where: { sessionId: id, status: "BOOKED" },
    });
    if (count && !confirmed)
      throw new AppError(
        `У занятия ${count} записей. Подтвердите отмену.`,
        409,
      );
    await tx.booking.updateMany({
      where: { sessionId: id, status: "BOOKED" },
      data: { status: "CANCELLED_CLUB" },
    });
    await tx.session.update({
      where: { id },
      data: { cancelled: true, open: false },
    });
    await audit(tx, actor.id, "SESSION_CANCELLED", id, {
      before: old,
      affectedBookings: count,
    });
  });
}
export const seriesInput = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.coerce.number().int().min(15).max(480),
  session: z.object({
    trainerId: z.string(),
    courtId: z.string(),
    format: z.enum(["GROUP", "PERSONAL", "KIDS"]),
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    price: z.coerce.number().int().min(0),
    capacity: z.coerce.number().int().min(1).max(100),
    open: z.boolean(),
  }),
  save: z.boolean().default(false),
});
export async function series(actor: Actor, input: z.infer<typeof seriesInput>) {
  admin(actor);
  return atomic(async (tx) => {
    const club = await settings(tx);
    const start = new Date(input.from + "T00:00:00Z"),
      end = new Date(input.to + "T00:00:00Z");
    if (+end < +start || +end - +start > 180 * 86400000)
      throw new AppError("Период серии — от 1 до 181 дня");
    const candidates: SessionInput[] = [];
    const conflicts: { date: string; message: string }[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (!input.weekdays.includes(d.getUTCDay())) continue;
      const date = d.toISOString().slice(0, 10),
        startsAt = fromZonedTime(date + "T" + input.time, club.timezone),
        endsAt = new Date(+startsAt + input.duration * 60000);
      if (
        formatInTimeZone(startsAt, club.timezone, "yyyy-MM-dd'T'HH:mm") !==
        date + "T" + input.time
      ) {
        conflicts.push({
          date,
          message: "Это местное время не существует из-за перевода часов",
        });
        continue;
      }
      const parsed = sessionInput.safeParse({
        ...input.session,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      if (!parsed.success) {
        conflicts.push({ date, message: parsed.error.issues[0].message });
        continue;
      }
      try {
        await check(tx, parsed.data);
        candidates.push(parsed.data);
      } catch (e) {
        if (e instanceof AppError) conflicts.push({ date, message: e.message });
        else throw e;
      }
    }
    if (!input.save || conflicts.length)
      return { conflicts, count: candidates.length, saved: false };
    if (!candidates.length)
      throw new AppError("В выбранном периоде нет подходящих дней");
    const record = await tx.series.create({ data: {} });
    for (const item of candidates)
      await tx.session.create({
        data: { ...(await check(tx, item)), seriesId: record.id },
      });
    await audit(tx, actor.id, "SERIES_CREATED", record.id, {
      input,
      count: candidates.length,
      timezone: club.timezone,
    });
    return { conflicts: [], count: candidates.length, saved: true };
  });
}
