import { Router } from "express";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { ah, unauthorized, uuidSchema } from "../lib/core.js";
import { requireVerified } from "../lib/auth.js";
import { rateLimit } from "../lib/infra.js";
import { config } from "../config.js";
import * as visitor from "../services/visitor-chat.js";

export const visitorChatRouter = Router();
const qr = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/);
const bodySchema = z.object({ body: z.string().trim().min(1).max(config.maxMessageLength) });
const before = (value: unknown) => value === undefined ? undefined : z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(value);
const messageId = z.object({ messageId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

visitorChatRouter.get("/qr/:qr", ah(async (req, res) => {
  res.json(await visitor.visitorQr(req, res, qr.parse(req.params.qr)));
}));
visitorChatRouter.get("/mine", ah(async (req, res) => { res.json({ chats: await visitor.visitorMine(req) }); }));
visitorChatRouter.post("/recover", ah(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  await rateLimit("visitorRecovery", `ip:${req.ip}`);
  const { recoveryCode } = z.object({ recoveryCode: z.string().trim().min(1).max(200) }).parse(req.body);
  res.json(await visitor.recoverVisitor(req, res, recoveryCode));
}));
visitorChatRouter.post("/requests", ah(async (req, res) => {
  const data = z.object({
    qrId: qr,
    displayName: z.string().trim().min(2).max(40),
    confirmAdult: z.literal(true, { message: "Potvrdi da imaš najmanje 18 godina." }),
  }).parse(req.body);
  await rateLimit("visitorRequest", `ip:${req.ip}`);
  res.json(await visitor.requestVisitorChat(req, res, data.qrId, data.displayName));
}));

visitorChatRouter.get("/conversations/:id", ah(async (req, res) => {
  res.json(await visitor.visitorHistory(req, uuidSchema.parse(req.params.id), false, before(req.query.before)));
}));
visitorChatRouter.post("/conversations/:id/messages", ah(async (req, res) => {
  const { body } = bodySchema.parse(req.body);
  await rateLimit("visitorMessage", `ip:${req.ip}`);
  res.status(201).json(await visitor.visitorSend(req, uuidSchema.parse(req.params.id), false, body));
}));
visitorChatRouter.post("/conversations/:id/read", ah(async (req, res) => {
  const data = messageId.parse(req.body);
  await visitor.visitorRead(req, uuidSchema.parse(req.params.id), false, data.messageId);
  res.json({ ok: true });
}));
visitorChatRouter.post("/conversations/:id/claim", requireVerified, ah(async (req, res) => {
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
  await rateLimit("login", `visitor-claim:${req.user!.id}:${req.ip}`);
  if (!(await verify(req.user!.passwordHash, password))) throw unauthorized();
  await visitor.claimVisitor(req, uuidSchema.parse(req.params.id));
  res.json({ ok: true });
}));
visitorChatRouter.post("/conversations/:id/recovery", ah(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  await rateLimit("visitorRecoveryIssue", `ip:${req.ip}`);
  res.json(await visitor.issueVisitorRecovery(req, uuidSchema.parse(req.params.id)));
}));

visitorChatRouter.use("/owner", requireVerified);
visitorChatRouter.get("/owner/conversations", ah(async (req, res) => { res.json({ chats: await visitor.visitorOwnerList(req.user!.id, false) }); }));
visitorChatRouter.get("/owner/requests", ah(async (req, res) => { res.json({ chats: await visitor.visitorOwnerList(req.user!.id, true) }); }));
visitorChatRouter.get("/owner/:id", ah(async (req, res) => {
  res.json(await visitor.visitorHistory(req, uuidSchema.parse(req.params.id), true, before(req.query.before)));
}));
visitorChatRouter.post("/owner/:id/approve", ah(async (req, res) => {
  res.json(await visitor.decideVisitor(req, uuidSchema.parse(req.params.id), true));
}));
visitorChatRouter.post("/owner/:id/reject", ah(async (req, res) => {
  res.json(await visitor.decideVisitor(req, uuidSchema.parse(req.params.id), false));
}));
visitorChatRouter.post("/owner/:id/messages", ah(async (req, res) => {
  const { body } = bodySchema.parse(req.body);
  await rateLimit("message", req.user!.id);
  res.status(201).json(await visitor.visitorSend(req, uuidSchema.parse(req.params.id), true, body));
}));
visitorChatRouter.post("/owner/:id/read", ah(async (req, res) => {
  await visitor.visitorRead(req, uuidSchema.parse(req.params.id), true, messageId.parse(req.body).messageId);
  res.json({ ok: true });
}));
visitorChatRouter.patch("/owner/:id/limit", ah(async (req, res) => {
  const { limit } = z.object({ limit: z.number().int().min(1).max(1000).nullable() }).parse(req.body);
  await visitor.visitorLimit(req, uuidSchema.parse(req.params.id), limit);
  res.json({ ok: true });
}));
visitorChatRouter.post("/owner/:id/room-offer", ah(async (req, res) => {
  res.json(await visitor.visitorRoomOffer(req, uuidSchema.parse(req.params.id)));
}));
