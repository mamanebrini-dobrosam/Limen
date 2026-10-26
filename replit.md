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
