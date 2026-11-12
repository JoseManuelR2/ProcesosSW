const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./e2e",
    timeout: 30000,
    use: {
        baseURL: "http://localhost:3000",
        headless: true
    },
    webServer: {
        command: "MONGODB_URI= PORT=3000 ADMIN_EMAIL=admin@test.com ADMIN_PASSWORD=adminpass1 node index.js",
        port: 3000,
        timeout: 30000,
        reuseExistingServer: true
    }
});