import { createInterface } from "node:readline/promises";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db, atomic, audit, searchText } from "../server/db.js";
async function password() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY)
    throw new Error(
      "Используйте интерактивный терминал или защищённую переменную ADMIN_PASSWORD",
    );
  process.stdout.write("Пароль (минимум 12 символов, ввод скрыт): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const handler = (buffer: Buffer) => {
      for (const char of buffer.toString()) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("Отменено"));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    function finish() {
      process.stdin.off("data", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    }
    process.stdin.on("data", handler);
  });
}
try {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = z
    .email()
    .parse(
      (process.env.ADMIN_EMAIL ?? (await rl.question("Email администратора: ")))
        .trim()
        .toLowerCase(),
    );
  const name = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .parse(process.env.ADMIN_NAME ?? (await rl.question("Имя: ")));
  rl.close();
  const secret = z
    .string()
    .min(12)
    .max(128)
    .parse(await password());
  const passwordHash = await hash(secret, 12);
  const user = await atomic(async (tx) => {
    if (await tx.user.findUnique({ where: { email } }))
      throw new Error(
        "Этот email уже существует. Команда не повышает права существующих аккаунтов.",
      );
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "ADMIN",
        searchText: searchText(name, email),
      },
    });
    await audit(tx, user.id, "ADMIN_CREATED", user.id, { via: "local CLI" });
    return user;
  });
  console.log("Администратор создан: " + user.email);
} finally {
  await db.$disconnect();
}
