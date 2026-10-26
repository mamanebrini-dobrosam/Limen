import nodemailer from "nodemailer";
import { sql } from "drizzle-orm";
import type { Server } from "socket.io";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { HttpError } from "./core.js";
import { productionMailErrors } from "./mail-settings.js";

// ---------- Rate limiting (fiksni prozor, atomski brojač u PostgreSQL-u) ----------
export async function rateLimit(bucket: keyof typeof config.limits | string, subject: string) {
  if (!config.rateLimitsEnabled) return;
  const lim = config.limits[bucket];
  if (!lim) throw new Error(`Nepoznat limit: ${bucket}`);
  const [max, windowSec] = lim;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - (nowSec % windowSec);
  const key = `${bucket}:${subject}`;
  const r = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, to_timestamp(${windowStartSec}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(r.rows[0].count);
  if (count > max) {
    const retryAfter = windowStartSec + windowSec - nowSec;
    throw new HttpError(429, "rate_limited", "Previše pokušaja. Pokušaj ponovo kasnije.", { retryAfter });
  }
}

export async function cleanupRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '2 days'`);
}

// ---------- Email ----------
const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

export function ensureMailAvailable() {
  if (productionMailErrors(config).length) {
    throw new HttpError(503, "email_unavailable", "Slanje emaila trenutno nije dostupno. Pokušaj kasnije.");
  }
}

export async function sendMail(to: string, subject: string, body: string) {
  ensureMailAvailable();
  if (transport) {
    try { await transport.sendMail({ from: config.mailFrom, to, subject, text: body }); }
    catch {
      // Never log credentials, recipient data or verification/reset links on failure.
      console.error("Email delivery failed.");
      throw new HttpError(503, "email_unavailable", "Email nije poslan. Pokušaj kasnije.");
    }
    return;
  }
  // Development-only outbox. Do not print token-bearing mail into server logs.
  if (!config.isProd) {
    await db.insert(schema.devOutbox).values({ to, subject, body });
    if (!config.isTest) console.log("[DEV EMAIL] Poruka je sačuvana u razvojnom sandučiću.");
    return;
  }
  // Production must never fall back to development outbox or token-bearing logs.
  throw new HttpError(503, "email_unavailable", "Slanje emaila trenutno nije dostupno.");
}

// ---------- Realtime hub ----------
let io: Server | null = null;
export const hub = {
  attach(server: Server) { io = server; },
  toUser(userId: string, event: string, data: unknown) { io?.to(`user:${userId}`).emit(event, data); },
  toUsers(userIds: string[], event: string, data: unknown) {
    if (!io || userIds.length === 0) return;
    io.to(userIds.map((u) => `user:${u}`)).emit(event, data);
  },
  async disconnectUserFromSession(userId: string, sessionId: string) {
    if (!io) return;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const s of sockets) s.leave(`session:${sessionId}`);
  },
  async countHostSockets(sessionId: string): Promise<number> {
    if (!io) return 0;
    return (await io.in(`host:${sessionId}`).fetchSockets()).length;
  },
  async countUserSessionSockets(userId: string, sessionId: string): Promise<number> {
    if (!io) return 0;
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    return sockets.filter((s) => s.rooms.has(`session:${sessionId}`)).length;
  },
  async logoutUser(userId: string) {
    if (!io) return;
    io.in(`user:${userId}`).disconnectSockets(true);
  },
};

// ---------- Obavijesti (samo unutar aplikacije) ----------
export async function notify(userId: string, type: string, payload: Record<string, unknown> = {}) {
  const [n] = await db.insert(schema.notifications).values({ userId, type, payload }).returning();
  hub.toUser(userId, "notification", n);
  return n;
}
