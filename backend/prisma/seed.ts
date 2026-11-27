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
    for (const trainer of [
      {
        id: "club-polina-t",
        name: "Тимофеева Полина Валерьевна",
        bio: "Кандидат в мастера спорта по бадминтону. Квалификация «Тренер-преподаватель».\n\nПобедитель юниорских международных турниров серии Гран-при.\nПобедитель чемпионата России среди клубных команд.\nДвукратный победитель первенств России в парном разряде.\nПобедитель и призёр всероссийских турниров.",
        phone: "+7 (966) 285-46-08",
        telegram: "VSC_Polly",
      },
      {
        id: "club-darya-t",
        name: "Трушникова Дарья Андреевна",
        bio: "Мастер спорта по бадминтону. Квалификация «Педагог по физической культуре и спорту».\n\nСеребряный призёр командного чемпионата Европы до 18 лет.\nПобедитель первенства России среди молодёжи в женском парном разряде.\nПобедитель и призёр всероссийских турниров.",
        phone: "+7 (984) 148-90-90",
        telegram: "DariaTrushnikova",
      },
      {
        id: "club-georgy-b",
        name: "Батаенков Георгий Владимирович",
        bio: "Тренер VladSmashClub.",
        phone: "+7 (953) 211-67-76",
        telegram: "goshaannn",
      },
      {
        id: "club-polina-d",
        name: "Дерюгина Полина",
        bio: "Тренер VladSmashClub.",
        phone: "+7 (914) 698-02-66",
        telegram: "Pwxxzd",
      },
    ])
      await tx.trainer.upsert({
        where: { id: trainer.id },
        create: trainer,
        update: {},
      });
  });
  console.log(
    "Данные клуба готовы: площадки, тренеры, цены и недельное расписание. Занятия для записи администратор публикует с конкретными датами и кортами.",
  );
} finally {
  await db.$disconnect();
}
