import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq, lt, desc, inArray } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { ah, bad, conflict, forbidden, notFound, uuidSchema } from "../lib/core.js";
import { rateLimit, hub } from "../lib/infra.js";
import { requireVerified, me } from "../lib/auth.js";
import { storeImage, copyAsset, readAsset } from "../lib/media.js";
import * as rules from "../services/rules.js";

const s = schema;
export const chatRouter = Router();
chatRouter.use(requireVerified);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxImageBytes, files: 1 } });

type MsgRow = typeof s.messages.$inferSelect;
async function present(rows: MsgRow[]) {
  const ids = [...new Set(rows.map((r) => r.authorUserId).filter(Boolean))] as string[];
  const people = ids.length ? await db.select({ id: s.users.id, displayName: s.users.displayName }).from(s.users).where(inArray(s.users.id, ids)) : [];
  return rows.map((r) => ({
    id: r.id, sessionId: r.sessionId, kind: r.kind, body: r.body, mediaId: r.mediaId, createdAt: r.createdAt,
    author: r.authorUserId
      ? { id: r.authorUserId, displayName: people.find((p) => p.id === r.authorUserId)?.displayName ?? "?" }
      : { id: r.anonymousAuthorId, displayName: "Obrisani korisnik", deleted: true },
  }));
}

/**
 * Čitanje razgovora. Domaćin vidi cijelu arhivu svoje sobe.
 * Gost mora trenutno sjediti za stolom u tom razgovoru i dobija SAMO poruke iz svojih intervala.
 */
chatRouter.get("/conversations/:id/messages", ah(async (req, res) => {
  const conversationId = uuidSchema.parse(req.params.id);
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const u = me(req);
  const room = await rules.getRoomOfConversation(conversationId);
  if (!room) throw notFound();
  if (room.ownerId !== u.id) {
    const seat = await rules.getOpenSeatOfUser(u.id);
    if (!seat || seat.conversationId !== conversationId) throw forbidden("Nemaš pristup ovom razgovoru.");
  }
  const rows = await db.select().from(s.messages).where(and(
    eq(s.messages.conversationId, conversationId),
    before && !Number.isNaN(before.getTime()) ? lt(s.messages.createdAt, before) : undefined,
    rules.messageReadableBy(u.id, room.ownerId),
  )).orderBy(desc(s.messages.createdAt)).limit(limit);
  res.json({ messages: await present(rows.reverse()) });
}));

async function assertCanSend(userId: string, sessionId: string) {
  const { session, role } = await rules.roleInSession(userId, sessionId);
  if (!session || session.closedAt) throw conflict("session_closed", "Soba nije otvorena.");
  if (!role) throw forbidden("Nisi za ovim stolom.");
  if (role === "guest") {
    if (session.hostDisconnectDeadline) throw conflict("host_away", "Čekamo povratak domaćina…");
    if (await rules.isMuted(sessionId, userId)) throw forbidden("Domaćin te utišao. Možeš čitati, ali ne i pisati.");
  }
  return session;
}

async function publish(row: MsgRow) {
  const [out] = await present([row]);
  const recipients = await rules.liveRecipients(row.sessionId);
  hub.toUsers(recipients, "message", out);
  return out;
}

chatRouter.post("/sessions/:id/messages", ah(async (req, res) => {
  const sessionId = uuidSchema.parse(req.params.id);
  const { body } = z.object({ body: z.string().trim().min(1).max(config.maxMessageLength) }).parse(req.body);
  const u = me(req);
  const session = await assertCanSend(u.id, sessionId);
  await rateLimit("message", u.id);
  const [row] = await db.insert(s.messages).values({ conversationId: session.conversationId, sessionId, authorUserId: u.id, kind: "text", body }).returning();
  res.status(201).json({ message: await publish(row) });
}));

/** Fotografija iz galerije telefona. Linkovi i video nisu dozvoljeni. */
chatRouter.post("/sessions/:id/images", upload.single("image"), ah(async (req, res) => {
  const sessionId = uuidSchema.parse(req.params.id);
  const u = me(req);
  const session = await assertCanSend(u.id, sessionId);
  await rateLimit("upload", u.id);
  if (!req.file) throw bad("no_file", "Izaberi fotografiju.");
  const asset = await storeImage(req.file.buffer, u.id, "chat");
  const [row] = await db.insert(s.messages).values({ conversationId: session.conversationId, sessionId, authorUserId: u.id, kind: "image", mediaId: asset.id }).returning();
  res.status(201).json({ message: await publish(row) });
}));

/** Izričito spremanje fotografije iz chata u vlastitu (privatnu) galeriju. */
chatRouter.post("/messages/:id/save-to-gallery", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const u = me(req);
  const [msg] = await db.select().from(s.messages).where(eq(s.messages.id, id)).limit(1);
  if (!msg || msg.kind !== "image" || !msg.mediaId) throw notFound();
  if (!(await canAccessMessageNow(u.id, msg))) throw notFound();
  const room = await rules.getRoomByOwner(u.id);
  const [gallery] = await db.select().from(s.roomSections).where(and(eq(s.roomSections.roomId, room!.id), eq(s.roomSections.kind, "gallery"))).limit(1);
  const copy = await copyAsset(msg.mediaId, u.id, "gallery");
  const [item] = await db.insert(s.roomItems).values({ roomId: room!.id, sectionId: gallery.id, kind: "image", mediaId: copy.id, sharedWithGuests: false }).returning();
  res.status(201).json({ itemId: item.id });
}));

/** Poruka je dostupna: vlasnik sobe, ili gost koji trenutno sjedi u tom razgovoru i poruka je iz njegovog intervala. */
async function canAccessMessageNow(userId: string, msg: MsgRow) {
  const room = await rules.getRoomOfConversation(msg.conversationId);
  if (!room) return false;
  if (room.ownerId !== userId) {
    const seat = await rules.getOpenSeatOfUser(userId);
    if (!seat || seat.conversationId !== msg.conversationId) return false;
  }
  return rules.canReadMessage(userId, msg.id);
}

/** Svaka fotografija se servira tek nakon serverske provjere prava. */
chatRouter.get("/media/:id", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const u = me(req);
  const [asset] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id)).limit(1);
  if (!asset) throw notFound();
  let allowed = false;
  if (asset.purpose === "gallery") {
    const [item] = await db.select({ item: s.roomItems, room: s.rooms }).from(s.roomItems)
      .innerJoin(s.rooms, eq(s.rooms.id, s.roomItems.roomId)).where(eq(s.roomItems.mediaId, id)).limit(1);
    if (asset.ownerId === u.id || item?.room.ownerId === u.id) allowed = true;
    else if (item?.item.sharedWithGuests) allowed = await isGuestOfRoomNow(u.id, item.room.id, item.room.ownerId);
  } else {
    const msgs = await db.select().from(s.messages).where(eq(s.messages.mediaId, id)).limit(5);
    for (const m of msgs) if (await canAccessMessageNow(u.id, m)) { allowed = true; break; }
  }
  // Ne otkrivamo postojanje privatnih datoteka.
  if (!allowed) throw notFound();
  const buf = await readAsset(asset.storageKey);
  res.setHeader("Content-Type", asset.mime);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
}));

export async function isGuestOfRoomNow(userId: string, roomId: string, ownerId: string) {
  const seat = await rules.getOpenSeatOfUser(userId);
  if (!seat) return false;
  const session = await rules.getSession(seat.sessionId);
  if (!session || session.closedAt || session.roomId !== roomId) return false;
  return !(await rules.isBlockedEither(userId, ownerId));
}
