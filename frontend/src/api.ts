const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
let csrf = "";
export async function api<T = unknown>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const res = await fetch(base + "/api" + path, {
    method,
    credentials: "include",
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrf } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await res
    .json()
    .catch(() => ({ error: "Сервер недоступен. Попробуйте позже." }));
  if (!res.ok) throw new Error(body.error ?? "Не удалось выполнить запрос");
  if (body.csrf) csrf = body.csrf;
  return body as T;
}
