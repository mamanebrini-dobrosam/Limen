import fs from "node:fs/promises";
import { config } from "../src/server/config.js";
import { startTestServer } from "./helpers.js";
import { startDirectCleanup } from "../src/server/services/direct-chat.js";

// This resets ONLY the explicitly selected disposable test database.
if (process.env.NODE_ENV !== "test" || !new URL(config.databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Refusing to start browser fixtures outside the test database.");
}
await fs.rm("/tmp/limen-visitor-isolated-fixtures.json", { force: true });
const ctx = await startTestServer();
config.appUrl = ctx.base;
config.rateLimitsEnabled = true;
startDirectCleanup();
console.log(`LIMEN_BROWSER_READY ${ctx.base}`);
process.on("SIGTERM", () => { void ctx.close().finally(() => process.exit(0)); });
