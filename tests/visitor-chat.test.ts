import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "../src/server/db/client.js";
import { cleanupVisitorChats } from "../src/server/services/visitor-chat.js";
import { config } from "../src/server/config.js";
import { sha256 } from "../src/server/lib/core.js";
import { Client, connect, latestToken, newUser, openRoom, seat, startTestServer, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

async function pending() {
  const owner = await newUser(ctx);
  const guest = new Client(ctx);
  const scan = await guest.get(`/api/visitor/qr/${owner.qrId}`);
  expect(scan.status).toBe(200);
  expect(scan.body.chat).toBeNull();
  const r = await guest.post("/api/visitor/requests", { qrId: owner.qrId, displayName: "Gost bez profila" });
  expect(r.status).toBe(200);
  return { owner, guest, id: r.body.chat.id as string };
}
async function approved() {
  const p = await pending();
  expect((await p.owner.post(`/api/visitor/owner/${p.id}/approve`)).status).toBe(200);
  return p;
}
const guestPath = (id: string) => `/api/visitor/conversations/${id}`;
const ownerPath = (id: string) => `/api/visitor/owner/${id}`;

describe("Tajni ključ za oporavak gostujućeg razgovora", () => {
  it("samo odobren gost s kolačićem može izdati ključ; podaci ne otkrivaju hash ni ključ", async () => {
    const { owner, guest, id } = await pending();
    expect((await guest.post(`${guestPath(id)}/recovery`)).status).toBe(403);
    expect((await owner.post(`${guestPath(id)}/recovery`)).status).toBe(404);
    expect((await new Client(ctx).post(`${guestPath(id)}/recovery`)).status).toBe(404);
    await owner.post(`${ownerPath(id)}/approve`);
    const issued = await guest.post(`${guestPath(id)}/recovery`);
    expect(issued.status).toBe(200);
    expect(issued.headers["cache-control"]).toBe("no-store");
    expect(issued.body.recoveryCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await db.select().from(s.visitorChats).where(eq(s.visitorChats.id, id));
    expect(row.recoveryHash).toBe(sha256(issued.body.recoveryCode));
    for (const response of [await guest.get(guestPath(id)), await guest.get("/api/visitor/mine"), await owner.get("/api/me/export")]) {
      const data = JSON.stringify(response.body);
      expect(data).not.toContain(issued.body.recoveryCode);
      expect(data).not.toContain(row.recoveryHash);
    }
  });

  it("oporavlja izgubljeni kolačić, rotira oba ključa i čuva odobrenje, limit i rok", async () => {
    const { guest, id, owner } = await approved();
    await guestSend(guest, id); await guestSend(guest, id);
    const before = (await guest.get(guestPath(id))).body.chat;
    const { recoveryCode } = (await guest.post(`${guestPath(id)}/recovery`)).body;
    const fresh = new Client(ctx);
    expect((await fresh.get(guestPath(id))).status).toBe(404);
    for (const code of [owner.qrId, owner.id, id, "Gost bez profila"]) {
      expect((await fresh.post("/api/visitor/recover", { recoveryCode: code })).status).toBe(400);
    }
    const result = await fresh.post("/api/visitor/recover", { recoveryCode });
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(result.body.chat).toMatchObject({ id, status: "approved", guestLimit: 2, guestStreak: 2, lastMessageAt: before.lastMessageAt });
    expect(result.body.recoveryCode).not.toBe(recoveryCode);
    expect((await fresh.get(guestPath(id))).body.messages).toHaveLength(2);
    expect((await guest.get(guestPath(id))).status).toBe(404);
    expect((await fresh.get("/api/me")).status).toBe(401);
    expect((await guestSend(fresh, id)).status).toBe(409);
    expect((await new Client(ctx).post("/api/visitor/recover", { recoveryCode })).status).toBe(400);
    const second = new Client(ctx);
    expect((await second.post("/api/visitor/recover", { recoveryCode: result.body.recoveryCode })).status).toBe(200);
    expect((await fresh.get(guestPath(id))).status).toBe(404);
  });

  it("isti ključ ne može se istovremeno iskoristiti dvaput", async () => {
    const { guest, id } = await approved();
    const { recoveryCode } = (await guest.post(`${guestPath(id)}/recovery`)).body;
    const results = await Promise.all([new Client(ctx), new Client(ctx)].map((c) => c.post("/api/visitor/recover", { recoveryCode })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("zamjena ključa poništava prethodni bez odjave aktivnog gosta", async () => {
    const { guest, id } = await approved();
    const first = (await guest.post(`${guestPath(id)}/recovery`)).body.recoveryCode;
    const second = (await guest.post(`${guestPath(id)}/recovery`)).body.recoveryCode;
    const fresh = new Client(ctx);
    expect((await fresh.post("/api/visitor/recover", { recoveryCode: first })).status).toBe(400);
    expect((await guest.get(guestPath(id))).status).toBe(200);
    expect((await fresh.post("/api/visitor/recover", { recoveryCode: second })).status).toBe(200);
  });

  it("istek i brisanje nakon 30 dana onemogućavaju oporavak; izdavanje ne produžava rok", async () => {
    const { guest, id } = await approved();
    await guestSend(guest, id);
    await db.update(s.visitorChats).set({ lastMessageAt: sql`now() - interval '29 days'` }).where(eq(s.visitorChats.id, id));
    const before = (await guest.get(guestPath(id))).body.chat.lastMessageAt;
    const { recoveryCode } = (await guest.post(`${guestPath(id)}/recovery`)).body;
    const recovered = new Client(ctx);
    expect((await recovered.post("/api/visitor/recover", { recoveryCode })).body.chat.lastMessageAt).toBe(before);
    const { recoveryCode: nextCode } = (await recovered.post(`${guestPath(id)}/recovery`)).body;
    await db.update(s.visitorChats).set({ lastMessageAt: sql`now() - interval '30 days'` }).where(eq(s.visitorChats.id, id));
    expect((await new Client(ctx).post("/api/visitor/recover", { recoveryCode: nextCode })).status).toBe(400);
    await cleanupVisitorChats();
    expect((await db.select().from(s.visitorChats).where(eq(s.visitorChats.id, id)))).toHaveLength(0);
    expect((await new Client(ctx).post("/api/visitor/recover", { recoveryCode: nextCode })).status).toBe(400);
  });

  it("blokiranje povezanog korisnika važi i za oporavak", async () => {
    const { guest, owner, id } = await approved();
    const account = await newUser(ctx);
    await db.update(s.visitorChats).set({ linkedUserId: account.id }).where(eq(s.visitorChats.id, id));
    const { recoveryCode } = (await guest.post(`${guestPath(id)}/recovery`)).body;
    await owner.post("/api/blocks", { userId: account.id });
    expect((await guest.post(`${guestPath(id)}/recovery`)).status).toBe(404);
    expect((await new Client(ctx).post("/api/visitor/recover", { recoveryCode })).status).toBe(400);
  });

  it("zadržava CSRF zaštitu i ograničava pokušaje oporavka", async () => {
    const { guest, id } = await approved();
    expect((await guest.agent.post(`${guestPath(id)}/recovery`).send({})).status).toBe(403);
    expect((await guest.agent.post("/api/visitor/recover").send({ recoveryCode: "invalid" })).status).toBe(403);
    const old = config.rateLimitsEnabled; const limit = config.limits.visitorRecovery;
    try {
      config.rateLimitsEnabled = true; config.limits.visitorRecovery = [2, 900];
      const fresh = new Client(ctx);
      expect((await fresh.post("/api/visitor/recover", { recoveryCode: "invalid-1" })).status).toBe(400);
      expect((await fresh.post("/api/visitor/recover", { recoveryCode: "invalid-2" })).status).toBe(400);
      expect((await fresh.post("/api/visitor/recover", { recoveryCode: "invalid-3" })).status).toBe(429);
    } finally { config.rateLimitsEnabled = old; config.limits.visitorRecovery = limit; }
  });
});
const guestSend = (guest: Client, id: string, body = "Gost piše") => guest.post(`${guestPath(id)}/messages`, { body });
const ownerSend = (owner: Client, id: string, body = "Vlasnik odgovara") => owner.post(`${ownerPath(id)}/messages`, { body });

async function registerGuest(guest: Client) {
  guest.email = `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  guest.name = "Potvrđeni gost";
  const r = await guest.post("/api/auth/register", { email: guest.email, password: "sigurna-lozinka-123", displayName: guest.name, birthDate: "1991-01-01", confirmAdult: true });
  expect(r.status).toBe(201);
  guest.id = r.body.user.id; guest.qrId = r.body.user.qrId;
}
async function verifyGuest(guest: Client) {
  expect((await guest.post("/api/auth/verify-email", { token: await latestToken(guest, "potvrda") })).status).toBe(200);
}

describe("Gostujući identitet bez LIMEN profila", () => {
  it("QR i zahtjev ne kreiraju korisnički profil niti otvaraju chat bez odobrenja", async () => {
    const before = await db.$count(s.users);
    const { guest, owner, id } = await pending();
    expect(await db.$count(s.users)).toBe(before + 1);
    const r = await guest.get(guestPath(id));
    expect(r.body.chat.status).toBe("pending");
    expect(r.body.chat.tokenHash).toBeUndefined();
    expect((await guestSend(guest, id)).status).toBe(403);
    expect((await guest.get("/api/me")).status).toBe(401);
    expect((await guest.get("/api/room/content")).status).toBe(401);
    expect((await owner.get("/api/visitor/owner/requests")).body.chats.some((c: { id: string }) => c.id === id)).toBe(true);
  });

  it("pristup zahtijeva odgovarajući HttpOnly cookie, ne samo ID ili QR", async () => {
    const { owner, guest, id } = await approved();
    const other = new Client(ctx);
    const registered = await newUser(ctx);
    for (const c of [other, registered]) {
      expect((await c.get(guestPath(id))).status).toBe(404);
      expect((await guestSend(c, id)).status).toBe(404);
    }
    expect((await guest.post(`${ownerPath(id)}/approve`)).status).toBe(401);
    expect((await registered.get(ownerPath(id))).status).toBe(404);
    expect((await owner.get(ownerPath(id))).body.chat.status).toBe("approved");
    const mine = (await guest.get("/api/visitor/mine")).body.chats;
    expect(mine.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(JSON.stringify(mine)).not.toContain("tokenHash");
    const scan = await other.get(`/api/visitor/qr/${owner.qrId}`);
    const cookie = scan.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/visitor");
    expect(scan.body.chat).toBeNull();
  });

  it("ponovljeni zahtjevi istog preglednika nemaju duplikate", async () => {
    const { owner, guest, id } = await pending();
    const replies = await Promise.all(Array.from({ length: 3 }, () =>
      guest.post("/api/visitor/requests", { qrId: owner.qrId, displayName: "Isti gost" })));
    expect(replies.every((r) => r.status === 200 && r.body.chat.id === id)).toBe(true);
    expect(await db.$count(s.visitorChats, eq(s.visitorChats.ownerId, owner.id))).toBe(1);
  });

  it("odbijanje je neutralno i ne može se zaobići slanjem ili potvrdom identiteta", async () => {
    const { owner, guest, id } = await pending();
    expect((await owner.post(`${ownerPath(id)}/reject`)).status).toBe(200);
    expect((await guest.get(guestPath(id))).body.chat.status).toBe("rejected");
    expect((await guestSend(guest, id)).status).toBe(403);
    expect((await owner.post(`${ownerPath(id)}/approve`)).status).toBe(409);
    expect((await guest.post("/api/visitor/requests", { qrId: owner.qrId, displayName: "Gost" })).status).toBe(409);
    await db.update(s.visitorChats).set({ decidedAt: sql`now() - interval '25 hours'` }).where(eq(s.visitorChats.id, id));
    expect((await guest.post("/api/visitor/requests", { qrId: owner.qrId, displayName: "Gost" })).body.chat.status).toBe("pending");
    expect((await guestSend(guest, id)).status).toBe(403);
  });

  it("cookie omogućava nastavak nakon odjave; slanje bez CSRF zaglavlja je zabranjeno", async () => {
    const { owner, guest, id } = await approved();
    await guestSend(guest, id);
    await ownerSend(owner, id);
    await guest.post("/api/auth/logout");
    expect((await guest.get(guestPath(id))).body.messages).toHaveLength(2);
    expect((await guest.get(`/api/visitor/qr/${owner.qrId}`)).body.chat.id).toBe(id);
    expect((await guest.agent.post(`${guestPath(id)}/messages`).send({ body: "CSRF" })).status).toBe(403);
  });
});

describe("Ograničenje uzastopnih poruka", () => {
  it("atomski propušta samo dvije gostujuće poruke i resetuje se odgovorom vlasnika", async () => {
    const { owner, guest, id } = await approved();
    const sends = await Promise.all([guestSend(guest, id), guestSend(guest, id), guestSend(guest, id)]);
    expect(sends.map((r) => r.status).sort()).toEqual([201, 201, 409]);
    expect((await guest.get(guestPath(id))).body.chat.remaining).toBe(0);
    await ownerSend(owner, id);
    expect((await guest.get(guestPath(id))).body.chat.remaining).toBe(2);
    expect((await guestSend(guest, id)).status).toBe(201);
    expect((await guestSend(guest, id)).status).toBe(201);
    expect((await guestSend(guest, id)).status).toBe(409);
  });

  it("samo vlasnik može povećati ili ukloniti limit; sam nema uzastopni limit", async () => {
    const { owner, guest, id } = await approved();
    await guestSend(guest, id); await guestSend(guest, id);
    expect((await guest.patch(`${ownerPath(id)}/limit`, { limit: null })).status).toBe(401);
    expect((await owner.patch(`${ownerPath(id)}/limit`, { limit: 4 })).status).toBe(200);
    expect((await guestSend(guest, id)).status).toBe(201);
    expect((await guestSend(guest, id)).status).toBe(201);
    expect((await guestSend(guest, id)).status).toBe(409);
    expect((await owner.patch(`${ownerPath(id)}/limit`, { limit: null })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await guestSend(guest, id)).status).toBe(201);
    for (let i = 0; i < 4; i++) expect((await ownerSend(owner, id)).status).toBe(201);
    expect((await owner.patch(`${ownerPath(id)}/limit`, { limit: -1 })).status).toBe(400);
  });

  it("isto ograničenje vrijedi i za registrovane QR sagovornike", async () => {
    const owner = await newUser(ctx); const guest = await newUser(ctx);
    const request = await guest.post("/api/direct/requests", { qrId: owner.qrId });
    const id = (await owner.post(`/api/direct/requests/${request.body.request.id}/approve`)).body.conversationId;
    const path = `/api/direct/conversations/${id}/messages`;
    expect((await guest.post(path, { body: "1" })).status).toBe(201);
    expect((await guest.post(path, { body: "2" })).status).toBe(201);
    expect((await guest.post(path, { body: "3" })).status).toBe(409);
    expect((await guest.patch(`/api/direct/conversations/${id}/limit`, { limit: null })).status).toBe(403);
    expect((await owner.post(path, { body: "Odgovor" })).status).toBe(201);
    expect((await guest.post(path, { body: "Nova" })).status).toBe(201);
    expect((await owner.patch(`/api/direct/conversations/${id}/limit`, { limit: null })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await guest.post(path, { body: String(i) })).status).toBe(201);
  });
});

describe("Zaseban poziv u sobu i potvrda identiteta", () => {
  it("traži profil, potvrđen email i lozinku; kontakt i ulazak ostaju odvojeno odobreni", async () => {
    const { owner, guest, id } = await approved();
    expect((await owner.post(`${ownerPath(id)}/room-offer`)).status).toBe(409);
    const sessionId = await openRoom(owner);
    expect((await owner.post(`${ownerPath(id)}/room-offer`)).status).toBe(200);
    expect((await guest.post(`${guestPath(id)}/claim`, { password: "sigurna-lozinka-123" })).status).toBe(401);
    expect((await guest.get(`/api/sessions/${sessionId}/room`)).status).toBe(401);
    await registerGuest(guest);
    expect((await guest.post(`${guestPath(id)}/claim`, { password: "sigurna-lozinka-123" })).status).toBe(403);
    await verifyGuest(guest);
    expect((await guest.post(`${guestPath(id)}/claim`, { password: "pogresna" })).status).toBe(401);
    expect((await guest.post(`${guestPath(id)}/claim`, { password: "sigurna-lozinka-123" })).status).toBe(200);
    expect((await guest.get(`/api/sessions/${sessionId}/room`)).status).toBe(403);
    expect((await owner.post(`/api/sessions/${sessionId}/invitations`, { userId: guest.id })).status).toBe(403);
    await connect(owner, guest);
    const content = (await owner.get("/api/room/content")).body;
    const sectionId = content.sections[0].id;
    await owner.post("/api/room/items", { sectionId, kind: "text", text: "Dozvoljeno", sharedWithGuests: true });
    await owner.post("/api/room/items", { sectionId, kind: "text", text: "Privatno", sharedWithGuests: false });
    await seat(owner, sessionId, guest);
    const shared = await guest.get(`/api/sessions/${sessionId}/room`);
    expect(shared.status).toBe(200);
    expect(JSON.stringify(shared.body)).toContain("Dozvoljeno");
    expect(JSON.stringify(shared.body)).not.toContain("Privatno");
    expect((await guest.post(`/api/sessions/${sessionId}/leave`)).status).toBe(200);
    expect((await guest.get(`/api/sessions/${sessionId}/room`)).status).toBe(403);
    expect((await guest.get(guestPath(id))).body.chat.status).toBe("approved");
    expect((await guestSend(guest, id, "Chat i dalje radi")).status).toBe(201);
  });

  it("vlasnikovo uklanjanje iz sobe odmah ukida pristup, a chat ostaje nezavisan", async () => {
    const { owner, guest, id } = await approved();
    await registerGuest(guest); await verifyGuest(guest);
    await guest.post(`${guestPath(id)}/claim`, { password: "sigurna-lozinka-123" });
    await connect(owner, guest);
    const sessionId = await openRoom(owner);
    await seat(owner, sessionId, guest);
    expect((await owner.post(`/api/sessions/${sessionId}/remove`, { userId: guest.id })).status).toBe(200);
    expect((await guest.get(`/api/sessions/${sessionId}/room`)).status).toBe(403);
    expect((await guestSend(guest, id)).status).toBe(201);
    await owner.post("/api/blocks", { userId: guest.id });
    expect((await guest.get(guestPath(id))).status).toBe(404);
    expect((await guestSend(guest, id)).status).toBe(404);
  });
});

describe("Gostujući chat se briše nakon 30 dana bez poruke", () => {
  it("čitanje ne produžava rok, nova poruka ga resetuje, nakon30d potrebno novo odobrenje", async () => {
    const { owner, guest, id } = await approved();
    await guestSend(guest, id);
    await db.update(s.visitorChats).set({ lastMessageAt: sql`now() - interval '29 days'` }).where(eq(s.visitorChats.id, id));
    expect((await guest.get(guestPath(id))).status).toBe(200);
    await cleanupVisitorChats();
    expect((await guest.get(guestPath(id))).status).toBe(200);
    expect((await ownerSend(owner, id)).status).toBe(201);
    const [c] = await db.select().from(s.visitorChats).where(eq(s.visitorChats.id, id));
    expect(Date.now() - c.lastMessageAt!.getTime()).toBeLessThan(10_000);
    await db.update(s.visitorChats).set({ lastMessageAt: sql`now() - interval '30 days'` }).where(eq(s.visitorChats.id, id));
    expect((await guest.get(guestPath(id))).status).toBe(404);
    await cleanupVisitorChats();
    expect(await db.$count(s.visitorMessages, eq(s.visitorMessages.chatId, id))).toBe(0);
    expect((await guest.get("/api/visitor/mine")).body.chats).toEqual([]);
    await guest.get(`/api/visitor/qr/${owner.qrId}`);
    const next = await guest.post("/api/visitor/requests", { qrId: owner.qrId, displayName: "Ponovni gost" });
    expect(next.body.chat.id).not.toBe(id);
    expect(next.body.chat.status).toBe("pending");
    expect((await guestSend(guest, next.body.chat.id)).status).toBe(403);
  });
});
