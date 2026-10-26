import { Router } from "express";
import { z } from "zod";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ah, bad, conflict, forbidden, notFound, uuidSchema } from "../lib/core.js";
import { rateLimit, notify, hub } from "../lib/infra.js";
import { requireVerified, me } from "../lib/auth.js";
import * as rules from "../services/rules.js";
import * as sessions from "../services/sessions.js";

const s = schema;
export const roomsRouter = Router();
roomsRouter.use(requireVerified);

async function requireHost(userId: string, sessionId: string) {
  const { session, role } = await rules.roleInSession(userId, sessionId);
  if (!session || session.closedAt) throw conflict("session_closed", "Soba nije otvorena.");
  if (role !== "host") throw forbidden("Ovo može samo domaćin.");
  return session;
}

// ---------- Moja soba ----------
roomsRouter.get("/rooms/mine", ah(async (req, res) => {
  const room = await rules.getRoomByOwner(me(req).id);
  if (!room) throw notFound();
  const open = await rules.getOpenSessionOfHost(me(req).id);
  const [last] = await db.select().from(s.roomSessions).where(eq(s.roomSessions.roomId, room.id)).orderBy(desc(s.roomSessions.openedAt)).limit(1);
  res.json({ room: { id: room.id, theme: room.theme }, openSessionId: open?.id ?? null, hasPreviousConversation: !!last });
}));

roomsRouter.patch("/rooms/mine", ah(async (req, res) => {
  const { theme } = z.object({ theme: z.enum(["orah", "kadulja", "noc", "krem"]) }).parse(req.body);
  await db.update(s.rooms).set({ theme }).where(eq(s.rooms.ownerId, me(req).id));
  res.json({ ok: true });
}));

roomsRouter.post("/rooms/mine/open", ah(async (req, res) => {
  const { mode } = z.object({ mode: z.enum(["continue", "new"]).default("new") }).parse(req.body ?? {});
  const sessionId = await sessions.openRoom(me(req).id, mode);
  res.json({ sessionId });
}));

// ---------- Sesija ----------
roomsRouter.get("/sessions/:id/state", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { session, role } = await rules.roleInSession(me(req).id, id);
  if (!session) throw notFound();
  if (!role) throw forbidden("Nisi za ovim stolom.");
  const state = await sessions.sessionState(id);
  const muted = role === "guest" ? await rules.isMuted(id, me(req).id) : false;
  res.json({ state, role, muted });
}));

roomsRouter.post("/sessions/:id/close", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  await requireHost(me(req).id, id);
  await sessions.closeSession(id, "host_closed");
  res.json({ ok: true });
}));

/** Izlaz domaćina: klijent prikazuje potvrdu, server traži izričito confirm=true. */
roomsRouter.post("/sessions/:id/exit", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { confirm } = z.object({ confirm: z.literal(true) }).parse(req.body);
  void confirm;
  await requireHost(me(req).id, id);
  await sessions.closeSession(id, "host_exit");
  res.json({ ok: true });
}));

// ---------- Pozivi ----------
roomsRouter.get("/sessions/:id/invitations", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  await requireHost(me(req).id, id);
  const rows = await db.select({ inv: s.invitations, displayName: s.users.displayName }).from(s.invitations)
    .innerJoin(s.users, eq(s.users.id, s.invitations.inviteeId)).where(eq(s.invitations.sessionId, id));
  const pending = await db.select().from(s.entryRequests).where(and(eq(s.entryRequests.sessionId, id), eq(s.entryRequests.status, "pending")));
  res.json({
    invitations: rows.map((r) => ({ id: r.inv.id, userId: r.inv.inviteeId, displayName: r.displayName, status: r.inv.status })),
    entryRequests: pending.map((p) => ({ id: p.id, userId: p.userId, displayName: rows.find((r) => r.inv.inviteeId === p.userId)?.displayName ?? "?", createdAt: p.createdAt })),
  });
}));

/** Poziv ne zauzima mjesto. Pozvati se mogu samo aktivni kontakti. */
roomsRouter.post("/sessions/:id/invitations", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { userId } = z.object({ userId: uuidSchema }).parse(req.body);
  const host = me(req);
  await requireHost(host.id, id);
  await rateLimit("invite", host.id);
  if (userId === host.id) throw bad("self", "Ne možeš pozvati sebe.");
  if (!(await rules.isActiveContact(host.id, userId))) throw forbidden("Možeš pozvati samo aktivne kontakte.");
  const [inv] = await db.insert(s.invitations).values({ sessionId: id, inviteeId: userId })
    .onConflictDoUpdate({ target: [s.invitations.sessionId, s.invitations.inviteeId], set: { status: "pending", createdAt: new Date(), updatedAt: new Date() } })
    .returning();
  await rules.touchContact(host.id, userId);
  await db.delete(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.type, "invitation")));
  await notify(userId, "invitation", { sessionId: id, invitationId: inv.id, hostName: host.displayName });
  res.json({ invitation: { id: inv.id, status: inv.status } });
}));

/** Domaćin povlači poziv dok nije prihvaćen. */
roomsRouter.delete("/sessions/:id/invitations/:userId", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const userId = uuidSchema.parse(req.params.userId);
  await requireHost(me(req).id, id);
  if (await rules.getOpenSeat(userId, id)) throw conflict("already_seated", "Gost već sjedi za stolom; poziv je prihvaćen.");
  await db.update(s.invitations).set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(s.invitations.sessionId, id), eq(s.invitations.inviteeId, userId)));
  await db.update(s.entryRequests).set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(s.entryRequests.sessionId, id), eq(s.entryRequests.userId, userId), eq(s.entryRequests.status, "pending")));
  hub.toUser(userId, "invitation:revoked", { sessionId: id });
  res.json({ ok: true });
}));

/** Moji pozivi (uključujući propuštene) za sesije koje još traju. */
roomsRouter.get("/invitations", ah(async (req, res) => {
  const rows = await db.select({ inv: s.invitations, session: s.roomSessions, hostName: s.users.displayName })
    .from(s.invitations)
    .innerJoin(s.roomSessions, eq(s.roomSessions.id, s.invitations.sessionId))
    .innerJoin(s.users, eq(s.users.id, s.roomSessions.hostId))
    .where(and(eq(s.invitations.inviteeId, me(req).id), inArray(s.invitations.status, ["pending", "missed"]), isNull(s.roomSessions.closedAt)));
  const ids = rows.map((r) => r.session.id);
  const reqs = ids.length ? await db.select().from(s.entryRequests).where(and(eq(s.entryRequests.userId, me(req).id), inArray(s.entryRequests.sessionId, ids), eq(s.entryRequests.status, "pending"))) : [];
  res.json({
    invitations: rows.map((r) => ({
      id: r.inv.id, sessionId: r.session.id, hostName: r.hostName, status: r.inv.status,
      requested: reqs.some((x) => x.sessionId === r.session.id),
    })),
  });
}));

roomsRouter.post("/invitations/:id/decline", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const r = await db.update(s.invitations).set({ status: "declined", updatedAt: new Date() })
    .where(and(eq(s.invitations.id, id), eq(s.invitations.inviteeId, me(req).id), inArray(s.invitations.status, ["pending", "missed"]))).returning();
  if (!r.length) throw notFound("Poziv ne postoji.");
  res.json({ ok: true });
}));

/** Odgovor na poziv = zahtjev za ulazak. Domaćin odobrava. */
roomsRouter.post("/invitations/:id/request-entry", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const u = me(req);
  const [inv] = await db.select().from(s.invitations).where(and(eq(s.invitations.id, id), eq(s.invitations.inviteeId, u.id))).limit(1);
  if (!inv || !["pending", "missed"].includes(inv.status)) throw notFound("Poziv ne postoji ili više ne važi.");
  const session = await rules.getSession(inv.sessionId);
  if (!session || session.closedAt) throw conflict("session_closed", "Soba više nije otvorena.");
  if (await rules.isBlockedEither(u.id, session.hostId)) throw notFound("Poziv ne postoji ili više ne važi.");
  if (await rules.getOpenSessionOfHost(u.id)) throw conflict("is_host", "Prvo zatvori svoju sobu – ne možeš istovremeno biti domaćin i gost.");
  const seat = await rules.getOpenSeatOfUser(u.id);
  if (seat?.sessionId === session.id) return res.json({ status: "seated" });
  if (seat) throw conflict("guest_elsewhere", "Već sjediš za drugim stolom. Prvo izađi.");
  const [r] = await db.insert(s.entryRequests).values({ sessionId: session.id, userId: u.id, invitationId: inv.id }).onConflictDoNothing().returning();
  if (r) await notify(session.hostId, "entry_request", { sessionId: session.id, requestId: r.id, displayName: u.displayName });
  res.json({ status: "requested" });
}));

roomsRouter.post("/entry-requests/:id/:decision", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const decision = z.enum(["approve", "reject"]).parse(req.params.decision);
  const [er] = await db.select().from(s.entryRequests).where(eq(s.entryRequests.id, id)).limit(1);
  if (!er || er.status !== "pending") throw notFound("Zahtjev ne postoji.");
  await requireHost(me(req).id, er.sessionId);
  if (decision === "reject") {
    await db.update(s.entryRequests).set({ status: "rejected", decidedAt: new Date() }).where(eq(s.entryRequests.id, id));
    await notify(er.userId, "entry_rejected", { sessionId: er.sessionId });
    return res.json({ ok: true });
  }
  const seat = await sessions.seatGuest(me(req).id, er.sessionId, er.userId, { placedAbsent: false });
  res.json({ seatNo: seat.seatNo });
}));

/** Domaćin postavlja ikonicu odsutnog pozvanog gosta za sto: od tog trenutka gost dobija nove poruke, i offline. */
roomsRouter.post("/sessions/:id/place", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { userId } = z.object({ userId: uuidSchema }).parse(req.body);
  await requireHost(me(req).id, id);
  const seat = await sessions.seatGuest(me(req).id, id, userId, { placedAbsent: true });
  res.json({ seatNo: seat.seatNo });
}));

roomsRouter.post("/sessions/:id/remove", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { userId } = z.object({ userId: uuidSchema }).parse(req.body);
  await sessions.removeGuest(me(req).id, id, userId);
  res.json({ ok: true });
}));

roomsRouter.post("/sessions/:id/mute", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { userId, muted } = z.object({ userId: uuidSchema, muted: z.boolean() }).parse(req.body);
  await sessions.setMuted(me(req).id, id, userId, muted);
  res.json({ ok: true });
}));

roomsRouter.post("/sessions/:id/leave", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  await sessions.leaveSeat(me(req).id, id);
  res.json({ ok: true });
}));
