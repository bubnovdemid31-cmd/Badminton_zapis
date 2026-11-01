import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  formats,
  levels,
  money,
  dateTime,
  time,
  type Session,
  type Club,
} from "./types";
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={"notice " + (error ? "error" : "")}
    >
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span />
      Загружаем данные…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span>↗</span>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = ref.current;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && root) {
        const fields = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
          ),
        ];
        const first = fields[0],
          last = fields[fields.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            autoFocus
            aria-label="Закрыть"
            className="icon-btn"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Form({
  children,
  submit,
  label = "Сохранить",
  onSuccess,
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<void>;
  label?: string;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await submit(new FormData(e.currentTarget));
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={send}>
      {children}
      {error && <Notice error>{error}</Notice>}
      {done && <Notice>Сохранено успешно</Notice>}
      <button className="button" disabled={busy}>
        {busy ? "Сохраняем…" : label}
      </button>
    </form>
  );
}
export function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: number | string;
  max?: number | string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
      />
    </label>
  );
}
export function SessionCard({
  s,
  club,
  onBook,
}: {
  s: Session;
  club: Club;
  onBook: (s: Session) => void;
}) {
  const left = s.capacity - s._count.bookings;
  return (
    <article className="session-card">
      <div className="session-top">
        <span className={"tag " + s.format.toLowerCase()}>
          {formats[s.format]}
        </span>
        <span className="muted">
          {Math.round((+new Date(s.endsAt) - +new Date(s.startsAt)) / 60000)}{" "}
          мин
        </span>
      </div>
      <h3>{dateTime(s.startsAt, club.timezone)}</h3>
      <p className="muted small">
        до {time(s.endsAt, club.timezone)} · {levels[s.level]}
      </p>
      <div className="session-details">
        <p>
          <span>↗</span>
          {s.trainer.name}
        </p>
        <p>
          <span>⌖</span>
          {s.court.venue.name}, {s.court.name}
        </p>
        <p className="muted small">{s.court.venue.address}</p>
      </div>
      <div className="session-bottom">
        <strong>{money(s.price)}</strong>
        <span className={left <= 2 ? "few" : "muted"}>
          {left > 0 ? `${left} из ${s.capacity} мест` : "Мест нет"}
        </span>
      </div>
      <button
        className="button full"
        disabled={!s.open || left <= 0}
        onClick={() => onBook(s)}
      >
        {!s.open
          ? "Запись закрыта"
          : left <= 0
            ? "Группа набрана"
            : "Записаться ↗"}
      </button>
    </article>
  );
}
