import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { db } from "../src/server/db/client.js";
import { config } from "../src/server/config.js";
import {
  Client, startTestServer, newUser, connect, openRoom, invite, seat, say, readBodies, sleep, waitFor, latestToken,
  restartTestServer, type Ctx,
} from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

async function hostWithGuests(n: number) {
  const host = await newUser(ctx);
  const guests: Client[] = [];
  for (let i = 0; i < n; i++) { const g = await newUser(ctx); await connect(host, g); guests.push(g); }
  return { host, guests };
}

async function convOf(c: Client, sessionId: string): Promise<string> {
  const r = await c.get(`/api/sessions/${sessionId}/state`);
  return r.body.state.conversationId;
}

// ------------------------------------------------------------------
describe("Registracija i nalog", () => {
  it("odbija osobe mlađe od 18 godina", async () => {
    const r = await new Client(ctx).post("/api/auth/register",
      { email: "mlad@test.local", password: "dugacka-lozinka-123", displayName: "Mlad", birthDate: "2012-01-01", confirmAdult: true });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("underage");
  });

  it("društvene funkcije traže potvrđen email", async () => {
    const u = await newUser(ctx, { verify: false });
    expect((await u.post("/api/rooms/mine/open")).status).toBe(403);
  });

  it("zahtjev bez CSRF zaglavlja se odbija", async () => {
    const u = await newUser(ctx);
    const r = await u.agent.post("/api/rooms/mine/open").send({});
    expect(r.status).toBe(403);
  });

  it("reset lozinke i odjava sa svih uređaja", async () => {
    const u = await newUser(ctx);
    expect((await u.get("/api/me")).status).toBe(200);
    await u.post("/api/auth/forgot-password", { email: u.email });
    const token = await latestToken(u, "nova-lozinka");
    expect((await u.post("/api/auth/reset-password", { token, password: "sasvim-nova-lozinka" })).status).toBe(200);
    expect((await u.get("/api/me")).status).toBe(401); // stara sesija opozvana
    expect((await u.post("/api/auth/login", { email: u.email, password: "sasvim-nova-lozinka" })).status).toBe(200);
    expect((await u.post("/api/auth/reset-password", { token, password: "jos-jedna-lozinka" })).status).toBe(400); // token jednokratan
    expect((await u.post("/api/auth/logout-all")).status).toBe(200);
    expect((await u.get("/api/me")).status).toBe(401);
  });
});

// ------------------------------------------------------------------
describe("Test 1 – QR bez poziva ne otvara sobu", () => {
  it("skeniranje šalje samo zahtjev za kontakt; prihvaćen kontakt i dalje nema pristup sobi", async () => {
    const host = await newUser(ctx); const stranger = await newUser(ctx);
    const sessionId = await openRoom(host);
    const scan = await stranger.post("/api/contacts/request", { qrId: host.qrId });
    expect(scan.body.status).toBe("pending");
    // kontakt nije aktivan dok domaćin ne prihvati
    expect((await host.post(`/api/sessions/${sessionId}/invitations`, { userId: stranger.id })).status).toBe(403);
    expect((await stranger.get(`/api/sessions/${sessionId}/state`)).status).toBe(403);
    expect((await stranger.get(`/api/sessions/${sessionId}/room`)).status).toBe(403);
    // i nakon prihvatanja: bez poziva nema ulaska
    const reqs = await host.get("/api/contacts/requests");
    await host.post(`/api/contacts/requests/${reqs.body.requests[0].id}/accept`);
    expect((await stranger.get(`/api/sessions/${sessionId}/state`)).status).toBe(403);
    expect((await stranger.join(sessionId)).ok).toBe(false);
  });

  it("kontakt nestaje iz pretrage nakon 90 dana bez zajedničke aktivnosti; QR ostaje isti", async () => {
    const a = await newUser(ctx); const b = await newUser(ctx);
    await connect(a, b);
    expect((await a.get("/api/contacts")).body.contacts.map((c: { userId: string }) => c.userId)).toContain(b.id);
    await db.execute(sql`update contacts set last_activity_at = now() - interval '91 days', accepted_at = now() - interval '200 days'`);
    expect((await a.get("/api/contacts")).body.contacts).toHaveLength(0);
    const sessionId = await openRoom(a);
    expect((await a.post(`/api/sessions/${sessionId}/invitations`, { userId: b.id })).status).toBe(403);
    // ponovno skeniranje istog QR koda
    const me = await b.get("/api/me");
    expect(me.body.user.qrId).toBe(b.qrId);
    await connect(a, b);
    expect((await a.get("/api/contacts")).body.contacts).toHaveLength(1);
  });

  it("poziv u sobu produžava rok kontakta", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    await db.execute(sql`update contacts set last_activity_at = now() - interval '80 days'`);
    const sessionId = await openRoom(host);
    await invite(host, sessionId, g);
    const c = (await host.get("/api/contacts")).body.contacts[0];
    expect(new Date(c.expiresAt).getTime()).toBeGreaterThan(Date.now() + 89 * 86400_000);
  });
});

// ------------------------------------------------------------------
describe("Test 2 – nema ulaska preko direktnog API/socket zahtjeva", () => {
  it("pozvani, ali neodobren gost ne može čitati, pisati ni ući preko socketa", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await say(host, sessionId, "tajna poruka");
    const conv = await convOf(host, sessionId);
    const invId = await invite(host, sessionId, g);
    expect((await g.get(`/api/conversations/${conv}/messages`)).status).toBe(403);
    expect((await say(g, sessionId, "upad")).status).toBe(403);
    expect((await g.join(sessionId)).ok).toBe(false);
    // gost ne može sam sebe odobriti ni postaviti
    await g.post(`/api/invitations/${invId}/request-entry`);
    const list = await host.get(`/api/sessions/${sessionId}/invitations`);
    expect((await g.post(`/api/entry-requests/${list.body.entryRequests[0].id}/approve`)).status).toBe(403);
    expect((await g.post(`/api/sessions/${sessionId}/place`, { userId: g.id })).status).toBe(403);
  });

  it("domaćin ne može postaviti za sto nekoga bez poziva", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    const r = await host.post(`/api/sessions/${sessionId}/place`, { userId: g.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("no_invitation");
  });
});

// ------------------------------------------------------------------
describe("Test 3 – kapacitet: najviše pet gostiju, i pri paralelnim odobrenjima", () => {
  it("od 8 istovremenih odobrenja tačno 5 uspije; poziv ne rezerviše mjesto", async () => {
    const { host, guests } = await hostWithGuests(8);
    const sessionId = await openRoom(host);
    for (const g of guests) await invite(host, sessionId, g); // 8 poziva je dozvoljeno
    for (const g of guests) {
      const inv = (await g.get("/api/invitations")).body.invitations[0];
      await g.post(`/api/invitations/${inv.id}/request-entry`);
    }
    const list = await host.get(`/api/sessions/${sessionId}/invitations`);
    expect(list.body.entryRequests).toHaveLength(8);
    const results = await Promise.all(list.body.entryRequests.map((er: { id: string }) => host.post(`/api/entry-requests/${er.id}/approve`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409 && r.body.error === "room_full")).toHaveLength(3);
    const state = (await host.get(`/api/sessions/${sessionId}/state`)).body.state;
    expect(state.seats.map((x: { seatNo: number }) => x.seatNo).sort()).toEqual([1, 2, 3, 4, 5]);
    // preostali zahtjevi čekaju
    expect((await host.get(`/api/sessions/${sessionId}/invitations`)).body.entryRequests).toHaveLength(3);
    // kad se mjesto oslobodi, zahtjev koji čeka može biti odobren
    await host.post(`/api/sessions/${sessionId}/remove`, { userId: state.seats[0].userId });
    const waiting = (await host.get(`/api/sessions/${sessionId}/invitations`)).body.entryRequests[0];
    expect((await host.post(`/api/entry-requests/${waiting.id}/approve`)).status).toBe(200);
  });
});

// ------------------------------------------------------------------
describe("Test 4 – nikad domaćin i gost istovremeno, nikad dva stola", () => {
  it("gost ne može otvoriti svoju sobu; domaćin ne može sjesti za tuđi sto; niko ne sjedi za dva stola", async () => {
    const h1 = await newUser(ctx); const h2 = await newUser(ctx); const g = await newUser(ctx);
    await connect(h1, g); await connect(h2, g); await connect(h1, h2);
    const s1 = await openRoom(h1); const s2 = await openRoom(h2);
    await seat(h1, s1, g);
    // gost u sobi 1 → ne može otvoriti svoju
    const open = await g.post("/api/rooms/mine/open", { mode: "new" });
    expect(open.status).toBe(409); expect(open.body.error).toBe("is_guest");
    // drugi domaćin ga ne može posjesti
    await invite(h2, s2, g);
    const place = await h2.post(`/api/sessions/${s2}/place`, { userId: g.id });
    expect(place.status).toBe(409); expect(place.body.error).toBe("guest_elsewhere");
    // domaćin s otvorenom sobom ne može tražiti ulazak kod drugog
    const inv = await invite(h1, s1, h2);
    const re = await h2.post(`/api/invitations/${inv}/request-entry`);
    expect(re.status).toBe(409); expect(re.body.error).toBe("is_host");
    expect((await h1.post(`/api/sessions/${s1}/place`, { userId: h2.id })).body.error).toBe("guest_is_host");
  });
});

// ------------------------------------------------------------------
async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: "#82927B" } })
    .jpeg().withExif({ IFD0: { Make: "TestKamera", Artist: "Tajna Osoba" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 12/1 0/1" } }).toBuffer();
}

describe("Test 5 – gost ne može pristupiti privatnoj galeriji", () => {
  it("vidi samo sadržaj odobren svim gostima; privatne fotografije nisu dostupne ni direktnim ID-em", async () => {
    const { host, guests: [g1, g2] } = await hostWithGuests(2);
    const outsider = await newUser(ctx);
    const content = (await host.get("/api/room/content")).body.sections;
    const gallery = content.find((x: { kind: string }) => x.kind === "gallery");
    const img = await jpegWithGps();
    const priv = await host.upload("/api/room/items/image", img, { sectionId: gallery.id });
    const pub = await host.upload("/api/room/items/image", img, { sectionId: gallery.id });
    expect(priv.status).toBe(201);
    await host.patch(`/api/room/items/${pub.body.item.id}`, { sharedWithGuests: true });
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g1); await seat(host, sessionId, g2);

    const v1 = (await g1.get(`/api/sessions/${sessionId}/room`)).body;
    const v2 = (await g2.get(`/api/sessions/${sessionId}/room`)).body;
    expect(v1).toEqual(v2); // isti sadržaj za sve goste
    const items = v1.sections.flatMap((x: { items: unknown[] }) => x.items);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(pub.body.item.id);
    expect(JSON.stringify(v1)).not.toContain("sharedWithGuests");

    expect((await g1.get(`/api/media/${pub.body.item.mediaId}`)).status).toBe(200);
    expect((await g1.get(`/api/media/${priv.body.item.mediaId}`)).status).toBe(404);
    expect((await outsider.get(`/api/media/${priv.body.item.mediaId}`)).status).toBe(404);
    expect((await g1.get("/api/room/content")).body.sections.flatMap((x: { items: unknown[] }) => x.items)).toHaveLength(0); // svoja soba
    expect((await g1.patch(`/api/room/items/${pub.body.item.id}`, { sharedWithGuests: false })).status).toBe(404);
    expect((await host.get(`/api/media/${priv.body.item.mediaId}`)).status).toBe(200);

    // nakon zatvaranja sobe ni javni sadržaj više nije dostupan gostu
    await host.post(`/api/sessions/${sessionId}/close`);
    expect((await g1.get(`/api/media/${pub.body.item.mediaId}`)).status).toBe(404);
  });

  it("sačuvana fotografija ostaje dostupna nakon ponovnog pokretanja servera", async () => {
    const host = await newUser(ctx);
    const outsider = await newUser(ctx);
    const gallery = (await host.get("/api/room/content")).body.sections.find((x: { kind: string }) => x.kind === "gallery");
    const uploaded = await host.upload("/api/room/items/image", await jpegWithGps(), { sectionId: gallery.id });
    expect(uploaded.status).toBe(201);
    const mediaId = uploaded.body.item.mediaId;
    expect((await outsider.get(`/api/media/${mediaId}`)).status).toBe(404);

    ctx = await restartTestServer(ctx);

    expect((await host.get(`/api/media/${mediaId}`)).status).toBe(200);
    expect((await outsider.get(`/api/media/${mediaId}`)).status).toBe(404);
  });

  it("uklanja EXIF/GPS, prihvata samo stvarne fotografije", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    const r = await g.upload(`/api/sessions/${sessionId}/images`, await jpegWithGps());
    expect(r.status).toBe(201);
    const file = await host.get(`/api/media/${r.body.message.mediaId}`).buffer(true);
    const meta = await sharp(file.body).metadata();
    expect(meta.exif).toBeUndefined();
    const raw = file.body.toString("latin1");
    expect(raw).not.toContain("TestKamera");
    expect(raw).not.toContain("Tajna Osoba");
    // "video" ili lažna slika se odbija
    const fake = await g.upload(`/api/sessions/${sessionId}/images`, Buffer.concat([Buffer.from("00000018667479706d703432", "hex"), Buffer.alloc(200)]));
    expect(fake.status).toBe(400);
    expect(fake.body.error).toBe("bad_type");
  });
});

// ------------------------------------------------------------------
describe("Utišavanje", () => {
  it("utišani gost čita, ali ne može pisati ni slati fotografije", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    await host.post(`/api/sessions/${sessionId}/mute`, { userId: g.id, muted: true });
    expect((await say(g, sessionId, "zdravo")).status).toBe(403);
    expect((await g.upload(`/api/sessions/${sessionId}/images`, await jpegWithGps())).status).toBe(403);
    await say(host, sessionId, "domaćin piše");
    expect(await readBodies(g, await convOf(g, sessionId))).toContain("domaćin piše");
    expect((await g.post(`/api/sessions/${sessionId}/mute`, { userId: g.id, muted: false })).status).toBe(403);
    await host.post(`/api/sessions/${sessionId}/mute`, { userId: g.id, muted: false });
    expect((await say(g, sessionId, "opet pišem")).status).toBe(201);
  });
});

// ------------------------------------------------------------------
describe("Test 7 – prava na poruke prate intervale za stolom", () => {
  it("odsutni gost postavljen za sto dobija nove poruke (i offline), samo iz svojih intervala", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    const conv = await convOf(host, sessionId);
    await say(host, sessionId, "prije sjedenja");
    await invite(host, sessionId, g);
    await sleep(15);
    expect((await host.post(`/api/sessions/${sessionId}/place`, { userId: g.id })).status).toBe(200);
    await say(host, sessionId, "dok je offline za stolom");
    // gost nikad nije bio povezan socketom, a ipak čita novu poruku
    expect(await readBodies(g, conv)).toEqual(["dok je offline za stolom"]);
    // domaćin uklanja ikonicu → pristup novim porukama prestaje
    await host.post(`/api/sessions/${sessionId}/remove`, { userId: g.id });
    await say(host, sessionId, "poslije uklanjanja");
    expect((await g.get(`/api/conversations/${conv}/messages`)).status).toBe(403);
    // ponovno postavljanje: vidi prvi interval i novi, ne i period između
    await invite(host, sessionId, g);
    await sleep(15);
    await host.post(`/api/sessions/${sessionId}/place`, { userId: g.id });
    await say(host, sessionId, "drugi interval");
    expect(await readBodies(g, conv)).toEqual(["dok je offline za stolom", "drugi interval"]);
    expect(await readBodies(host, conv)).toEqual(["prije sjedenja", "dok je offline za stolom", "poslije uklanjanja", "drugi interval"]);
  });

  it("'Nastavi razgovor': stari član dobija samo ranije intervale, novi član ništa staro", async () => {
    const { host, guests: [old, fresh] } = await hostWithGuests(2);
    const s1 = await openRoom(host);
    await say(host, s1, "prije starog");
    await sleep(15);
    await seat(host, s1, old);
    await say(host, s1, "sesija 1 sa starim");
    await host.post(`/api/sessions/${s1}/close`);
    const s2 = await openRoom(host, "continue");
    const conv = await convOf(host, s2);
    expect(conv).toBe(await (async () => { const st = await db.execute(sql`select conversation_id from room_sessions where id = ${s1}`); return st.rows[0].conversation_id; })());
    await say(host, s2, "između sesija – bez gostiju");
    await sleep(15);
    await seat(host, s2, old); await seat(host, s2, fresh);
    await say(host, s2, "sesija 2 svi");
    expect(await readBodies(old, conv)).toEqual(["sesija 1 sa starim", "sesija 2 svi"]);
    expect(await readBodies(fresh, conv)).toEqual(["sesija 2 svi"]);
    // 'Započni novi razgovor': prazna historija za goste, arhiva ostaje domaćinu
    await host.post(`/api/sessions/${s2}/close`);
    const s3 = await openRoom(host, "new");
    const conv3 = await convOf(host, s3);
    expect(conv3).not.toBe(conv);
    expect(await readBodies(host, conv3)).toEqual([]);
    expect((await readBodies(host, conv)).length).toBe(4);
  });
});

// ------------------------------------------------------------------
describe("Test 8 – novi gost bez stare historije; uklonjeni gost ne prima nove poruke", () => {
  it("preko API-ja i websocketa", async () => {
    const { host, guests: [a, b] } = await hostWithGuests(2);
    const sessionId = await openRoom(host);
    const conv = await convOf(host, sessionId);
    await seat(host, sessionId, a);
    await say(a, sessionId, "stara poruka");
    await sleep(15);
    await seat(host, sessionId, b);
    expect(await readBodies(b, conv)).toEqual([]);

    const sa = await a.socket(); await a.join(sessionId, sa);
    const received: string[] = [];
    sa.on("message", (m: { body: string }) => received.push(m.body));
    await say(host, sessionId, "prva nova");
    await waitFor(() => received.includes("prva nova"));
    await host.post(`/api/sessions/${sessionId}/remove`, { userId: a.id });
    await say(host, sessionId, "poslije uklanjanja");
    await sleep(200);
    expect(received).not.toContain("poslije uklanjanja");
    expect((await a.get(`/api/conversations/${conv}/messages`)).status).toBe(403);
    // uklonjeni gost ne može sam ponovo tražiti ulazak istim pozivom
    const inv = (await a.get("/api/invitations")).body.invitations;
    expect(inv).toHaveLength(0);
    a.disconnectAll();
  });
});

// ------------------------------------------------------------------
describe("Test 9 – zatvaranje sobe poništava pozive i propuštene pozive", () => {
  it("pozivi, zahtjevi i obavijesti o pozivu nestaju", async () => {
    const { host, guests: [a, b] } = await hostWithGuests(2);
    const sessionId = await openRoom(host);
    await invite(host, sessionId, a);
    await invite(host, sessionId, b);
    await waitFor(async () => (await a.get("/api/invitations")).body.invitations[0]?.status === "missed");
    const invB = (await b.get("/api/invitations")).body.invitations[0];
    await b.post(`/api/invitations/${invB.id}/request-entry`);
    expect((await a.get("/api/me/notifications")).body.notifications.some((n: { type: string }) => n.type === "invitation")).toBe(true);

    expect((await host.post(`/api/sessions/${sessionId}/exit`, {})).status).toBe(400); // izlaz traži potvrdu
    expect((await host.post(`/api/sessions/${sessionId}/exit`, { confirm: true })).status).toBe(200);

    expect((await a.get("/api/invitations")).body.invitations).toHaveLength(0);
    expect((await b.get("/api/invitations")).body.invitations).toHaveLength(0);
    expect((await a.get("/api/me/notifications")).body.notifications.some((n: { type: string }) => n.type === "invitation")).toBe(false);
    expect((await a.post(`/api/invitations/${invB.id}/request-entry`)).status).toBe(404);
    const rows = await db.execute(sql`select status from invitations where session_id = ${sessionId}`);
    expect(rows.rows.map((r) => r.status)).toEqual(["expired", "expired"]);
    // ponovno otvaranje: stari pozivi ne važe
    const s2 = await openRoom(host);
    expect(s2).not.toBe(sessionId);
    expect((await a.get("/api/invitations")).body.invitations).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
describe("Pravilo od 30 sekundi (u testovima skraćeno na 600 ms)", () => {
  it("Test 17 – gost bez veze duže od roka gubi mjesto i interval; povratak u roku zadržava mjesto", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    const conv = await convOf(host, sessionId);
    await seat(host, sessionId, g);
    const s1 = await g.socket(); await g.join(sessionId, s1);
    // kratak prekid i povratak u roku
    s1.disconnect();
    await sleep(250);
    await g.join(sessionId);
    await sleep(700);
    expect((await g.get(`/api/sessions/${sessionId}/state`)).status).toBe(200);
    // dugačak prekid
    g.disconnectAll();
    await waitFor(async () => (await g.get(`/api/sessions/${sessionId}/state`)).status === 403);
    await say(host, sessionId, "nakon isteka");
    expect((await g.get(`/api/conversations/${conv}/messages`)).status).toBe(403);
    const ended = await db.execute(sql`select end_reason from seat_intervals where user_id = ${g.id} and session_id = ${sessionId}`);
    expect(ended.rows[0].end_reason).toBe("disconnect");
    // istom sesijskom pozivnicom može ponovo zatražiti ulazak, uz novo odobrenje
    const inv = (await g.get("/api/invitations")).body.invitations[0];
    expect((await g.post(`/api/invitations/${inv.id}/request-entry`)).body.status).toBe("requested");
    expect((await g.get(`/api/sessions/${sessionId}/state`)).status).toBe(403);
  });

  it("domaćin bez veze: gosti vide 'čeka se domaćin' (bez roka), povratak u roku nastavlja sesiju", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    const hs = await host.socket(); await host.join(sessionId, hs);
    const gs = await g.socket(); await g.join(sessionId, gs);
    const states: { hostAway: boolean }[] = [];
    gs.on("session:state", (st) => states.push(st));
    hs.disconnect();
    await waitFor(() => states.some((x) => x.hostAway));
    expect(JSON.stringify(states)).not.toMatch(/deadline|seconds|countdown/i);
    expect((await say(g, sessionId, "dok domaćina nema")).status).toBe(409);
    await host.join(sessionId);
    await waitFor(() => states.length > 0 && states[states.length - 1].hostAway === false);
    await sleep(700);
    expect((await host.get(`/api/sessions/${sessionId}/state`)).body.state.open).toBe(true);
    expect((await say(g, sessionId, "domaćin se vratio")).status).toBe(201);
    host.disconnectAll(); g.disconnectAll();
  });

  it("domaćin bez veze duže od roka: sesija se završava za sve, poruke ostaju u arhivi", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    await say(g, sessionId, "ostaje u arhivi");
    const conv = await convOf(host, sessionId);
    const gs = await g.socket(); await g.join(sessionId, gs);
    let closed: { reason?: string } | null = null;
    gs.on("session:closed", (x) => { closed = x; });
    await host.join(sessionId);
    host.disconnectAll();
    await waitFor(() => closed !== null);
    expect(closed!.reason).toBe("host_timeout");
    expect((await g.get(`/api/sessions/${sessionId}/state`)).status).toBe(403);
    expect(await readBodies(host, conv)).toEqual(["ostaje u arhivi"]);
    expect((await g.get(`/api/conversations/${conv}/messages`)).status).toBe(403); // arhiva samo domaćinu
    g.disconnectAll();
  });
});

// ------------------------------------------------------------------
describe("Test 18 – prijava zloupotrebe i blokiranje", () => {
  it("domaćin blokira gosta: gost odmah napušta sto i gubi pristup ranijim porukama", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    await say(g, sessionId, "uvredljiva poruka");
    const conv = await convOf(host, sessionId);
    const msg = (await g.get(`/api/conversations/${conv}/messages`)).body.messages[0];
    expect((await host.post("/api/reports", { messageId: msg.id, sessionId, reason: "Uvreda" })).status).toBe(201);
    expect((await host.post("/api/blocks", { userId: g.id })).status).toBe(200);
    expect((await g.get(`/api/sessions/${sessionId}/state`)).status).toBe(403);
    expect((await host.get("/api/contacts")).body.contacts).toHaveLength(0);
    // ni ponovni poziv ni QR zahtjev ne prolaze, a blokada se ne otkriva
    expect((await host.post(`/api/sessions/${sessionId}/invitations`, { userId: g.id })).status).toBe(403);
    expect((await g.post("/api/contacts/request", { qrId: host.qrId })).body.status).toBe("pending");
    expect((await host.get("/api/contacts/requests")).body.requests).toHaveLength(0);
  });

  it("gost blokira gosta tokom sesije: oba ostaju, domaćin dobija obavijest; sljedeći put ne sjede zajedno", async () => {
    const { host, guests: [a, b] } = await hostWithGuests(2);
    const s1 = await openRoom(host);
    await seat(host, s1, a); await seat(host, s1, b);
    await a.post("/api/blocks", { userId: b.id });
    const st = (await host.get(`/api/sessions/${s1}/state`)).body.state;
    expect(st.seats).toHaveLength(2);
    const notes = (await host.get("/api/me/notifications")).body.notifications;
    expect(notes.some((n: { type: string }) => n.type === "guest_block")).toBe(true);
    await host.post(`/api/sessions/${s1}/close`);
    const s2 = await openRoom(host);
    await seat(host, s2, a);
    await invite(host, s2, b);
    const r = await host.post(`/api/sessions/${s2}/place`, { userId: b.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("blocked_with_guest");
  });

  it("administrator vidi prijave i svaki pregled se bilježi; obični korisnik nema pristup", async () => {
    const admin = await newUser(ctx, { email: "admin@test.local" });
    const u = await newUser(ctx); const t = await newUser(ctx);
    await u.post("/api/reports", { targetUserId: t.id, reason: "Spam zahtjevi" });
    expect((await u.get("/api/admin/reports")).status).toBe(403);
    const list = await admin.get("/api/admin/reports");
    const rep = list.body.reports.find((r: { reason: string }) => r.reason === "Spam zahtjevi");
    expect(rep).toBeTruthy();
    expect((await admin.get(`/api/admin/reports/${rep.id}`)).status).toBe(200);
    await admin.post(`/api/admin/reports/${rep.id}/status`, { status: "reviewed" });
    const log = await db.execute(sql`select action from admin_audit_log order by created_at`);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["list_reports", "view_report", "set_report_status"]));
  });

  it("ne može se prijaviti poruka koju korisnik ne smije čitati", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const outsider = await newUser(ctx);
    const sessionId = await openRoom(host);
    const m = await say(host, sessionId, "privatno");
    expect((await outsider.post("/api/reports", { messageId: m.body.message.id, reason: "x x x" })).status).toBe(404);
    void g;
  });
});

// ------------------------------------------------------------------
describe("Spremanje fotografije iz chata i brisanje naloga", () => {
  it("gost izričito sprema fotografiju u svoju privatnu galeriju", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    const m = await host.upload(`/api/sessions/${sessionId}/images`, await jpegWithGps());
    expect((await g.get("/api/room/content")).body.sections.flatMap((x: { items: unknown[] }) => x.items)).toHaveLength(0);
    expect((await g.post(`/api/messages/${m.body.message.id}/save-to-gallery`)).status).toBe(201);
    const mine = (await g.get("/api/room/content")).body.sections.find((x: { kind: string }) => x.kind === "gallery").items;
    expect(mine).toHaveLength(1);
    expect(mine[0].sharedWithGuests).toBe(false);
  });

  it("brisanje naloga: poruke ostaju kao 'Obrisani korisnik' bez veze s nalogom", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    await say(g, sessionId, "moja poruka");
    const conv = await convOf(host, sessionId);
    expect((await g.del("/api/me", { password: "pogresna" })).status).toBe(401);
    expect((await g.del("/api/me", { password: "dugacka-lozinka-123" })).status).toBe(200);
    const msgs = (await host.get(`/api/conversations/${conv}/messages`)).body.messages;
    expect(msgs[0].author.displayName).toBe("Obrisani korisnik");
    const row = await db.execute(sql`select author_user_id, anonymous_author_id from messages where body = 'moja poruka'`);
    expect(row.rows[0].author_user_id).toBeNull();
    expect(row.rows[0].anonymous_author_id).not.toBe(g.id);
    const u = await db.execute(sql`select count(*)::int as n from users where id = ${g.id}`);
    expect(u.rows[0].n).toBe(0);
  });
});

// ------------------------------------------------------------------
describe("Rate limiting", () => {
  it("prekoračenje vraća 429 i vrijeme do ponovnog pokušaja", async () => {
    const { host, guests: [g] } = await hostWithGuests(1);
    const sessionId = await openRoom(host);
    await seat(host, sessionId, g);
    config.rateLimitsEnabled = true;
    // Keep all attempts in one fixed rate-limit window, even at a minute boundary.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      const results = [];
      for (let i = 0; i < 32; i++) results.push(await say(g, sessionId, `poruka ${i}`));
      const limited = results.filter((r) => r.status === 429);
      expect(limited.length).toBe(2);
      expect(Number(limited[0].headers["retry-after"])).toBeGreaterThan(0);
    } finally { config.rateLimitsEnabled = false; clock.mockRestore(); }
  });
});
