import { Router } from "express";
import { z } from "zod";
import { and, eq, gt, isNull, desc, or, inArray, sql } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { HttpError, ah, ageOn, bad, randomToken, sha256, unauthorized, conflict, notFound } from "../lib/core.js";
import { rateLimit, sendMail, hub, ensureMailAvailable } from "../lib/infra.js";
import { createSession, setSessionCookie, requireUser, me, SESSION_COOKIE } from "../lib/auth.js";
import { closeSession, endSeat } from "../services/sessions.js";
import * as rules from "../services/rules.js";
import { deleteAssetFile } from "../lib/media.js";
import { exportDirectData } from "../services/direct-chat.js";
import { exportVisitorData } from "../services/visitor-chat.js";

const s = schema;
export const authRouter = Router();

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, "Lozinka mora imati najmanje 10 znakova.").max(200);

// Argon2id parametri (OWASP preporuka: m=19 MiB, t=2, p=1)
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const DUMMY_HASH = await hash("nepostojeci-nalog-za-izjednacavanje-vremena", ARGON);

async function issueEmailToken(userId: string, purpose: "verify" | "reset") {
  const token = randomToken(32);
  const ttl = purpose === "verify" ? 48 * 3600_000 : 3600_000;
  await db.insert(s.emailTokens).values({ userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl) });
  return token;
}

async function consumeEmailToken(token: string, purpose: "verify" | "reset") {
  const [row] = await db.update(s.emailTokens).set({ usedAt: new Date() })
    .where(and(eq(s.emailTokens.tokenHash, sha256(token)), eq(s.emailTokens.purpose, purpose), isNull(s.emailTokens.usedAt), gt(s.emailTokens.expiresAt, new Date())))
    .returning();
  return row ?? null;
}

export function publicUser(u: typeof s.users.$inferSelect) {
  return { id: u.id, email: u.email, displayName: u.displayName, qrId: u.qrId, emailVerified: !!u.emailVerifiedAt, isAdmin: u.isAdmin };
}

authRouter.post("/register", ah(async (req, res) => {
  await rateLimit("register", req.ip ?? "?");
  ensureMailAvailable();
  const body = z.object({
    email, password,
    displayName: z.string().trim().min(2).max(40),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confirmAdult: z.literal(true, { message: "Potvrdi da imaš najmanje 18 godina." }),
  }).parse(req.body);
  if (Number.isNaN(Date.parse(body.birthDate))) throw bad("birth_date", "Neispravan datum rođenja.");
  if (ageOn(body.birthDate) < 18) throw bad("underage", "LIMEN je trenutno dostupan samo osobama od 18 godina i starijim.");

  const passwordHash = await hash(body.password, ARGON);
  let user: typeof s.users.$inferSelect;
  try {
    user = await db.transaction(async (tx) => {
      const [u] = await tx.insert(s.users).values({
        email: body.email, passwordHash, displayName: body.displayName, birthDate: body.birthDate,
        adultConfirmedAt: new Date(), qrId: randomToken(16), isAdmin: config.adminEmails.includes(body.email),
      }).returning();
      const [room] = await tx.insert(s.rooms).values({ ownerId: u.id }).returning();
      await tx.insert(s.roomSections).values([
        { roomId: room.id, kind: "about", title: "O meni", position: 0 },
        { roomId: room.id, kind: "vision", title: "Vision Board", position: 1 },
        { roomId: room.id, kind: "gallery", title: "Galerija", position: 2 },
      ]);
      return u;
    });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === "23505" || err.cause?.code === "23505") throw conflict("email_taken", "Nalog s ovom email adresom već postoji.");
    throw e;
  }
  const token = await issueEmailToken(user.id, "verify");
  await sendMail(user.email, "Potvrdi svoju email adresu – LIMEN",
    `Dobro došao/la u LIMEN.\n\nPotvrdi adresu otvaranjem linka:\n${config.appUrl}/potvrda?token=${token}\n\nLink važi 48 sati.`);
  const sess = await createSession(user.id, req.get("user-agent"));
  setSessionCookie(res, sess.token, sess.expiresAt);
  res.status(201).json({ user: publicUser(user) });
}));

authRouter.post("/verify-email", ah(async (req, res) => {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
  const row = await consumeEmailToken(token, "verify");
  if (!row) throw bad("invalid_token", "Link za potvrdu nije važeći ili je istekao.");
  await db.update(s.users).set({ emailVerifiedAt: new Date() }).where(eq(s.users.id, row.userId));
  res.json({ ok: true });
}));

authRouter.post("/resend-verification", requireUser, ah(async (req, res) => {
  const u = me(req);
  if (u.emailVerifiedAt) return res.json({ ok: true });
  ensureMailAvailable();
  await rateLimit("passwordReset", `verify:${u.id}`);
  const token = await issueEmailToken(u.id, "verify");
  await sendMail(u.email, "Potvrdi svoju email adresu – LIMEN", `Potvrdi adresu:\n${config.appUrl}/potvrda?token=${token}`);
  res.json({ ok: true });
}));

authRouter.post("/login", ah(async (req, res) => {
  const body = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
  await rateLimit("login", `ip:${req.ip}`);
  await rateLimit("login", `email:${body.email}`);
  const [u] = await db.select().from(s.users).where(eq(s.users.email, body.email)).limit(1);
  const ok = await verify(u?.passwordHash ?? DUMMY_HASH, body.password);
  if (!u || !ok) throw new HttpError(401, "bad_credentials", "Pogrešan email ili lozinka.");
  const sess = await createSession(u.id, req.get("user-agent"));
  setSessionCookie(res, sess.token, sess.expiresAt);
  res.json({ user: publicUser(u) });
}));

authRouter.post("/logout", ah(async (req, res) => {
  if (req.sessionTokenHash) await db.update(s.authSessions).set({ revokedAt: new Date() }).where(eq(s.authSessions.tokenHash, req.sessionTokenHash));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));

authRouter.post("/logout-all", requireUser, ah(async (req, res) => {
  await db.update(s.authSessions).set({ revokedAt: new Date() }).where(and(eq(s.authSessions.userId, me(req).id), isNull(s.authSessions.revokedAt)));
  await hub.logoutUser(me(req).id);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));

authRouter.post("/forgot-password", ah(async (req, res) => {
  const body = z.object({ email }).parse(req.body);
  await rateLimit("passwordReset", `ip:${req.ip}`);
  await rateLimit("passwordReset", `email:${body.email}`);
  // A missing mail service must not distinguish existing/nonexistent accounts.
  ensureMailAvailable();
  const [u] = await db.select().from(s.users).where(eq(s.users.email, body.email)).limit(1);
  if (u) {
    const token = await issueEmailToken(u.id, "reset");
    await sendMail(u.email, "Nova lozinka – LIMEN", `Za postavljanje nove lozinke otvori:\n${config.appUrl}/nova-lozinka?token=${token}\n\nLink važi 1 sat. Ako nisi tražio/la promjenu, zanemari ovu poruku.`);
  }
  // Isti odgovor bez obzira na to postoji li nalog.
  res.json({ ok: true });
}));

authRouter.post("/reset-password", ah(async (req, res) => {
  const body = z.object({ token: z.string().min(10).max(200), password }).parse(req.body);
  const row = await consumeEmailToken(body.token, "reset");
  if (!row) throw bad("invalid_token", "Link za novu lozinku nije važeći ili je istekao.");
  await db.update(s.users).set({ passwordHash: await hash(body.password, ARGON), emailVerifiedAt: new Date() }).where(eq(s.users.id, row.userId));
  // Nova lozinka odjavljuje sve uređaje.
  await db.update(s.authSessions).set({ revokedAt: new Date() }).where(and(eq(s.authSessions.userId, row.userId), isNull(s.authSessions.revokedAt)));
  await hub.logoutUser(row.userId);
  res.json({ ok: true });
}));

// ---------- Moj nalog ----------
export const meRouter = Router();
meRouter.use(requireUser);

meRouter.get("/", ah(async (req, res) => { res.json({ user: publicUser(me(req)) }); }));

meRouter.get("/status", ah(async (req, res) => {
  const u = me(req);
  const hosting = await rules.getOpenSessionOfHost(u.id);
  const seat = await rules.getOpenSeatOfUser(u.id);
  const unread = await db.$count(s.notifications, and(eq(s.notifications.userId, u.id), isNull(s.notifications.readAt)));
  res.json({ hostingSessionId: hosting?.id ?? null, guestSessionId: seat?.sessionId ?? null, unreadNotifications: unread });
}));

meRouter.get("/notifications", ah(async (req, res) => {
  const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, me(req).id)).orderBy(desc(s.notifications.createdAt)).limit(100);
  res.json({ notifications: rows });
}));

meRouter.post("/notifications/read-all", ah(async (req, res) => {
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, me(req).id), isNull(s.notifications.readAt)));
  res.json({ ok: true });
}));

/** GDPR: izvoz vlastitih podataka. */
meRouter.get("/export", ah(async (req, res) => {
  const u = me(req);
  const [contactsA, contactsB, myMessages, room, blocksMade, reportsMade] = await Promise.all([
    db.select().from(s.contacts).where(eq(s.contacts.userA, u.id)),
    db.select().from(s.contacts).where(eq(s.contacts.userB, u.id)),
    db.select({ id: s.messages.id, createdAt: s.messages.createdAt, kind: s.messages.kind, body: s.messages.body }).from(s.messages).where(eq(s.messages.authorUserId, u.id)),
    rules.getRoomByOwner(u.id),
    db.select().from(s.blocks).where(eq(s.blocks.blockerId, u.id)),
    db.select().from(s.reports).where(eq(s.reports.reporterId, u.id)),
  ]);
  const items = room ? await db.select().from(s.roomItems).where(eq(s.roomItems.roomId, room.id)) : [];
  res.setHeader("Content-Disposition", "attachment; filename=limen-izvoz.json");
  res.json({
    exportedAt: new Date().toISOString(),
    account: { email: u.email, displayName: u.displayName, birthDate: u.birthDate, createdAt: u.createdAt, qrId: u.qrId },
    directChat: await exportDirectData(u.id),
    visitorChat: await exportVisitorData(u.id),
    contacts: [...contactsA, ...contactsB], messagesWritten: myMessages, roomItems: items, blocks: blocksMade, reports: reportsMade,
  });
}));

/** Brisanje naloga. Poruke u tuđim arhivama ostaju, ali bez veze s nalogom ("Obrisani korisnik"). */
meRouter.delete("/", ah(async (req, res) => {
  const u = me(req);
  const { password: pw } = z.object({ password: z.string().min(1) }).parse(req.body);
  if (!(await verify(u.passwordHash, pw))) throw unauthorized();
  const hosting = await rules.getOpenSessionOfHost(u.id);
  if (hosting) await closeSession(hosting.id, "account_deleted");
  const seat = await rules.getOpenSeatOfUser(u.id);
  if (seat) await endSeat(seat.sessionId, u.id, "left");

  const files = await db.select({ key: s.mediaAssets.storageKey, id: s.mediaAssets.id }).from(s.mediaAssets).where(and(eq(s.mediaAssets.ownerId, u.id), eq(s.mediaAssets.purpose, "gallery")));
  await db.transaction(async (tx) => {
    // Novi nasumični ID; ne čuva se nikakva veza s obrisanim nalogom.
    await tx.update(s.messages).set({ authorUserId: null, anonymousAuthorId: crypto.randomUUID() }).where(eq(s.messages.authorUserId, u.id));
    for (const f of files) await tx.delete(s.mediaAssets).where(eq(s.mediaAssets.id, f.id));
    const chats = await tx.select({ id: s.directConversations.id }).from(s.directConversations)
      .where(or(eq(s.directConversations.userA, u.id), eq(s.directConversations.userB, u.id)));
    const requests = await tx.select({ id: s.directRequests.id }).from(s.directRequests)
      .where(or(eq(s.directRequests.ownerId, u.id), eq(s.directRequests.requesterId, u.id)));
    const visitorChats = await tx.select({ id: s.visitorChats.id }).from(s.visitorChats)
      .where(or(eq(s.visitorChats.ownerId, u.id), eq(s.visitorChats.linkedUserId, u.id)));
    if (visitorChats.length) await tx.delete(s.notifications).where(
      inArray(sql<string>`${s.notifications.payload}->>'visitorChatId'`, visitorChats.map((c) => c.id)));
    if (chats.length || requests.length) await tx.delete(s.notifications).where(and(
      sql`${s.notifications.type} like 'direct\\_%' escape '\\'`,
      or(
        chats.length ? inArray(sql<string>`${s.notifications.payload}->>'conversationId'`, chats.map((c) => c.id)) : undefined,
        requests.length ? inArray(sql<string>`${s.notifications.payload}->>'requestId'`, requests.map((r) => r.id)) : undefined,
      ),
    ));
    await tx.delete(s.users).where(eq(s.users.id, u.id)); // kaskadno briše sobu, kontakte, sesije, blokade i privatni chat
  });
  for (const f of files) await deleteAssetFile(f.key);
  await hub.logoutUser(u.id);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
}));

// ---------- Samo za izolovane automatske testove: pregled testnih poruka ----------
export const devRouter = Router();
devRouter.get("/outbox", ah(async (req, res) => {
  if (!config.isTest || config.isProd) throw notFound();
  const to = typeof req.query.to === "string" ? req.query.to.toLowerCase() : undefined;
  const rows = await db.select().from(s.devOutbox).where(to ? eq(s.devOutbox.to, to) : undefined).orderBy(desc(s.devOutbox.createdAt)).limit(20);
  res.json({ emails: rows });
}));
