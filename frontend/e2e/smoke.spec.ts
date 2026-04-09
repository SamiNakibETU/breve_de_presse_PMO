import { test, expect } from "@playwright/test";

test.describe("Parcours critique UI", () => {
  test("page d'accueil charge la coquille", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("link", { name: "Articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Revue de presse" })).toBeVisible();
  });

  test("liste Articles affiche l'en-tête", async ({ page }) => {
    await page.goto("/articles");
    await expect(page.getByRole("heading", { name: "Articles" })).toBeVisible();
  });

  test("page Panorama se charge sans erreur", async ({ page }) => {
    await page.goto("/panorama");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("page 404 affiche le lien Édition du jour", async ({ page }) => {
    await page.goto("/page-qui-nexiste-pas-vraiment-12345");
    const body = page.locator("body");
    await expect(body).toBeVisible();
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("link", { name: "Édition du jour" })).toBeVisible();
  });

  test("redirection /redaction ne provoque pas d'erreur serveur", async ({ page }) => {
    const resp = await page.goto("/redaction", { waitUntil: "commit" });
    // Doit rediriger vers /edition (302) puis charger normalement
    expect(resp?.status()).not.toBe(500);
    expect(page.url()).not.toContain("/redaction");
  });

  test("page Edition du jour se charge", async ({ page }) => {
    const today = new Date()
      .toLocaleDateString("fr-CA", {
        timeZone: "Asia/Beirut",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-");
    await page.goto(`/edition/${today}`);
    await expect(page.locator("main")).toBeVisible();
  });
});
