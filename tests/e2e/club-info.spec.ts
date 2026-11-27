import { test, expect } from "@playwright/test";
test("confirmed rates, capacities and weekly coaches are visible", async ({
  page,
}) => {
  await page.goto("/#/trainings");
  const rows = page.locator(".club-prices .format-card");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "СК «Молодежный»" })).toContainText(
    /650\s*₽/,
  );
  await expect(rows.filter({ hasText: "СК «Молодежный»" })).toContainText(
    "До 26 человек",
  );
  await expect(rows.filter({ hasText: "Динамо Арена" })).toContainText(
    /750\s*₽/,
  );
  await page.goto("/#/schedule");
  const days = page.locator(".weekly-day");
  await expect(days).toHaveCount(6);
  await expect(days.filter({ hasText: "Четверг" })).toHaveCount(0);
  const monday = days.filter({ hasText: "Понедельник" });
  await expect(monday).toContainText("Полина Тимофеева");
  await expect(monday).toContainText("Дарья Трушникова");
  await expect(monday).toContainText("20:00–21:30");
  const saturday = days.filter({ hasText: "Суббота" });
  await expect(saturday).toContainText("Полина Дерюгина");
  await expect(saturday).toContainText("Б3");
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((el) => el.clientWidth),
  );
});
