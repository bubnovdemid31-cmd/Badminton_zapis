import { ClubPrices, WeeklySchedule } from "./ClubInformation";
import { useEffect, useState, useCallback } from "react";
import { api } from "./api";
import {
  formats,
  levels,
  sessionPrice,
  dateTime,
  type PublicData,
  type User,
  type Session,
} from "./types";
import {
  SessionCard,
  Loading,
  Notice,
  Modal,
  Form,
  Field,
  Empty,
} from "./components";
import { Account } from "./Account";
import { Admin } from "./Admin";
export function navigate(path: string) {
  window.location.hash = path;
}
function route() {
  const [path, query] = (window.location.hash.slice(1) || "/").split("?");
  return { path, query: new URLSearchParams(query) };
}
function BrandLogo() {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className="brand-logo-slot" role="img" aria-label="Vlad Smash Club">
      <img
        className="brand-logo-image"
        src="/logo.jpg"
        alt=""
        width={1280}
        height={853}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
        style={{ visibility: loaded ? "visible" : "hidden" }}
        decoding="async"
      />
    </span>
  );
}

export function App() {
  const [location, setLocation] = useState(route),
    [data, setData] = useState<PublicData | null>(null),
    [user, setUser] = useState<User | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [selected, setSelected] = useState<Session | null>(null),
    [success, setSuccess] = useState(""),
    [menu, setMenu] = useState(false);
  const reload = useCallback(async () => {
    const p = await api<PublicData>("/public");
    setData(p);
  }, []);
  async function boot() {
    setBusy(true);
    setError("");
    try {
      const [p, a] = await Promise.all([
        api<PublicData>("/public"),
        api<{ user: User | null }>("/auth/session"),
      ]);
      setData(p);
      setUser(a.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void boot();
    const change = () => {
      setLocation(route());
      setMenu(false);
      setSuccess("");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const book = useCallback(
    (s: Session) => {
      if (!user) {
        navigate("/login?book=" + s.id);
        return;
      }
      setSelected(s);
      setSuccess("");
    },
    [user],
  );
  if (busy)
    return (
      <div className="boot">
        <div className="brand">
          <BrandLogo />
        </div>
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <main className="container section">
        <Notice error>{error || "Данные недоступны"}</Notice>
        <button className="button" onClick={() => void boot()}>
          Повторить
        </button>
      </main>
    );
  const { club } = data,
    p = location.path;
  return (
    <>
      <header>
        <div className="container header-inner">
          <a className="brand" href="#/">
            <BrandLogo />
          </a>
          <button
            className="mobile-toggle icon-btn"
            aria-label="Меню"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <nav className={menu ? "opened" : ""} aria-label="Основная навигация">
            {[
              ["/trainings", "Тренировки"],
              ["/coaches", "Тренеры"],
              ["/schedule", "Расписание"],
              ["/about", "О клубе"],
              ["/contacts", "Контакты"],
            ].map(([path, label]) => (
              <a
                key={path}
                href={"#" + path}
                className={p === path ? "active" : ""}
              >
                {label}
              </a>
            ))}
          </nav>
          <a className="account-link" href={user ? "#/account" : "#/login"}>
            {user ? "Личный кабинет" : "Войти"} <span>↗</span>
          </a>
        </div>
      </header>
      <main>
        {success && (
          <div className="container top-notice">
            <Notice>{success}</Notice>
          </div>
        )}
        {p === "/" && <Home data={data} book={book} />}
        {p === "/trainings" && (
          <section className="container section">
            <PageTitle
              eyebrow="НАЙДИ СВОЮ ИГРУ"
              title="Тренировки для каждого"
              text="Первый выход на корт или подготовка к турниру — подберём комфортный темп."
            />
            <ClubPrices data={data} />
            <div className="panel">
              <h2>Что взять на тренировку</h2>
              <p>
                Спортивную форму, чистую обувь для зала и воду. Наличие ракетки
                и условия проката уточните у администратора до визита.
              </p>
              <a className="button" href="#/schedule">
                Выбрать занятие ↗
              </a>
              {data.club.publicInfo?.shopUrl?.startsWith("https://t.me/") && (
                <p className="small" style={{ marginTop: 20, marginBottom: 0 }}>
                  <a
                    className="text-link"
                    href={data.club.publicInfo.shopUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Одежда и аксессуары в Telegram
                  </a>
                </p>
              )}
            </div>
          </section>
        )}
        {p === "/coaches" && (
          <section className="container section">
            <PageTitle
              eyebrow="ЛЮДИ КЛУБА"
              title="На одной стороне корта"
              text="Тренеры помогают почувствовать игру, освоить технику и двигаться к своим целям."
            />
            <Coaches data={data} />
          </section>
        )}
        {p === "/schedule" && (
          <Schedule
            key={location.query.toString()}
            data={data}
            book={book}
            initialFormat={location.query.get("format") ?? ""}
            bookingId={location.query.get("book") ?? ""}
          />
        )}
        {p === "/about" && (
          <section className="container section">
            <PageTitle
              eyebrow="МЕСТО ДЛЯ ТВОЕЙ ИГРЫ"
              title="Встречаемся на корте"
              text="Наш клуб — про движение, внимание к себе и людей, с которыми хочется играть снова."
            />
            <div className="about-banner">
              <img src="/court.svg" alt="Иллюстрация бадминтонного корта" />
              <div>
                <h2>Больше, чем тренировка</h2>
                <p>
                  Учим играть с удовольствием. Начинаем с понятной техники,
                  поддерживаем на каждом шаге и знакомим с командой.
                </p>
                <p>
                  Адрес площадки и условия первого визита уточните у
                  администратора клуба.
                </p>
              </div>
            </div>
            <h2 className="space-top">Наши площадки</h2>
            <Venues data={data} />
          </section>
        )}
        {p === "/contacts" && (
          <section className="container section">
            <PageTitle eyebrow="ОСТАЁМСЯ НА СВЯЗИ" title="Контакты клуба" />
            <div className="contact-grid">
              <div className="panel">
                <span className="eyebrow">АДМИНИСТРАТОР</span>
                <h2>{club.phone}</h2>
                {club.email && (
                  <a href={"mailto:" + club.email}>{club.email}</a>
                )}
                <p>{club.address}</p>
                <p className="muted">Время клуба: {club.timezone}</p>
                <p>
                  Оплата занятий производится в клубе. По вопросам поздней
                  отмены свяжитесь с администратором.
                </p>
              </div>
              <img
                className="contact-art"
                src="/court.svg"
                alt="Бадминтонный корт"
              />
            </div>
            <Venues data={data} />
          </section>
        )}
        {(p === "/login" || p === "/register") && (
          <Auth
            register={p === "/register"}
            bookingId={location.query.get("book") ?? ""}
            onAuth={setUser}
          />
        )}
        {p === "/account" &&
          (user ? (
            <Account
              user={user}
              data={data}
              setUser={setUser}
              logout={async () => {
                await api("/auth/logout", "POST", {});
                await api("/auth/session");
                setUser(null);
                navigate("/");
              }}
            />
          ) : (
            <section className="container section">
              <Empty>Войдите, чтобы увидеть свои записи.</Empty>
              <a className="button" href="#/login">
                Войти
              </a>
            </section>
          ))}
        {p.startsWith("/admin") &&
          (user?.role === "ADMIN" ? (
            <Admin data={data} reloadPublic={reload} />
          ) : (
            <section className="container section">
              <Notice error>
                Доступ к панели есть только у администратора.
              </Notice>
            </section>
          ))}
        {![
          "/",
          "/trainings",
          "/coaches",
          "/schedule",
          "/about",
          "/contacts",
          "/login",
          "/register",
          "/account",
          "/admin",
        ].includes(p) &&
          !p.startsWith("/admin") && (
            <section className="container section">
              <h1>Страница не найдена</h1>
              <a href="#/">На главную</a>
            </section>
          )}
      </main>
      <footer>
        <div className="container footer-inner">
          <a className="brand" href="#/">
            <BrandLogo />
          </a>
          <p>Больше движения. Больше игры.</p>
          <div>
            <a href="#/schedule">Расписание</a>
            <a href="#/contacts">Контакты</a>
            {user?.role === "ADMIN" && <a href="#/admin">Администратор</a>}
          </div>
          <small>© {new Date().getFullYear()} · Оплата в клубе</small>
        </div>
      </footer>
      {selected && (
        <Modal title="Подтверждение записи" onClose={() => setSelected(null)}>
          <span className="tag">{formats[selected.format]}</span>
          <h3>{dateTime(selected.startsAt, club.timezone)}</h3>
          <p>
            {selected.trainer.name} · {selected.court.venue.name},{" "}
            {selected.court.name}
          </p>
          <p>{selected.court.venue.address}</p>
          <p>
            {levels[selected.level]} ·{" "}
            {Math.round(
              (+new Date(selected.endsAt) - +new Date(selected.startsAt)) /
                60000,
            )}{" "}
            мин · {sessionPrice(selected)}
          </p>
          {selected.priceFrom && (
            <Notice>
              Указана начальная стоимость. Итоговую цену согласуйте с тренером
              до занятия.
            </Notice>
          )}
          <Notice>
            Отмена и перенос — не позднее чем за {club.cancelHours} ч до начала.
            Позже свяжитесь с администратором. Оплата в клубе.
          </Notice>
          <Form
            label="Подтвердить запись"
            submit={async (f) => {
              await api("/account/bookings", "POST", {
                sessionId: selected.id,
                ...(selected.format === "KIDS"
                  ? {
                      childName: String(f.get("childName")),
                      childAge: Number(f.get("childAge")),
                    }
                  : {}),
              });
              setSelected(null);
              navigate("/account");
              setSuccess(
                "Вы записаны! Тренировка появилась в личном кабинете.",
              );
            }}
          >
            {selected.format === "KIDS" && (
              <>
                <Field label="Имя ребёнка" name="childName" />
                <Field
                  label="Возраст ребёнка"
                  name="childAge"
                  type="number"
                  min={3}
                  max={17}
                />
              </>
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
    </div>
  );
}
function Coaches({ data }: { data: PublicData }) {
  return data.trainers.length ? (
    <div className="coaches-grid">
      {data.trainers.map((t, i) => (
        <article className="coach" key={t.id}>
          <span className="coach-number">{String(i + 1).padStart(2, "0")}</span>
          <h3>{t.name}</h3>
          <p>{t.bio}</p>
          <a href={"#/schedule?trainer=" + t.id}>Тренировки тренера ↗</a>
        </article>
      ))}
    </div>
  ) : (
    <Empty>Тренеры скоро появятся.</Empty>
  );
}
function Venues({ data }: { data: PublicData }) {
  return (
    <div className="venues-grid">
      {data.venues.map((v, i) => (
        <article className="panel venue" key={v.id}>
          <span className="eyebrow">ПЛОЩАДКА / 0{i + 1}</span>
          <h3>{v.name}</h3>
          <p>{v.address}</p>
          <p className="muted">{v.courts.map((c) => c.name).join(" · ")}</p>
          <a href={"#/schedule?venue=" + v.id}>Расписание площадки ↗</a>
        </article>
      ))}
    </div>
  );
}
function Home({
  data,
  book,
}: {
  data: PublicData;
  book: (s: Session) => void;
}) {
  const [sessions, setSessions] = useState<Session[] | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    api<Session[]>("/sessions")
      .then(setSessions)
      .catch((e) => setErr(e.message));
  }, []);
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">БАДМИНТОННЫЙ КЛУБ</span>
          <h1>
            Время
            <br />
            для <em>игры.</em>
          </h1>
          <p>
            Оставь суету за пределами корта.
            <br />
            Бадминтон, новые друзья и энергия
            <br className="desktop" /> на весь день — в нашем клубе.
          </p>
          <div className="hero-actions">
            <a href="#/schedule" className="button">
              Записаться на тренировку <span>↗</span>
            </a>
            <a className="text-link" href="#/trainings">
              Найти свой формат
            </a>
          </div>
        </div>
        <aside className="hero-agenda" aria-label="Ближайшая тренировка">
          <div className="agenda-heading">
            <span>Ближайшая тренировка</span>
            <span>Расписание клуба</span>
          </div>
          {err ? (
            <Notice error>{err}</Notice>
          ) : sessions === null ? (
            <Loading />
          ) : sessions.length ? (
            <>
              <div className="agenda-date">
                {new Intl.DateTimeFormat("ru-RU", {
                  timeZone: data.club.timezone,
                  day: "2-digit",
                }).format(new Date(sessions[0].startsAt))}
                <span>
                  {
                    new Intl.DateTimeFormat("ru-RU", {
                      timeZone: data.club.timezone,
                      day: "numeric",
                      month: "long",
                    })
                      .formatToParts(new Date(sessions[0].startsAt))
                      .find((part) => part.type === "month")?.value
                  }
                </span>
              </div>
              <h2>{formats[sessions[0].format]} тренировка</h2>
              <dl className="agenda-details">
                <div>
                  <dt>Начало</dt>
                  <dd>{dateTime(sessions[0].startsAt, data.club.timezone)}</dd>
                </div>
                <div>
                  <dt>Тренер</dt>
                  <dd>{sessions[0].trainer.name}</dd>
                </div>
                <div>
                  <dt>Площадка</dt>
                  <dd>{sessions[0].court.venue.name}</dd>
                </div>
              </dl>
              <a className="agenda-link" href="#/schedule">
                Смотреть расписание
              </a>
            </>
          ) : (
            <Empty>Новые занятия скоро появятся в расписании.</Empty>
          )}
          <p className="agenda-footnote">Время клуба: {data.club.timezone}</p>
        </aside>
      </section>
      <section className="container section">
        <div className="section-head">
          <div>
            <span className="eyebrow">ФОРМАТЫ ЗАНЯТИЙ</span>
            <h2>Выбери свой формат</h2>
          </div>
          <a className="text-link" href="#/trainings">
            Все тренировки ↗
          </a>
        </div>
        <ClubPrices data={data} />
      </section>
      <section className="soft-section">
        <div className="container section">
          <div className="section-head">
            <div>
              <span className="eyebrow">РАСПИСАНИЕ</span>
              <h2>Ближайшие тренировки</h2>
            </div>
            <a className="text-link" href="#/schedule">
              Всё расписание ↗
            </a>
          </div>
          <p className="muted">
            Время занятий: {data.club.timezone}. Оплата в клубе.
          </p>
          {err ? (
            <Notice error>{err}</Notice>
          ) : sessions === null ? (
            <Loading />
          ) : sessions.length ? (
            <div className="session-grid">
              {sessions.slice(0, 3).map((s) => (
                <SessionCard key={s.id} s={s} club={data.club} onBook={book} />
              ))}
            </div>
          ) : (
            <Empty>Скоро здесь появятся новые занятия.</Empty>
          )}
        </div>
      </section>
      <section className="container section">
        <div className="section-head">
          <div>
            <span className="eyebrow">ТРЕНЕРЫ</span>
            <h2>Команда, которая поддержит</h2>
          </div>
          <a className="text-link" href="#/coaches">
            Все тренеры ↗
          </a>
        </div>
        <Coaches data={data} />
      </section>
      <section className="container">
        <div className="cta">
          <span className="eyebrow">ОНЛАЙН-ЗАПИСЬ</span>
          <h2>
            Твоя следующая игра
            <br />
            начинается здесь.
          </h2>
          <a className="button light" href="#/schedule">
            Выбрать тренировку ↗
          </a>
        </div>
      </section>
    </>
  );
}
function Schedule({
  data,
  book,
  initialFormat,
  bookingId,
}: {
  data: PublicData;
  book: (s: Session) => void;
  initialFormat: string;
  bookingId: string;
}) {
  const query = route().query;
  const [filters, setFilters] = useState({
      format: initialFormat,
      venue: query.get("venue") ?? "",
      trainer: query.get("trainer") ?? "",
      level: "",
    }),
    [day, setDay] = useState(""),
    [sessions, setSessions] = useState<Session[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setSessions(null);
    setError("");
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    api<Session[]>("/sessions?" + q)
      .then((s) => {
        if (current) {
          setSessions(s);
          if (bookingId) {
            const selected = s.find((v) => v.id === bookingId);
            if (selected) book(selected);
            else
              setError("Выбранное занятие больше недоступно. Выберите другое.");
          }
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [filters, retry]);
  const dateKey = (s: Session) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: data.club.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s.startsAt));
  const days = [...new Set(sessions?.map(dateKey) ?? [])];
  const visible = sessions?.filter((s) => !day || dateKey(s) === day);
  return (
    <section className="container section">
      <PageTitle
        eyebrow="ПЛАНИРУЙ СВОЮ ИГРУ"
        title="Расписание тренировок"
        text="Выбери подходящее занятие. Свободные места и подтверждение — сразу на сайте."
      />
      <WeeklySchedule data={data} />
      <h2 className="booking-dates-title">Запись на конкретную дату</h2>
      <div className="filter-bar">
        {(
          [
            ["venue", "Площадка", data.venues.map((v) => [v.id, v.name])],
            ["format", "Формат", Object.entries(formats)],
            ["trainer", "Тренер", data.trainers.map((t) => [t.id, t.name])],
            ["level", "Уровень", Object.entries(levels)],
          ] as [keyof typeof filters, string, string[][]][]
        ).map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={filters[key]}
              onChange={(e) => {
                setFilters({ ...filters, [key]: e.target.value });
                setDay("");
              }}
            >
              <option value="">Все</option>
              {options.map(([v, n]) => (
                <option value={v} key={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="day-tabs">
        <button className={!day ? "chosen" : ""} onClick={() => setDay("")}>
          Все дни
        </button>
        {days.map((d) => (
          <button
            className={day === d ? "chosen" : ""}
            key={d}
            onClick={() => setDay(d)}
          >
            {new Intl.DateTimeFormat("ru-RU", {
              day: "numeric",
              month: "short",
              weekday: "short",
              timeZone: "UTC",
            }).format(new Date(d + "T12:00:00Z"))}
          </button>
        ))}
      </div>
      <p className="muted small">
        Время клуба: {data.club.timezone} · Самостоятельная отмена и перенос за{" "}
        {data.club.cancelHours} ч до начала
      </p>
      {error ? (
        <>
          <Notice error>{error}</Notice>
          <button className="button" onClick={() => setRetry(retry + 1)}>
            Повторить
          </button>
        </>
      ) : sessions === null ? (
        <Loading />
      ) : visible?.length ? (
        <div className="session-grid">
          {visible.map((s) => (
            <SessionCard key={s.id} s={s} club={data.club} onBook={book} />
          ))}
        </div>
      ) : (
        <Empty>
          По этим фильтрам занятий нет. Попробуйте другой формат или площадку.
        </Empty>
      )}
    </section>
  );
}
function Auth({
  register,
  bookingId,
  onAuth,
}: {
  register: boolean;
  bookingId: string;
  onAuth: (user: User) => void;
}) {
  return (
    <section className="container section auth-layout">
      <div className="auth-story">
        <span className="eyebrow">ДОБРО ПОЖАЛОВАТЬ НА КОРТ</span>
        <h1>
          Хорошая игра
          <br />
          начинается
          <br />
          со знакомства.
        </h1>
        <img src="/court.svg" alt="Бадминтонный корт" />
      </div>
      <div className="auth-form panel" key={register ? "register" : "login"}>
        <h2>{register ? "Создать аккаунт" : "Рады видеть снова"}</h2>
        <p className="muted">
          {register
            ? "Записывайтесь на тренировки и управляйте ими в кабинете."
            : "Войдите, чтобы продолжить запись."}
        </p>
        <Form
          label={register ? "Зарегистрироваться" : "Войти"}
          submit={async (f) => {
            const result = await api<{ user: User }>(
              register ? "/auth/register" : "/auth/login",
              "POST",
              {
                email: String(f.get("email")),
                password: String(f.get("password")),
                ...(register ? { name: String(f.get("name")) } : {}),
              },
            );
            onAuth(result.user);
            navigate(bookingId ? "/schedule?book=" + bookingId : "/account");
          }}
        >
          {register && <Field label="Ваше имя" name="name" />}
          <Field label="Email" name="email" type="email" />
          <label>
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={register ? 10 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && (
            <p className="small muted">
              Минимум 10 символов. Не используйте пароль от других сайтов. Имя,
              email и записи сохраняются для работы личного кабинета.
            </p>
          )}
        </Form>
        <p className="small">
          {register ? "Уже есть аккаунт?" : "Впервые у нас?"}{" "}
          <a
            href={
              "#" +
              (register ? "/login" : "/register") +
              (bookingId ? "?book=" + bookingId : "")
            }
          >
            {register ? "Войти" : "Зарегистрироваться"}
          </a>
        </p>
      </div>
    </section>
  );
}
