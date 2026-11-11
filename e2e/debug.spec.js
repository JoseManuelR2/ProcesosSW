const { test } = require("@playwright/test");

test("debug base user game", async ({ page }) => {
    page.on("console", msg => console.log("CONSOLE:", msg.text()));
    page.on("pageerror", err => console.log("PAGEERROR:", err.message));

    await page.goto("http://localhost:3300");
    await page.waitForTimeout(1000);

    // Login as base user
    await page.fill("#email", "jugador@test.com");
    await page.fill("#password", "contrasena1");
    await page.click("#btnLogin");
    await page.waitForTimeout(2000);

    // Go to game
    await page.click("#navJuego");
    await page.waitForTimeout(1000);

    // Click crear partida
    await page.click("#btnCrearPartida");
    await page.waitForTimeout(2000);

    const content = await page.locator("#contenido").innerHTML();
    console.log("Has editor:", content.includes("Programa tus movimientos"));
    console.log("Has error:", content.includes("danger") && content.includes("alert-danger"));

    await page.screenshot({ path: "/tmp/opencode/debug_base2.png" });
    console.log("DONE");
});
