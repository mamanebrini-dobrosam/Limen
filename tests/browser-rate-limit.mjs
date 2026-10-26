import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, devices } from "playwright-core";
import { browserBase as base } from "./browser-target.mjs";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", args: ["--no-sandbox"],
});
try {
  for (const [name, device] of [["desktop", { viewport: { width: 1280, height: 900 } }],
    ["Android", devices["Pixel 7"]], ["iPhone", devices["iPhone 13"]]]) {
    const context = await browser.newContext({ ...device, baseURL: base });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    let attempts = 0;
    let wait = 252;
    await page.route("**/api/auth/login", async (route) => {
      attempts++;
      await route.fulfill({ status: 429, contentType: "application/json",
        headers: { "retry-after": String(wait) },
        body: JSON.stringify({ error: "rate_limited", message: "Previše pokušaja. Pokušaj ponovo kasnije.", retryAfter: wait }),
      });
    });
    await page.goto("/prijava");
    await page.getByLabel("Email", { exact: true }).fill("countdown@test.local");
    await page.getByLabel("Lozinka", { exact: true }).fill("Synthetic-only-123!");
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "4 min 12 sek." }).waitFor();
    await page.clock.fastForward(12000);
    await page.getByRole("timer").filter({ hasText: "4 min 0 sek." }).waitFor();
    assert.equal(attempts, 1, "Clock updates must never attempt login.");
    await fs.mkdir("generated-artifacts/limen-countdown", { recursive: true });
    await page.screenshot({ path: `generated-artifacts/limen-countdown/${name}.jpg`, fullPage: true });
    await page.clock.fastForward(240000);
    await page.getByRole("alert").filter({ hasText: "Čekanje je isteklo. Možeš ponovo pokušati." }).waitFor();
    await page.clock.fastForward(60000);
    assert.equal(attempts, 1, "Expiry must never attempt login.");
    // Only an explicit click makes another request and can show a fresh server wait.
    wait = 60;
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await page.getByRole("timer").filter({ hasText: "1 min 0 sek." }).waitFor();
    assert.equal(attempts, 2);
    // Clear timer on unmount; no delayed retry after navigating away.
    await page.getByRole("link", { name: "Zaboravljena lozinka", exact: true }).click();
    await page.clock.fastForward(120000);
    assert.equal(attempts, 2);
    assert.equal(await page.getByRole("timer").count(), 0);
    // Guest request uses the same display, not a new protection rule.
    await page.route("**/api/visitor/qr/countdown-fixture", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ owner: { id: "fixture", displayName: "Test domaćin" }, chat: null }),
    }));
    let guestAttempts = 0;
    await page.route("**/api/visitor/requests", (route) => {
      guestAttempts++;
      return route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "2" },
        body: JSON.stringify({ error: "rate_limited", message: "Previše pokušaja.", retryAfter: 2 }) });
    });
    await page.goto("/c/countdown-fixture");
    await page.getByLabel("Ime ili nadimak", { exact: true }).fill("Test gost");
    await page.getByRole("button", { name: "Pošalji zahtjev", exact: true }).click();
    await page.getByRole("timer").filter({ hasText: "0 min 2 sek." }).waitFor();
    await page.clock.fastForward(3000);
    await page.getByRole("alert").filter({ hasText: "Čekanje je isteklo." }).waitFor();
    assert.equal(guestAttempts, 1);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name} Chromium: countdown, expiry, manual retry, unmount cleanup and guest request; no automatic submissions`);
    await context.close();
  }
} finally { await browser.close(); }
