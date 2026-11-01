import { db, atomic, settings } from "../src/db.js";
import clubInfo from "../club-info.json" with { type: "json" };
try {
  await atomic(async (tx) => {
    const club = await settings(tx);
    if (!club.publicInfo)
      await tx.settings.update({
        where: { id: "club" },
        data: { publicInfo: clubInfo },
      });
    for (const venue of clubInfo.venues)
      await tx.venue.upsert({
        where: { id: venue.id },
        create: venue,
        update: {},
      });
    for (const [id, name] of [
      ["club-polina-t", "Полина Т."],
      ["club-darya-t", "Дарья Т."],
      ["club-georgy-b", "Георгий Б."],
      ["club-polina-d", "Полина Д."],
    ])
      await tx.trainer.upsert({
        where: { id },
        create: { id, name, bio: "Тренер клуба VLAD SMASH." },
        update: {},
      });
  });
  console.log(
    "Данные клуба готовы: площадки, тренеры, цены и недельное расписание. Занятия для записи администратор публикует с конкретными датами и кортами.",
  );
} finally {
  await db.$disconnect();
}
