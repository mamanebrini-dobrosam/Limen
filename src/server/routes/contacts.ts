import { Router } from "express";
import { z } from "zod";
import { and, eq, or, ilike, inArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { ah, bad, forbidden, notFound, orderedPair, uuidSchema } from "../lib/core.js";
import { rateLimit, notify, hub } from "../lib/infra.js";
import { requireVerified, me } from "../lib/auth.js";
import * as rules from "../services/rules.js";
import { endSeat, broadcastState } from "../services/sessions.js";

const s = schema;
export const contactsRouter = Router();
contactsRouter.use(requireVerified);

/** Ko stoji iza QR koda – samo ime, za potvrdu prije slanja zahtjeva. QR nikad ne daje pristup sobi. */
contactsRouter.get("/qr/:qrId", ah(async (req, res) => {
  const qrId = z.string().min(10).max(64).parse(req.params.qrId);
  const [u] = await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(eq(s.users.qrId, qrId)).limit(1);
  if (!u) throw notFound("QR kod nije prepoznat.");
  const row = await rules.getContactRow(me(req).id, u.id);
  const active = await rules.isActiveContact(me(req).id, u.id);
  res.json({ displayName: u.displayName, self: u.id === me(req).id, alreadyContact: active, pending: row?.status === "pending" });
}));

/** Skeniranje → zahtjev za kontakt. Druga osoba mora prihvatiti. */
contactsRouter.post("/request", ah(async (req, res) => {
  const { qrId } = z.object({ qrId: z.string().min(10).max(64) }).parse(req.body);
  const meId = me(req).id;
  await rateLimit("contactRequest", meId);
  const [target] = await db.select().from(s.users).where(eq(s.users.qrId, qrId)).limit(1);
  if (!target) throw notFound("QR kod nije prepoznat.");
  if (target.id === meId) throw bad("self", "Ovo je tvoj QR kod.");
  // Blokada se ne otkriva: odgovor izgleda isto kao uspješno poslan zahtjev.
  if (await rules.isBlockedEither(meId, target.id)) return res.json({ status: "pending" });

  const [ua, ub] = orderedPair(meId, target.id);
  const row = await rules.getContactRow(meId, target.id);
  if (row?.status === "accepted" && (await rules.isActiveContact(meId, target.id))) return res.json({ status: "accepted" });
  if (row?.status === "pending") {
    if (row.requesterId !== meId) {
      // Obostrano skeniranje = prihvatanje.
      await db.update(s.contacts).set({ status: "accepted", acceptedAt: new Date(), lastActivityAt: new Date() }).where(eq(s.contacts.id, row.id));
      await notify(target.id, "contact_accepted", { userId: meId, displayName: me(req).displayName });
      return res.json({ status: "accepted" });
    }
    return res.json({ status: "pending" });
  }
  const values = { userA: ua, userB: ub, requesterId: meId, status: "pending" as const, requestedAt: new Date(), acceptedAt: null, lastActivityAt: null };
  if (row) await db.update(s.contacts).set(values).where(eq(s.contacts.id, row.id));
  else await db.insert(s.contacts).values(values);
  await notify(target.id, "contact_request", { userId: meId, displayName: me(req).displayName });
  res.json({ status: "pending" });
}));

/** Dolazni zahtjevi za kontakt. */
contactsRouter.get("/requests", ah(async (req, res) => {
  const meId = me(req).id;
  const rows = await db.select().from(s.contacts).where(and(eq(s.contacts.status, "pending"), or(eq(s.contacts.userA, meId), eq(s.contacts.userB, meId))));
  const incoming = rows.filter((r) => r.requesterId !== meId);
  const ids = incoming.map((r) => r.requesterId);
  const people = ids.length ? await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(inArray(s.users.id, ids)) : [];
  res.json({ requests: incoming.map((r) => ({ id: r.id, userId: r.requesterId, displayName: people.find((p) => p.id === r.requesterId)?.displayName ?? "?", requestedAt: r.requestedAt })) });
}));

contactsRouter.post("/requests/:id/:decision", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const decision = z.enum(["accept", "reject"]).parse(req.params.decision);
  const meId = me(req).id;
  const [row] = await db.select().from(s.contacts).where(eq(s.contacts.id, id)).limit(1);
  if (!row || row.status !== "pending" || (row.userA !== meId && row.userB !== meId)) throw notFound("Zahtjev ne postoji.");
  if (row.requesterId === meId) throw forbidden("Ne možeš prihvatiti vlastiti zahtjev.");
  if (decision === "accept") {
    await db.update(s.contacts).set({ status: "accepted", acceptedAt: new Date(), lastActivityAt: new Date() }).where(eq(s.contacts.id, id));
    await notify(row.requesterId, "contact_accepted", { userId: meId, displayName: me(req).displayName });
  } else {
    await db.update(s.contacts).set({ status: "rejected" }).where(eq(s.contacts.id, id));
  }
  res.json({ ok: true });
}));

/** Privatna pretraga: samo aktivni kontakti (prihvaćeni, bez blokade, mlađi od 90 dana bez aktivnosti). Nema javne pretrage ljudi. */
contactsRouter.get("/", ah(async (req, res) => {
  const meId = me(req).id;
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  const rows = await db.select().from(s.contacts).where(and(eq(s.contacts.status, "accepted"), or(eq(s.contacts.userA, meId), eq(s.contacts.userB, meId))));
  const now = Date.now();
  const active = rows.filter((r) => (rules.contactExpiresAt(r)?.getTime() ?? 0) > now);
  const otherIds = active.map((r) => (r.userA === meId ? r.userB : r.userA));
  if (otherIds.length === 0) return res.json({ contacts: [] });
  const blocked = await db.select().from(s.blocks).where(or(
    and(eq(s.blocks.blockerId, meId), inArray(s.blocks.blockedId, otherIds)),
    and(eq(s.blocks.blockedId, meId), inArray(s.blocks.blockerId, otherIds)),
  ));
  const blockedSet = new Set(blocked.map((b) => (b.blockerId === meId ? b.blockedId : b.blockerId)));
  const people = await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users)
    .where(and(inArray(s.users.id, otherIds), q ? ilike(s.users.displayName, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined));
  res.json({
    contacts: people.filter((p) => !blockedSet.has(p.id)).map((p) => {
      const r = active.find((x) => x.userA === p.id || x.userB === p.id)!;
      return { userId: p.id, displayName: p.displayName, expiresAt: rules.contactExpiresAt(r) };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName, "bs")),
  });
}));

/** Uklanjanje kontakta. Ne dira profil ni QR kod druge osobe. */
contactsRouter.delete("/:userId", ah(async (req, res) => {
  const other = uuidSchema.parse(req.params.userId);
  const [ua, ub] = orderedPair(me(req).id, other);
  await db.delete(s.contacts).where(and(eq(s.contacts.userA, ua), eq(s.contacts.userB, ub)));
  res.json({ ok: true });
}));

// ---------- Blokade ----------
export const blocksRouter = Router();
blocksRouter.use(requireVerified);

blocksRouter.get("/", ah(async (req, res) => {
  const rows = await db.select({ userId: s.blocks.blockedId, displayName: s.users.displayName, createdAt: s.blocks.createdAt })
    .from(s.blocks).innerJoin(s.users, eq(s.users.id, s.blocks.blockedId)).where(eq(s.blocks.blockerId, me(req).id));
  res.json({ blocks: rows });
}));

blocksRouter.post("/", ah(async (req, res) => {
  const { userId: target } = z.object({ userId: uuidSchema }).parse(req.body);
  const meId = me(req).id;
  if (target === meId) throw bad("self", "Ne možeš blokirati sebe.");
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, target)).limit(1);
  if (!exists) throw notFound();
  await blockUser(meId, target);
  res.json({ ok: true });
}));

blocksRouter.delete("/:userId", ah(async (req, res) => {
  const target = uuidSchema.parse(req.params.userId);
  await db.delete(s.blocks).where(and(eq(s.blocks.blockerId, me(req).id), eq(s.blocks.blockedId, target)));
  res.json({ ok: true });
}));

/**
 * Posljedice blokade:
 * - kontakt se uklanja iz pretrage, otvoreni pozivi i zahtjevi između njih se poništavaju;
 * - ako je jedan domaćin, a drugi sjedi za njegovim stolom: gost odmah napušta sto;
 * - pristup ranijim porukama iz sobe se ukida (provjera u svakom čitanju);
 * - ako su oboje gosti za istim stolom: oba ostaju do kraja sesije, domaćin dobija obavijest.
 */
export async function blockUser(meId: string, target: string) {
  const [ua, ub] = orderedPair(meId, target);
  const affected: { sessionId: string; userId: string }[] = [];
  await db.transaction(async (tx) => {
    await tx.insert(s.blocks).values({ blockerId: meId, blockedId: target }).onConflictDoNothing();
    await tx.delete(s.contacts).where(and(eq(s.contacts.userA, ua), eq(s.contacts.userB, ub)));
    for (const [host, guest] of [[meId, target], [target, meId]] as const) {
      const sess = await rules.getOpenSessionOfHost(host, tx);
      if (!sess) continue;
      await tx.update(s.invitations).set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(s.invitations.sessionId, sess.id), eq(s.invitations.inviteeId, guest)));
      await tx.update(s.entryRequests).set({ status: "cancelled", decidedAt: new Date() })
        .where(and(eq(s.entryRequests.sessionId, sess.id), eq(s.entryRequests.userId, guest), eq(s.entryRequests.status, "pending")));
      const ended = await endSeat(sess.id, guest, "blocked", tx);
      if (ended) affected.push({ sessionId: sess.id, userId: guest });
    }
  });
  for (const a of affected) {
    await hub.disconnectUserFromSession(a.userId, a.sessionId);
    hub.toUser(a.userId, "session:left", { sessionId: a.sessionId, reason: "blocked" });
    await broadcastState(a.sessionId);
  }
  // Oba gosta za istim stolom?
  const mySeat = await rules.getOpenSeatOfUser(meId);
  const theirSeat = await rules.getOpenSeatOfUser(target);
  if (mySeat && theirSeat && mySeat.sessionId === theirSeat.sessionId) {
    const sess = await rules.getSession(mySeat.sessionId);
    if (sess) await notify(sess.hostId, "guest_block", { sessionId: sess.id, message: "Jedan gost je blokirao drugog gosta za tvojim stolom. Oba ostaju do kraja ove sesije; od sljedeće ne mogu sjediti zajedno." });
  }
}
