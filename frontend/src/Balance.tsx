import { useEffect, useState } from "react";
import { api } from "./api";
import { Form, Field, Notice, Loading } from "./components";
const money = (value: number) =>
  (value / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" });
type Statement = {
  balance: number;
  entries: {
    id: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    method: string;
    createdAt: string;
  }[];
};
export function Balance({
  userId,
  onChange,
}: {
  userId?: string;
  onChange?: () => void;
}) {
  const [statement, setStatement] = useState<Statement>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const path = userId
    ? "/admin/clients/" + userId + "/balance"
    : "/account/balance";
  useEffect(() => {
    let alive = true;
    api<Statement>(path)
      .then((v) => {
        if (alive) setStatement(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, revision]);
  return (
    <div className="panel">
      <h2>Депозитный баланс</h2>
      {error && <Notice error>{error}</Notice>}
      {!statement ? (
        <Loading />
      ) : (
        <>
          <h3>{money(statement.balance)}</h3>
          {statement.balance < 0 && (
            <Notice error>Задолженность: {money(-statement.balance)}</Notice>
          )}
          <p className="muted">
            Пополнение подтверждает администратор. Стоимость списывается после
            отметки посещения. При записи деньги не списываются.
          </p>
          {userId && (
            <Form
              submit={async (f) => {
                const amount = Number(
                  String(f.get("amount")).replace(",", "."),
                );
                if (
                  !Number.isFinite(amount) ||
                  !Number.isSafeInteger(Math.round(amount * 100)) ||
                  amount === 0
                )
                  throw new Error("Укажите сумму в рублях");
                await api(path, "POST", {
                  amount: Math.round(amount * 100),
                  method: f.get("method"),
                  reason: f.get("reason"),
                  operationKey: key,
                });
                setKey(crypto.randomUUID());
                setRevision((v) => v + 1);
                setError("");
                onChange?.();
              }}
            >
              <Field
                label="Сумма в рублях (минус — списание при корректировке)"
                name="amount"
              />
              <label>
                Операция
                <select name="method">
                  <option value="CASH">Пополнение наличными</option>
                  <option value="TRANSFER">Пополнение переводом</option>
                  <option value="REFUND">Возврат на баланс</option>
                  <option value="CORRECTION">Корректировка</option>
                </select>
              </label>
              <Field label="Причина / комментарий" name="reason" />
            </Form>
          )}
          <h3>История операций</h3>
          <p className="muted">Последние 200 операций. Время Владивостока.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Причина</th>
                  <th>Сумма</th>
                  <th>Остаток</th>
                </tr>
              </thead>
              <tbody>
                {statement.entries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {new Date(e.createdAt).toLocaleString("ru-RU", {
                        timeZone: "Asia/Vladivostok",
                      })}
                    </td>
                    <td>{e.reason}</td>
                    <td>{money(e.amount)}</td>
                    <td>{money(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!statement.entries.length && <p>Операций пока нет.</p>}
        </>
      )}
    </div>
  );
}
