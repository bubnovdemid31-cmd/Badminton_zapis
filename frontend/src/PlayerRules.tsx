import { useEffect, useState } from "react";
import { api } from "./api";
import { Form, Field, Notice } from "./components";
import type { User, Session } from "./types";
type Level = {
  id: string;
  name: string;
  description: string;
  archived: boolean;
};
export function PlayerRules({
  user,
  session,
  policy,
  onChange,
}: {
  user?: User;
  session?: Session;
  policy?: string;
  onChange: () => void;
}) {
  const [levels, setLevels] = useState<Level[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    api<Level[]>("/admin/levels")
      .then(setLevels)
      .catch((e) => setError(e.message));
  }, [revision]);
  return (
    <div className="panel">
      {error && <Notice error>{error}</Notice>}
      {user ? (
        <>
          <h3>Уровень и кредитный лимит</h3>
          <Form
            submit={async (f) => {
              await api("/admin/clients/" + user.id + "/rules", "PATCH", {
                playerLevelId: f.get("level") || null,
                creditLimit: Math.round(Number(f.get("credit")) * 100),
              });
              onChange();
            }}
          >
            <label>
              Уровень
              <select name="level" defaultValue={user.playerLevelId ?? ""}>
                <option value="">Не назначен</option>
                {levels
                  .filter((l) => !l.archived || l.id === user.playerLevelId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.archived ? " (архив)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="Кредитный лимит, ₽"
              name="credit"
              type="number"
              min={0}
              value={(user.creditLimit ?? 0) / 100}
            />
          </Form>
        </>
      ) : session ? (
        <>
          <h3>Допустимые уровни</h3>
          <p>
            Без выбранных уровней запись доступна всем. Администратор может
            записать участника вне уровня.
          </p>
          <Form
            submit={async (f) => {
              await api("/admin/sessions/" + session.id + "/levels", "PUT", {
                levelIds: f.getAll("level"),
              });
              onChange();
            }}
          >
            {levels
              .filter((l) => !l.archived)
              .map((l) => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    name="level"
                    value={l.id}
                    defaultChecked={session.allowedLevels?.some(
                      (a) => a.levelId === l.id,
                    )}
                  />{" "}
                  {l.name}
                </label>
              ))}
          </Form>
        </>
      ) : (
        <>
          <h3>Правила баланса</h3>
          <Form
            submit={async (f) => {
              await api("/admin/balance-policy", "PATCH", {
                balancePolicy: f.get("policy"),
              });
              onChange();
            }}
          >
            <label>
              Условия записи
              <select name="policy" defaultValue={policy ?? "ALLOW"}>
                <option value="ALLOW">Разрешать запись с любым балансом</option>
                <option value="POSITIVE">Требовать положительный баланс</option>
                <option value="CREDIT">
                  Учитывать стоимость записей и кредитный лимит
                </option>
              </select>
            </label>
          </Form>
          <h3>Уровни игроков</h3>
          {levels.map((l) => (
            <details key={l.id}>
              <summary>
                {l.name}
                {l.archived ? " (архив)" : ""}
              </summary>
              <Form
                submit={async (f) => {
                  await api("/admin/levels/" + l.id, "PATCH", {
                    name: f.get("name"),
                    description: f.get("description"),
                    archived: f.get("archived") === "on",
                  });
                  setRevision((v) => v + 1);
                }}
              >
                <Field name="name" label="Название" value={l.name} />
                <Field
                  name="description"
                  label="Описание"
                  value={l.description}
                  required={false}
                />
                <label>
                  <input
                    name="archived"
                    type="checkbox"
                    defaultChecked={l.archived}
                  />{" "}
                  В архиве
                </label>
              </Form>
            </details>
          ))}
          <h3>Добавить уровень</h3>
          <Form
            submit={async (f) => {
              await api("/admin/levels", "POST", {
                name: f.get("name"),
                description: f.get("description"),
              });
              setRevision((v) => v + 1);
            }}
          >
            <Field name="name" label="Название" />
            <Field name="description" label="Описание" required={false} />
          </Form>
        </>
      )}
    </div>
  );
}
