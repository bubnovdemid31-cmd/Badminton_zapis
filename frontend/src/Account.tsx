import { Balance } from "./Balance";
import { useEffect, useState } from "react";
import { api } from "./api";
import { PageTitle } from "./App";
import { Notice, Empty, Loading, Modal, Form, Field } from "./components";
import {
  dateTime,
  formats,
  statuses,
  sessionPrice,
  type Booking,
  type User,
  type PublicData,
  type Session,
} from "./types";
export function Account({
  user,
  data,
  setUser,
  logout,
}: {
  user: User;
  data: PublicData;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
}) {
  const [tab, setTab] = useState("upcoming"),
    [bookings, setBookings] = useState<Booking[] | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [transfer, setTransfer] = useState<Booking | null>(null),
    [targets, setTargets] = useState<Session[]>([]),
    [pending, setPending] = useState(false);
  useEffect(() => {
    setError("");
    api<Booking[]>("/account/bookings")
      .then(setBookings)
      .catch((e) => setError(e.message));
  }, [revision]);
  const upcoming = (b: Booking) =>
    b.status === "BOOKED" && +new Date(b.session.endsAt) > Date.now();
  const list = bookings?.filter((b) =>
    tab === "upcoming" ? upcoming(b) : !upcoming(b),
  );
  async function cancel(b: Booking) {
    if (
      !confirm(
        "Отменить запись на " +
          dateTime(b.session.startsAt, data.club.timezone) +
          "?",
      )
    )
      return;
    setPending(true);
    try {
      await api("/account/bookings/" + b.id + "/cancel", "POST", {});
      setRevision(revision + 1);
      setMessage("Запись отменена, место освобождено.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function openTransfer(b: Booking) {
    setPending(true);
    try {
      setTargets(
        (await api<Session[]>("/sessions?format=" + b.session.format)).filter(
          (s) =>
            s.id !== b.sessionId && s.open && s._count.bookings < s.capacity,
        ),
      );
      setTransfer(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="container section">
      <div className="section-head">
        <PageTitle
          eyebrow="ЛИЧНЫЙ КАБИНЕТ"
          title={"Привет, " + user.name + "!"}
          text="Здесь твои планы на игру и история тренировок."
        />
        <div className="actions">
          {user.role === "ADMIN" && (
            <a className="button outline" href="#/admin">
              Панель администратора
            </a>
          )}
          <button
            className="text-button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              logout().catch((e) => {
                setError(e.message);
                setPending(false);
              });
            }}
          >
            Выйти
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          ["upcoming", "Предстоящие тренировки"],
          ["history", "История"],
          ["profile", "Профиль"],
          ["balance", "Мой баланс"],
        ].map(([v, n]) => (
          <button
            className={tab === v ? "chosen" : ""}
            key={v}
            onClick={() => setTab(v)}
          >
            {n}
          </button>
        ))}
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {tab === "balance" ? (
        <Balance />
      ) : tab === "profile" ? (
        <div className="profile-grid">
          <div className="panel">
            <h2>Личные данные</h2>
            <p className="muted">{user.email}</p>
            <Form
              submit={async (f) => {
                const result = await api<User>("/account/profile", "PATCH", {
                  name: String(f.get("name")),
                  phone: String(f.get("phone")),
                });
                setUser(result);
              }}
            >
              <Field label="Имя" name="name" value={user.name} />
              <Field
                label="Телефон"
                name="phone"
                value={user.phone}
                type="tel"
                required={false}
              />
            </Form>
          </div>
          <div className="panel">
            <h2>Сменить пароль</h2>
            <Form
              submit={async (f) => {
                await api("/account/password", "POST", {
                  current: String(f.get("current")),
                  password: String(f.get("password")),
                });
              }}
            >
              <Field label="Текущий пароль" name="current" type="password" />
              <label>
                Новый пароль
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <p className="muted small">
                После смены пароля вход на других устройствах будет завершён.
              </p>
            </Form>
          </div>
        </div>
      ) : bookings === null ? (
        <Loading />
      ) : list?.length ? (
        <div className="booking-list">
          {list.map((b) => {
            const editable =
              b.status === "BOOKED" &&
              +new Date(b.session.startsAt) - Date.now() >
                data.club.cancelHours * 3600000;
            return (
              <article className="booking-row" key={b.id}>
                <div className="booking-date">
                  <span className="tag">{formats[b.session.format]}</span>
                  <h3>{dateTime(b.session.startsAt, data.club.timezone)}</h3>
                  <span className={"status status-" + b.status.toLowerCase()}>
                    {statuses[b.status]}
                  </span>
                </div>
                <div>
                  <h3>{b.session.trainer.name}</h3>
                  <p>
                    {b.session.court.venue.name} · {b.session.court.name}
                  </p>
                  <p className="small muted">{b.session.court.venue.address}</p>
                  <p>
                    {b.childName
                      ? `Участник: ${b.childName}, ${b.childAge} лет`
                      : `Участник: ${user.name}`}
                  </p>
                  <strong>{sessionPrice(b.session)}</strong>
                </div>
                <div className="booking-actions">
                  {editable ? (
                    <>
                      <button
                        className="button outline"
                        disabled={pending}
                        onClick={() => void openTransfer(b)}
                      >
                        Перенести
                      </button>
                      <button
                        className="text-button danger"
                        disabled={pending}
                        onClick={() => void cancel(b)}
                      >
                        Отменить запись
                      </button>
                    </>
                  ) : upcoming(b) ? (
                    <p className="small muted">
                      До начала меньше {data.club.cancelHours} ч. Для изменений
                      свяжитесь с администратором: {data.club.phone}
                    </p>
                  ) : (
                    <a
                      className="button outline"
                      href={"#/schedule?format=" + b.session.format}
                    >
                      Записаться снова ↗
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>
          {tab === "upcoming"
            ? "Пока нет предстоящих тренировок. Самое время выбрать свою игру!"
            : "Здесь появится история ваших тренировок."}
          <br />
          <a className="button" href="#/schedule">
            Открыть расписание ↗
          </a>
        </Empty>
      )}
      {transfer && (
        <Modal title="Перенести тренировку" onClose={() => setTransfer(null)}>
          <Notice>
            Перенос доступен на занятие того же формата. Если место недоступно,
            исходная запись останется у вас.
          </Notice>
          {targets.length ? (
            <Form
              label="Подтвердить перенос"
              submit={async (f) => {
                await api(
                  "/account/bookings/" + transfer.id + "/transfer",
                  "POST",
                  { sessionId: String(f.get("sessionId")) },
                );
                setTransfer(null);
                setRevision(revision + 1);
                setMessage("Запись перенесена.");
              }}
            >
              <label>
                Новое занятие
                <select name="sessionId" required>
                  {targets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {dateTime(s.startsAt, data.club.timezone)} ·{" "}
                      {s.trainer.name} · {s.court.venue.name} ·{" "}
                      {sessionPrice(s)}
                    </option>
                  ))}
                </select>
              </label>
            </Form>
          ) : (
            <Empty>Подходящих свободных занятий пока нет.</Empty>
          )}
        </Modal>
      )}
    </section>
  );
}
