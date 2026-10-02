import { expect, test } from "@playwright/test";

test.describe("WGUI combat panel", () => {
  test("GM view displays full combat data", async ({ page }) => {
    await page.goto("/?role=GM");

    await expect(page.getByText("GM VIEW")).toBeVisible();
    await expect(page.getByRole("heading", { name: "wg combat test" })).toBeVisible();

    const row = page.locator(".combatant-row").filter({ hasText: "Hadrosaurid" });
    await expect(row).toContainText("Level 4");
    await expect(row).toContainText("AC");
    await expect(row).toContainText("18");
    await expect(row).toContainText("40 / 59");
    await expect(row).toContainText("Frightened 1");

    await row.getByRole("button").click();
    await expect(row).toContainText("FORT");
    await expect(row).toContainText("+11");
    await expect(row).toContainText("Perception");
    await expect(row).toContainText("+8");
  });

  test("player view does not expose exact enemy statistics", async ({ page }) => {
    await page.goto("/?role=PLAYER");

    await expect(page.getByText("PLAYER VIEW")).toBeVisible();

    const row = page.locator(".combatant-row").filter({ hasText: "Hadrosaurid" });
    await expect(row).toContainText("Enemy");
    await expect(row).toContainText("Injured");
    await expect(row).not.toContainText("Level 4");
    await expect(row).not.toContainText("40 / 59");

    await row.getByRole("button").click();
    await expect(row).not.toContainText("+11");
    await expect(row).not.toContainText("+8");
    await expect(row).toContainText("Frightened 1");
  });

  test("browser preview can switch between GM and player projections", async ({ page }) => {
    await page.goto("/?role=GM");
    await page.getByRole("button", { name: "Player" }).click();

    await expect(page.getByText("PLAYER VIEW")).toBeVisible();
    const row = page.locator(".combatant-row").filter({ hasText: "Hadrosaurid" });
    await expect(row).toContainText("Injured");
    await expect(row).not.toContainText("40 / 59");
  });

  for (const width of [560, 420, 360, 320]) {
    test(`does not horizontally overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await page.goto("/?role=GM");

      await expect(page.getByText("GM VIEW")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    });
  }
});
