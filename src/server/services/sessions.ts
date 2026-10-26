// Životni ciklus sobe: otvaranje, sjedenje, uklanjanje, zatvaranje, prekidi veze (pravilo od 30 sekundi).
import { and, eq, inArray, isNull, isNotNull, lt, sql, desc } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema, type Tx } from "../db/client.js";
import { conflict, forbidden, notFound, isUniqueViolation } from "../lib/core.js";
import { hub, notify } from "../lib/infra.js";
import * as rules from "./rules.js";

const s = schema;

// ---------- Javno stanje sesije (isto za sve goste) ----------
export async function sessionState(sessionId: string) {
  const session = await rules.getSession(sessionId);
  if (!session) return null;
  const seats = session.closedAt ? [] : await rules.openSeats(sessionId);
  const ids = [session.hostId, ...seats.map((x) => x.userId)];
  const people = ids.length ? await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(inArray(s.users.id, ids)) : [];
  const name = (id: string) => people.find((p) => p.id === id)?.displayName ?? "Gost";
  const parts = await db.select().from(s.sessionParticipants).where(eq(s.sessionParticipants.sessionId, sessionId));
  const muted = new Set(parts.filter((p) => p.chatMuted).map((p) => p.userId));
  return {
    id: session.id,
    roomId: session.roomId,
    conversationId: session.conversationId,
    open: !session.closedAt,
    closeReason: session.closeReason,
    hostAway: !!session.hostDisconnectDeadline, // bez odbrojavanja – klijent ne dobija rok
    host: { id: session.hostId, displayName: name(session.hostId) },
    seats: seats.map((x) => ({
      seatNo: x.seatNo, userId: x.userId, displayName: name(x.userId),
      present: !!x.connectedAt && !x.disconnectDeadline, muted: muted.has(x.userId),
    })).sort((a, b) => a.seatNo - b.seatNo),
  };
}

export async function broadcastState(sessionId: string, extraUserIds: string[] = []) {
  const state = await sessionState(sessionId);
  if (!state) return;
  const recipients = new Set([state.host.id, ...state.seats.map((x) => x.userId), ...extraUserIds]);
  hub.toUsers([...recipients], "session:state", state);
}

// ---------- Otvaranje ----------
export async function openRoom(userId: string, mode: "continue" | "new") {
  const sessionId = await db.transaction(async (tx) => {
    await rules.lockUser(tx, userId);
    const room = await rules.getRoomByOwner(userId, tx);
    if (!room) throw notFound("Soba ne postoji.");
    if (await rules.getOpenSeatOfUser(userId, tx)) {
      throw conflict("is_guest", "Ne možeš otvoriti svoju sobu dok si gost u tuđoj. Prvo izađi.");
    }
    const existing = await rules.getOpenSessionOfHost(userId, tx);
    if (existing) return existing.id;

    let conversationId: string | null = null;
    if (mode === "continue") {
      const [last] = await tx.select().from(s.roomSessions).where(eq(s.roomSessions.roomId, room.id)).orderBy(desc(s.roomSessions.openedAt)).limit(1);
      conversationId = last?.conversationId ?? null;
    }
    if (!conversationId) {
      const [c] = await tx.insert(s.conversations).values({ roomId: room.id }).returning();
      conversationId = c.id;
    }
    const [session] = await tx.insert(s.roomSessions).values({ roomId: room.id, hostId: userId, conversationId }).returning();
    return session.id;
  });
  return sessionId;
}

// ---------- Sjedenje (odobren ulazak ili postavljanje odsutnog gosta) ----------
export async function seatGuest(hostId: string, sessionId: string, guestId: string, opts: { placedAbsent: boolean }) {
  const result = await db.transaction(async (tx) => {
    // Zaključavanje sesije serijalizuje sva odobrenja za isti sto → nema prekoračenja kapaciteta.
    const [session] = await tx.select().from(s.roomSessions).where(eq(s.roomSessions.id, sessionId)).for("update");
    if (!session || session.closedAt) throw conflict("session_closed", "Soba nije otvorena.");
    if (session.hostId !== hostId) throw forbidden("Samo domaćin odobrava ulazak.");
    if (guestId === hostId) throw conflict("self", "Domaćin već sjedi za svojim stolom.");
    await rules.lockUser(tx, guestId);

    const [inv] = await tx.select().from(s.invitations)
      .where(and(eq(s.invitations.sessionId, sessionId), eq(s.invitations.inviteeId, guestId))).limit(1);
    if (!inv || !["pending", "missed"].includes(inv.status)) throw conflict("no_invitation", "Ova osoba nema važeći poziv za ovu sesiju.");

    if (await rules.isBlockedEither(hostId, guestId, tx)) throw conflict("blocked", "Ova osoba ne može sjesti za tvoj sto.");
    const seats = await rules.openSeats(sessionId, tx);
    if (seats.some((x) => x.userId === guestId)) throw conflict("already_seated", "Ova osoba već sjedi za stolom.");
    if (await rules.blockedAmong(guestId, seats.map((x) => x.userId), tx)) {
      throw conflict("blocked_with_guest", "Ova osoba ne može sjesti za sto s nekim od prisutnih gostiju.");
    }
    if (await rules.getOpenSessionOfHost(guestId, tx)) throw conflict("guest_is_host", "Ova osoba trenutno ima otvorenu svoju sobu.");
    if (await rules.getOpenSeatOfUser(guestId, tx)) throw conflict("guest_elsewhere", "Ova osoba već sjedi za drugim stolom.");

    const taken = new Set(seats.map((x) => x.seatNo));
    const free = [1, 2, 3, 4, 5].find((n) => !taken.has(n));
    if (!free) throw conflict("room_full", "Svih pet mjesta je zauzeto. Zahtjev čeka.");

    const [seat] = await tx.insert(s.seatIntervals).values({
      sessionId, conversationId: session.conversationId, userId: guestId, seatNo: free, placedAbsent: opts.placedAbsent,
    }).returning();
    await tx.insert(s.sessionParticipants).values({ sessionId, userId: guestId }).onConflictDoNothing();
    await tx.update(s.entryRequests).set({ status: "approved", decidedAt: new Date() })
      .where(and(eq(s.entryRequests.sessionId, sessionId), eq(s.entryRequests.userId, guestId), eq(s.entryRequests.status, "pending")));
    await rules.touchContact(hostId, guestId, tx);
    return seat;
  }).catch((e) => {
    if (isUniqueViolation(e, "seat_no_open_per_session_uq")) throw conflict("room_full", "Svih pet mjesta je zauzeto. Zahtjev čeka.");
    if (isUniqueViolation(e, "seat_one_open_per_user_uq")) throw conflict("guest_elsewhere", "Ova osoba već sjedi za drugim stolom.");
    throw e;
  });
  await notify(guestId, "seated", { sessionId, placedAbsent: opts.placedAbsent });
  await broadcastState(sessionId);
  return result;
}

// ---------- Kraj intervala ----------
type EndReason = "left" | "removed" | "disconnect" | "blocked" | "session_closed";

export async function endSeat(sessionId: string, userId: string, reason: EndReason, q: typeof db | Tx = db) {
  const ended = await q.update(s.seatIntervals).set({ endedAt: new Date(), endReason: reason, disconnectDeadline: null })
    .where(and(eq(s.seatIntervals.sessionId, sessionId), eq(s.seatIntervals.userId, userId), isNull(s.seatIntervals.endedAt)))
    .returning();
  return ended[0] ?? null;
}

async function afterSeatEnded(sessionId: string, userId: string, reason: EndReason) {
  await hub.disconnectUserFromSession(userId, sessionId);
  hub.toUser(userId, "session:left", { sessionId, reason });
  await broadcastState(sessionId);
}

export async function leaveSeat(userId: string, sessionId: string) {
  const ended = await endSeat(sessionId, userId, "left");
  if (!ended) throw conflict("not_seated", "Ne sjediš za ovim stolom.");
  await afterSeatEnded(sessionId, userId, "left");
}

/** Uklanjanje gosta: odmah završava interval i poništava poziv za ovu sesiju. */
export async function removeGuest(hostId: string, sessionId: string, guestId: string) {
  const session = await rules.getSession(sessionId);
  if (!session || session.closedAt) throw conflict("session_closed", "Soba nije otvorena.");
  if (session.hostId !== hostId) throw forbidden("Samo domaćin može ukloniti gosta.");
  const ended = await db.transaction(async (tx) => {
    const e = await endSeat(sessionId, guestId, "removed", tx);
    await tx.update(s.invitations).set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(s.invitations.sessionId, sessionId), eq(s.invitations.inviteeId, guestId)));
    await tx.update(s.entryRequests).set({ status: "cancelled", decidedAt: new Date() })
      .where(and(eq(s.entryRequests.sessionId, sessionId), eq(s.entryRequests.userId, guestId), eq(s.entryRequests.status, "pending")));
    return e;
  });
  if (!ended) throw conflict("not_seated", "Ovaj gost ne sjedi za stolom.");
  await afterSeatEnded(sessionId, guestId, "removed");
}

export async function setMuted(hostId: string, sessionId: string, guestId: string, muted: boolean) {
  const { role } = await rules.roleInSession(hostId, sessionId);
  if (role !== "host") throw forbidden("Samo domaćin može utišati gosta.");
  if (!(await rules.getOpenSeat(guestId, sessionId))) throw conflict("not_seated", "Ovaj gost ne sjedi za stolom.");
  const now = new Date();
  await db.insert(s.sessionParticipants).values({ sessionId, userId: guestId, chatMuted: muted, mutedAt: muted ? now : null, mutedBy: muted ? hostId : null, unmutedAt: muted ? null : now })
    .onConflictDoUpdate({
      target: [s.sessionParticipants.sessionId, s.sessionParticipants.userId],
      set: muted ? { chatMuted: true, mutedAt: now, mutedBy: hostId, unmutedAt: null } : { chatMuted: false, unmutedAt: now },
    });
  await broadcastState(sessionId);
}

// ---------- Zatvaranje ----------
export async function closeSession(sessionId: string, reason: "host_closed" | "host_exit" | "host_timeout" | "account_deleted") {
  const res = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(s.roomSessions).where(eq(s.roomSessions.id, sessionId)).for("update");
    if (!session || session.closedAt) return null;
    const seats = await rules.openSeats(sessionId, tx);
    await tx.update(s.roomSessions).set({ closedAt: new Date(), closeReason: reason, hostDisconnectDeadline: null }).where(eq(s.roomSessions.id, sessionId));
    await tx.update(s.seatIntervals).set({ endedAt: new Date(), endReason: "session_closed", disconnectDeadline: null })
      .where(and(eq(s.seatIntervals.sessionId, sessionId), isNull(s.seatIntervals.endedAt)));
    const invs = await tx.update(s.invitations).set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(s.invitations.sessionId, sessionId), inArray(s.invitations.status, ["pending", "missed"]))).returning();
    await tx.update(s.entryRequests).set({ status: "expired", decidedAt: new Date() })
      .where(and(eq(s.entryRequests.sessionId, sessionId), eq(s.entryRequests.status, "pending")));
    // Pozivi i propušteni pozivi za ovu sesiju nestaju i iz obavijesti.
    await tx.execute(sql`delete from notifications where type in ('invitation','entry_request') and payload->>'sessionId' = ${sessionId}`);
    return { session, seatUsers: seats.map((x) => x.userId), invitees: invs.map((i) => i.inviteeId) };
  });
  if (!res) return false;
  const everyone = [res.session.hostId, ...res.seatUsers, ...res.invitees];
  hub.toUsers(everyone, "session:closed", { sessionId, reason });
  for (const u of res.seatUsers) await hub.disconnectUserFromSession(u, sessionId);
  return true;
}

// ---------- Prekidi veze ----------
export async function hostConnected(sessionId: string) {
  const r = await db.update(s.roomSessions).set({ hostDisconnectDeadline: null })
    .where(and(eq(s.roomSessions.id, sessionId), isNull(s.roomSessions.closedAt), isNotNull(s.roomSessions.hostDisconnectDeadline))).returning();
  if (r.length) await broadcastState(sessionId);
}

export async function hostDisconnected(sessionId: string) {
  const deadline = new Date(Date.now() + config.hostGraceMs);
  const r = await db.update(s.roomSessions).set({ hostDisconnectDeadline: deadline })
    .where(and(eq(s.roomSessions.id, sessionId), isNull(s.roomSessions.closedAt), isNull(s.roomSessions.hostDisconnectDeadline))).returning();
  if (r.length) await broadcastState(sessionId);
}

export async function guestConnected(sessionId: string, userId: string) {
  const r = await db.update(s.seatIntervals).set({ connectedAt: sql`coalesce(${s.seatIntervals.connectedAt}, now())`, disconnectDeadline: null })
    .where(and(eq(s.seatIntervals.sessionId, sessionId), eq(s.seatIntervals.userId, userId), isNull(s.seatIntervals.endedAt))).returning();
  if (r.length) await broadcastState(sessionId);
  return r.length > 0;
}

export async function guestDisconnected(sessionId: string, userId: string) {
  const deadline = new Date(Date.now() + config.guestGraceMs);
  const r = await db.update(s.seatIntervals).set({ disconnectDeadline: deadline })
    .where(and(eq(s.seatIntervals.sessionId, sessionId), eq(s.seatIntervals.userId, userId), isNull(s.seatIntervals.endedAt), isNotNull(s.seatIntervals.connectedAt)))
    .returning();
  if (r.length) await broadcastState(sessionId);
}

/** Pokreće se periodično. Rokovi su u bazi, pa preživljavaju restart servera. */
export async function sweep() {
  const now = new Date();
  const expiredHosts = await db.select({ id: s.roomSessions.id }).from(s.roomSessions)
    .where(and(isNull(s.roomSessions.closedAt), isNotNull(s.roomSessions.hostDisconnectDeadline), lt(s.roomSessions.hostDisconnectDeadline, now)));
  for (const x of expiredHosts) await closeSession(x.id, "host_timeout");

  const expiredGuests = await db.update(s.seatIntervals).set({ endedAt: now, endReason: "disconnect", disconnectDeadline: null })
    .where(and(isNull(s.seatIntervals.endedAt), isNotNull(s.seatIntervals.disconnectDeadline), lt(s.seatIntervals.disconnectDeadline, now)))
    .returning();
  for (const g of expiredGuests) await afterSeatEnded(g.sessionId, g.userId, "disconnect");

  await db.update(s.invitations).set({ status: "missed", updatedAt: now })
    .where(and(eq(s.invitations.status, "pending"), lt(s.invitations.createdAt, new Date(now.getTime() - config.inviteMissedAfterMs))));
}

let timer: NodeJS.Timeout | null = null;
export function startSweeper() {
  if (timer) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await sweep(); } catch (e) { console.error("sweep", e); } finally { running = false; }
  }, config.sweepIntervalMs);
}
export function stopSweeper() { if (timer) clearInterval(timer); timer = null; }
