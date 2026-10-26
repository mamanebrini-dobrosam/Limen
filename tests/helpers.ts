import request from "supertest";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { sql } from "drizzle-orm";
import { createServer } from "../src/server/app.js";
import { runMigrations } from "../src/server/db/migrate.js";
import { db } from "../src/server/db/client.js";
import { startSweeper, stopSweeper } from "../src/server/services/sessions.js";

export type Ctx = { base: string; close: () => Promise<void> };

let counter = 0;

export async function startTestServer(): Promise<Ctx> {
  await runMigrations();
  await db.execute(sql`truncate users, rate_limits, dev_outbox, admin_audit_log cascade`);
  return listenTestServer(0);
}

async function listenTestServer(port: number): Promise<Ctx> {
  const { server, io } = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  startSweeper();
  const boundPort = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${boundPort}`,
    close: async () => { stopSweeper(); await io.close(); },
  };
}

export async function restartTestServer(ctx: Ctx): Promise<Ctx> {
  const port = Number(new URL(ctx.base).port);
  await ctx.close();
  return listenTestServer(port);
}

export class Client {
  agent: ReturnType<typeof request.agent>;
  id = ""; qrId = ""; email = ""; name = "";
  sockets: Socket[] = [];
  constructor(public ctx: Ctx) { this.agent = request.agent(ctx.base); }

  get(url: string) { return this.agent.get(url); }
  post(url: string, body?: object) { return this.agent.post(url).set("x-limen", "1").send(body ?? {}); }
  patch(url: string, body?: object) { return this.agent.patch(url).set("x-limen", "1").send(body ?? {}); }
  del(url: string, body?: object) { return this.agent.delete(url).set("x-limen", "1").send(body ?? {}); }
  upload(url: string, buf: Buffer, fields: Record<string, string> = {}) {
    let r = this.agent.post(url).set("x-limen", "1");
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach("image", buf, "slika.jpg");
  }

  cookieHeader(): string {
    const jar = (this.agent as unknown as { jar: { getCookies: (o: object) => { name: string; value: string }[] } }).jar;
    const url = new URL(this.ctx.base);
    return jar.getCookies({ domain: url.hostname, path: "/", secure: false, script: false }).map((c) => `${c.name}=${c.value}`).join("; ");
  }

  async socket(): Promise<Socket> {
    const s = ioClient(this.ctx.base, { extraHeaders: { cookie: this.cookieHeader() }, transports: ["websocket"], forceNew: true, reconnection: false });
    await new Promise<void>((res, rej) => { s.on("connect", () => res()); s.on("connect_error", rej); });
    this.sockets.push(s);
    return s;
  }

  async join(sessionId: string, s?: Socket): Promise<{ ok: boolean; role?: string; error?: string }> {
    const sock = s ?? (await this.socket());
    return new Promise((res) => sock.emit("session:join", { sessionId }, res));
  }

  disconnectAll() { for (const s of this.sockets) s.disconnect(); this.sockets = []; }
}

export async function newUser(ctx: Ctx, opts: { verify?: boolean; email?: string; name?: string } = {}): Promise<Client> {
  const c = new Client(ctx);
  counter++;
  c.email = opts.email ?? `korisnik${counter}-${Date.now()}@test.local`;
  c.name = opts.name ?? `Korisnik ${counter}`;
  const r = await c.post("/api/auth/register", { email: c.email, password: "dugacka-lozinka-123", displayName: c.name, birthDate: "1990-05-05", confirmAdult: true });
  if (r.status !== 201) throw new Error(`register ${r.status} ${JSON.stringify(r.body)}`);
  c.id = r.body.user.id; c.qrId = r.body.user.qrId;
  if (opts.verify !== false) {
    const token = await latestToken(c, "potvrda");
    const v = await c.post("/api/auth/verify-email", { token });
    if (v.status !== 200) throw new Error("verify failed");
  }
  return c;
}

export async function latestToken(c: Client, kind: "potvrda" | "nova-lozinka") {
  const r = await c.get(`/api/dev/outbox?to=${encodeURIComponent(c.email)}`);
  const mail = r.body.emails.find((e: { body: string }) => e.body.includes(`/${kind}?token=`));
  return mail.body.match(/token=([A-Za-z0-9_-]+)/)[1] as string;
}

export async function connect(a: Client, b: Client) {
  const r1 = await a.post("/api/contacts/request", { qrId: b.qrId });
  if (r1.status !== 200) throw new Error("contact request failed");
  const reqs = await b.get("/api/contacts/requests");
  const req = reqs.body.requests.find((x: { userId: string }) => x.userId === a.id);
  const r2 = await b.post(`/api/contacts/requests/${req.id}/accept`);
  if (r2.status !== 200) throw new Error("accept failed");
}

export async function openRoom(host: Client, mode: "new" | "continue" = "new"): Promise<string> {
  const r = await host.post("/api/rooms/mine/open", { mode });
  if (r.status !== 200) throw new Error(`open ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.sessionId;
}

export async function invite(host: Client, sessionId: string, guest: Client) {
  const r = await host.post(`/api/sessions/${sessionId}/invitations`, { userId: guest.id });
  if (r.status !== 200) throw new Error(`invite ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.invitation.id as string;
}

/** Poziv → zahtjev za ulazak → odobrenje. */
export async function seat(host: Client, sessionId: string, guest: Client) {
  const invId = await invite(host, sessionId, guest);
  const r = await guest.post(`/api/invitations/${invId}/request-entry`);
  if (r.status !== 200) throw new Error(`request-entry ${r.status} ${JSON.stringify(r.body)}`);
  const list = await host.get(`/api/sessions/${sessionId}/invitations`);
  const er = list.body.entryRequests.find((x: { userId: string }) => x.userId === guest.id);
  const a = await host.post(`/api/entry-requests/${er.id}/approve`);
  if (a.status !== 200) throw new Error(`approve ${a.status} ${JSON.stringify(a.body)}`);
}

export async function say(c: Client, sessionId: string, body: string) {
  return c.post(`/api/sessions/${sessionId}/messages`, { body });
}

export async function readBodies(c: Client, conversationId: string): Promise<string[]> {
  const r = await c.get(`/api/conversations/${conversationId}/messages`);
  if (r.status !== 200) return [`HTTP ${r.status}`];
  return r.body.messages.map((m: { body: string }) => m.body);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn: () => Promise<boolean> | boolean, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await sleep(40);
  }
  throw new Error("waitFor: isteklo vrijeme");
}
