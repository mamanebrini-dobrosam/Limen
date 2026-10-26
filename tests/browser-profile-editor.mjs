import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { devices } from "playwright-core";
import sharp from "sharp";

export async function verifyProfileEditor({ ownerContext, guestContext, api, base }) {
  const browser = guestContext.browser();
  const storageState = await guestContext.storageState();
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#eeeeee" } }).png().toBuffer();
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
    page.on("dialog", (dialog) => dialog.accept());
    const open = async () => {
      await page.goto(`${base}/moja-soba`);
      await page.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
      assert.equal(await page.locator(".palette-picker").count(), 0);
    };
    const content = () => api(context, "GET", "/room/content");
    const about = () => page.getByRole("textbox", { name: "Novi sadržaj za O meni", exact: true });
    const selectColor = async () => {
      await page.getByRole("button", { name: "Promijeni boju", exact: true }).click();
      assert.equal(await page.locator(".palette-picker button").count(), 12);
      await page.getByRole("button", { name: /Sunčano zlato/ }).click();
    };
    try {
      assert.equal((await api(context, "GET", "/rooms/mine")).openSessionId, null);
      const own = await content();
      const seedText = `Prethodno sačuvano ${name}`;
      await api(context, "POST", "/room/items", { sectionId: own.sections[0].id, kind: "text", text: seedText });
      const sectionTitle = `Cjelina za brisanje ${name}`;
      await api(context, "POST", "/room/sections", { title: sectionTitle });
      await open();
      const previous = await content();
      await page.getByRole("link", { name: "Izađi", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");

      // All edit types must remain local until explicit Save.
      await open();
      const writes = [];
      page.on("request", (request) => {
        if (request.method() !== "GET" && /\/api\/(room\/|rooms\/mine)/.test(request.url())) writes.push(request.url());
      });
      await selectColor();
      await page.getByRole("button", { name: "Promijeni boju", exact: true }).click();
      await page.getByRole("button", { name: "Zatvori paletu", exact: true }).click();
      await about().fill(`Odbaci ${name}`);
      const seedRow = page.locator(".item-row").filter({ hasText: seedText });
      await seedRow.getByRole("checkbox").check();
      await seedRow.getByRole("button", { name: "Obriši", exact: true }).click();
      await page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(sectionTitle) }) })
        .getByRole("button", { name: "Obriši cjelinu", exact: true }).click();
      await page.getByLabel("Fotografija za Galerija", { exact: true }).setInputFiles({ name: "draft.png", mimeType: "image/png", buffer: image });
      await page.getByRole("textbox", { name: "Naziv nove cjeline" }).fill(`Nesačuvano ${name}`);
      await page.getByRole("button", { name: "Dodaj cjelinu", exact: true }).click();
      assert.deepEqual(await content(), previous, "Color, visibility, additions, images and deletions have not persisted");
      assert.deepEqual(writes, [], "No edit request may leave the browser before confirmation");
      await page.getByRole("link", { name: "Odustani", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      assert.deepEqual(await content(), previous, "Cancel preserves every previous setting and saved item");

      await open();
      assert.equal(await about().inputValue(), "");
      await page.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await open();
      const text = `Sačuvani profil ${name}`;
      const quote = `Sačuvani citat ${name}`;
      const title = `Nova cjelina ${name}`;
      await about().fill(text);
      await page.getByRole("textbox", { name: "Novi sadržaj za Vision Board", exact: true }).fill(quote);
      await page.getByRole("textbox", { name: "Naziv nove cjeline" }).fill(title);
      await page.getByLabel("Fotografija za Galerija", { exact: true }).setInputFiles({ name: "save.png", mimeType: "image/png", buffer: image });
      await page.locator(".item-row").filter({ hasText: seedText }).getByRole("checkbox").check();
      await page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(sectionTitle) }) })
        .getByRole("button", { name: "Obriši cjelinu", exact: true }).click();
      await selectColor();
      await page.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      const saved = await content();
      assert.equal(saved.theme, "sunce");
      assert.equal(saved.sections.flatMap((s) => s.items).filter((i) => i.text === text).length, 1);
      assert.ok(saved.sections.some((s) => s.title === title));
      assert.ok(!saved.sections.some((s) => s.title === sectionTitle));
      assert.ok(saved.sections.flatMap((s) => s.items).some((i) => i.text === seedText && i.sharedWithGuests));
      assert.ok(saved.sections.flatMap((s) => s.items).some((i) => i.kind === "image" && i.mediaId));
      assert.ok(saved.sections.flatMap((s) => s.items).some((i) => i.text === quote && i.kind === "quote"));
      await open();
      await page.getByText(text, { exact: true }).waitFor();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const exit = await page.getByRole("link", { name: "Izađi", exact: true }).boundingBox();
      assert.ok(exit && exit.y >= 0 && exit.y + exit.height <= page.viewportSize().height);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await about().fill(`Greška ${name}`);
      await page.route("**/api/room/items", (route) => route.request().method() === "POST"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "test", message: "Probna greška čuvanja profila." }) })
        : route.continue());
      await page.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Probna greška čuvanja profila." }).waitFor();
      assert.equal(await page.locator(".item-row").filter({ hasText: `Greška ${name}` }).count(), 1);
      assert.deepEqual(await content(), saved);
      await page.getByRole("link", { name: "Odustani", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await page.unroute("**/api/room/items");
      await open();
      assert.equal(await about().inputValue(), "");
      await fs.mkdir("generated-artifacts/limen-profile-editor", { recursive: true });
      await page.screenshot({ path: `generated-artifacts/limen-profile-editor/${name}.jpg`, type: "jpeg", fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS explicit save ${name} (Chromium): no autosave, cancel all edit types, confirmed save/reload, closed palette, nested menu exit, failed save and sticky exit`);
    } finally { await context.close(); }
  }
  // Guests may change their own room, never a host's room/content.
  const ownerContent = await api(ownerContext, "GET", "/room/content");
  const target = ownerContent.sections[0].id;
  const ownerItem = (await api(ownerContext, "POST", "/room/items", { sectionId: target, kind: "text", text: "Private owner-only fixture" })).item;
  for (const [method, path, data] of [
    ["POST", "/room/items", { sectionId: target, kind: "text", text: "unauthorized" }],
    ["PATCH", `/room/sections/${target}`, { title: "unauthorized" }],
    ["PATCH", `/room/items/${ownerItem.id}`, { sharedWithGuests: true }],
    ["DELETE", `/room/items/${ownerItem.id}`, undefined],
  ]) {
    const result = await guestContext.request.fetch(`${base}/api${path}`, { method, headers: { "x-limen": "1" }, data });
    assert.equal(result.status(), 404, "Guest cannot modify another owner's content/settings");
  }
  const owner = await ownerContext.newPage();
  try {
    const mine = await api(ownerContext, "GET", "/rooms/mine");
    assert.ok(mine.openSessionId);
    await owner.goto(`${base}/moja-soba`);
    await owner.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
    await owner.getByRole("link", { name: "Izađi", exact: true }).click();
    await owner.waitForURL((url) => url.pathname === `/sto/${mine.openSessionId}`);
    console.log("PASS existing room exit and server rejection of foreign-room writes");
  } finally { await owner.close(); }
}
