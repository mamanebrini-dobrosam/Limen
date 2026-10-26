import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, eq, asc, desc, inArray } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { ah, bad, forbidden, notFound, uuidSchema } from "../lib/core.js";
import { rateLimit, notify } from "../lib/infra.js";
import { requireVerified, requireAdmin, me } from "../lib/auth.js";
import { storeImage, deleteAssetFile } from "../lib/media.js";
import * as rules from "../services/rules.js";
import { isGuestOfRoomNow } from "./chat.js";

const s = schema;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxImageBytes, files: 1 } });

async function myRoom(userId: string) {
  const room = await rules.getRoomByOwner(userId);
  if (!room) throw notFound();
  return room;
}

async function roomContent(roomId: string, onlyShared: boolean) {
  const sections = await db.select().from(s.roomSections).where(eq(s.roomSections.roomId, roomId)).orderBy(asc(s.roomSections.position), asc(s.roomSections.createdAt));
  const items = await db.select().from(s.roomItems)
    .where(and(eq(s.roomItems.roomId, roomId), onlyShared ? eq(s.roomItems.sharedWithGuests, true) : undefined))
    .orderBy(asc(s.roomItems.position), desc(s.roomItems.createdAt));
  return sections.map((sec) => ({
    id: sec.id, kind: sec.kind, title: sec.title,
    items: items.filter((i) => i.sectionId === sec.id).map((i) => ({
      id: i.id, kind: i.kind, text: i.text, mediaId: i.mediaId, ...(onlyShared ? {} : { sharedWithGuests: i.sharedWithGuests }),
    })),
  }));
}

// ---------- Vlasnik uređuje svoju sobu ----------
export const contentRouter = Router();
contentRouter.use(requireVerified);

contentRouter.get("/room/content", ah(async (req, res) => {
  const room = await myRoom(me(req).id);
  res.json({ theme: room.theme, sections: await roomContent(room.id, false) });
}));

/** Gosti vide samo sadržaj koji je vlasnik odobrio svim gostima – isti za sve. Privatna galerija se nikad ne vraća. */
contentRouter.get("/sessions/:id/room", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { session, role } = await rules.roleInSession(me(req).id, id);
  if (!session || !role) throw forbidden("Nisi za ovim stolom.");
  const [room] = await db.select().from(s.rooms).where(eq(s.rooms.id, session.roomId));
  if (role === "guest" && !(await isGuestOfRoomNow(me(req).id, room.id, room.ownerId))) throw forbidden();
  res.json({ theme: room.theme, sections: await roomContent(room.id, true) });
}));

contentRouter.post("/room/sections", ah(async (req, res) => {
  const { title } = z.object({ title: z.string().trim().min(1).max(40) }).parse(req.body);
  const room = await myRoom(me(req).id);
  const [sec] = await db.insert(s.roomSections).values({ roomId: room.id, kind: "custom", title, position: 10 }).returning();
  res.status(201).json({ section: sec });
}));

async function ownSection(userId: string, sectionId: string) {
  const room = await myRoom(userId);
  const [sec] = await db.select().from(s.roomSections).where(and(eq(s.roomSections.id, sectionId), eq(s.roomSections.roomId, room.id))).limit(1);
  if (!sec) throw notFound();
  return { room, sec };
}

contentRouter.patch("/room/sections/:id", ah(async (req, res) => {
  const { title } = z.object({ title: z.string().trim().min(1).max(40) }).parse(req.body);
  const { sec } = await ownSection(me(req).id, uuidSchema.parse(req.params.id));
  await db.update(s.roomSections).set({ title }).where(eq(s.roomSections.id, sec.id));
  res.json({ ok: true });
}));

contentRouter.delete("/room/sections/:id", ah(async (req, res) => {
  const { sec } = await ownSection(me(req).id, uuidSchema.parse(req.params.id));
  if (sec.kind !== "custom") throw bad("fixed_section", "Osnovne cjeline se ne mogu obrisati.");
  await db.delete(s.roomSections).where(eq(s.roomSections.id, sec.id));
  res.json({ ok: true });
}));

contentRouter.post("/room/items", ah(async (req, res) => {
  const body = z.object({ sectionId: uuidSchema, kind: z.enum(["text", "quote"]), text: z.string().trim().min(1).max(2000), sharedWithGuests: z.boolean().default(false) }).parse(req.body);
  const { room, sec } = await ownSection(me(req).id, body.sectionId);
  const [item] = await db.insert(s.roomItems).values({ roomId: room.id, sectionId: sec.id, kind: body.kind, text: body.text, sharedWithGuests: body.sharedWithGuests }).returning();
  res.status(201).json({ item });
}));

contentRouter.post("/room/items/image", upload.single("image"), ah(async (req, res) => {
  const sectionId = uuidSchema.parse(req.body.sectionId);
  const u = me(req);
  await rateLimit("upload", u.id);
  const { room, sec } = await ownSection(u.id, sectionId);
  if (!req.file) throw bad("no_file", "Izaberi fotografiju.");
  const asset = await storeImage(req.file.buffer, u.id, "gallery");
  const [item] = await db.insert(s.roomItems).values({ roomId: room.id, sectionId: sec.id, kind: "image", mediaId: asset.id, text: typeof req.body.text === "string" ? req.body.text.slice(0, 300) : null }).returning();
  res.status(201).json({ item });
}));

async function ownItem(userId: string, itemId: string) {
  const room = await myRoom(userId);
  const [item] = await db.select().from(s.roomItems).where(and(eq(s.roomItems.id, itemId), eq(s.roomItems.roomId, room.id))).limit(1);
  if (!item) throw notFound();
  return item;
}

contentRouter.patch("/room/items/:id", ah(async (req, res) => {
  const body = z.object({ text: z.string().trim().max(2000).optional(), sharedWithGuests: z.boolean().optional() }).parse(req.body);
  const item = await ownItem(me(req).id, uuidSchema.parse(req.params.id));
  await db.update(s.roomItems).set(body).where(eq(s.roomItems.id, item.id));
  res.json({ ok: true });
}));

contentRouter.delete("/room/items/:id", ah(async (req, res) => {
  const item = await ownItem(me(req).id, uuidSchema.parse(req.params.id));
  await db.delete(s.roomItems).where(eq(s.roomItems.id, item.id));
  if (item.mediaId) {
    const [a] = await db.delete(s.mediaAssets).where(eq(s.mediaAssets.id, item.mediaId)).returning();
    if (a) await deleteAssetFile(a.storageKey);
  }
  res.json({ ok: true });
}));

// ---------- Prijave zloupotrebe ----------
export const reportsRouter = Router();
reportsRouter.use(requireVerified);

reportsRouter.post("/", ah(async (req, res) => {
  const body = z.object({
    targetUserId: uuidSchema.optional(), messageId: uuidSchema.optional(), sessionId: uuidSchema.optional(),
    reason: z.string().trim().min(3).max(1000),
  }).refine((b) => b.targetUserId || b.messageId, { message: "Navedi korisnika ili poruku." }).parse(req.body);
  const u = me(req);
  await rateLimit("report", u.id);
  let targetUserId = body.targetUserId ?? null;
  if (body.messageId) {
    if (!(await rules.canReadMessage(u.id, body.messageId))) throw notFound();
    const [m] = await db.select().from(s.messages).where(eq(s.messages.id, body.messageId));
    targetUserId = targetUserId ?? m.authorUserId;
  }
  const [r] = await db.insert(s.reports).values({ reporterId: u.id, targetUserId, messageId: body.messageId ?? null, sessionId: body.sessionId ?? null, reason: body.reason }).returning();
  if (body.sessionId) {
    const sess = await rules.getSession(body.sessionId);
    if (sess && !sess.closedAt && sess.hostId !== u.id && (await rules.getOpenSeat(u.id, sess.id))) {
      await notify(sess.hostId, "report_in_room", { sessionId: sess.id, message: "Gost za tvojim stolom je prijavio zloupotrebu." });
    }
  }
  res.status(201).json({ reportId: r.id });
}));

// ---------- Administracija ----------
export const adminRouter = Router();
adminRouter.use(requireAdmin);

async function audit(adminId: string, action: string, target: string, details: Record<string, unknown> = {}) {
  await db.insert(s.adminAuditLog).values({ adminId, action, target, details });
}

adminRouter.get("/reports", ah(async (req, res) => {
  const status = z.enum(["open", "reviewed", "dismissed"]).default("open").parse(req.query.status ?? "open");
  const rows = await db.select().from(s.reports).where(eq(s.reports.status, status)).orderBy(desc(s.reports.createdAt)).limit(200);
  await audit(me(req).id, "list_reports", status);
  res.json({ reports: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, reason: r.reason, status: r.status, hasMessage: !!r.messageId, targetUserId: r.targetUserId, reporterId: r.reporterId })) });
}));

/** Sadržaj prijavljene poruke vidi se samo kroz konkretnu prijavu, a svaki pregled se bilježi. */
adminRouter.get("/reports/:id", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const [r] = await db.select().from(s.reports).where(eq(s.reports.id, id));
  if (!r) throw notFound();
  const [msg] = r.messageId ? await db.select().from(s.messages).where(eq(s.messages.id, r.messageId)) : [];
  const ids = [r.reporterId, r.targetUserId].filter(Boolean) as string[];
  const people = ids.length ? await db.select({ id: s.users.id, displayName: s.users.displayName, email: s.users.email }).from(s.users).where(inArray(s.users.id, ids)) : [];
  await audit(me(req).id, "view_report", id, { messageId: r.messageId });
  res.json({ report: r, message: msg ? { kind: msg.kind, body: msg.body, mediaId: msg.mediaId, createdAt: msg.createdAt } : null, people });
}));

adminRouter.post("/reports/:id/status", ah(async (req, res) => {
  const id = uuidSchema.parse(req.params.id);
  const { status } = z.object({ status: z.enum(["reviewed", "dismissed", "open"]) }).parse(req.body);
  await db.update(s.reports).set({ status, reviewedBy: me(req).id, reviewedAt: new Date() }).where(eq(s.reports.id, id));
  await audit(me(req).id, "set_report_status", id, { status });
  res.json({ ok: true });
}));

