const { test, expect } = require("@playwright/test");

test("la página principal carga y muestra el título", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await expect(page).toHaveTitle(/ProcesosSW/);
});

test("el script del juego está incluido", async ({ page }) => {
    await page.goto("http://localhost:3000");
    const scripts = await page.locator("script").all();
    let found = false;
    for (const s of scripts){
        const src = await s.getAttribute("src");
        if (src && src.includes("juego.js")){ found = true; break; }
    }
    expect(found).toBe(true);
});

test("Socket.IO está disponible", async ({ page }) => {
    await page.goto("http://localhost:3000");
    const hasIO = await page.evaluate(() => typeof io !== "undefined");
    expect(hasIO).toBe(true);
});