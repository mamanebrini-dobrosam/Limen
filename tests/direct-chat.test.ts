import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "../src/server/db/client.js";
import { config } from "../src/server/config.js";
import { cleanupDirectChats } from "../src/server/services/direct-chat.js";
import { Client, newUser, startTestServer, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

async function pair() {
  const guest = await newUser(ctx);
  const owner = await newUser(ctx);
  return { guest, owner };
}
async function approved() {
  const { guest, owner } = await pair();
  const r = await guest.post("/api/direct/requests", { qrId: owner.qrId });
  expect(r.status).toBe(200);
  const a = await owner.post(`/api/direct/requests/${r.body.request.id}/approve`);
  expect(a.status).toBe(200);
  return { guest, owner, id: a.body.conversationId as string, requestId: r.body.request.id as string };
}
const history = (id: string) => `/api/direct/conversations/${id}/messages`;
const send = (c: Client, id: string, body = "Zdravo iz LIMEN-a") => c.post(history(id), { body });
async function age(id: string, days: number) {
  await db.update(s.directConversations).set({
    lastMessageAt: sql`now() - ${days} * interval '1 day'`,
  }).where(eq(s.directConversations.id, id));
}

describe("LIMEN Chat: QR i ručno odobrenje", () => {
  it("skeniranje prepoznaje vlasnika bez kreiranja zahtjeva ili razgovora", async () => {
    const { guest, owner } = await pair();
    const r = await guest.get(`/api/direct/qr/${owner.qrId}`);
    expect(r.status).toBe(200);
    expect(r.body.owner).toEqual({ id: owner.id, displayName: owner.name });
    expect(r.body.conversationId).toBeNull();
    expect(r.body.request).toBeNull();
    expect(r.body.canRequest).toBe(true);
    expect((await owner.get("/api/direct/requests")).body.requests).toEqual([]);
  });

  it("zahtjev čeka vlasnika; ni gost ni treća osoba ne mogu odobriti", async () => {
    const { guest, owner } = await pair();
    const stranger = await newUser(ctx);
    const r = await guest.post("/api/direct/requests", { qrId: owner.qrId, status: "approved" });
    expect(r.body.request.status).toBe("pending");
    const id = r.body.request.id;
    expect((await guest.post(`/api/direct/requests/${id}/approve`)).status).toBe(404);
    expect((await stranger.post(`/api/direct/requests/${id}/approve`)).status).toBe(404);
    const incoming = (await owner.get("/api/direct/requests")).body.requests.find((r: { id: string }) => r.id === id);
    expect(incoming.direction).toBe("incoming");
    expect(incoming.status).toBe("pending");
    expect((await guest.get("/api/direct/conversations")).body.conversations).toEqual([]);
    expect((await send(guest, id)).status).toBe(404);
    const note = (await owner.get("/api/me/notifications")).body.notifications.find((n: { type: string }) => n.type === "direct_request");
    expect(note.payload.requestId).toBe(id);
  });

  it("paralelni i obostrani zahtjevi ne stvaraju duplikate ni automatsko odobrenje", async () => {
    const { guest, owner } = await pair();
    const responses = await Promise.all(Array.from({ length: 4 }, () => guest.post("/api/direct/requests", { qrId: owner.qrId })));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(responses.map((r) => r.body.request.id)).size).toBe(1);
    const reciprocal = await owner.post("/api/direct/requests", { qrId: guest.qrId });
    expect(reciprocal.body.request.status).toBe("pending");
    expect(reciprocal.body.request.direction).toBe("incoming");
    expect(reciprocal.body.conversationId).toBeNull();
    const id = reciprocal.body.request.id;
    const decisions = await Promise.all([
      owner.post(`/api/direct/requests/${id}/approve`),
      owner.post(`/api/direct/requests/${id}/approve`),
    ]);
    expect(decisions.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await guest.get("/api/direct/conversations")).body.conversations).toHaveLength(1);
  });

  it("odbijanje je neutralno, ne otvara razgovor i ne može se zaobići", async () => {
    const { guest, owner } = await pair();
    const r = await guest.post("/api/direct/requests", { qrId: owner.qrId });
    const id = r.body.request.id;
    expect((await owner.post(`/api/direct/requests/${id}/reject`)).status).toBe(200);
    expect((await owner.post(`/api/direct/requests/${id}/approve`)).status).toBe(409);
    expect((await send(guest, id)).status).toBe(404);
    expect((await guest.post("/api/direct/requests", { qrId: owner.qrId })).status).toBe(409);
    const qr = await guest.get(`/api/direct/qr/${owner.qrId}`);
    expect(qr.body.canRequest).toBe(false);
    expect(qr.body.request.status).toBe("rejected");
    const notes = (await guest.get("/api/me/notifications")).body.notifications;
    expect(notes.some((n: { type: string }) => n.type === "direct_rejected")).toBe(true);
    expect((await guest.get("/api/direct/conversations")).body.conversations).toEqual([]);
    await db.update(s.directRequests).set({ decidedAt: sql`now() - interval '25 hours'` }).where(eq(s.directRequests.id, id));
    const retry = await guest.post("/api/direct/requests", { qrId: owner.qrId });
    expect(retry.body.request.status).toBe("pending");
    expect(retry.body.conversationId).toBeNull();
  });

  it("odobren razgovor se otvara istim i obrnutim QR kodom bez duplikata", async () => {
    const { guest, owner, id } = await approved();
    expect((await guest.get(`/api/direct/qr/${owner.qrId}`)).body.conversationId).toBe(id);
    expect((await owner.get(`/api/direct/qr/${guest.qrId}`)).body.conversationId).toBe(id);
    expect((await guest.post("/api/direct/requests", { qrId: owner.qrId })).body.conversationId).toBe(id);
    expect((await owner.get("/api/direct/conversations")).body.conversations).toHaveLength(1);
  });
});

describe("LIMEN Chat: poruke, privatnost i obavijesti", () => {
  it("oboje šalju, poruke opstaju nakon odjave i ponovne prijave", async () => {
    const { guest, owner, id } = await approved();
    expect((await send(guest, id, "Prva poruka")).status).toBe(201);
    expect((await send(owner, id, "Odgovor")).status).toBe(201);
    expect((await guest.post("/api/auth/logout")).status).toBe(200);
    expect((await guest.get(history(id))).status).toBe(401);
    expect((await guest.post("/api/auth/login", { email: guest.email, password: "dugacka-lozinka-123" })).status).toBe(200);
    const r = await guest.get(history(id));
    expect(r.body.messages.map((m: { body: string }) => m.body)).toEqual(["Prva poruka", "Odgovor"]);
    expect(r.body.messages.every((m: { createdAt: string }) => !!m.createdAt)).toBe(true);
  });

  it("liste prikazuju zadnju poruku i nepročitano; čitanje ne mijenja aktivnost", async () => {
    const { guest, owner, id } = await approved();
    const sent = await send(guest, id, "Pregled poruke");
    const list = (await owner.get("/api/direct/conversations")).body.conversations;
    expect(list[0].lastMessage.body).toBe("Pregled poruke");
    expect(list[0].unreadCount).toBe(1);
    const timestamp = list[0].lastMessageAt;
    expect((await owner.get(history(id))).status).toBe(200);
    expect((await owner.post(`/api/direct/conversations/${id}/read`, { messageId: sent.body.message.id })).status).toBe(200);
    const after = (await owner.get("/api/direct/conversations")).body.conversations[0];
    expect(after.unreadCount).toBe(0);
    expect(after.lastMessageAt).toBe(timestamp);
    const n = (await owner.get("/api/me/notifications")).body.notifications.find((n: { type: string }) => n.type === "direct_message");
    expect(n.payload.body).toBeUndefined();
    expect(n.readAt).not.toBeNull();
  });

  it("neovlašteni i nepotvrđeni korisnici ne mogu čitati, slati ili označavati pročitano", async () => {
    const { guest, id } = await approved();
    const stranger = await newUser(ctx);
    const unverified = await newUser(ctx, { verify: false });
    const sent = await send(guest, id);
    for (const c of [stranger, unverified, new Client(ctx)]) {
      expect([401, 403, 404]).toContain((await c.get(history(id))).status);
      expect([401, 403, 404]).toContain((await send(c, id)).status);
      expect([401, 403, 404]).toContain((await c.post(`/api/direct/conversations/${id}/read`, { messageId: sent.body.message.id })).status);
    }
    expect((await stranger.get("/api/direct/conversations")).body.conversations).toEqual([]);
    expect((await unverified.get(`/api/direct/qr/${guest.qrId}`)).status).toBe(403);
  });

  it("blokiranje ukida pristup i slanje u oba smjera", async () => {
    const { guest, owner, id } = await approved();
    await send(guest, id);
    expect((await owner.post("/api/blocks", { userId: guest.id })).status).toBe(200);
    for (const c of [guest, owner]) {
      expect((await c.get(history(id))).status).toBe(404);
      expect((await send(c, id)).status).toBe(404);
      expect((await c.get("/api/direct/conversations")).body.conversations).toEqual([]);
    }
    expect((await guest.post("/api/direct/requests", { qrId: owner.qrId })).status).toBe(403);
  });

  it("odbija neispravan QR, vlastiti QR i prazne/preduge poruke", async () => {
    const { guest, id } = await approved();
    expect((await guest.get("/api/direct/qr/nepostojeci-kod")).status).toBe(404);
    expect((await guest.post("/api/direct/requests", { qrId: guest.qrId })).status).toBe(400);
    expect((await send(guest, id, "   ")).status).toBe(400);
    expect((await send(guest, id, "x".repeat(4001))).status).toBe(400);
    expect((await guest.get(`${history(id)}?before=NaN`)).status).toBe(400);
    expect((await guest.agent.post(history(id)).send({ body: "Bez CSRF" })).status).toBe(403);
  });

  it("zahtjevi su ograničeni na serveru sa Retry-After zaglavljem", async () => {
    const { guest, owner } = await pair();
    const oldEnabled = config.rateLimitsEnabled;
    const oldLimit = config.limits.directRequest;
    try {
      config.rateLimitsEnabled = true;
      config.limits.directRequest = [1, 60];
      expect((await guest.post("/api/direct/requests", { qrId: owner.qrId })).status).toBe(200);
      const r = await guest.post("/api/direct/requests", { qrId: owner.qrId });
      expect(r.status).toBe(429);
      expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    } finally {
      config.rateLimitsEnabled = oldEnabled;
      config.limits.directRequest = oldLimit;
    }
  });

  it("websocket obavijest stiže samo učesnicima, bez tijela poruke", async () => {
    const { guest, owner, id } = await approved();
    const stranger = await newUser(ctx);
    const ownerSocket = await owner.socket();
    const otherSocket = await stranger.socket();
    const leaked: unknown[] = [];
    otherSocket.on("direct:changed", (x) => leaked.push(x));
    otherSocket.on("notification", (x) => leaked.push(x));
    try {
      const notified = new Promise<{ type: string; payload: Record<string, unknown> }>((resolve) => ownerSocket.once("notification", resolve));
      expect((await send(guest, id, "Privatno")).status).toBe(201);
      const n = await notified;
      expect(n.type).toBe("direct_message");
      expect(n.payload.conversationId).toBe(id);
      expect(n.payload.body).toBeUndefined();
      expect(leaked).toEqual([]);
    } finally { owner.disconnectAll(); stranger.disconnectAll(); }
  });

  it("starije poruke imaju stabilnu paginaciju i čitanje ne može označiti drugi razgovor", async () => {
    const { guest, owner, id } = await approved();
    const rows = await db.insert(s.directMessages).values(Array.from({ length: 55 }, (_, i) => ({
      conversationId: id, senderId: guest.id, body: `Poruka ${i}`,
    }))).returning();
    const page = await owner.get(history(id));
    expect(page.body.messages).toHaveLength(50);
    expect(page.body.hasMore).toBe(true);
    const older = await owner.get(`${history(id)}?before=${page.body.messages[0].id}`);
    expect(older.body.messages).toHaveLength(5);
    expect(older.body.hasMore).toBe(false);
    const other = await approved();
    expect((await other.owner.post(`/api/direct/conversations/${other.id}/read`, { messageId: rows[0].id })).status).toBe(400);
  });

  it("nova poruka tokom čitanja ostaje nepročitana", async () => {
    const { guest, owner, id } = await approved();
    const first = await send(guest, id, "Viđeno");
    const second = await send(guest, id, "Još nije viđeno");
    await owner.post(`/api/direct/conversations/${id}/read`, { messageId: first.body.message.id });
    const list = (await owner.get("/api/direct/conversations")).body.conversations;
    expect(list[0].unreadCount).toBe(1);
    const notes = (await owner.get("/api/me/notifications")).body.notifications;
    const unread = notes.find((n: { payload: { messageId: number } }) => n.payload.messageId === second.body.message.id);
    expect(unread.readAt).toBeNull();
  });

  it("izvoz naloga sadrži privatni razgovor, ali ne tuđe razgovore", async () => {
    const { guest, owner, id } = await approved();
    await send(guest, id, "Moj razgovor");
    const other = await approved();
    await send(other.guest, other.id, "Tuđi razgovor");
    const r = await owner.get("/api/me/export");
    expect(r.status).toBe(200);
    expect(r.body.directChat.conversations.map((c: { id: string }) => c.id)).toEqual([id]);
    expect(r.body.directChat.messages.map((m: { body: string }) => m.body)).toEqual(["Moj razgovor"]);
  });
});

describe("LIMEN Chat: tačno 30 dana neaktivnosti", () => {
  it("razgovor opstaje nakon 29 dana; otvaranje ne resetuje rok", async () => {
    const { guest, owner, id } = await approved();
    const m = await send(guest, id);
    await age(id, 29);
    expect((await owner.get(history(id))).status).toBe(200);
    await owner.post(`/api/direct/conversations/${id}/read`, { messageId: m.body.message.id });
    await cleanupDirectChats();
    expect((await guest.get(history(id))).status).toBe(200);
    const [c] = await db.select().from(s.directConversations).where(eq(s.directConversations.id, id));
    expect(Date.now() - c.lastMessageAt!.getTime()).toBeGreaterThan(28.9 * 86400_000);
  });

  it("nakon 30 dana briše razgovor, poruke, odobrenje i povezane obavijesti", async () => {
    const { guest, owner, id, requestId } = await approved();
    await send(guest, id);
    await age(id, 30);
    expect((await guest.get(history(id))).status).toBe(404);
    await cleanupDirectChats();
    expect(await db.$count(s.directConversations, eq(s.directConversations.id, id))).toBe(0);
    expect(await db.$count(s.directMessages, eq(s.directMessages.conversationId, id))).toBe(0);
    expect(await db.$count(s.directRequests, eq(s.directRequests.id, requestId))).toBe(0);
    expect(await db.$count(s.notifications, sql`${s.notifications.payload}->>'conversationId' = ${id}`)).toBe(0);
    for (const c of [guest, owner]) expect((await c.get("/api/direct/conversations")).body.conversations).toEqual([]);
    expect((await guest.get(`/api/direct/qr/${owner.qrId}`)).body.canRequest).toBe(true);
    const next = await guest.post("/api/direct/requests", { qrId: owner.qrId });
    expect(next.body.request.status).toBe("pending");
    expect(next.body.conversationId).toBeNull();
  });

  it("nova poruka iz bilo kojeg smjera resetuje rok", async () => {
    const { guest, owner, id } = await approved();
    for (const sender of [guest, owner]) {
      await age(id, 29);
      expect((await send(sender, id)).status).toBe(201);
      await cleanupDirectChats();
      const [c] = await db.select().from(s.directConversations).where(eq(s.directConversations.id, id));
      expect(Date.now() - c.lastMessageAt!.getTime()).toBeLessThan(10_000);
    }
  });

  it("odobren razgovor bez prve poruke također ističe nakon 30 dana", async () => {
    const { guest, id } = await approved();
    await db.update(s.directConversations).set({ createdAt: sql`now() - interval '30 days'` }).where(eq(s.directConversations.id, id));
    await cleanupDirectChats();
    expect((await guest.get(history(id))).status).toBe(404);
  });

  it("brisanje korisničkog naloga briše njegove privatne razgovore i poruke", async () => {
    const { guest, owner, id } = await approved();
    await send(guest, id);
    await owner.del("/api/me", { password: "dugacka-lozinka-123" });
    expect(await db.$count(s.directMessages, eq(s.directMessages.conversationId, id))).toBe(0);
    expect((await guest.get(history(id))).status).toBe(404);
  });
});
