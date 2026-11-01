import { db, atomic, settings } from "../server/db.js";
import { fromZonedTime } from "date-fns-tz";
async function seed() {
  await atomic(async (tx) => {
    const club = await settings(tx);
    const trainers = [
      {
        id: "demo-trainer-anna",
        name: "Анна Соколова",
        bio: "Демонстрационный профиль. Групповые тренировки: от первых ударов до уверенных розыгрышей.",
      },
      {
        id: "demo-trainer-max",
        name: "Максим Волков",
        bio: "Демонстрационный профиль. Индивидуальная работа над техникой, координацией и тактикой игры.",
      },
      {
        id: "demo-trainer-elena",
        name: "Елена Морозова",
        bio: "Демонстрационный профиль. Знакомит детей с бадминтоном через движение, игру и командную поддержку.",
      },
    ];
    for (const t of trainers)
      await tx.trainer.upsert({ where: { id: t.id }, create: t, update: {} });
    for (const v of [
      {
        id: "demo-venue-center",
        name: "Центральный зал · демо",
        address: "Демонстрационная площадка. Адрес задаёт администратор.",
      },
      {
        id: "demo-venue-park",
        name: "Зал у парка · демо",
        address: "Демонстрационная площадка. Адрес задаёт администратор.",
      },
    ])
      await tx.venue.upsert({ where: { id: v.id }, create: v, update: {} });
    for (const [id, name, venueId] of [
      ["demo-court-1", "Корт 1", "demo-venue-center"],
      ["demo-court-2", "Корт 2", "demo-venue-center"],
      ["demo-court-3", "Корт 1", "demo-venue-park"],
    ])
      await tx.court.upsert({
        where: { id },
        create: { id, name, venueId },
        update: {},
      });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: club.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (let day = 1; day <= 6; day++)
      for (let k = 0; k < 2; k++) {
        const d = new Date(today + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + day);
        const date = d.toISOString().slice(0, 10),
          i = (day + k) % 3;
        const startsAt = fromZonedTime(
            date + (k ? "T19:00:00" : "T10:00:00"),
            club.timezone,
          ),
          endsAt = new Date(+startsAt + 90 * 60000),
          id = `demo-${date}-${k}`;
        await tx.session.upsert({
          where: { id },
          update: {},
          create: {
            id,
            startsAt,
            endsAt,
            trainerId: trainers[i].id,
            courtId: "demo-court-" + (i + 1),
            format: (["GROUP", "PERSONAL", "KIDS"] as const)[i],
            level: day % 3 === 0 ? "INTERMEDIATE" : "BEGINNER",
            capacity: i === 1 ? 1 : 8,
            price: i === 1 ? 250000 : i === 2 ? 70000 : 90000,
          },
        });
      }
  });
  console.log(
    "Демонстрационные данные готовы. Аккаунты и пароли не создавались.",
  );
}
try {
  await seed();
} finally {
  await db.$disconnect();
}
