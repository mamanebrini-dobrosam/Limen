import { spawn, spawnSync } from "node:child_process";

if (process.env.NODE_ENV === "production") throw new Error("Browser fixtures cannot run in production.");
const original = new URL(process.env.DATABASE_URL);
const target = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) target.pathname = "/limen_test";
if (!target.pathname.endsWith("_test") || target.host === original.host && target.pathname === original.pathname) {
  throw new Error("Browser fixtures require a separate disposable _test database, never the application database.");
}
const env = {
  ...process.env, NODE_ENV: "test", DATABASE_URL: target.toString(),
  RATE_LIMITS_ENABLED: "true", APP_URL: "http://127.0.0.1:5001",
  // Tests must never use or send through a real SMTP account.
  SMTP_URL: "", SMTP_HOST: "", SMTP_PORT: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "",
};
const server = spawn(process.execPath, ["--import", "tsx", "tests/browser-server.ts"], { env, stdio: ["ignore", "pipe", "inherit"] });
let timer;
try {
  const base = await new Promise((resolve, reject) => {
    let output = "";
    timer = setTimeout(() => reject(new Error("Isolated browser server did not become ready.")), 30000);
    server.stdout.on("data", (data) => {
      output += data.toString();
      const match = output.match(/LIMEN_BROWSER_READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    server.once("error", reject);
    server.once("exit", () => reject(new Error("Isolated browser server exited before readiness.")));
  });
  clearTimeout(timer);
  for (const file of ["tests/browser-scanner.mjs", "tests/browser-visitor.mjs"]) {
    const result = spawnSync(process.execPath, [file], {
      env: { ...env, LIMEN_BROWSER_BASE_URL: base }, stdio: "inherit", timeout: 180000,
    });
    if (result.status !== 0) throw new Error(`Browser check failed: ${file}`);
  }
} finally {
  clearTimeout(timer);
  server.kill("SIGTERM");
}
