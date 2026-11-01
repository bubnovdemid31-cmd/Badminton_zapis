import { test, expect } from "@playwright/test";
test("confirmed rates, capacities and weekly coaches are visible", async ({
  page,
}) => {
  await page.goto("/#/trainings");
  const rows = page.locator(".club-prices .format-card");
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: "СК «Молодежный»" })).toContainText(
    /650\s*₽/,
  );
  await expect(rows.filter({ hasText: "СК «Молодежный»" })).toContainText(
    "До 26 человек",
  );
  await expect(rows.filter({ hasText: "Мини-группа" })).toContainText(
    /1\s*500\s*₽/,
  );
  await expect(rows.filter({ hasText: "Мини-группа" })).toContainText(
    "До 16 человек",
  );
  await expect(rows.filter({ hasText: "Сплит-тренировка" })).toContainText(
    /от 1\s*500\s*₽/,
  );
  await expect(
    rows.filter({ hasText: "Индивидуальная тренировка" }),
  ).toContainText(/от 3\s*000\s*₽/);
  await page.goto("/#/schedule");
  const days = page.locator(".weekly-day");
  await expect(days).toHaveCount(6);
  await expect(days.filter({ hasText: "Четверг" })).toHaveCount(0);
  const monday = days.filter({ hasText: "Понедельник" });
  await expect(monday).toContainText("Полина Т.");
  await expect(monday).toContainText("Дарья Т.");
  await expect(monday).toContainText("20:00–21:00");
  const saturday = days.filter({ hasText: "Суббота" });
  await expect(saturday).toContainText("Полина Д.");
  await expect(saturday).toContainText("Начальный уровень");
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((el) => el.clientWidth),
  );
});
