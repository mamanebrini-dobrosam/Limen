import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/limen_test?host=/tmp",
      HOST_GRACE_MS: "600",
      GUEST_GRACE_MS: "600",
      SWEEP_INTERVAL_MS: "50",
      INVITE_MISSED_AFTER_MS: "300",
      RATE_LIMITS_ENABLED: "false",
      STORAGE_DIR: "storage-test",
      ADMIN_EMAILS: "admin@test.local",
    },
  },
});
