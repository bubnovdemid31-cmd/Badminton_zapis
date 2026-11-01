import { test, expect } from "@playwright/test";
test("register, book, reload persistence, cancel; responsive public pages", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Время.*для игры/ }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((el) => el.clientWidth),
  );
  await page.getByRole("link", { name: "Записаться на тренировку" }).click();
  await expect(
    page.getByRole("heading", { name: "Расписание тренировок" }),
  ).toBeVisible();
  await page.getByLabel("Формат", { exact: true }).selectOption("GROUP");
  await page.getByRole("button", { name: "Записаться ↗" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Рады видеть снова" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Зарегистрироваться", exact: true })
    .click();
  await page.getByLabel("Ваше имя").fill("Тестовый игрок");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-${info.project.name}-${Date.now()}@example.test`);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("testing-strong-password");
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Подтверждение записи" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Подтвердить запись", exact: true })
    .click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  await page.getByLabel("Телефон", { exact: true }).fill("+7 999 123 45 67");
  await page
    .getByRole("button", { name: "Сохранить", exact: true })
    .first()
    .click();
  await expect(page.getByText("Сохранено успешно")).toBeVisible();
  await page
    .getByRole("button", { name: "Предстоящие тренировки", exact: true })
    .click();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Отменить запись", exact: true })
    .click();
  await expect(page.locator(".booking-row")).toHaveCount(0);
  await page.getByRole("button", { name: "История", exact: true }).click();
  await expect(
    page.getByText("Отменено клиентом", { exact: true }),
  ).toBeVisible();
  await page.goto("/#/admin");
  await expect(
    page.getByText("Доступ к панели есть только у администратора."),
  ).toBeVisible();
  await page.goto("/#/contacts");
  await expect(
    page.getByRole("heading", { name: "Контакты клуба" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.goto("/");
  await page.screenshot({
    path: `test-results/home-${info.project.name}.png`,
    fullPage: true,
  });
});
