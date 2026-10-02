import { expect, test } from "@playwright/test";

test.describe("WGUI combat panel", () => {
  test("manifest and extension icon are served correctly", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.json");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.manifest_version).toBe(1);
    expect(manifest.action?.popover).toBe("/");

    const iconResponse = await request.get(manifest.action.icon);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  });

  test("GM and player previews produce no browser page errors or console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.goto("/?role=GM");
    await expect(page.getByText("GM VIEW")).toBeVisible();
    await page.goto("/?role=PLAYER");
    await expect(page.getByText("PLAYER VIEW")).toBeVisible();

    expect(errors).toEqual([]);
  });

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

  test("player page contains no exact enemy HP or defense values from sample data", async ({ page }) => {
    await page.goto("/?role=PLAYER");

    await expect(page.locator("body")).not.toContainText("40 / 59");
    await expect(page.locator("body")).not.toContainText("58 / 72");
    await expect(page.locator("body")).not.toContainText("Level 4");
    await expect(page.locator("body")).not.toContainText("+11");
    await expect(page.locator("body")).not.toContainText("+12");
  });

  test("unmatched token color can be selected and persists locally", async ({ page }) => {
    await page.goto("/?role=GM");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    const row = page.locator(".combatant-row").filter({ hasText: "Ulysses" });
    await expect(row).toHaveAttribute("data-token-match", "unmatched");

    await row.locator(".combatant-main").click();
    const purple = row.getByRole("button", { name: "Set Ulysses token color to #6d28d9" });
    await expect(purple).toBeVisible();
    await purple.click();

    await expect(row).toHaveAttribute("data-token-match", "manual");
    await expect(purple).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    const reloadedRow = page.locator(".combatant-row").filter({ hasText: "Ulysses" });
    await expect(reloadedRow).toHaveAttribute("data-token-match", "manual");
  });

  test("opening another combatant closes the previous detail panel", async ({ page }) => {
    await page.goto("/?role=GM");

    const hadrosaurid = page.locator(".combatant-row").filter({ hasText: "Hadrosaurid" });
    const ulysses = page.locator(".combatant-row").filter({ hasText: "Ulysses" });

    await hadrosaurid.getByRole("button").click();
    await expect(hadrosaurid.locator(".combatant-detail")).toBeVisible();

    await ulysses.getByRole("button").click();
    await expect(ulysses.locator(".combatant-detail")).toBeVisible();
    await expect(hadrosaurid.locator(".combatant-detail")).toHaveCount(0);
  });

  test("long combatant and condition labels stay within the Owlbear panel", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 820 });
    await page.goto("/?role=GM");

    const row = page.locator(".combatant-row").first();
    await row.locator(".identity strong").evaluate((node) => {
      node.textContent = "An Extremely Long Pathfinder Creature Name That Should Never Widen The Panel";
    });

    const chip = row.locator(".condition-chip").first();
    if (await chip.count()) {
      await chip.evaluate((node) => {
        node.textContent = "An Extremely Long Persistent Condition Name That Must Truncate";
      });
    }

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  for (const width of [560, 480, 420, 390, 360, 340, 320]) {
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
