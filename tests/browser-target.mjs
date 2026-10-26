// Never let automated fixtures target an arbitrary published application.
const value = process.env.LIMEN_BROWSER_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000");
const url = new URL(value);
const local = url.protocol === "http:" && url.hostname === "127.0.0.1";
const development = url.protocol === "https:" && url.hostname === process.env.REPLIT_DEV_DOMAIN;
if ((!local && !development) || url.username || url.password || url.pathname !== "/") {
  throw new Error("Browser tests accept only the local test server or this workspace's development domain.");
}
if (process.env.LIMEN_BROWSER_BASE_URL && (!local || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))) {
  throw new Error("Isolated browser tests require loopback and a dedicated _test database.");
}
export const browserBase = url.origin;
