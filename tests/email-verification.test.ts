import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema as s } from "../src/server/db/client.js";
import { config } from "../src/server/config.js";
import { sendMail } from "../src/server/lib/infra.js";
import { productionMailErrors } from "../src/server/lib/mail-settings.js";
import { Client, latestToken, newUser, startTestServer, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

describe("Verifikacijski linkovi", () => {
  it("nevažeći i istekli link ne potvrđuju korisnika; novi link radi samo jednom", async () => {
    const c = await newUser(ctx, { verify: false });
    const expiredToken = await latestToken(c, "potvrda");
    await db.update(s.emailTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(s.emailTokens.userId, c.id));
    expect((await c.post("/api/auth/verify-email", { token: "invalid-verification-token" })).status).toBe(400);
    expect((await c.post("/api/auth/verify-email", { token: expiredToken })).status).toBe(400);
    expect((await c.get("/api/me")).body.user.emailVerified).toBe(false);
    expect((await c.post("/api/auth/resend-verification")).status).toBe(200);
    const token = await latestToken(c, "potvrda");
    expect(token).not.toBe(expiredToken);
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(200);
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(400);
    expect((await c.get("/api/me")).body.user.emailVerified).toBe(true);
  });

  it("paralelna upotreba istog linka uspijeva samo jednom", async () => {
    const c = await newUser(ctx, { verify: false });
    const token = await latestToken(c, "potvrda");
    const attempts = await Promise.all([c.post("/api/auth/verify-email", { token }), c.post("/api/auth/verify-email", { token })]);
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("link za reset lozinke nije potvrda emaila", async () => {
    const c = await newUser(ctx, { verify: false });
    await c.post("/api/auth/forgot-password", { email: c.email });
    const token = await latestToken(c, "nova-lozinka");
    expect((await c.post("/api/auth/verify-email", { token })).status).toBe(400);
    expect((await c.get("/api/me")).body.user.emailVerified).toBe(false);
  });
});

describe("Produkcijski email nema razvojni fallback", () => {
  it("traži SMTP, stvarnog pošiljaoca i javni HTTPS URL, bez ispisa vrijednosti", () => {
    expect(productionMailErrors({ isProd: true, smtpUrl: "", mailFrom: "LIMEN <no-reply@limen.local>", appUrl: "http://localhost:5000" }))
      .toEqual(["SMTP_URL", "MAIL_FROM", "APP_URL"]);
    const valid = { isProd: true, smtpUrl: "smtps://user:synthetic-password@smtp.mail.example:465", mailFrom: "LIMEN <no-reply@limen.example>", appUrl: "https://limen.example" };
    expect(productionMailErrors(valid)).toEqual([]);
    expect(productionMailErrors({ ...valid, appUrl: "https://project.replit.dev" })).toEqual(["APP_URL"]);
    expect(productionMailErrors({ ...valid, appUrl: "https://localhost" })).toEqual(["APP_URL"]);
    expect(productionMailErrors({ ...valid, smtpUrl: "https://smtp.example" })).toEqual(["SMTP_URL"]);
    expect(productionMailErrors({ isProd: false, smtpUrl: "", mailFrom: "", appUrl: "" })).toEqual([]);
  });

  it("produkcija skriva dev sandučić i odbija email umjesto izlaganja linka ili kreiranja naloga", async () => {
    const existing = await newUser(ctx);
    const saved = { isProd: config.isProd, smtpUrl: config.smtpUrl, mailFrom: config.mailFrom, appUrl: config.appUrl };
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const before = (await db.select().from(s.devOutbox)).length;
    try {
      Object.assign(config, { isProd: true, smtpUrl: "", mailFrom: "", appUrl: "" });
      const c = new Client(ctx);
      expect((await c.get("/api/dev/outbox")).status).toBe(404);
      const email = "missing-mail-config@test.local";
      expect((await c.post("/api/auth/register", { email, password: "dugacka-lozinka-123", displayName: "SMTP test", birthDate: "1990-01-01", confirmAdult: true })).status).toBe(503);
      expect((await db.select().from(s.users).where(eq(s.users.email, email)))).toHaveLength(0);
      for (const address of [existing.email, "nonexistent@test.local"]) {
        expect((await c.post("/api/auth/forgot-password", { email: address })).status).toBe(503);
      }
      await expect(sendMail("fixture@test.local", "subject", "private-verification-link")).rejects.toMatchObject({ status: 503 });
      expect((await db.select().from(s.devOutbox)).length).toBe(before);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      Object.assign(config, saved);
      for (const log of logs) log.mockRestore();
    }
  });
});
