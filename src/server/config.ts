// Centralna konfiguracija. Sve vrijednosti dolaze iz okruženja (.env), uz sigurne podrazumijevane vrijednosti za razvoj.

const env = process.env;

function int(name: string, def: number): number {
  const v = env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Neispravna vrijednost za ${name}`);
  return n;
}

export const config = {
  env: env.NODE_ENV ?? "development",
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: int("PORT", 5000),
  databaseUrl: env.DATABASE_URL ?? "postgres://postgres@localhost:5432/limen?host=/tmp",
  appUrl: env.APP_URL ?? "http://localhost:5173",
  storageDir: env.STORAGE_DIR ?? "storage",
  adminEmails: (env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  smtpUrl: env.SMTP_URL ?? "",
  mailFrom: env.MAIL_FROM ?? "LIMEN <no-reply@limen.local>",

  sessionTtlDays: int("SESSION_TTL_DAYS", 30),
  contactTtlDays: int("CONTACT_TTL_DAYS", 90),
  // Pravilo od 30 sekundi (u testovima se skraćuje)
  hostGraceMs: int("HOST_GRACE_MS", 30_000),
  guestGraceMs: int("GUEST_GRACE_MS", 30_000),
  // Poziv na koji nije odgovoreno postaje "propušten poziv"
  inviteMissedAfterMs: int("INVITE_MISSED_AFTER_MS", 120_000),
  sweepIntervalMs: int("SWEEP_INTERVAL_MS", 1000),
  pingIntervalMs: int("WS_PING_INTERVAL_MS", 4000),
  pingTimeoutMs: int("WS_PING_TIMEOUT_MS", 4000),

  maxImageBytes: int("MAX_IMAGE_BYTES", 10 * 1024 * 1024),
  maxMessageLength: int("MAX_MESSAGE_LENGTH", 4000),
  guestSeats: 5,

  // Rate limiting: [broj zahtjeva, prozor u sekundama]
  rateLimitsEnabled: env.RATE_LIMITS_ENABLED !== "false",
  limits: {
    login: [int("RL_LOGIN", 5), 15 * 60],
    register: [int("RL_REGISTER", 3), 60 * 60],
    contactRequest: [int("RL_CONTACT_REQUEST", 20), 24 * 60 * 60],
    invite: [int("RL_INVITE", 30), 60 * 60],
    message: [int("RL_MESSAGE", 30), 60],
    upload: [int("RL_UPLOAD", 10), 60],
    report: [int("RL_REPORT", 10), 24 * 60 * 60],
    passwordReset: [int("RL_PASSWORD_RESET", 5), 60 * 60],
  } as Record<string, [number, number]>,
};
