import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { devices } from "playwright-core";

export async function verifyProfileEditor({ ownerContext, guestContext, api, base }) {
  const browser = guestContext.browser();
  const storageState = await guestContext.storageState();
  const variants = [
    ["desktop", { viewport: { width: 1280, height: 900 } }],
    ["Android", devices["Pixel 7"]],
    ["iPhone", devices["iPhone 13"]],
  ];
  for (const [name, device] of variants) {
    const { defaultBrowserType, ...options } = device;
    const context = await browser.newContext({ ...options, storageState, baseURL: base });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const open = async () => {
      await page.goto(`${base}/moja-soba`);
      await page.getByRole("button", { name: "Sačuvaj promjene", exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
    };
    const content = () => api(context, "GET", "/room/content");
    const about = () => page.getByRole("textbox", { name: "Novi sadržaj za O meni", exact: true });
    try {
      assert.equal((await api(context, "GET", "/rooms/mine")).openSessionId, null);
      await open();
      const previous = await content();
      // Empty optional fields must never trap the user or trigger validation.
      await page.getByRole("link", { name: "Nazad", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await open();
      await about().fill(`Odbaci ${name}`);
      await page.getByRole("textbox", { name: "Naziv nove cjeline" }).fill(`Nesačuvano ${name}`);
      await page.getByRole("link", { name: "Odustani", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      assert.deepEqual(await content(), previous, "Cancel preserves all existing saved data");

      await open();
      assert.equal(await about().inputValue(), "");
      // Saving an empty profile is also a valid way out.
      await page.getByRole("button", { name: "Sačuvaj promjene", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await open();
      const text = `Sačuvani profil ${name}`;
      const quote = `Sačuvani citat ${name}`;
      const title = `Nova cjelina ${name}`;
      await about().fill(text);
      await page.getByRole("textbox", { name: "Novi sadržaj za Vision Board", exact: true }).fill(quote);
      await page.getByRole("textbox", { name: "Naziv nove cjeline" }).fill(title);
      await page.getByRole("button", { name: "Sačuvaj promjene", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      const saved = await content();
      assert.equal(saved.sections.flatMap((s) => s.items).filter((i) => i.text === text).length, 1);
      assert.ok(saved.sections.some((s) => s.title === title));
      assert.ok(saved.sections.flatMap((s) => s.items).some((i) => i.text === quote && i.kind === "quote"));
      await open();
      await page.getByText(text, { exact: true }).waitFor();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const back = await page.getByRole("link", { name: "Nazad", exact: true }).boundingBox();
      assert.ok(back && back.y >= 0 && back.y + back.height <= page.viewportSize().height, "Exit remains visible at the bottom");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await about().fill(`Greška ${name}`);
      await page.route("**/api/room/items", (route) => route.request().method() === "POST"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "test", message: "Probna greška čuvanja profila." }) })
        : route.continue());
      await page.getByRole("button", { name: "Sačuvaj promjene", exact: true }).click();
      await page.getByRole("alert").getByText("Probna greška čuvanja profila.").waitFor();
      assert.equal(await about().inputValue(), `Greška ${name}`);
      assert.deepEqual(await content(), saved, "Failed save preserves existing data");
      await page.getByRole("link", { name: "Odustani", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await page.unroute("**/api/room/items");
      await open();
      assert.equal(await about().inputValue(), "");
      await fs.mkdir("generated-artifacts/limen-profile-editor", { recursive: true });
      await page.screenshot({ path: `generated-artifacts/limen-profile-editor/${name}.jpg`, type: "jpeg", fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS profile editor ${name} (Chromium): exit without session/incomplete fields, save/reload, cancel preserves data, failed save can exit, sticky controls and no overflow`);
    } finally { await context.close(); }
  }
  const owner = await ownerContext.newPage();
  try {
    const mine = await api(ownerContext, "GET", "/rooms/mine");
    assert.ok(mine.openSessionId);
    await owner.goto(`${base}/moja-soba`);
    await owner.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
    await owner.getByRole("link", { name: "Nazad", exact: true }).click();
    await owner.waitForURL((url) => url.pathname === `/sto/${mine.openSessionId}`);
    console.log("PASS profile editor returns to existing room when a conversation is open");
  } finally { await owner.close(); }
}
