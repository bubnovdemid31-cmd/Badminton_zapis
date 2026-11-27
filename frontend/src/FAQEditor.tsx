import { useRef, useState } from "react";
import { api } from "./api";
import { Form } from "./components";
import type { FAQEntry } from "./types";

export function FAQEditor({
  faq,
  reload,
}: {
  faq: FAQEntry[] | null;
  reload: () => void;
}) {
  const [entries, setEntries] = useState(() =>
    (faq ?? []).map((entry, id) => ({ ...entry, id })),
  );
  const nextId = useRef(entries.length);

  return (
    <div className="panel settings-panel">
      <h2>Частые вопросы</h2>
      <p className="muted">
        Сохранённые ответы появятся на странице «О клубе».
      </p>
      <Form
        submit={async (form) => {
          await api(
            "/admin/faq",
            "PUT",
            entries.map(({ id }) => ({
              question: form.get("question-" + id),
              answer: form.get("answer-" + id),
            })),
          );
          reload();
        }}
      >
        {entries.map(({ id, question, answer }) => (
          <fieldset key={id}>
            <label>
              Вопрос
              <input
                name={"question-" + id}
                defaultValue={question}
                maxLength={200}
                required
              />
            </label>
            <label>
              Ответ
              <textarea
                name={"answer-" + id}
                defaultValue={answer}
                maxLength={2000}
                required
              />
            </label>
            <button
              type="button"
              className="text-button danger"
              onClick={() =>
                setEntries((rows) => rows.filter((row) => row.id !== id))
              }
            >
              Удалить вопрос
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button outline"
          disabled={entries.length >= 50}
          onClick={() => {
            const id = nextId.current++;
            setEntries((rows) => [...rows, { id, question: "", answer: "" }]);
          }}
        >
          Добавить вопрос
        </button>
      </Form>
    </div>
  );
}
