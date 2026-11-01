import { useEffect, useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { api } from "./api";
import { PageTitle } from "./App";
import { Empty, Loading, Notice, Modal, Form, Field } from "./components";
import {
  formats,
  levels,
  statuses,
  dateTime,
  money,
  type PublicData,
  type Session,
  type Booking,
  type User,
  type Trainer,
  type Court,
  type Venue,
} from "./types";
type Resources = { trainers: Trainer[]; venues: Venue[]; courts: Court[] };
type Overview = { today: number; active: number; nextSessions: Session[] };
export function Admin({
  data,
  reloadPublic,
}: {
  data: PublicData;
  reloadPublic: () => Promise<void>;
}) {
  const [tab, setTab] = useState("overview"),
    [revision, setRevision] = useState(0),
    [sessions, setSessions] = useState<Session[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [clients, setClients] = useState<User[]>([]),
    [resources, setResources] = useState<Resources>({
      trainers: [],
      venues: [],
      courts: [],
    }),
    [overview, setOverview] = useState<Overview | null>(null),
    [audits, setAudits] = useState<
      {
        id: string;
        action: string;
        entityId: string;
        createdAt: string;
        details: unknown;
      }[]
    >([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [modal, setModal] = useState<{
      kind: string;
      item?: Session | Trainer | Venue | Court;
    }>(),
    [transfer, setTransfer] = useState<Booking | null>(null),
    [pending, setPending] = useState(false);
  const reload = () => {
    setRevision((v) => v + 1);
    void reloadPublic().catch((e) => setError(e.message));
  };
  useEffect(() => {
    let alive = true;
    setError("");
    Promise.all([
      api<Overview>("/admin/overview"),
      api<Session[]>("/admin/sessions"),
      api<Resources>("/admin/resources"),
      api<User[]>("/admin/clients?q=" + encodeURIComponent(q)),
    ])
      .then(([o, s, r, c]) => {
        if (alive) {
          setOverview(o);
          setSessions(s);
          setResources(r);
          setClients(c);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [revision, q]);
  useEffect(() => {
    if (tab !== "bookings" && tab !== "audit") return;
    let alive = true;
    const request =
      tab === "bookings"
        ? api<Booking[]>(
            "/admin/bookings?" + filter + "&q=" + encodeURIComponent(q),
          ).then((b) => {
            if (alive) setBookings(b);
          })
        : api<typeof audits>("/admin/audit").then((a) => {
            if (alive) setAudits(a);
          });
    request
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, revision, filter, q]);
  async function action(fn: () => Promise<unknown>, text: string) {
    setPending(true);
    setError("");
    try {
      await fn();
      setMessage(text);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const tabs = [
    ["overview", "Обзор"],
    ["schedule", "Расписание"],
    ["bookings", "Записи"],
    ["clients", "Клиенты"],
    ["trainers", "Тренеры"],
    ["venues", "Площадки и корты"],
    ["settings", "Настройки"],
    ["audit", "Журнал действий"],
  ];
  return (
    <section className="container section admin">
      <PageTitle
        eyebrow="УПРАВЛЕНИЕ КЛУБОМ"
        title="Панель администратора"
        text={"Время клуба: " + data.club.timezone}
      />
      <div className="tabs admin-tabs">
        {tabs.map(([v, n]) => (
          <button
            key={v}
            className={tab === v ? "chosen" : ""}
            onClick={() => {
              setTab(v);
              setQ("");
              setFilter("");
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {busy ? (
        <Loading />
      ) : (
        <>
          {tab === "overview" && overview && (
            <>
              <div className="stats">
                <article>
                  <span>Тренировки сегодня</span>
                  <strong>{overview.today}</strong>
                </article>
                <article>
                  <span>Активные записи на будущие занятия</span>
                  <strong>{overview.active}</strong>
                </article>
                <article>
                  <span>Ближайшие занятия</span>
                  <strong>{overview.nextSessions.length}</strong>
                </article>
              </div>
              <h2>Заполненность ближайших тренировок</h2>
              <div className="panel">
                {overview.nextSessions.length ? (
                  overview.nextSessions.map((s) => (
                    <div className="occupancy" key={s.id}>
                      <span>
                        {dateTime(s.startsAt, data.club.timezone)} ·{" "}
                        {formats[s.format]} · {s.court.venue.name}
                      </span>
                      <progress value={s._count.bookings} max={s.capacity} />
                      <b>
                        {s._count.bookings}/{s.capacity}
                      </b>
                    </div>
                  ))
                ) : (
                  <Empty>Ближайших занятий пока нет.</Empty>
                )}
              </div>
            </>
          )}
          {tab === "schedule" && (
            <>
              <div className="actions toolbar">
                <button
                  className="button"
                  onClick={() => setModal({ kind: "session" })}
                >
                  + Создать занятие
                </button>
                <button
                  className="button outline"
                  onClick={() => setModal({ kind: "series" })}
                >
                  Создать серию
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Дата и формат</th>
                      <th>Тренер / корт</th>
                      <th>Запись</th>
                      <th>Цена</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {dateTime(s.startsAt, data.club.timezone)}
                          <small>
                            {formats[s.format]} · {levels[s.level]}
                            {s.seriesId ? " · Серия" : ""}
                          </small>
                        </td>
                        <td>
                          {s.trainer.name}
                          <small>
                            {s.court.venue.name} · {s.court.name}
                          </small>
                        </td>
                        <td>
                          {s.cancelled
                            ? "Отменено"
                            : s.open
                              ? "Открыта"
                              : "Закрыта"}
                          <small>
                            {s._count.bookings}/{s.capacity} участников
                          </small>
                        </td>
                        <td>{money(s.price)}</td>
                        <td>
                          <div className="actions">
                            <button
                              className="text-button"
                              onClick={() => {
                                setFilter("sessionId=" + s.id);
                                setTab("bookings");
                              }}
                            >
                              Участники
                            </button>
                            {!s.cancelled && (
                              <>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setModal({ kind: "session", item: s })
                                  }
                                >
                                  Изменить
                                </button>
                                <button
                                  className="text-button danger"
                                  disabled={pending}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Отменить занятие? Активных записей: ${s._count.bookings}. Все участники увидят отмену в кабинете.`,
                                      )
                                    )
                                      void action(
                                        () =>
                                          api(
                                            "/admin/sessions/" +
                                              s.id +
                                              "/cancel",
                                            "POST",
                                            { confirmed: true },
                                          ),
                                        "Занятие отменено",
                                      );
                                  }}
                                >
                                  Отменить
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sessions.length && <Empty>Создайте первое занятие.</Empty>}
              </div>
            </>
          )}
          {tab === "bookings" && (
            <>
              <div className="toolbar actions">
                <button
                  className="button"
                  onClick={() => setModal({ kind: "booking" })}
                >
                  + Записать клиента / гостя
                </button>
                <input
                  aria-label="Поиск записей"
                  placeholder="Имя, телефон или email"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {filter && (
                  <button className="text-button" onClick={() => setFilter("")}>
                    Сбросить фильтр
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Участник / контакты</th>
                      <th>Занятие</th>
                      <th>Статус</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <b>{b.childName ?? b.user?.name ?? b.guestName}</b>
                          {b.childName && (
                            <small>
                              {b.childAge} лет · Родитель:{" "}
                              {b.user?.name ?? b.guestName}
                            </small>
                          )}
                          <small>
                            {b.user?.email ?? "Гостевая запись без аккаунта"}
                          </small>
                          <small>
                            {b.user?.phone ||
                              b.guestPhone ||
                              "Телефон не указан"}
                          </small>
                        </td>
                        <td>
                          {dateTime(b.session.startsAt, data.club.timezone)}
                          <small>
                            {formats[b.session.format]} ·{" "}
                            {b.session.court.venue.name}
                          </small>
                        </td>
                        <td>{statuses[b.status]}</td>
                        <td>
                          {b.status === "BOOKED" && (
                            <div className="actions">
                              <button
                                className="text-button"
                                onClick={() => setTransfer(b)}
                              >
                                Перенести
                              </button>
                              <button
                                className="text-button danger"
                                disabled={pending}
                                onClick={() => {
                                  if (confirm("Отменить запись участника?"))
                                    void action(
                                      () =>
                                        api(
                                          "/admin/bookings/" + b.id + "/cancel",
                                          "POST",
                                          {},
                                        ),
                                      "Запись отменена",
                                    );
                                }}
                              >
                                Отменить
                              </button>
                              {+new Date(b.session.endsAt) <= Date.now() && (
                                <>
                                  <button
                                    className="text-button"
                                    disabled={pending}
                                    onClick={() =>
                                      void action(
                                        () =>
                                          api(
                                            "/admin/bookings/" +
                                              b.id +
                                              "/attendance",
                                            "POST",
                                            { status: "ATTENDED" },
                                          ),
                                        "Посещение отмечено",
                                      )
                                    }
                                  >
                                    Посещено
                                  </button>
                                  <button
                                    className="text-button"
                                    disabled={pending}
                                    onClick={() =>
                                      void action(
                                        () =>
                                          api(
                                            "/admin/bookings/" +
                                              b.id +
                                              "/attendance",
                                            "POST",
                                            { status: "MISSED" },
                                          ),
                                        "Пропуск отмечен",
                                      )
                                    }
                                  >
                                    Пропуск
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!bookings.length && <Empty>Записи не найдены.</Empty>}
              </div>
            </>
          )}
          {tab === "clients" && (
            <>
              <div className="toolbar">
                <input
                  aria-label="Поиск клиентов"
                  placeholder="Поиск по имени, email, телефону"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Email / телефон</th>
                      <th>Записи</th>
                      <th>История</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.name}
                          <small>
                            {c.role === "ADMIN" ? "Администратор" : "Клиент"}
                          </small>
                        </td>
                        <td>
                          {c.email}
                          <small>{c.phone || "Не указан"}</small>
                        </td>
                        <td>{c._count?.bookings ?? 0}</td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => {
                              setFilter("userId=" + c.id);
                              setQ("");
                              setTab("bookings");
                            }}
                          >
                            Все записи ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!clients.length && <Empty>Клиенты не найдены.</Empty>}
              </div>
            </>
          )}
          {tab === "trainers" && (
            <>
              <button
                className="button toolbar"
                onClick={() => setModal({ kind: "trainer" })}
              >
                + Добавить тренера
              </button>
              <div className="resources-grid">
                {resources.trainers.map((t) => (
                  <article className="panel" key={t.id}>
                    <h3>{t.name}</h3>
                    <p>{t.bio}</p>
                    <p className="muted">
                      {t.archived ? "В архиве" : "Действующий тренер"}
                    </p>
                    <button
                      className="button outline"
                      onClick={() => setModal({ kind: "trainer", item: t })}
                    >
                      Редактировать
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "venues" && (
            <>
              <div className="toolbar actions">
                <button
                  className="button"
                  onClick={() => setModal({ kind: "venue" })}
                >
                  + Площадка
                </button>
                <button
                  className="button outline"
                  onClick={() => setModal({ kind: "court" })}
                >
                  + Корт
                </button>
              </div>
              <div className="resources-grid">
                {resources.venues.map((v) => (
                  <article className="panel" key={v.id}>
                    <h3>{v.name}</h3>
                    <p>{v.address}</p>
                    {v.archived && <span className="tag">В архиве</span>}
                    <button
                      className="text-button"
                      onClick={() => setModal({ kind: "venue", item: v })}
                    >
                      Изменить площадку
                    </button>
                    <hr />
                    {resources.courts
                      .filter((c) => c.venueId === v.id)
                      .map((c) => (
                        <div className="court-line" key={c.id}>
                          <span>
                            {c.name}
                            {c.archived ? " (архив)" : ""}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => setModal({ kind: "court", item: c })}
                          >
                            Изменить
                          </button>
                        </div>
                      ))}
                  </article>
                ))}
              </div>
            </>
          )}
          {tab === "settings" && (
            <div className="panel settings-panel">
              <h2>Настройки клуба</h2>
              <Form
                submit={async (f) => {
                  await api("/admin/settings", "PATCH", Object.fromEntries(f));
                  reload();
                }}
              >
                <Field
                  label="Название клуба"
                  name="name"
                  value={data.club.name}
                />
                <Field
                  label="Часовой пояс IANA"
                  name="timezone"
                  value={data.club.timezone}
                />
                <Field label="Телефон" name="phone" value={data.club.phone} />
                <Field
                  label="Email"
                  name="email"
                  value={data.club.email}
                  required={false}
                  type="email"
                />
                <Field
                  label="Адрес / контакты"
                  name="address"
                  value={data.club.address}
                />
                <Field
                  label="Отмена и перенос: минимум часов до начала"
                  name="cancelHours"
                  type="number"
                  value={data.club.cancelHours}
                  min={0}
                  max={720}
                />
                <p className="small muted">
                  Изменение часового пояса меняет отображение, но сохраняет
                  UTC-время уже созданных занятий. Для серий применяется текущий
                  пояс клуба.
                </p>
              </Form>
            </div>
          )}
          {tab === "audit" && (
            <div className="audit-list">
              {audits.map((a) => (
                <details className="panel" key={a.id}>
                  <summary>
                    {dateTime(a.createdAt, data.club.timezone)} · {a.action} ·{" "}
                    {a.entityId}
                  </summary>
                  <pre>{JSON.stringify(a.details, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            (
              {
                session: "Занятие",
                series: "Серия занятий",
                booking: "Записать участника",
                trainer: "Тренер",
                venue: "Площадка",
                court: "Корт",
              } as Record<string, string>
            )[modal.kind]
          }
          onClose={() => setModal(undefined)}
        >
          {modal.kind === "session" && (
            <SessionForm
              item={modal.item as Session | undefined}
              resources={resources}
              data={data}
              done={() => {
                setModal(undefined);
                reload();
              }}
            />
          )}
          {modal.kind === "series" && (
            <SeriesForm resources={resources} data={data} done={reload} />
          )}
          {modal.kind === "booking" && (
            <BookingForm
              sessions={sessions}
              clients={clients}
              data={data}
              done={() => {
                setModal(undefined);
                reload();
              }}
            />
          )}
          {["trainer", "venue", "court"].includes(modal.kind) && (
            <ResourceForm
              kind={modal.kind}
              item={modal.item as Trainer | Venue | Court | undefined}
              resources={resources}
              done={() => {
                setModal(undefined);
                reload();
              }}
            />
          )}
        </Modal>
      )}
      {transfer && (
        <Modal
          title="Перенос записи администратором"
          onClose={() => setTransfer(null)}
        >
          <Form
            submit={async (f) => {
              await api(
                "/admin/bookings/" + transfer.id + "/transfer",
                "POST",
                { sessionId: f.get("sessionId") },
              );
              setTransfer(null);
              reload();
            }}
          >
            <label>
              Новое занятие
              <select name="sessionId" required>
                <option value="">Выберите занятие</option>
                {sessions
                  .filter(
                    (s) =>
                      s.id !== transfer.sessionId &&
                      s.format === transfer.session.format &&
                      !s.cancelled &&
                      s.open &&
                      +new Date(s.startsAt) > Date.now(),
                  )
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {dateTime(s.startsAt, data.club.timezone)} ·{" "}
                      {s.court.venue.name} · {s._count.bookings}/{s.capacity}
                    </option>
                  ))}
              </select>
            </label>
            <Notice>
              Срок самостоятельной отмены к администратору не применяется.
              Перенос сохраняется атомарно.
            </Notice>
          </Form>
        </Modal>
      )}
    </section>
  );
}
function Selects({
  resources,
  item,
}: {
  resources: Resources;
  item?: Session;
}) {
  return (
    <>
      <label>
        Тренер
        <select name="trainerId" defaultValue={item?.trainerId} required>
          <option value="">Выберите тренера</option>
          {resources.trainers
            .filter((t) => !t.archived || t.id === item?.trainerId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.archived ? " (архив)" : ""}
              </option>
            ))}
        </select>
      </label>
      <label>
        Корт и площадка
        <select name="courtId" defaultValue={item?.courtId} required>
          <option value="">Выберите корт</option>
          {resources.courts
            .filter(
              (c) =>
                (!c.archived && !c.venue.archived) || c.id === item?.courtId,
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.venue.name} · {c.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Формат
        <select name="format" defaultValue={item?.format}>
          {Object.entries(formats).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Уровень
        <select name="level" defaultValue={item?.level}>
          {Object.entries(levels).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Стоимость, ₽"
        name="priceRub"
        type="number"
        value={item ? item.price / 100 : 900}
        min={0}
        max={1000000}
      />
      <Field
        label="Вместимость (для индивидуальной — 1)"
        name="capacity"
        type="number"
        value={item?.capacity ?? 8}
        min={1}
        max={100}
      />
      <label className="check">
        <input
          name="open"
          type="checkbox"
          defaultChecked={item?.open ?? true}
        />
        Запись открыта
      </label>
    </>
  );
}
function sessionData(f: FormData) {
  return {
    trainerId: String(f.get("trainerId")),
    courtId: String(f.get("courtId")),
    format: String(f.get("format")),
    level: String(f.get("level")),
    price: Math.round(Number(f.get("priceRub")) * 100),
    capacity: Number(f.get("capacity")),
    open: f.get("open") === "on",
  };
}
function SessionForm({
  resources,
  item,
  data,
  done,
}: {
  resources: Resources;
  item?: Session;
  data: PublicData;
  done: () => void;
}) {
  const local = (s: string) =>
    formatInTimeZone(s, data.club.timezone, "yyyy-MM-dd'T'HH:mm");
  return (
    <Form
      submit={async (f) => {
        const startsAt = fromZonedTime(
            String(f.get("startsAt")),
            data.club.timezone,
          ).toISOString(),
          endsAt = fromZonedTime(
            String(f.get("endsAt")),
            data.club.timezone,
          ).toISOString();
        if (
          local(startsAt) !== String(f.get("startsAt")) ||
          local(endsAt) !== String(f.get("endsAt"))
        )
          throw new Error(
            "Выбранное местное время не существует из-за перевода часов. Выберите другое время.",
          );
        await api(
          "/admin/sessions" + (item ? "/" + item.id : ""),
          item ? "PATCH" : "POST",
          {
            ...sessionData(f),
            startsAt,
            endsAt,
            confirmParticipants: f.get("confirmed") === "on",
          },
        );
        done();
      }}
    >
      <p className="muted small">
        Введите время в часовом поясе {data.club.timezone}.
      </p>
      <Field
        label="Начало"
        name="startsAt"
        type="datetime-local"
        value={item ? local(item.startsAt) : undefined}
      />
      <Field
        label="Окончание"
        name="endsAt"
        type="datetime-local"
        value={item ? local(item.endsAt) : undefined}
      />
      <Selects resources={resources} item={item} />
      {!!item?._count.bookings && (
        <>
          <Notice>
            У занятия {item._count.bookings} участников. Изменение времени
            затронет их планы. История изменений сохранится.
          </Notice>
          <label className="check">
            <input type="checkbox" name="confirmed" />
            Подтверждаю изменение времени с участниками
          </label>
        </>
      )}
    </Form>
  );
}
function SeriesForm({
  resources,
  data,
  done,
}: {
  resources: Resources;
  data: PublicData;
  done: () => void;
}) {
  const [preview, setPreview] = useState<{
    conflicts: { date: string; message: string }[];
    count: number;
    saved: boolean;
  } | null>(null);
  return (
    <div onChange={() => setPreview(null)}>
      <Form
        label={
          preview && !preview.conflicts.length
            ? "Сохранить всю серию"
            : "Проверить даты и конфликты"
        }
        submit={async (f) => {
          const result = await api<NonNullable<typeof preview>>(
            "/admin/series",
            "POST",
            {
              from: String(f.get("from")),
              to: String(f.get("to")),
              time: String(f.get("time")),
              duration: Number(f.get("duration")),
              weekdays: f.getAll("weekday").map(Number),
              session: sessionData(f),
              save: !!preview && !preview.conflicts.length,
            },
          );
          setPreview(result);
          if (result.saved) done();
        }}
      >
        <p className="muted">
          Время серии: {data.club.timezone}. Период — до 181 дня. При конфликтах
          серия целиком не сохраняется.
        </p>
        <Field label="С даты" name="from" type="date" />
        <Field label="По дату" name="to" type="date" />
        <div className="weekdays">
          {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((day, i) => (
            <label className="check" key={day}>
              <input name="weekday" type="checkbox" value={i} />
              {day}
            </label>
          ))}
        </div>
        <Field label="Начало" name="time" type="time" value="18:00" />
        <Field
          label="Продолжительность, минут"
          name="duration"
          type="number"
          value={90}
          min={15}
          max={480}
        />
        <Selects resources={resources} />
        {preview && (
          <Notice error={!!preview.conflicts.length}>
            {preview.saved
              ? `Сохранено занятий: ${preview.count}`
              : `Доступных дат: ${preview.count}. Конфликтов: ${preview.conflicts.length}.`}
            {preview.conflicts.map((c) => (
              <p key={c.date}>
                {c.date}: {c.message}
              </p>
            ))}
          </Notice>
        )}
      </Form>
    </div>
  );
}
function BookingForm({
  sessions,
  clients,
  data,
  done,
}: {
  sessions: Session[];
  clients: User[];
  data: PublicData;
  done: () => void;
}) {
  const [mode, setMode] = useState("user"),
    [sessionId, setSessionId] = useState("");
  const selected = sessions.find((s) => s.id === sessionId);
  return (
    <Form
      submit={async (f) => {
        await api("/admin/bookings", "POST", {
          sessionId,
          ...(mode === "user"
            ? { userId: String(f.get("userId")) }
            : {
                guestName: String(f.get("guestName")),
                guestPhone: String(f.get("guestPhone")),
              }),
          ...(selected?.format === "KIDS"
            ? {
                childName: String(f.get("childName")),
                childAge: Number(f.get("childAge")),
              }
            : {}),
        });
        done();
      }}
    >
      <label>
        Занятие
        <select
          name="sessionId"
          required
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Выберите занятие</option>
          {sessions
            .filter(
              (s) =>
                !s.cancelled && s.open && +new Date(s.startsAt) > Date.now(),
            )
            .map((s) => (
              <option value={s.id} key={s.id}>
                {dateTime(s.startsAt, data.club.timezone)} · {formats[s.format]}{" "}
                · {s._count.bookings}/{s.capacity}
              </option>
            ))}
        </select>
      </label>
      <label>
        Способ записи
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="user">Зарегистрированный клиент</option>
          <option value="guest">Гость по телефону</option>
        </select>
      </label>
      {mode === "user" ? (
        <label>
          Клиент
          <select name="userId" required>
            <option value="">Выберите клиента</option>
            {clients.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name} · {c.email}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <Field label="Имя гостя" name="guestName" />
          <Field label="Телефон гостя" name="guestPhone" type="tel" />
          <p className="small muted">
            Гость не привязывается к аккаунтам по совпадению телефона.
          </p>
        </>
      )}
      {selected?.format === "KIDS" && (
        <>
          <Field label="Имя ребёнка" name="childName" />
          <Field
            label="Возраст"
            name="childAge"
            type="number"
            min={3}
            max={17}
          />
        </>
      )}
    </Form>
  );
}
function ResourceForm({
  kind,
  item,
  resources,
  done,
}: {
  kind: string;
  item?: Trainer | Venue | Court;
  resources: Resources;
  done: () => void;
}) {
  return (
    <Form
      submit={async (f) => {
        const input = {
          ...Object.fromEntries(f),
          archived: f.get("archived") === "on",
        };
        await api(
          "/admin/" +
            (
              {
                trainer: "trainers",
                venue: "venues",
                court: "courts",
              } as Record<string, string>
            )[kind] +
            (item ? "/" + item.id : ""),
          item ? "PATCH" : "POST",
          input,
        );
        done();
      }}
    >
      <Field label="Название / имя" name="name" value={item?.name} />
      {kind === "trainer" && (
        <label>
          О тренере
          <textarea
            name="bio"
            required
            minLength={10}
            maxLength={2000}
            defaultValue={(item as Trainer)?.bio}
          />
        </label>
      )}
      {kind === "venue" && (
        <Field label="Адрес" name="address" value={(item as Venue)?.address} />
      )}
      {kind === "court" && (
        <label>
          Площадка
          <select
            name="venueId"
            defaultValue={(item as Court)?.venueId}
            required
          >
            {resources.venues.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          name="archived"
          defaultChecked={item?.archived}
        />
        В архиве
      </label>
      <p className="small muted">
        Архивирование не удаляет занятия и историю записей.
      </p>
    </Form>
  );
}
