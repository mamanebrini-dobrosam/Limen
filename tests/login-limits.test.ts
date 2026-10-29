import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { config } from "../src/server/config.js";
import { newUser, startTestServer, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await ctx.close(); });

// Sintetičke adrese iz dokumentacijskog opsega (RFC 5737), ne stvarni korisnici.
const NET_A = "192.0.2.10";
const NET_B = "198.51.100.20";

function login(ip: string, email: string, password: string) {
  return request(ctx.base).post("/api/auth/login").set("x-limen", "1").set("x-forwarded-for", ip).send({ email, password });
}

async function withLimits<T>(fn: () => Promise<T>) {
  const old = config.rateLimitsEnabled;
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
  config.rateLimitsEnabled = true;
  try { return await fn(); } finally { config.rateLimitsEnabled = old; clock.mockRestore(); }
}

const PASS = "dugacka-lozinka-123";

describe("Limiti prijave", () => {
  it("uspješne prijave se ne broje kao neuspjesi", async () => {
    const u = await newUser(ctx);
    await withLimits(async () => {
      for (let i = 0; i < 12; i++) expect((await login(NET_A, u.email, PASS)).status).toBe(200);
    });
  });

  it("5 pogrešnih lozinki blokira taj nalog s te mreže, ali ne drugi nalog s iste mreže", async () => {
    const a = await newUser(ctx);
    const b = await newUser(ctx);
    await withLimits(async () => {
      for (let i = 0; i < 5; i++) expect((await login(NET_A, a.email, "pogresna-lozinka")).status).toBe(401);
      const blocked = await login(NET_A, a.email, PASS);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      // Drugi korisnik na istom Wi-Fi-ju / iza istog proxyja nije pogođen.
      expect((await login(NET_A, b.email, PASS)).status).toBe(200);
      // Isti nalog s druge mreže i dalje može.
      expect((await login(NET_B, a.email, PASS)).status).toBe(200);
    });
  });

  it("uspješna prijava poništava brojač neuspjeha", async () => {
    const u = await newUser(ctx);
    await withLimits(async () => {
      for (let i = 0; i < 4; i++) expect((await login(NET_A, u.email, "pogresna-lozinka")).status).toBe(401);
      expect((await login(NET_A, u.email, PASS)).status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await login(NET_A, u.email, "pogresna-lozinka")).status).toBe(401);
      expect((await login(NET_A, u.email, PASS)).status).toBe(200);
    });
  });

  it("nepostojeći nalog dobija isti odgovor kao postojeći (ne otkriva se postojanje)", async () => {
    const u = await newUser(ctx);
    const ghost = `nepostoji-${Date.now()}@test.local`;
    await withLimits(async () => {
      const real: number[] = []; const fake: number[] = [];
      for (let i = 0; i < 6; i++) {
        real.push((await login(NET_B, u.email, "pogresna-lozinka")).status);
        fake.push((await login(NET_B, ghost, "pogresna-lozinka")).status);
      }
      expect(fake).toEqual(real);
      expect(real).toEqual([401, 401, 401, 401, 401, 429]);
    });
  });

  it("nalog ima i ukupni limit neuspjeha preko svih mreža", async () => {
    const u = await newUser(ctx);
    const old = config.limits.loginFailAccount;
    config.limits.loginFailAccount = [6, 3600];
    try {
      await withLimits(async () => {
        for (let i = 0; i < 6; i++) expect((await login(`203.0.113.${i + 1}`, u.email, "pogresna-lozinka")).status).toBe(401);
        expect((await login("203.0.113.99", u.email, PASS)).status).toBe(429);
      });
    } finally { config.limits.loginFailAccount = old; }
  });

  it("previše zahtjeva s jedne adrese se zaustavlja", async () => {
    const u = await newUser(ctx);
    const old = config.limits.loginIp;
    config.limits.loginIp = [3, 900];
    try {
      await withLimits(async () => {
        for (let i = 0; i < 3; i++) expect((await login("203.0.113.200", u.email, PASS)).status).toBe(200);
        expect((await login("203.0.113.200", u.email, PASS)).status).toBe(429);
      });
    } finally { config.limits.loginIp = old; }
  });
});
