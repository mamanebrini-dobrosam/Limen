import { and, eq, or, sql, inArray, desc, lt } from "drizzle-orm";
import { db, schema as s, type Tx } from "../db/client.js";
import { bad, conflict, forbidden, notFound, orderedPair } from "../lib/core.js";
import { hub } from "../lib/infra.js";
import { isBlockedEither } from "./rules.js";

export const DIRECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
type Chat = typeof s.directConversations.$inferSelect;
type Request = typeof s.directRequests.$inferSelect;
type Note = typeof s.notifications.$inferSelect;
export const liveDirectChat = sql`coalesce(${s.directConversations.lastMessageAt}, ${s.directConversations.createdAt}) > now() - interval '30 days'`;
const pairWhere = (a: string, b: string) => and(eq(s.directConversations.userA, a), eq(s.directConversations.userB, b));
const requestPair = (a: string, b: string) => and(eq(s.directRequests.userA, a), eq(s.directRequests.userB, b));
const member = (userId: string) => or(eq(s.directConversations.userA, userId), eq(s.directConversations.userB, userId));
const notBlocked = (userId: string) => sql`not exists (
  select 1 from ${s.blocks} where
  (${s.blocks.blockerId} = ${userId} and ${s.blocks.blockedId} = case when ${s.directConversations.userA} = ${userId} then ${s.directConversations.userB} else ${s.directConversations.userA} end)
  or (${s.blocks.blockedId} = ${userId} and ${s.blocks.blockerId} = case when ${s.directConversations.userA} = ${userId} then ${s.directConversations.userB} else ${s.directConversations.userA} end)
)`;

/** Shared by requesting, deciding and blocking: reciprocal requests never auto-approve. */
export async function lockDirectPair(tx: Tx, a: string, b: string) {
  const pair = orderedPair(a, b).join(":");
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pair}, 0))`);
}

export function presentRequest(r: Request, userId: string) {
  return {
    ...r, direction: r.ownerId === userId ? "incoming" : "outgoing",
    retryAt: r.status === "rejected" && r.decidedAt
      ? new Date(r.decidedAt.getTime() + REJECTION_COOLDOWN_MS).toISOString() : null,
  };
}

async function note(tx: Tx, userId: string, type: string, payload: Record<string, unknown>) {
  const [n] = await tx.insert(s.notifications).values({ userId, type, payload }).returning();
  return n;
}
function emit(notes: Note[], users: string[], conversationId?: string) {
  for (const n of notes) hub.toUser(n.userId, "notification", n);
  hub.toUsers(users, "direct:changed", { conversationId });
}

/** DELETE rechecks the deadline after waiting for a concurrent sender's row lock. */
export async function cleanupDirectChats() {
  const expired = await db.transaction(async (tx) => {
    const rows = await tx.delete(s.directConversations)
      .where(sql`coalesce(${s.directConversations.lastMessageAt}, ${s.directConversations.createdAt}) <= now() - interval '30 days'`)
      .returning();
    if (rows.length) await tx.delete(s.notifications).where(and(
      sql`${s.notifications.type} like 'direct\\_%' escape '\\'`,
      inArray(sql<string>`${s.notifications.payload}->>'conversationId'`, rows.map((r) => r.id)),
    ));
    return rows;
  });
  for (const c of expired) hub.toUsers([c.userA, c.userB], "direct:expired", { conversationId: c.id });
  return expired.length;
}

export async function directQr(userId: string, qrId: string) {
  const [owner] = await db.select({ id: s.users.id, displayName: s.users.displayName })
    .from(s.users).where(eq(s.users.qrId, qrId));
  if (!owner) throw notFound("QR kod nije prepoznat.");
  const [a, b] = orderedPair(userId, owner.id);
  const self = userId === owner.id;
  const unavailable = !self && await isBlockedEither(userId, owner.id);
  const [chat] = self || unavailable ? [] : await db.select().from(s.directConversations)
    .where(and(pairWhere(a, b), liveDirectChat));
  const [request] = self || unavailable || chat ? [] : await db.select().from(s.directRequests).where(and(
    requestPair(a, b), sql`${s.directRequests.status} <> 'approved'`,
  ));
  const retryAt = request?.decidedAt ? request.decidedAt.getTime() + REJECTION_COOLDOWN_MS : 0;
  return {
    owner, self, unavailable, conversationId: chat?.id ?? null,
    request: request ? presentRequest(request, userId) : null,
    canRequest: !self && !unavailable && !chat && (!request || (request.status === "rejected" && Date.now() >= retryAt)),
  };
}

export async function requestDirectChat(userId: string, qrId: string) {
  // Reopening an expired conversation always requires a fresh manual decision.
  await cleanupDirectChats();
  const result = await db.transaction(async (tx) => {
    const [owner] = await tx.select().from(s.users).where(eq(s.users.qrId, qrId));
    if (!owner) throw notFound("QR kod nije prepoznat.");
    if (owner.id === userId) throw bad("self", "Ovo je tvoj QR kod.");
    const [a, b] = orderedPair(userId, owner.id);
    await lockDirectPair(tx, a, b);
    if (await isBlockedEither(userId, owner.id, tx)) throw forbidden("Razgovor trenutno nije dostupan.");
    const [chat] = await tx.select().from(s.directConversations).where(pairWhere(a, b));
    const [existing] = await tx.select().from(s.directRequests).where(requestPair(a, b));
    if (chat || existing?.status === "pending") return { request: existing, conversationId: chat?.id ?? null, notes: [] };
    if (existing?.status === "rejected" && existing.decidedAt &&
      Date.now() < existing.decidedAt.getTime() + REJECTION_COOLDOWN_MS) {
      throw conflict("request_cooldown", "Zahtjev nije odobren. Novi zahtjev možeš poslati nakon 24 sata.");
    }
    const values = { userA: a, userB: b, requesterId: userId, ownerId: owner.id, status: "pending" as const,
      conversationId: null, createdAt: new Date(), decidedAt: null };
    const [request] = existing
      ? await tx.update(s.directRequests).set(values).where(eq(s.directRequests.id, existing.id)).returning()
      : await tx.insert(s.directRequests).values(values).returning();
    const [requester] = await tx.select({ displayName: s.users.displayName }).from(s.users).where(eq(s.users.id, userId));
    const notification = await note(tx, owner.id, "direct_request", { requestId: request.id, displayName: requester.displayName });
    return { request, conversationId: null, notes: [notification] };
  });
  emit(result.notes, result.request ? [result.request.requesterId, result.request.ownerId] : [userId], result.conversationId ?? undefined);
  return { request: result.request ? presentRequest(result.request, userId) : null, conversationId: result.conversationId };
}

export async function decideDirectRequest(userId: string, id: string, approve: boolean) {
  const result = await db.transaction(async (tx) => {
    const [initial] = await tx.select().from(s.directRequests).where(eq(s.directRequests.id, id));
    if (!initial || initial.ownerId !== userId) throw notFound();
    await lockDirectPair(tx, initial.userA, initial.userB);
    const [r] = await tx.select().from(s.directRequests).where(eq(s.directRequests.id, id)).for("update");
    if (!r || r.status !== "pending") throw conflict("request_decided", "Ovaj zahtjev je već obrađen.");
    if (await isBlockedEither(r.ownerId, r.requesterId, tx)) throw forbidden("Razgovor trenutno nije dostupan.");
    let conversationId: string | null = null;
    if (approve) {
      const [chat] = await tx.insert(s.directConversations).values({ userA: r.userA, userB: r.userB }).returning();
      conversationId = chat.id;
    }
    await tx.update(s.directRequests).set({ status: approve ? "approved" : "rejected", decidedAt: new Date(), conversationId })
      .where(eq(s.directRequests.id, id));
    // Link the original request notification too, so expiration removes stale links.
    if (conversationId) await tx.execute(sql`update notifications set payload = payload || jsonb_build_object('conversationId', ${conversationId}::text)
      where type = 'direct_request' and payload->>'requestId' = ${id}`);
    const [owner] = await tx.select({ displayName: s.users.displayName }).from(s.users).where(eq(s.users.id, userId));
    const notification = await note(tx, r.requesterId, approve ? "direct_approved" : "direct_rejected",
      { requestId: r.id, ...(conversationId ? { conversationId } : {}), displayName: owner.displayName });
    return { conversationId, notes: [notification], users: [r.ownerId, r.requesterId] };
  });
  emit(result.notes, result.users, result.conversationId ?? undefined);
  return { conversationId: result.conversationId };
}

export async function listDirectRequests(userId: string) {
  const rows = await db.select().from(s.directRequests).where(or(
    eq(s.directRequests.ownerId, userId), eq(s.directRequests.requesterId, userId),
  )).orderBy(desc(s.directRequests.createdAt));
  const out = [];
  for (const r of rows) {
    const peerId = r.ownerId === userId ? r.requesterId : r.ownerId;
    if (await isBlockedEither(userId, peerId)) continue;
    const [peer] = await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(eq(s.users.id, peerId));
    out.push({ ...presentRequest(r, userId), peer });
  }
  return out;
}

export async function listDirectChats(userId: string) {
  const rows = await db.select().from(s.directConversations)
    .where(and(member(userId), liveDirectChat, notBlocked(userId)))
    .orderBy(desc(sql`coalesce(${s.directConversations.lastMessageAt}, ${s.directConversations.createdAt})`));
  const out = [];
  for (const c of rows) {
    const peerId = c.userA === userId ? c.userB : c.userA;
    const [peer] = await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(eq(s.users.id, peerId));
    const [lastMessage] = await db.select().from(s.directMessages).where(eq(s.directMessages.conversationId, c.id))
      .orderBy(desc(s.directMessages.id)).limit(1);
    const unreadCount = await db.$count(s.directMessages, and(eq(s.directMessages.conversationId, c.id),
      eq(s.directMessages.senderId, peerId), sql`${s.directMessages.id} > ${c.userA === userId ? c.userAReadId : c.userBReadId}`));
    out.push({ id: c.id, peer, lastMessage: lastMessage ?? null, lastMessageAt: c.lastMessageAt, createdAt: c.createdAt, unreadCount });
  }
  return out;
}

/** Include the new private-chat data in the existing account export. */
export async function exportDirectData(userId: string) {
  const conversations = await db.select().from(s.directConversations).where(and(member(userId), liveDirectChat, notBlocked(userId)));
  const messages = conversations.length ? await db.select().from(s.directMessages)
    .where(inArray(s.directMessages.conversationId, conversations.map((c) => c.id)))
    .orderBy(s.directMessages.id) : [];
  return { conversations, messages, requests: await listDirectRequests(userId) };
}

async function allowedChat(tx: Tx, userId: string, id: string): Promise<Chat> {
  const [c] = await tx.select().from(s.directConversations)
    .where(and(eq(s.directConversations.id, id), member(userId), liveDirectChat)).for("update");
  if (!c) throw notFound("Razgovor nije dostupan ili je istekao.");
  if (await isBlockedEither(c.userA, c.userB, tx)) throw notFound("Razgovor nije dostupan ili je istekao.");
  return c;
}

export async function directHistory(userId: string, id: string, before?: number) {
  return db.transaction(async (tx) => {
    const c = await allowedChat(tx, userId, id);
    const [peer] = await tx.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users)
      .where(eq(s.users.id, c.userA === userId ? c.userB : c.userA));
    const rows = await tx.select().from(s.directMessages).where(and(
      eq(s.directMessages.conversationId, id), before ? lt(s.directMessages.id, before) : undefined,
    )).orderBy(desc(s.directMessages.id)).limit(51);
    return { conversation: { id, peer, createdAt: c.createdAt, lastMessageAt: c.lastMessageAt },
      messages: rows.slice(0, 50).reverse(), hasMore: rows.length > 50 };
  });
}

export async function sendDirectMessage(userId: string, id: string, body: string) {
  const result = await db.transaction(async (tx) => {
    const c = await allowedChat(tx, userId, id);
    const now = new Date();
    const [message] = await tx.insert(s.directMessages).values({ conversationId: id, senderId: userId, body, createdAt: now }).returning();
    await tx.update(s.directConversations).set({ lastMessageAt: now }).where(eq(s.directConversations.id, id));
    const peerId = c.userA === userId ? c.userB : c.userA;
    const [sender] = await tx.select({ displayName: s.users.displayName }).from(s.users).where(eq(s.users.id, userId));
    // No message text in notifications or websocket broadcasts.
    const notification = await note(tx, peerId, "direct_message", { conversationId: id, messageId: message.id, displayName: sender.displayName });
    return { message, notes: [notification], users: [c.userA, c.userB] };
  });
  emit(result.notes, result.users, id);
  return result.message;
}

export async function readDirectChat(userId: string, id: string, messageId: number) {
  await db.transaction(async (tx) => {
    const c = await allowedChat(tx, userId, id);
    const [m] = await tx.select().from(s.directMessages).where(and(eq(s.directMessages.id, messageId), eq(s.directMessages.conversationId, id)));
    if (!m) throw bad("message_not_found", "Poruka ne pripada ovom razgovoru.");
    const readField = c.userA === userId ? "userAReadId" : "userBReadId";
    await tx.update(s.directConversations).set({ [readField]: Math.max(c[readField], messageId) }).where(eq(s.directConversations.id, id));
    await tx.execute(sql`update notifications set read_at = now() where user_id = ${userId}
      and type = 'direct_message' and payload->>'conversationId' = ${id}
      and (payload->>'messageId')::bigint <= ${messageId}`);
  });
  hub.toUser(userId, "direct:changed", { conversationId: id, read: true });
}

let cleanupTimer: NodeJS.Timeout | null = null;
export function startDirectCleanup() {
  if (cleanupTimer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await cleanupDirectChats(); } catch (e) { console.error("direct chat cleanup failed", e); }
    finally { running = false; }
  };
  void run();
  cleanupTimer = setInterval(run, 60_000);
  cleanupTimer.unref();
}
