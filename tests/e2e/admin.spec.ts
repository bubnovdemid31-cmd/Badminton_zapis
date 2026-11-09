import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { db } from "../../backend/src/db.js";
let email: string, password: string;
let trainerId: string, courtId: string, trainerName: string;
test.beforeAll(async () => {
  email = `e2e-admin-${Date.now()}@example.test`;
  password = randomBytes(24).toString("hex");
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "backend/scripts/create-admin.ts"],
    {
      env: {
        ...process.env,
        ADMIN_EMAIL: email,
        ADMIN_NAME: "Тестовый администратор",
        ADMIN_PASSWORD: password,
      },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
  trainerName = "Тестовый тренер " + Date.now();
  trainerId = (
    await db.trainer.create({
      data: { name: trainerName, bio: "Временный тренер сквозной проверки" },
    })
  ).id;
  courtId = (
    await db.court.create({
      data: {
        name: "Тестовый корт " + Date.now(),
        venueId: "club-youth",
      },
    })
  ).id;
});
test.afterAll(async () => {
  if (trainerId) {
    await db.booking.deleteMany({ where: { session: { trainerId } } });
    await db.session.deleteMany({ where: { trainerId } });
    await db.trainer.delete({ where: { id: trainerId } });
  }
  if (courtId) await db.court.delete({ where: { id: courtId } });
  if (email) {
    await db.ledgerEntry.deleteMany({ where: { user: { email } } });
    await db.user.deleteMany({ where: { email } });
  }
  await db.$disconnect();
});
test("admin creates a session and a phone guest booking, then cancels it", async ({
  page,
}, info) => {
  await page.goto("/#/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("link", { name: "Панель администратора", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Панель администратора" }),
  ).toBeVisible();
  await expect(
    page.getByText("Тренировки сегодня", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Создать занятие", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Занятие", exact: true });
  const date = new Date(
    Date.now() + (info.project.name === "mobile" ? 15 : 14) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  await dialog.getByLabel("Начало", { exact: true }).fill(date + "T15:00");
  await dialog.getByLabel("Окончание", { exact: true }).fill(date + "T16:00");
  await dialog
    .getByRole("combobox", { name: "Тренер", exact: true })
    .selectOption({ label: trainerName });
  await dialog
    .getByRole("combobox", { name: "Корт и площадка", exact: true })
    .selectOption(courtId);
  await dialog
    .getByLabel("Вместимость (для индивидуальной — 1)", { exact: true })
    .fill("4");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toBeHidden();
  const created = await db.session.findFirstOrThrow({
    where: {
      startsAt: new Date(date + "T15:00:00+10:00"),
      trainerId,
      cancelled: false,
    },
  });
  await page.getByRole("button", { name: "Записи", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Записать клиента / гостя", exact: true })
    .click();
  const booking = page.getByRole("dialog", {
    name: "Записать участника",
    exact: true,
  });
  await booking
    .getByRole("combobox", { name: "Занятие", exact: true })
    .selectOption(created.id);
  await booking
    .getByRole("combobox", { name: "Способ записи", exact: true })
    .selectOption("guest");
  await booking
    .getByLabel("Имя гостя", { exact: true })
    .fill("Гость браузерной проверки");
  await booking
    .getByLabel("Телефон гостя", { exact: true })
    .fill("+7 999 111 22 33");
  await booking.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(booking).toBeHidden();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Гость браузерной проверки" })
    .first();
  await expect(row).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Отменить", exact: true }).click();
  await expect(row.getByText("Отменено клубом", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  const sessionRow = page
    .getByRole("row")
    .filter({
      hasText: trainerName,
    })
    .first();
  await sessionRow
    .getByRole("button", { name: "Отменить", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Журнал действий", exact: true })
    .click();
  await expect(page.getByText(/SESSION_CANCELLED/).first()).toBeVisible();
});

test("admin manually tops up a balance and assigns the participant level", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("link", { name: "Панель администратора", exact: true })
    .click();
  await page.getByRole("button", { name: "Клиенты", exact: true }).click();
  await page.getByRole("textbox", { name: "Поиск клиентов" }).fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: /операции/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Баланс: Тестовый администратор",
  });
  await dialog.getByLabel("Сумма в рублях", { exact: false }).fill("5000");
  await dialog
    .getByLabel("Причина / комментарий")
    .fill("Тестовое ручное пополнение");
  await dialog
    .getByRole("button", { name: "Сохранить", exact: true })
    .first()
    .click();
  await expect(
    dialog.getByRole("heading", { name: /5.*000/ }).first(),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Уровень", exact: true })
    .selectOption("beginner");
  await dialog
    .getByRole("button", { name: "Сохранить", exact: true })
    .last()
    .click();
  await expect
    .poll(
      async () =>
        (await db.user.findUniqueOrThrow({ where: { email } })).playerLevelId,
    )
    .toBe("beginner");
});

test("admin corrects a missed attendance and the balance is charged", async ({
  page,
}) => {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const balance = user.balance;
  const session = await db.session.create({
    data: {
      startsAt: new Date(Date.now() - 7200000),
      endsAt: new Date(Date.now() - 3600000),
      trainerId,
      courtId,
      format: "GROUP",
      level: "BEGINNER",
      capacity: 5,
      price: 90000,
    },
  });
  await db.booking.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      participantKey: "user:" + user.id + ":adult",
      status: "MISSED",
      priceSnapshot: 90000,
    },
  });
  await page.goto("/#/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page
    .getByRole("link", { name: "Панель администратора", exact: true })
    .click();
  await page.getByRole("button", { name: "Записи", exact: true }).click();
  await page
    .getByRole("button", { name: "Исправить посещение", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Исправить посещение" });
  await dialog
    .getByRole("combobox", { name: "Статус" })
    .selectOption("ATTENDED");
  await dialog
    .getByLabel("Причина исправления")
    .fill("Участник присутствовал, исправляем ошибку");
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await db.user.findUniqueOrThrow({ where: { email } })).balance,
    )
    .toBe(balance - 90000);
  await page.waitForLoadState("networkidle");
});
