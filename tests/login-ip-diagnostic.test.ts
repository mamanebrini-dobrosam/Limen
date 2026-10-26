import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLoginIpDiagnostic } from "../src/server/lib/login-ip-diagnostic";

const request = {
  ip: "198.51.100.12",
  socket: { remoteAddress: "::ffff:127.0.0.1" },
  headers: { "x-forwarded-for": "198.51.100.12, 10.0.0.1" },
};

describe("Privremena zaštićena IP dijagnostika", () => {
  it("ne zapisuje ništa bez opt-in odobrenja ili izvan razvoja", () => {
    const entries: string[] = [];
    for (const environment of ["production", "test", "development"]) {
      createLoginIpDiagnostic({ environment, enabled: environment !== "development", write: (entry) => entries.push(entry) })(request);
    }
    expect(entries).toEqual([]);
  });

  it("bilježi samo dvije uspješne prijave i samo odobrena polja", () => {
    const entries: string[] = [];
    const log = createLoginIpDiagnostic({ environment: "development", enabled: true, write: (entry) => entries.push(entry) });
    log(request); log(request); log(request);
    expect(entries.map((entry) => JSON.parse(entry))).toEqual([1, 2].map((sample) => ({
      event: "limen.login-ip-diagnostic", sample,
      ip: "198.51.100.12", socketAddress: "::ffff:127.0.0.1",
      forwardedFor: ["198.51.100.12", "10.0.0.1"],
    })));
  });

  it("samostalno prestaje nakon 15 minuta bez novih zahtjeva", () => {
    let time = 100;
    const entries: string[] = [];
    const log = createLoginIpDiagnostic({ environment: "development", enabled: true, now: () => time, write: (entry) => entries.push(entry) });
    time += 15 * 60_000;
    log(request);
    expect(entries).toEqual([]);
  });

  it("ne prenosi emailove, tokene ili ubačene redove iz lažnog IP zaglavlja", () => {
    const entries: string[] = [];
    const log = createLoginIpDiagnostic({ environment: "development", enabled: true, write: (entry) => entries.push(entry) });
    log({ ip: "private@example.test", socket: { remoteAddress: "secret-token" },
      headers: { "x-forwarded-for": "private@example.test,\nsecret-token, 2001:db8::1" } });
    expect(JSON.parse(entries[0])).toMatchObject({
      ip: "[invalid]", socketAddress: "[invalid]",
      forwardedFor: ["[invalid]", "[invalid]", "2001:db8::1"],
    });
    expect(entries[0]).not.toMatch(/@|secret-token|\n/);
  });

  it("ograničava veličinu i broj proslijeđenih adresa", () => {
    const entries: string[] = [];
    const log = createLoginIpDiagnostic({ environment: "development", enabled: true, write: (entry) => entries.push(entry) });
    log({ ...request, headers: { "x-forwarded-for": Array(1000).fill("198.51.100.1").join(",") } });
    expect(JSON.parse(entries[0]).forwardedFor).toHaveLength(16);
    expect(entries[0].length).toBeLessThan(1024);
  });

  it("greška zapisivanja ne smije zaustaviti prijavu", () => {
    const log = createLoginIpDiagnostic({ environment: "development", enabled: true, write: () => { throw Error("unavailable"); } });
    expect(() => log(request)).not.toThrow();
  });

  it("poziv je tek iza limitera, provjere lozinke i kreiranja sesije", () => {
    const source = readFileSync("src/server/routes/auth.ts", "utf8");
    const login = source.split('authRouter.post("/login"')[1].split('authRouter.post("/logout"')[0];
    const position = login.indexOf("logSuccessfulLoginIp(req)");
    expect(position).toBeGreaterThan(login.indexOf('await rateLimit("login"'));
    expect(position).toBeGreaterThan(login.indexOf("await verify("));
    expect(position).toBeGreaterThan(login.indexOf("await createSession("));
    expect(position).toBeLessThan(login.indexOf("res.json("));
    expect(login.match(/logSuccessfulLoginIp\(req\)/g)).toHaveLength(1);
  });
});
