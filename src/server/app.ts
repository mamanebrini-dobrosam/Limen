import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Server } from "socket.io";
import { config } from "./config.js";
import { errorHandler } from "./lib/core.js";
import { hub } from "./lib/infra.js";
import { loadUser, csrfGuard, userFromToken, SESSION_COOKIE } from "./lib/auth.js";
import { authRouter, meRouter, devRouter } from "./routes/auth.js";
import { contactsRouter, blocksRouter } from "./routes/contacts.js";
import { roomsRouter } from "./routes/rooms.js";
import { chatRouter } from "./routes/chat.js";
import { contentRouter, reportsRouter, adminRouter } from "./routes/content.js";
import { directChatRouter } from "./routes/direct-chat.js";
import * as rules from "./services/rules.js";
import * as sessions from "./services/sessions.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameAncestors: config.isProd ? ["'none'"] : [
          "'self'", "https://replit.com", "https://*.replit.com", "https://*.replit.dev",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: config.isProd ? { action: "deny" } : false,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", csrfGuard, loadUser);

  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/direct", directChatRouter);
  app.use("/api/blocks", blocksRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/dev", devRouter);
  app.use("/api", roomsRouter, chatRouter, contentRouter);
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not_found", message: "Nije pronađeno." }); });

  // Produkcija: server poslužuje izgrađeni klijent.
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/client");
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }
  app.use(errorHandler);
  return app;
}

function parseCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function createServer() {
  const app = createApp();
  const server = http.createServer(app);
  // Kratak heartbeat: prekid veze (npr. nestanak interneta) server primijeti za najviše ~8 s,
  // pa pravilo od 30 sekundi počinje teći gotovo odmah nakon stvarnog prekida.
  const io = new Server(server, {
    pingInterval: config.pingIntervalMs, pingTimeout: config.pingTimeoutMs,
    cors: config.isProd ? undefined : { origin: config.appUrl, credentials: true },
  });
  hub.attach(io);

  io.use(async (socket, next) => {
    try {
      const r = await userFromToken(parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
      if (!r || !r.user.emailVerifiedAt) return next(new Error("unauthorized"));
      socket.data.userId = r.user.id;
      next();
    } catch (e) { next(e as Error); }
  });

  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);
    const joined = new Map<string, "host" | "guest">();

    socket.on("session:join", async (payload: { sessionId?: string }, ack?: (r: unknown) => void) => {
      try {
        const sessionId = String(payload?.sessionId ?? "");
        const { session, role } = await rules.roleInSession(userId, sessionId);
        if (!session || !role) return ack?.({ ok: false, error: "forbidden" });
        socket.join(`session:${sessionId}`);
        if (role === "host") {
          socket.join(`host:${sessionId}`);
          await sessions.hostConnected(sessionId);
        } else {
          await sessions.guestConnected(sessionId, userId);
        }
        joined.set(sessionId, role);
        ack?.({ ok: true, role, state: await sessions.sessionState(sessionId) });
      } catch (e) {
        console.error(e);
        ack?.({ ok: false, error: "server" });
      }
    });

    socket.on("disconnect", async () => {
      // Socket je već izašao iz svih soba, pa brojimo preostale veze istog korisnika.
      for (const [sessionId, role] of joined) {
        try {
          if (role === "host") {
            if ((await hub.countHostSockets(sessionId)) === 0) await sessions.hostDisconnected(sessionId);
          } else if ((await hub.countUserSessionSockets(userId, sessionId)) === 0) {
            await sessions.guestDisconnected(sessionId, userId);
          }
        } catch (e) { console.error(e); }
      }
    });
  });

  return { app, server, io };
}
