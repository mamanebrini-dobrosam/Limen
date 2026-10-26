// Serverska pravila pristupa. Svaka ruta i websocket događaj koriste ove funkcije – frontend nikad ne odlučuje o pravima.
import { and, eq, isNull, or, sql, inArray } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema, type Tx } from "../db/client.js";
import { orderedPair } from "../lib/core.js";

type Q = typeof db | Tx;
const s = schema;

export async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"user:" + userId}))`);
}

export async function isBlockedEither(a: string, b: string, q: Q = db): Promise<boolean> {
  const r = await q.select({ x: s.blocks.blockerId }).from(s.blocks).where(or(
    and(eq(s.blocks.blockerId, a), eq(s.blocks.blockedId, b)),
    and(eq(s.blocks.blockerId, b), eq(s.blocks.blockedId, a)),
  )).limit(1);
  return r.length > 0;
}

export async function getContactRow(a: string, b: string, q: Q = db) {
  const [ua, ub] = orderedPair(a, b);
  const [row] = await q.select().from(s.contacts).where(and(eq(s.contacts.userA, ua), eq(s.contacts.userB, ub))).limit(1);
  return row ?? null;
}

export function contactExpiresAt(row: { lastActivityAt: Date | null; acceptedAt: Date | null }): Date | null {
  const base = row.lastActivityAt ?? row.acceptedAt;
  return base ? new Date(base.getTime() + config.contactTtlDays * 86400_000) : null;
}

/** Aktivan kontakt = prihvaćen, bez blokade i nije istekao (90 dana bez zajedničke aktivnosti). */
export async function isActiveContact(a: string, b: string, q: Q = db): Promise<boolean> {
  const row = await getContactRow(a, b, q);
  if (!row || row.status !== "accepted") return false;
  const exp = contactExpiresAt(row);
  if (!exp || exp.getTime() <= Date.now()) return false;
  return !(await isBlockedEither(a, b, q));
}

/** Zajednička aktivnost (poziv, sjedenje za stolom) produžava kontakt. Samo skeniranje ne produžava. */
export async function touchContact(a: string, b: string, q: Q = db) {
  const [ua, ub] = orderedPair(a, b);
  await q.update(s.contacts).set({ lastActivityAt: new Date() })
    .where(and(eq(s.contacts.userA, ua), eq(s.contacts.userB, ub), eq(s.contacts.status, "accepted")));
}

export async function getRoomByOwner(ownerId: string, q: Q = db) {
  const [r] = await q.select().from(s.rooms).where(eq(s.rooms.ownerId, ownerId)).limit(1);
  return r ?? null;
}

export async function getSession(sessionId: string, q: Q = db) {
  const [r] = await q.select().from(s.roomSessions).where(eq(s.roomSessions.id, sessionId)).limit(1);
  return r ?? null;
}

export async function getOpenSessionOfHost(hostId: string, q: Q = db) {
  const [r] = await q.select().from(s.roomSessions)
    .where(and(eq(s.roomSessions.hostId, hostId), isNull(s.roomSessions.closedAt))).limit(1);
  return r ?? null;
}

export async function getOpenSeatOfUser(userId: string, q: Q = db) {
  const [r] = await q.select().from(s.seatIntervals)
    .where(and(eq(s.seatIntervals.userId, userId), isNull(s.seatIntervals.endedAt))).limit(1);
  return r ?? null;
}

export async function getOpenSeat(userId: string, sessionId: string, q: Q = db) {
  const [r] = await q.select().from(s.seatIntervals)
    .where(and(eq(s.seatIntervals.userId, userId), eq(s.seatIntervals.sessionId, sessionId), isNull(s.seatIntervals.endedAt))).limit(1);
  return r ?? null;
}

export async function openSeats(sessionId: string, q: Q = db) {
  return q.select().from(s.seatIntervals)
    .where(and(eq(s.seatIntervals.sessionId, sessionId), isNull(s.seatIntervals.endedAt)));
}

export type SessionRole = "host" | "guest" | null;

/** Uloga u OTVORENOJ sesiji: domaćin, gost sa otvorenim mjestom, ili niko. */
export async function roleInSession(userId: string, sessionId: string, q: Q = db) {
  const session = await getSession(sessionId, q);
  if (!session || session.closedAt) return { session, role: null as SessionRole, seat: null };
  if (session.hostId === userId) return { session, role: "host" as SessionRole, seat: null };
  const seat = await getOpenSeat(userId, sessionId, q);
  return { session, role: (seat ? "guest" : null) as SessionRole, seat };
}

export async function isMuted(sessionId: string, userId: string, q: Q = db) {
  const [p] = await q.select().from(s.sessionParticipants)
    .where(and(eq(s.sessionParticipants.sessionId, sessionId), eq(s.sessionParticipants.userId, userId))).limit(1);
  return !!p?.chatMuted;
}

export async function getRoomOfConversation(conversationId: string, q: Q = db) {
  const [r] = await q.select({ room: s.rooms }).from(s.conversations)
    .innerJoin(s.rooms, eq(s.rooms.id, s.conversations.roomId))
    .where(eq(s.conversations.id, conversationId)).limit(1);
  return r?.room ?? null;
}

/**
 * SQL uslov: korisnik smije čitati poruku samo ako je nastala u nekom njegovom intervalu za stolom
 * u tom razgovoru, i ako ne postoji blokada između njega i vlasnika sobe. Vlasnik vidi sve.
 */
export function messageReadableBy(userId: string, ownerId: string) {
  const m = s.messages;
  return sql`(
    ${userId}::uuid = ${ownerId}::uuid
    or (
      exists (
        select 1 from seat_intervals si
        where si.user_id = ${userId}::uuid
          and si.conversation_id = ${m.conversationId}
          and ${m.createdAt} >= si.started_at
          and (si.ended_at is null or ${m.createdAt} <= si.ended_at)
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = ${userId}::uuid and b.blocked_id = ${ownerId}::uuid)
           or (b.blocker_id = ${ownerId}::uuid and b.blocked_id = ${userId}::uuid)
      )
    )
  )`;
}

export async function canReadMessage(userId: string, messageId: string, q: Q = db): Promise<boolean> {
  const [row] = await q.select({ conv: s.messages.conversationId }).from(s.messages).where(eq(s.messages.id, messageId)).limit(1);
  if (!row) return false;
  const room = await getRoomOfConversation(row.conv, q);
  if (!room) return false;
  const r = await q.select({ id: s.messages.id }).from(s.messages)
    .where(and(eq(s.messages.id, messageId), messageReadableBy(userId, room.ownerId))).limit(1);
  return r.length > 0;
}

/** Ko u ovom trenutku prima nove poruke sesije: domaćin + svi sa otvorenim intervalom (i offline). */
export async function liveRecipients(sessionId: string, q: Q = db): Promise<string[]> {
  const session = await getSession(sessionId, q);
  if (!session || session.closedAt) return [];
  const seats = await openSeats(sessionId, q);
  return [session.hostId, ...seats.map((x) => x.userId)];
}

export async function blockedAmong(userId: string, others: string[], q: Q = db): Promise<boolean> {
  if (others.length === 0) return false;
  const r = await q.select({ x: s.blocks.blockerId }).from(s.blocks).where(or(
    and(eq(s.blocks.blockerId, userId), inArray(s.blocks.blockedId, others)),
    and(eq(s.blocks.blockedId, userId), inArray(s.blocks.blockerId, others)),
  )).limit(1);
  return r.length > 0;
}
