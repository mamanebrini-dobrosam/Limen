import crypto from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";

// ---------- Greške ----------
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const bad = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = () => new HttpError(401, "unauthorized", "Prijavi se da nastaviš.");
export const forbidden = (msg = "Nemaš dozvolu za ovu radnju.") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "Nije pronađeno.") => new HttpError(404, "not_found", msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    if (err.extra?.retryAfter) res.setHeader("Retry-After", String(err.extra.retryAfter));
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "validation", message: "Neispravni podaci.", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) });
  }
  const e = err as { type?: string; code?: string };
  if (e?.type === "entity.too.large") return res.status(413).json({ error: "too_large", message: "Zahtjev je prevelik." });
  if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "too_large", message: "Fotografija je prevelika (najviše 10 MB)." });
  console.error(err);
  res.status(500).json({ error: "server", message: "Došlo je do greške na serveru." });
}

export const ah = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

// ---------- Kriptografija ----------
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// ---------- Validacija ----------
export const uuidSchema = z.string().uuid();
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export function ageOn(birthDate: string, now = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  if (md < m * 100 + d) age--;
  return age;
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Postgres unique violation */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = (e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } });
  const c = err?.code === "23505" ? err : err?.cause?.code === "23505" ? err.cause : null;
  if (!c) return false;
  return constraint ? c.constraint === constraint : true;
}
