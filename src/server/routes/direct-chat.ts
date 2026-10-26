import { Router } from "express";
import { z } from "zod";
import { ah, uuidSchema } from "../lib/core.js";
import { me, requireVerified } from "../lib/auth.js";
import { rateLimit } from "../lib/infra.js";
import { config } from "../config.js";
import * as direct from "../services/direct-chat.js";

export const directChatRouter = Router();
directChatRouter.use(requireVerified);
const qrSchema = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/);
directChatRouter.get("/qr/:qrId", ah(async (req, res) => {
  res.json(await direct.directQr(me(req).id, qrSchema.parse(req.params.qrId)));
}));
directChatRouter.get("/requests", ah(async (req, res) => {
  res.json({ requests: await direct.listDirectRequests(me(req).id) });
}));
directChatRouter.post("/requests", ah(async (req, res) => {
  const { qrId } = z.object({ qrId: qrSchema }).parse(req.body);
  await rateLimit("directRequest", me(req).id);
  res.json(await direct.requestDirectChat(me(req).id, qrId));
}));
directChatRouter.post("/requests/:id/:decision", ah(async (req, res) => {
  const decision = z.enum(["approve", "reject"]).parse(req.params.decision);
  res.json(await direct.decideDirectRequest(me(req).id, uuidSchema.parse(req.params.id), decision === "approve"));
}));
directChatRouter.get("/conversations", ah(async (req, res) => {
  res.json({ conversations: await direct.listDirectChats(me(req).id) });
}));
directChatRouter.get("/conversations/:id/messages", ah(async (req, res) => {
  const before = req.query.before === undefined ? undefined : z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(req.query.before);
  res.json(await direct.directHistory(me(req).id, uuidSchema.parse(req.params.id), before));
}));
directChatRouter.patch("/conversations/:id/limit", ah(async (req, res) => {
  const { limit } = z.object({ limit: z.number().int().min(1).max(1000).nullable() }).parse(req.body);
  await direct.setDirectLimit(me(req).id, uuidSchema.parse(req.params.id), limit);
  res.json({ ok: true });
}));
directChatRouter.post("/conversations/:id/messages", ah(async (req, res) => {
  const { body } = z.object({ body: z.string().trim().min(1).max(config.maxMessageLength) }).parse(req.body);
  await rateLimit("message", me(req).id);
  res.status(201).json({ message: await direct.sendDirectMessage(me(req).id, uuidSchema.parse(req.params.id), body) });
}));
directChatRouter.post("/conversations/:id/read", ah(async (req, res) => {
  const { messageId } = z.object({ messageId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).parse(req.body);
  await direct.readDirectChat(me(req).id, uuidSchema.parse(req.params.id), messageId);
  res.json({ ok: true });
}));
