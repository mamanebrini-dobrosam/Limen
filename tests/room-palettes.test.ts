import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { ROOM_PALETTES, LEGACY_ROOM_THEME_IDS, effectivePaletteColor, paletteBackground } from "../src/shared/room-palettes";
import { Client, connect, invite, newUser, openRoom, seat, startTestServer, type Ctx } from "./helpers";
import { createRoomPaletteStyle } from "../src/client/visual/tokens";
import { visualSettings } from "../src/client/visual/settings";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

function luminance(hex: string) {
  return hex.slice(1).match(/.{2}/g)!.map((n) => parseInt(n, 16) / 255)
    .map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("Zvanična LIMEN paleta", () => {
  it("sadrži tačno 12 zaokruženih položaja, bez neodabranih varijanti", () => {
    expect(ROOM_PALETTES.map((p) => [p.row, p.column])).toEqual([
      [1, 2], [1, 3], [1, 5], [2, 2], [2, 3], [3, 1],
      [3, 2], [3, 4], [3, 5], [4, 1], [4, 4], [4, 5],
    ]);
    expect(new Set(ROOM_PALETTES.map((p) => p.id)).size).toBe(12);
  });

  it.each(ROOM_PALETTES)("$id: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)", (p) => {
    const a = effectivePaletteColor(p.start, p.shade).slice(1).match(/.{2}/g)!.map((x) => parseInt(x, 16));
    const b = effectivePaletteColor(p.end, p.shade).slice(1).match(/.{2}/g)!.map((x) => parseInt(x, 16));
    for (let step = 0; step <= 20; step++) {
      const color = "#" + a.map((n, i) => Math.round(n + (b[i] - n) * step / 20).toString(16).padStart(2, "0")).join("");
      expect(contrast(color, p.foreground)).toBeGreaterThanOrEqual(4.5);
    }
    expect(paletteBackground(p)).toContain(effectivePaletteColor(p.start, p.shade));
    const vars = createRoomPaletteStyle(p.id)!;
    expect(contrast(vars["--room-seat"], vars["--room-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars["--room-host-foreground"], vars["--room-host-background"])).toBeGreaterThanOrEqual(4.5);
  });

  it("identitet aplikacije zadržava čitljiv kontrast teksta, dugmadi i navigacije", () => {
    const { palette: p, navigation: n } = visualSettings;
    for (const [foreground, background] of [
      [p.text, p.background], [p.mutedText, p.background], [p.text, p.surface],
      [p.background, p.primary], [p.background, p.night],
      [n.active, n.background], [n.inactive, n.background],
      [p.secondaryDark, p.background], [p.highlight, "#80614b"],
    ]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("logo varijante su tačni izrezi iz originala, bez crvenih oznaka ili redizajna", async () => {
    const original = "attached_assets/0_Limen_Logo-Farbpalette_im_Raster_(1)_1793015058984.png";
    const xs = [0, 209, 412, 614, 818, 1024], ys = [0, 165, 332, 499, 683];
    for (const p of ROOM_PALETTES) {
      const left = Math.round(xs[p.column - 1] * 1.5) + 5;
      const top = Math.round(ys[p.row - 1] * 1024 / 683) + 5;
      const right = Math.round(xs[p.column] * 1.5) - 5;
      const bottom = Math.round(ys[p.row] * 1024 / 683) - 5;
      const expected = await sharp(original).extract({ left, top, width: right - left, height: bottom - top }).removeAlpha().raw().toBuffer();
      const actual = await sharp(`src/client/public/brand/palette/${p.id}.png`).removeAlpha().raw().toBuffer();
      expect(actual.equals(expected)).toBe(true);
    }
  });
});

describe("Čuvanje izgleda samo u vlastitoj sobi", () => {
  it("vlasnik može sačuvati i ponovo učitati svaku od 12 pozadina", async () => {
    const owner = await newUser(ctx);
    for (const p of ROOM_PALETTES) {
      expect((await owner.patch("/api/rooms/mine", { theme: p.id })).status).toBe(200);
      expect((await owner.get("/api/rooms/mine")).body.room.theme).toBe(p.id);
      expect((await owner.get("/api/room/content")).body.theme).toBe(p.id);
    }
  });

  it("različite sobe čuvaju različite izbore; pokušaj tuđeg roomId ne mijenja tuđu sobu", async () => {
    const owner = await newUser(ctx);
    const other = await newUser(ctx);
    const roomId = (await owner.get("/api/rooms/mine")).body.room.id;
    await owner.patch("/api/rooms/mine", { theme: "smaragd" });
    expect((await other.patch("/api/rooms/mine", { theme: "sunce", roomId, ownerId: owner.id })).status).toBe(200);
    expect((await owner.get("/api/rooms/mine")).body.room.theme).toBe("smaragd");
    expect((await other.get("/api/rooms/mine")).body.room.theme).toBe("sunce");
    expect((await other.patch(`/api/rooms/${roomId}`, { theme: "rubin" })).status).toBe(404);
  });

  it("neprijavljeni, nepotvrđeni i zahtjevi bez CSRF zaštite ne mogu mijenjati izgled", async () => {
    expect((await new Client(ctx).patch("/api/rooms/mine", { theme: "sunce" })).status).toBe(401);
    const unverified = await newUser(ctx, { verify: false });
    expect((await unverified.patch("/api/rooms/mine", { theme: "sunce" })).status).toBe(403);
    const verified = await newUser(ctx);
    expect((await verified.agent.patch("/api/rooms/mine").send({ theme: "sunce" })).status).toBe(403);
  });

  it("odbija proizvoljne stilove i čuva kompatibilnost prethodnih izbora", async () => {
    const owner = await newUser(ctx);
    for (const id of LEGACY_ROOM_THEME_IDS) expect((await owner.patch("/api/rooms/mine", { theme: id })).status).toBe(200);
    for (const theme of ["#ff0000", "url(https://example.invalid)", "nepoznata", "", null]) {
      expect((await owner.patch("/api/rooms/mine", { theme })).status).toBe(400);
    }
    expect((await owner.get("/api/rooms/mine")).body.room.theme).toBe("krem");
  });

  it("odobreni gost vidi sačuvanu pozadinu domaćina, ali je ne može promijeniti", async () => {
    const owner = await newUser(ctx);
    const guest = await newUser(ctx);
    await connect(owner, guest);
    const sessionId = await openRoom(owner);
    await invite(owner, sessionId, guest);
    await seat(owner, sessionId, guest);
    // Keep the existing heartbeat/authorization rules unchanged during the check.
    await owner.join(sessionId);
    await guest.join(sessionId);
    try {
      await owner.patch("/api/rooms/mine", { theme: "koralj" });
      expect((await guest.get(`/api/sessions/${sessionId}/room`)).body.theme).toBe("koralj");
      expect((await guest.patch(`/api/sessions/${sessionId}/room`, { theme: "rubin" })).status).toBe(404);
      await guest.patch("/api/rooms/mine", { theme: "ponoc" });
      expect((await guest.get(`/api/sessions/${sessionId}/room`)).body.theme).toBe("koralj");
      expect((await owner.get("/api/rooms/mine")).body.room.theme).toBe("koralj");
    } finally {
      owner.disconnectAll();
      guest.disconnectAll();
    }
  });
});
