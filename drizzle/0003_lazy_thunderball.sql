ALTER TABLE "visitor_chats" ADD COLUMN "recovery_hash" text;--> statement-breakpoint
ALTER TABLE "visitor_chats" ADD CONSTRAINT "visitor_chats_recovery_hash_unique" UNIQUE("recovery_hash");