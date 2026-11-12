const { test } = require("@playwright/test");

test("back to lobby", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    page1.on("console", msg => console.log("P1:", msg.text()));
    page1.on("pageerror", err => console.log("P1 ERROR:", err.message));

    await page1.goto("http://localhost:3300");
    await page1.waitForTimeout(500);
    await page1.fill("#email", "admin@test.com");
    await page1.fill("#password", "adminpass1");
    await page1.click("#btnLogin");
    await page1.waitForTimeout(2000);

    await page2.goto("http://localhost:3300");
    await page2.waitForTimeout(500);
    await page2.fill("#email", "jugador@test.com");
    await page2.fill("#password", "contrasena1");
    await page2.click("#btnLogin");
    await page2.waitForTimeout(2000);

    await page1.click("#navJuego");
    await page1.waitForTimeout(1000);
    await page1.click("#btnCrearPartida");
    await page1.waitForTimeout(2000);

    await page2.click("#navJuego");
    await page2.waitForTimeout(1000);
    await page2.click("#btnRefrescar");
    await page2.waitForTimeout(1000);
    const unirseBtn = page2.locator(".btn-unirse").first();
    if (await unirseBtn.count() > 0) {
        await unirseBtn.click();
        await page2.waitForTimeout(2000);
    }

    // Player 1 adds move block and sends
    await page1.click('.block-palette[data-type="mv"]');
    await page1.waitForTimeout(500);
    await page1.click("#btnEnviar");
    await page1.waitForTimeout(2000);

    // Player 2 adds move block and sends
    await page2.click('.block-palette[data-type="mv"]');
    await page2.waitForTimeout(500);
    await page2.click("#btnEnviar");
    await page2.waitForTimeout(3000);

    // Now click Back to lobby on page1
    const btnVolver = page1.locator("#btnVolverLobby");
    console.log("btnVolverLobby count:", await btnVolver.count());
    if (await btnVolver.count() > 0) {
        await btnVolver.click();
        await page1.waitForTimeout(2000);
    }

    const content = await page1.locator("#contenido").innerHTML();
    console.log("After back, has lobby:", content.includes("Maze Duel") && content.includes("Create game"));
    console.log("After back, has resultado:", content.includes("Result"));

    // Now click Maze Duel in nav
    await page1.click("#navJuego");
    await page1.waitForTimeout(2000);
    const content2 = await page1.locator("#contenido").innerHTML();
    console.log("After nav click, has lobby:", content2.includes("Maze Duel") && content2.includes("Create game"));

    await page1.screenshot({ path: "/tmp/opencode/lobby_test.png" });
    console.log("DONE");

    await ctx1.close();
    await ctx2.close();
});
