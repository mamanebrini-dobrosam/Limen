import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, boolean, integer, date, jsonb,
  primaryKey, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------- Nalozi ----------
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  birthDate: date("birth_date", { mode: "string" }).notNull(),
  adultConfirmedAt: ts("adult_confirmed_at").notNull(),
  emailVerifiedAt: ts("email_verified_at"),
  // Stabilni, nepredvidivi identifikator iz QR koda. Nije lozinka ni pristup sobi.
  qrId: text("qr_id").notNull().unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: createdAt(),
});

export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  userAgent: text("user_agent"),
}, (t) => [index("auth_sessions_user_idx").on(t.userId)]);

export const emailTokens = pgTable("email_tokens", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose", { enum: ["verify", "reset"] }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

// ---------- Kontakti i blokade ----------
// Par je uvijek spremljen s user_a < user_b.
export const contacts = pgTable("contacts", {
  id: id(),
  userA: uuid("user_a").notNull().references(() => users.id, { onDelete: "cascade" }),
  userB: uuid("user_b").notNull().references(() => users.id, { onDelete: "cascade" }),
  requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull(),
  requestedAt: ts("requested_at").notNull().defaultNow(),
  acceptedAt: ts("accepted_at"),
  // Posljednja zajednička aktivnost (poziv u sobu ili sjedenje za stolom). Rok = +90 dana.
  lastActivityAt: ts("last_activity_at"),
}, (t) => [
  uniqueIndex("contacts_pair_uq").on(t.userA, t.userB),
  check("contacts_order_ck", sql`${t.userA} < ${t.userB}`),
]);

export const blocks = pgTable("blocks", {
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

// ---------- Soba, sesije, razgovori ----------
export const rooms = pgTable("rooms", {
  id: id(),
  ownerId: uuid("owner_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("orah"),
  createdAt: createdAt(),
});

export const conversations = pgTable("conversations", {
  id: id(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const roomSessions = pgTable("room_sessions", {
  id: id(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  hostId: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  openedAt: ts("opened_at").notNull().defaultNow(),
  closedAt: ts("closed_at"),
  closeReason: text("close_reason"),
  // Trajno zapisan rok: domaćin je izgubio vezu i čeka se povratak.
  hostDisconnectDeadline: ts("host_disconnect_deadline"),
}, (t) => [
  uniqueIndex("room_sessions_one_open_uq").on(t.roomId).where(sql`${t.closedAt} is null`),
  index("room_sessions_deadline_idx").on(t.hostDisconnectDeadline),
]);

export const invitations = pgTable("invitations", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  inviteeId: uuid("invitee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // pending → missed (bez odgovora) → (zahtjev za ulazak) ; revoked = povučen / gost uklonjen ; declined ; expired = sesija zatvorena
  status: text("status", { enum: ["pending", "missed", "declined", "revoked", "expired"] }).notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("invitations_session_invitee_uq").on(t.sessionId, t.inviteeId)]);

export const entryRequests = pgTable("entry_requests", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitationId: uuid("invitation_id").notNull().references(() => invitations.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "approved", "rejected", "expired", "cancelled"] }).notNull().default("pending"),
  createdAt: createdAt(),
  decidedAt: ts("decided_at"),
}, (t) => [
  uniqueIndex("entry_requests_one_pending_uq").on(t.sessionId, t.userId).where(sql`${t.status} = 'pending'`),
]);

// Jedno sjedenje za stolom = jedan interval prava čitanja poruka.
// Baza garantuje: najviše jedno otvoreno mjesto po korisniku i jedinstven broj mjesta 1–5 po sesiji.
export const seatIntervals = pgTable("seat_intervals", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  seatNo: integer("seat_no").notNull(),
  placedAbsent: boolean("placed_absent").notNull().default(false),
  startedAt: ts("started_at").notNull().defaultNow(),
  endedAt: ts("ended_at"),
  endReason: text("end_reason"),
  connectedAt: ts("connected_at"),
  disconnectDeadline: ts("disconnect_deadline"),
}, (t) => [
  uniqueIndex("seat_one_open_per_user_uq").on(t.userId).where(sql`${t.endedAt} is null`),
  uniqueIndex("seat_no_open_per_session_uq").on(t.sessionId, t.seatNo).where(sql`${t.endedAt} is null`),
  check("seat_no_range_ck", sql`${t.seatNo} between 1 and 5`),
  index("seat_conv_user_idx").on(t.conversationId, t.userId),
  index("seat_deadline_idx").on(t.disconnectDeadline),
]);

export const sessionParticipants = pgTable("session_participants", {
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatMuted: boolean("chat_muted").notNull().default(false),
  mutedAt: ts("muted_at"),
  mutedBy: uuid("muted_by").references(() => users.id, { onDelete: "set null" }),
  unmutedAt: ts("unmuted_at"),
}, (t) => [primaryKey({ columns: [t.sessionId, t.userId] })]);

// ---------- Mediji i poruke ----------
export const mediaAssets = pgTable("media_assets", {
  id: id(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  purpose: text("purpose", { enum: ["chat", "gallery"] }).notNull(),
  storageKey: text("storage_key").notNull().unique(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: createdAt(),
});

export const messages = pgTable("messages", {
  id: id(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").notNull().references(() => roomSessions.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  // Nakon brisanja naloga: nasumičan ID bez veze s obrisanim nalogom.
  anonymousAuthorId: uuid("anonymous_author_id"),
  kind: text("kind", { enum: ["text", "image"] }).notNull(),
  body: text("body"),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [index("messages_conv_created_idx").on(t.conversationId, t.createdAt)]);

// ---------- Sadržaj sobe ----------
export const roomSections = pgTable("room_sections", {
  id: id(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["about", "vision", "gallery", "custom"] }).notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

export const roomItems = pgTable("room_items", {
  id: id(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").notNull().references(() => roomSections.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["text", "quote", "image"] }).notNull(),
  text: text("text"),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "cascade" }),
  // Vidljivo SVIM gostima (isto za sve). Podrazumijevano privatno.
  sharedWithGuests: boolean("shared_with_guests").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: createdAt(),
});

// ---------- Obavijesti, prijave, administracija ----------
export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: createdAt(),
  readAt: ts("read_at"),
}, (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)]);

export const reports = pgTable("reports", {
  id: id(),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  sessionId: uuid("session_id").references(() => roomSessions.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "reviewed", "dismissed"] }).notNull().default("open"),
  createdAt: createdAt(),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: id(),
  adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  details: jsonb("details").notNull().default({}),
  createdAt: createdAt(),
});

// Zajedničko atomsko spremište brojača za rate limiting (radi i s više procesa).
export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

// Samo za razvoj/testove: emailovi koji bi bili poslani.
export const devOutbox = pgTable("dev_outbox", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
