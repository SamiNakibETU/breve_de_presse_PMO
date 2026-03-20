import { test, expect } from "@playwright/test";

test.describe("Parcours critique UI", () => {
  test("page d’accueil charge la coquille", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: "Articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Revue de presse" })).toBeVisible();
  });

  test("liste Articles affiche l’en-tête", async ({ page }) => {
    await page.goto("/articles");
    await expect(page.getByRole("heading", { name: "Articles" })).toBeVisible();
  });
});
