import type { Request, Response } from "express";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema as s, type Tx } from "../db/client.js";
import { config } from "../config.js";
import { bad, conflict, forbidden, notFound, randomToken, sha256 } from "../lib/core.js";
import { hub } from "../lib/infra.js";
import { getSession, isActiveContact, isBlockedEither, getOpenSessionOfHost } from "./rules.js";

type Chat = typeof s.visitorChats.$inferSelect;
type Q = typeof db | Tx;
const live = sql`coalesce(${s.visitorChats.lastMessageAt}, ${s.visitorChats.approvedAt}, ${s.visitorChats.createdAt}) > now() - interval '30 days'`;
const cookieName = (ownerId: string) => `limen_guest_${ownerId.replaceAll("-", "")}`;

function cookieToken(req: Request, ownerId: string): string | null {
  const token = req.cookies?.[cookieName(ownerId)];
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function setGuestCookie(res: Response, ownerId: string, token: string) {
  res.cookie(cookieName(ownerId), token, {
    httpOnly: true, secure: config.isProd || (!config.isTest && !!process.env.REPLIT_DEV_DOMAIN),
    sameSite: "lax", path: "/api/visitor", maxAge: 365 * 86400_000,
  });
}
async function requireChat(q: Q, req: Request, id: string, owner: boolean, lock = false): Promise<Chat> {
  const query = q.select().from(s.visitorChats).where(and(eq(s.visitorChats.id, id), live));
  const [c] = lock ? await query.for("update") : await query;
  if (!c) throw notFound("Razgovor nije dostupan ili je istekao.");
  if (owner ? c.ownerId !== req.user?.id : sha256(cookieToken(req, c.ownerId) ?? "") !== c.tokenHash) throw notFound();
  if (c.linkedUserId && await isBlockedEither(c.ownerId, c.linkedUserId, q)) throw notFound();
  return c;
}
async function present(c: Chat, owner: boolean, q: Q = db) {
  const [u] = await q.select({ displayName: s.users.displayName, qrId: s.users.qrId }).from(s.users).where(eq(s.users.id, c.ownerId));
  const [lastMessage] = c.status === "approved" ? await q.select().from(s.visitorMessages)
    .where(eq(s.visitorMessages.chatId, c.id)).orderBy(desc(s.visitorMessages.id)).limit(1) : [];
  const unreadCount = c.status === "approved" ? Number((await q.execute<{ n: string }>(sql`select count(*) as n from visitor_messages
    where chat_id = ${c.id} and sender = ${owner ? "guest" : "owner"} and id > ${owner ? c.ownerReadId : c.guestReadId}`)).rows[0].n) : 0;
  const offer = c.roomOfferSessionId ? await getSession(c.roomOfferSessionId, q) : null;
  return {
    id: c.id, ownerId: c.ownerId, ownerName: u.displayName, ownerQrId: u.qrId,
    displayName: c.displayName, status: c.status, createdAt: c.createdAt, approvedAt: c.approvedAt,
    lastMessageAt: c.lastMessageAt, guestLimit: c.guestLimit, guestStreak: c.guestStreak,
    remaining: c.guestLimit === null ? null : Math.max(0, c.guestLimit - c.guestStreak),
    linkedUserId: c.linkedUserId,
    roomOffer: offer && !offer.closedAt ? { sessionId: offer.id, isContact: !!c.linkedUserId && await isActiveContact(c.ownerId, c.linkedUserId, q) } : null,
    lastMessage: lastMessage ?? null, unreadCount,
  };
}
async function notification(tx: Tx, c: Chat, type: string) {
  const [n] = await tx.insert(s.notifications).values({
    userId: c.ownerId, type, payload: { visitorChatId: c.id, displayName: c.displayName },
  }).returning();
  return n;
}
function changed(c: Chat) {
  hub.toUser(c.ownerId, "direct:changed", { visitorChatId: c.id });
}

export async function visitorQr(req: Request, res: Response, qr: string) {
  const [owner] = await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(eq(s.users.qrId, qr));
  if (!owner) throw notFound("QR kod nije prepoznat.");
  const token = cookieToken(req, owner.id);
  if (!token) setGuestCookie(res, owner.id, randomToken(32));
  const [c] = token ? await db.select().from(s.visitorChats).where(and(eq(s.visitorChats.ownerId, owner.id), eq(s.visitorChats.tokenHash, sha256(token)), live)) : [];
  return { owner, chat: c ? await present(await requireChat(db, req, c.id, false), false) : null };
}

export async function requestVisitorChat(req: Request, res: Response, qr: string, displayName: string) {
  await cleanupVisitorChats();
  const [owner] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.qrId, qr));
  if (!owner) throw notFound("QR kod nije prepoznat.");
  if (req.user?.id === owner.id) throw bad("self", "Ovo je tvoj QR kod.");
  const oldToken = cookieToken(req, owner.id);
  if (!oldToken) throw bad("scan_required", "Prvo otvori ili skeniraj LIMEN QR kod.");
  const token = oldToken;
  const result = await db.transaction(async (tx) => {
    // A request is one identity per browser and owner, even under concurrent clicks.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sha256(token)}, 0))`);
    const [old] = await tx.select().from(s.visitorChats).where(eq(s.visitorChats.tokenHash, sha256(token))).for("update");
    if (old) {
      await requireChat(tx, req, old.id, false);
      if (old.status !== "rejected") return { c: old, n: null };
      if (old.decidedAt && Date.now() - old.decidedAt.getTime() < 86400_000) {
        throw conflict("request_cooldown", "Zahtjev nije odobren. Novi zahtjev možeš poslati nakon 24 sata.");
      }
    }
    const values = { ownerId: owner.id, tokenHash: sha256(token), displayName,
      status: "pending" as const, createdAt: new Date(), decidedAt: null };
    const [c] = old
      ? await tx.update(s.visitorChats).set(values).where(eq(s.visitorChats.id, old.id)).returning()
      : await tx.insert(s.visitorChats).values(values).returning();
    return { c, n: await notification(tx, c, "visitor_request") };
  });
  setGuestCookie(res, owner.id, token);
  if (result.n) hub.toUser(owner.id, "notification", result.n);
  changed(result.c);
  return { chat: await present(result.c, false) };
}

export async function visitorMine(req: Request) {
  const tokens = Object.entries(req.cookies ?? {}).filter(([k, v]) => k.startsWith("limen_guest_") && typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v))
    .slice(0, 100).map(([, v]) => sha256(v as string));
  if (!tokens.length) return [];
  const rows = await db.select().from(s.visitorChats).where(and(inArray(s.visitorChats.tokenHash, tokens), live))
    .orderBy(desc(sql`coalesce(${s.visitorChats.lastMessageAt}, ${s.visitorChats.createdAt})`));
  const chats = [];
  for (const c of rows) {
    if (c.linkedUserId && await isBlockedEither(c.ownerId, c.linkedUserId)) continue;
    chats.push(await present(c, false));
  }
  return chats;
}

export async function visitorOwnerList(userId: string, requests: boolean) {
  const rows = await db.select().from(s.visitorChats).where(and(eq(s.visitorChats.ownerId, userId), live,
    requests ? inArray(s.visitorChats.status, ["pending", "rejected"]) : eq(s.visitorChats.status, "approved")))
    .orderBy(desc(sql`coalesce(${s.visitorChats.lastMessageAt}, ${s.visitorChats.createdAt})`));
  const chats = [];
  for (const c of rows) {
    if (c.linkedUserId && await isBlockedEither(c.ownerId, c.linkedUserId)) continue;
    chats.push(await present(c, true));
  }
  return chats;
}

export async function visitorHistory(req: Request, id: string, owner: boolean, before?: number) {
  const c = await requireChat(db, req, id, owner);
  const rows = c.status === "approved" ? await db.select().from(s.visitorMessages).where(and(
    eq(s.visitorMessages.chatId, id), before ? lt(s.visitorMessages.id, before) : undefined,
  )).orderBy(desc(s.visitorMessages.id)).limit(51) : [];
  return { chat: await present(c, owner), messages: rows.slice(0, 50).reverse(), hasMore: rows.length > 50 };
}

export async function decideVisitor(req: Request, id: string, approve: boolean) {
  const c = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, true, true);
    if (c.status !== "pending") throw conflict("request_decided", "Zahtjev je već obrađen.");
    const [updated] = await tx.update(s.visitorChats).set({
      status: approve ? "approved" : "rejected", decidedAt: new Date(), approvedAt: approve ? new Date() : null,
    }).where(eq(s.visitorChats.id, id)).returning();
    return updated;
  });
  changed(c);
  return { chat: await present(c, true) };
}

export async function visitorSend(req: Request, id: string, owner: boolean, body: string) {
  const result = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, owner, true);
    if (c.status !== "approved") throw forbidden("Razgovor još nije odobren.");
    if (!owner && c.guestLimit !== null && c.guestStreak >= c.guestLimit) throw conflict("guest_limit", "Sačekaj odgovor vlasnika prije slanja nove poruke.");
    const now = new Date();
    const [message] = await tx.insert(s.visitorMessages).values({ chatId: id, sender: owner ? "owner" : "guest", body, createdAt: now }).returning();
    await tx.update(s.visitorChats).set({ guestStreak: owner ? 0 : c.guestStreak + 1, lastMessageAt: now }).where(eq(s.visitorChats.id, id));
    return { c, message, n: owner ? null : await notification(tx, c, "visitor_message") };
  });
  if (result.n) hub.toUser(result.c.ownerId, "notification", result.n);
  changed(result.c);
  return { message: result.message };
}

export async function visitorRead(req: Request, id: string, owner: boolean, messageId: number) {
  const c = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, owner, true);
    const [m] = await tx.select().from(s.visitorMessages).where(and(eq(s.visitorMessages.chatId, id), eq(s.visitorMessages.id, messageId)));
    if (!m) throw bad("message_not_found", "Poruka ne pripada razgovoru.");
    const field = owner ? "ownerReadId" : "guestReadId";
    await tx.update(s.visitorChats).set({ [field]: Math.max(c[field], messageId) }).where(eq(s.visitorChats.id, id));
    return c;
  });
  if (owner) changed(c);
}

export async function visitorLimit(req: Request, id: string, limit: number | null) {
  const c = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, true, true);
    if (c.status !== "approved") throw forbidden();
    await tx.update(s.visitorChats).set({ guestLimit: limit }).where(eq(s.visitorChats.id, id));
    return c;
  });
  changed(c);
}

export async function visitorRoomOffer(req: Request, id: string) {
  const c = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, true, true);
    if (c.status !== "approved") throw forbidden();
    const session = await getOpenSessionOfHost(c.ownerId, tx);
    if (!session) throw conflict("room_closed", "Prvo otvori svoju sobu.");
    const [updated] = await tx.update(s.visitorChats).set({ roomOfferSessionId: session.id }).where(eq(s.visitorChats.id, id)).returning();
    return updated;
  });
  changed(c);
  return { chat: await present(c, true) };
}

/** Cookie possession plus reauthentication links an identity; never grants room access. */
export async function claimVisitor(req: Request, id: string) {
  const c = await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, false, true);
    const userId = req.user!.id;
    if (c.status !== "approved" || c.ownerId === userId) throw forbidden();
    if (c.linkedUserId && c.linkedUserId !== userId) throw conflict("identity_linked", "Identitet je već potvrđen drugim nalogom.");
    if (await isBlockedEither(c.ownerId, userId, tx)) throw forbidden();
    const [room] = await tx.select({ id: s.rooms.id }).from(s.rooms).where(eq(s.rooms.ownerId, userId));
    if (!room) throw forbidden("Za ulazak je potreban vlastiti LIMEN profil i soba.");
    await tx.update(s.visitorChats).set({ linkedUserId: userId }).where(eq(s.visitorChats.id, id));
    return c;
  });
  changed(c);
}

/** Only a currently authenticated guest can mint a recovery credential. */
export async function issueVisitorRecovery(req: Request, id: string) {
  const recoveryCode = randomToken(32);
  await db.transaction(async (tx) => {
    const c = await requireChat(tx, req, id, false, true);
    if (c.status !== "approved") throw forbidden("Oporavak je dostupan tek nakon odobrenja razgovora.");
    await tx.update(s.visitorChats).set({ recoveryHash: sha256(recoveryCode) }).where(eq(s.visitorChats.id, id));
  });
  return { recoveryCode };
}

/** A QR, nickname, account id or chat id alone never authorizes recovery. */
export async function recoverVisitor(req: Request, res: Response, recoveryCode: string) {
  const newToken = randomToken(32);
  const nextCode = randomToken(32);
  const c = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(s.visitorChats).where(and(
      eq(s.visitorChats.recoveryHash, sha256(recoveryCode)), eq(s.visitorChats.status, "approved"), live,
    )).for("update");
    const invalid = () => bad("invalid_recovery", "Ključ za oporavak nije važeći ili je razgovor istekao.");
    if (!c) throw invalid();
    if (c.linkedUserId && await isBlockedEither(c.ownerId, c.linkedUserId, tx)) throw invalid();
    // Rotating both credentials revokes old browser sessions and prevents replay.
    const [updated] = await tx.update(s.visitorChats).set({
      tokenHash: sha256(newToken), recoveryHash: sha256(nextCode),
    }).where(eq(s.visitorChats.id, c.id)).returning();
    return updated;
  });
  setGuestCookie(res, c.ownerId, newToken);
  return { chat: await present(c, false), recoveryCode: nextCode };
}

export async function cleanupVisitorChats() {
  const expired = await db.transaction(async (tx) => {
    const rows = await tx.delete(s.visitorChats).where(sql`coalesce(${s.visitorChats.lastMessageAt}, ${s.visitorChats.approvedAt}, ${s.visitorChats.createdAt}) <= now() - interval '30 days'`).returning();
    if (rows.length) await tx.delete(s.notifications).where(inArray(sql<string>`${s.notifications.payload}->>'visitorChatId'`, rows.map((r) => r.id)));
    return rows;
  });
  for (const c of expired) changed(c);
  return expired.length;
}

export async function exportVisitorData(userId: string) {
  const rows = await db.select().from(s.visitorChats).where(and(live,
    sql`(${s.visitorChats.ownerId} = ${userId} or ${s.visitorChats.linkedUserId} = ${userId})`));
  const out = [];
  for (const c of rows) {
    if (c.linkedUserId && await isBlockedEither(c.ownerId, c.linkedUserId)) continue;
    out.push({ chat: await present(c, c.ownerId === userId), messages: await db.select().from(s.visitorMessages)
      .where(eq(s.visitorMessages.chatId, c.id)).orderBy(s.visitorMessages.id) });
  }
  return out;
}
