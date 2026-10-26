import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { ROOM_PALETTES, effectivePaletteColor } from "../src/shared/room-palettes.ts";

export async function verifyRoomPalettes({ ownerContext, guestContext, roomPage, guestPage, api, base }) {
  const editor = await ownerContext.newPage();
  await editor.goto(`${base}/moja-soba`);
  await editor.getByRole("heading", { name: "Izgled sobe", exact: true }).waitFor();
  await editor.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
  assert.equal(await editor.locator(".palette-picker").count(), 0, "Palette starts closed");
  await editor.getByRole("button", { name: "Promijeni boju", exact: true }).click();
  const officialLogo = "/brand/palette/slonovaca.png";
  const previewLogos = await editor.locator(".palette-picker .palette-choice-image img").evaluateAll((images) =>
    images.map((img) => ({
      path: new URL(img.src).pathname,
      filter: getComputedStyle(img).filter,
      opacity: getComputedStyle(img).opacity,
      blend: getComputedStyle(img).mixBlendMode,
    })));
  assert.equal(previewLogos.length, 12);
  for (const logo of previewLogos) {
    assert.equal(logo.path, officialLogo, "All backgrounds retain the same official logo");
    assert.equal(logo.filter, "none");
    assert.equal(logo.opacity, "1");
    assert.equal(logo.blend, "normal");
  }
  await editor.getByRole("button", { name: "Zatvori paletu", exact: true }).click();
  assert.equal(await guestPage.getByRole("link", { name: "Uredi sobu", exact: true }).count(), 0);
  const mine = await api(ownerContext, "GET", "/rooms/mine");
  const guestBefore = (await api(guestContext, "GET", "/rooms/mine")).room.theme;
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const until = async (fn, label) => {
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(label);
  };
  const rgb = (hex) => `rgb(${hex.slice(1).match(/.{2}/g).map((n) => parseInt(n, 16)).join(", ")})`;
  try {
    for (const p of ROOM_PALETTES) {
      const previousTheme = (await api(ownerContext, "GET", "/rooms/mine")).room.theme;
      await editor.getByRole("button", { name: "Promijeni boju", exact: true }).click();
      const option = editor.getByRole("button", { name: new RegExp(p.label) });
      await option.click();
      assert.equal((await api(ownerContext, "GET", "/rooms/mine")).room.theme, previousTheme, "Choosing a color never autosaves");
      assert.equal(await editor.locator(".palette-picker").count(), 0, "Choice closes the palette");
      await editor.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).click();
      await editor.waitForURL((url) => url.pathname === `/sto/${mine.openSessionId}`);
      await until(async () => (await api(ownerContext, "GET", "/rooms/mine")).room.theme === p.id, `Saved ${p.id}`);
      // Reload the editor to test actual persisted selection, not local state.
      await editor.goto(`${base}/moja-soba`);
      await editor.getByLabel("Trenutno odabrana boja", { exact: true }).getByText(p.label, { exact: true }).waitFor();
      await editor.waitForFunction(() => !document.querySelector(".profile-editor-fields")?.disabled);
      await roomPage.reload();
      await roomPage.locator(`.room[data-theme="${p.id}"]`).waitFor();
      const actual = await roomPage.locator(".room").evaluate((el) => ({
        background: getComputedStyle(el).backgroundImage, color: getComputedStyle(el).color,
      }));
      assert.ok(actual.background.includes(rgb(effectivePaletteColor(p.start, p.shade))), `${p.id} actual gradient`);
      assert.equal(actual.color, rgb(p.foreground), `${p.id} actual text`);
      const chair = roomPage.locator(".seat.taken:not(.host) .chair").first();
      if (await chair.count()) {
        const colors = await chair.evaluate((el) => ({ fg: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }));
        assert.notEqual(colors.fg, colors.bg, `${p.id} occupied seat remains legible`);
      }
      assert.equal(await overflow(roomPage), false, `${p.id} desktop room overflow`);
      assert.equal((await api(guestContext, "GET", `/sessions/${mine.openSessionId}/room`)).theme, p.id);
    }
    assert.equal((await api(guestContext, "GET", "/rooms/mine")).room.theme, guestBefore);
    await editor.route("**/api/rooms/mine", async (route) => {
      if (route.request().method() === "PATCH") return route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "test_unavailable", message: "Probna greška čuvanja izgleda." }),
      });
      return route.continue();
    });
    await editor.getByRole("button", { name: "Promijeni boju", exact: true }).click();
    await editor.getByRole("button", { name: /Duboki smaragd/ }).click();
    await editor.getByRole("button", { name: "Sačuvaj i izađi", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: "Probna greška čuvanja izgleda." }).waitFor();
    assert.equal((await api(ownerContext, "GET", "/rooms/mine")).room.theme, "obsidijan");
    await editor.unroute("**/api/rooms/mine");
    await editor.setViewportSize({ width: 390, height: 844 });
    await editor.reload();
    await editor.getByLabel("Trenutno odabrana boja", { exact: true }).getByText("Zeleni obsidijan", { exact: true }).waitFor();
    assert.equal(await overflow(editor), false, "Mobile owner settings overflow");
    await roomPage.setViewportSize({ width: 390, height: 844 });
    await roomPage.reload();
    await roomPage.locator('.room[data-theme="obsidijan"]').waitFor();
    assert.equal(await overflow(roomPage), false, "Mobile room overflow");
    await guestPage.reload();
    await guestPage.locator('.room[data-theme="obsidijan"]').waitFor();
    assert.equal(await guestPage.getByRole("link", { name: "Uredi sobu", exact: true }).count(), 0);
    assert.equal(await guestPage.getByRole("button", { name: /Duboki smaragd/ }).count(), 0);
    const denied = await guestContext.request.patch(`${base}/api/rooms/${mine.room.id}`, {
      headers: { "x-limen": "1" }, data: { theme: "sunce" },
    });
    assert.equal(denied.status(), 404);
    assert.equal((await api(ownerContext, "GET", "/rooms/mine")).room.theme, "obsidijan");

    const dir = "generated-artifacts/limen-palette-review";
    await fs.mkdir(dir, { recursive: true });
    await editor.screenshot({ path: `${dir}/owner-settings-mobile.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await roomPage.screenshot({ path: `${dir}/room-mobile.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await editor.setViewportSize({ width: 1280, height: 900 });
    await editor.reload();
    await editor.getByLabel("Trenutno odabrana boja", { exact: true }).getByText("Zeleni obsidijan", { exact: true }).waitFor();
    await editor.screenshot({ path: `${dir}/owner-settings-desktop.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await editor.goto(base);
    await editor.getByRole("heading", { name: /Dobro/ }).first().waitFor();
    assert.equal(await editor.locator(".tabbar a").count(), 5, "Keep all five real navigation routes");
    assert.equal(await editor.locator(".shell").evaluate((el) => getComputedStyle(el).display), "grid", "Desktop uses approved salon sidebar");
    assert.equal(await overflow(editor), false, "Desktop salon home overflow");
    await editor.screenshot({ path: `${dir}/home-desktop.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await editor.setViewportSize({ width: 390, height: 844 });
    assert.equal(await editor.locator(".shell").evaluate((el) => getComputedStyle(el).display), "flex", "Mobile keeps bottom navigation");
    assert.equal(await overflow(editor), false, "Mobile salon home overflow");
    await editor.screenshot({ path: `${dir}/home-mobile.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await editor.setViewportSize({ width: 1280, height: 900 });
    await editor.goto(`${base}/paleta`);
    await editor.getByRole("heading", { name: "Palete sobe", exact: true }).waitFor();
    const reviewLogoPaths = await editor.locator(".palette-review-swatch img").evaluateAll((images) =>
      images.map((img) => new URL(img.src).pathname));
    assert.equal(reviewLogoPaths.length, 12);
    assert.ok(reviewLogoPaths.every((path) => path === officialLogo), "The public palette review must not swap the logo");
    await editor.screenshot({ path: `${dir}/palette-desktop.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    await editor.setViewportSize({ width: 390, height: 844 });
    await editor.screenshot({ path: `${dir}/palette-mobile.jpg`, fullPage: true, type: "jpeg", quality: 80 });
    assert.equal(await overflow(editor), false, "Mobile review overflow");
    console.log("PASS all12 room palettes: owner UI save/reload, actual room gradient/foreground, per-room independence, guest read-only, mobile/desktop overflow");
  } finally {
    await editor.close();
    await roomPage.setViewportSize({ width: 1280, height: 900 });
  }
}
