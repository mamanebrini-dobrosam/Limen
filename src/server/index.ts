import { config } from "./config.js";
import { createServer } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { startSweeper } from "./services/sessions.js";
import { cleanupRateLimits } from "./lib/infra.js";
import { startDirectCleanup } from "./services/direct-chat.js";

// Replit applies the development schema to its managed database when publishing.
if (!config.isProd) await runMigrations();
const { server } = createServer();
startSweeper();
startDirectCleanup();
setInterval(() => { cleanupRateLimits().catch(() => {}); }, 3600_000);
server.listen(config.port, "0.0.0.0", () => {
  console.log(`LIMEN server radi na portu ${config.port} (${config.env})`);
});
