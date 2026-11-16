// Prueba end-to-end del lobby con el administrador sembrado por playwright.config.js.
// No necesita un segundo jugador: crea una partida, vuelve al lobby y la cancela.
const { test, expect } = require("@playwright/test");

test("el administrador crea una partida, vuelve al lobby y la cancela", async ({ page }) => {
    await page.goto("http://localhost:3000");

    await page.fill("#email", "admin@test.com");
    await page.fill("#password", "adminpass1");
    await page.click("#btnLogin");

    await expect(page.locator("#navJuego")).toBeVisible();
    await page.waitForFunction(function(){
        return window.juegoWeb && window.juegoWeb.socket && window.juegoWeb.socket.connected;
    });

    await page.click("#navJuego");
    await expect(page.locator("#btnCrearPartida")).toBeVisible();

    await page.selectOption("#dificultad", "pequeno");
    await page.click("#btnCrearPartida");

    // El editor aparece cuando el servidor confirma la creación de la partida.
    await expect(page.locator("#btnEnviar")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#paleta")).toContainText("move");

    // Volver al lobby desde la barra de navegación.
    await page.click("#navJuego");
    await expect(page.locator("#btnCrearPartida")).toBeVisible();

    // El administrador ve la partida en la lista y puede cancelarla.
    let cancelar = page.locator(".btn-cancelar").first();
    await expect(cancelar).toBeVisible({ timeout: 10000 });
    await cancelar.click();
    await expect(page.locator(".btn-cancelar")).toHaveCount(0, { timeout: 10000 });
});
