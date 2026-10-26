# Running LIMEN on Replit

This is the imported React/Vite + Express/Socket.IO + Drizzle/PostgreSQL app.
Keep its existing structure and npm stack.

## Run

- Runtime: Node.js 22.
- Click Run to start the `Start application` workflow (`npm run replit`).
- This builds the React client, applies the existing migrations to the development
  database, and serves the client and API together on port 5000.
- PostgreSQL is supplied through the managed `DATABASE_URL`; do not put its value
  in files or logs.
- In development, `APP_URL` defaults to the current Replit development domain.
  An explicit `APP_URL` overrides it.

## Accounts and email

The existing app uses its own email/password authentication; keep that in place.
Without `SMTP_URL`, email is not delivered. Verification and password-reset links
are available in the development server logs and at `/api/dev/outbox`.
No administrator account is created automatically. To grant admin access, set
`ADMIN_EMAILS` to the desired email address before registering that account.
Do not invent an admin email or SMTP credentials.

## Checks

- `npm run typecheck`
- `npm run build`
- Integration tests: `TEST_DATABASE_URL=<separate test database> npm test`.
  The suite truncates tables; never point it at an app database containing data.

## After task merges

Replit runs `scripts/post-merge.sh` automatically. It installs the locked npm
dependencies, applies migrations to the development database, and builds the
client. Workflow reconciliation then restarts the running application.
The hook is non-interactive and refuses to run with `NODE_ENV=production`.

## LIMEN Chat

- Private two-person conversations are separate from the existing room/table
  conversations. Contact approval and room admission do not grant private-chat
  access, and private-chat approval does not grant room access.
- The existing owner QR link opens an already approved, unexpired private chat
  or offers a manual access request. Reciprocal scans never auto-approve a chat.
- A verified account is required. Only the request recipient can approve or
  reject it. Pending duplicates reuse the same request; rejected pairs must
  wait 24 hours before requesting again. `RL_DIRECT_REQUEST` defaults to 10
  attempts per user per day, in addition to the existing message rate limit.
- Messages live in PostgreSQL, not browser memory. Realtime events carry IDs
  and notification metadata, not message text. Message contents are not
  end-to-end encrypted; access is controlled by authenticated server routes.
- Opening, reading, logging out and reconnecting do not extend retention.
  A message from either participant sets the 30-day deadline. A chat without
  its first message expires 30 days after approval.
- A server-side cleanup runs on startup and every minute. It deletes expired
  direct chats, their messages, associated approval requests and linked
  notifications. API access and lists enforce the deadline even between runs.
  Room/table histories are not affected by this cleanup.
- Account export includes accessible private-chat data. Account deletion
  cascades through private chats and their messages; blocking prevents both
  participants from reading or sending in the private chat.
- Apply the checked-in Drizzle migration to development with `npm run db:migrate`.
  Replit Publish applies the development schema to managed production; do not
  run migrations from the production entrypoint.

## Before publishing

- Set `APP_URL` to the confirmed published URL and configure real SMTP delivery
  (`SMTP_URL`, `MAIL_FROM`).
- Production photos use Replit App Storage. Development and tests use local
  `storage/`. Before the first production release with App Storage, run
  `npm run media:migrate-to-object-storage` where the existing `STORAGE_DIR`,
  configured database, and App Storage bucket are all accessible.
- The current single-process Socket.IO design and presence sweeper need a
  continuously running single server.
- Production does not run startup migrations. Replit's Publish flow applies the
  development database schema to the managed production database.
- Production keeps anti-framing protection; only development permits Replit's
  preview frame.
