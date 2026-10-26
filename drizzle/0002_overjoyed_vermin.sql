CREATE TABLE "visitor_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"linked_user_id" uuid,
	"room_offer_session_id" uuid,
	"guest_limit" integer DEFAULT 2,
	"guest_streak" integer DEFAULT 0 NOT NULL,
	"owner_read_id" bigint DEFAULT 0 NOT NULL,
	"guest_read_id" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	CONSTRAINT "visitor_chats_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "visitor_chats_limit_ck" CHECK (("visitor_chats"."guest_limit" is null or "visitor_chats"."guest_limit" between 1 and 1000) and "visitor_chats"."guest_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "visitor_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD COLUMN "guest_limit" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD COLUMN "guest_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "visitor_chats" ADD CONSTRAINT "visitor_chats_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_chats" ADD CONSTRAINT "visitor_chats_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_chats" ADD CONSTRAINT "visitor_chats_room_offer_session_id_room_sessions_id_fk" FOREIGN KEY ("room_offer_session_id") REFERENCES "public"."room_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_messages" ADD CONSTRAINT "visitor_messages_chat_id_visitor_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."visitor_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_chats_owner_idx" ON "visitor_chats" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "visitor_chats_expiry_idx" ON "visitor_chats" USING btree (coalesce("last_message_at", "approved_at", "created_at"));--> statement-breakpoint
CREATE INDEX "visitor_messages_chat_idx" ON "visitor_messages" USING btree ("chat_id","id");--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_owner_ck" CHECK ("direct_conversations"."owner_id" in ("direct_conversations"."user_a", "direct_conversations"."user_b"));--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_limit_ck" CHECK (("direct_conversations"."guest_limit" is null or "direct_conversations"."guest_limit" between 1 and 1000) and "direct_conversations"."guest_streak" >= 0);