import { money, type PublicData } from "./types";
export function ClubPrices({ data }: { data: PublicData }) {
  const info = data.club.publicInfo;
  if (!info)
    return (
      <p className="muted">Стоимость занятий уточните у администратора.</p>
    );
  return (
    <div className="formats-grid club-prices">
      {info.pricing.map((p) => {
        const venueId = info.venues.find((venue) => venue.name === p.venue)?.id;
        const filters = new URLSearchParams({ format: p.format });
        if (venueId) filters.set("venue", venueId);
        return (
          <a className="format-card" href={"#/schedule?" + filters} key={p.id}>
            <h3>{p.title}</h3>
            <p>
              {p.venue ?? "Площадка и время по согласованию"}
              {p.capacity !== null && (
                <span className="price-capacity">
                  До {p.capacity} {p.capacity === 1 ? "человека" : "человек"}
                </span>
              )}
            </p>
            <strong className="club-price">
              {p.priceFrom ? "от " : ""}
              {money(p.price)}
            </strong>
          </a>
        );
      })}
    </div>
  );
}
export function WeeklySchedule({ data }: { data: PublicData }) {
  const info = data.club.publicInfo;
  if (!info) return null;
  return (
    <section className="weekly-schedule" aria-label="Недельное расписание">
      <div className="section-head">
        <div>
          <span className="eyebrow">КАЖДУЮ НЕДЕЛЮ</span>
          <h2>Недельное расписание</h2>
        </div>
        <span className="muted small">Время клуба: {data.club.timezone}</span>
      </div>
      <div className="weekly-legend">
        <span>
          <i className="venue-dot youth" />
          СК «Молодежный»
        </span>
        <span>
          <i className="venue-dot arena" />
          {info.venues.find((v) => v.id === "club-dynamo-sporta")?.name}
        </span>
      </div>
      <div className="weekly-table">
        {info.week.map((day) => (
          <div className="weekly-day" key={day.day}>
            <h3>{day.day}</h3>
            <div>
              {day.slots.map((s) => (
                <div className="weekly-slot" key={s.venueId + s.startsAt}>
                  <strong>
                    {s.startsAt}–{s.endsAt}
                  </strong>
                  <span>
                    <i
                      className={
                        "venue-dot " +
                        (s.venueId === "club-youth" ? "youth" : "arena")
                      }
                    />
                    {info.venues.find((v) => v.id === s.venueId)?.name}
                    <small>
                      Игровая тренировка · до {s.capacity} человек
                      {s.levelLabel ? " · " + s.levelLabel : ""}
                      {s.price != null && " · " + money(s.price)}
                    </small>
                  </span>
                  <span className="weekly-trainer">
                    {s.trainer ?? "Тренер уточняется"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted small weekly-note">
        Это черновик недельного расписания. Запись открывается за пять дней до
        опубликованной тренировки.
      </p>
    </section>
  );
}
