import type { Request, Response, NextFunction } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/client.js";
import { randomToken, sha256, unauthorized, forbidden } from "./core.js";

export const SESSION_COOKIE = "limen_sid";

export type AuthUser = typeof schema.users.$inferSelect;

declare module "express-serve-static-core" {
  interface Request { user?: AuthUser; sessionTokenHash?: string }
}

export async function createSession(userId: string, userAgent?: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86400_000);
  await db.insert(schema.authSessions).values({ tokenHash: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  return { token, expiresAt };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, expires: expiresAt, path: "/",
  });
}

export async function userFromToken(token: string | undefined): Promise<{ user: AuthUser; tokenHash: string } | null> {
  if (!token) return null;
  const tokenHash = sha256(token);
  const rows = await db.select({ user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(and(eq(schema.authSessions.tokenHash, tokenHash), isNull(schema.authSessions.revokedAt), gt(schema.authSessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ? { user: rows[0].user, tokenHash } : null;
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const r = await userFromToken(req.cookies?.[SESSION_COOKIE]);
    if (r) { req.user = r.user; req.sessionTokenHash = r.tokenHash; }
    next();
  } catch (e) { next(e); }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Društvene funkcije traže potvrđen email. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.emailVerifiedAt) return next(forbidden("Potvrdi email adresu da nastaviš."));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden());
  next();
}

/** CSRF zaštita: svaki zahtjev koji mijenja stanje mora imati zaglavlje koje drugi sajt ne može poslati bez CORS dozvole. */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-limen") !== "1") return res.status(403).json({ error: "csrf", message: "Neispravan zahtjev." });
  next();
}

export const me = (req: Request) => req.user as AuthUser;
