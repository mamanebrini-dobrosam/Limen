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
- For registered-user chats a verified account is required. Only the request recipient can approve or
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

## Guests without profiles and room invitations

- `/skeniraj` is public: camera, uploaded QR image and a same-origin LIMEN QR
  link/code are supported. `/c/:qrId` allows a visitor to request a chat with
  a nickname without creating a user account.
- Guest identities are separate from registered users. Each owner/chat identity
  is authenticated by a random HttpOnly, SameSite cookie scoped to `/api/visitor`;
  only its SHA-256 hash is stored in the database. Neither a public QR nor a
  conversation ID is an access credential. Resume at `/gost-razgovori` with the
  same browser/cookies, or use a previously saved recovery key.
- Owners manually approve/reject visitor requests through Chat requests.
  Guests poll for decisions and replies, only while the page is visible.
  Pending/rejected requests cannot send messages.
- Guests (including registered QR requesters) default to two consecutive
  messages. An owner reply resets the counter. The owner can raise the per-chat
  limit or leave it unlimited; counters are enforced under database row locks.
  Existing protective request/message rate limits remain enabled for everyone.
- A small-chat room offer grants no room access. Before a visitor can receive
  a real invitation, they register, verify email, confirm their current password
  to link the guest identity, and obtain normal contact approval. The existing
  room invitation, entry request and host approval remain mandatory.
- Room permissions still end immediately on leave/removal/closure and do not
  affect the small chat. No room/table admission or sharing rules were replaced.
- Visitors have the same 30-day message inactivity retention; reading,
  approving room offers and changing limits do not extend the timer.
- Legacy registered chats resolve their owner from the original approved
  request when the newly added nullable owner field is unset. This avoids a
  mandatory-column backfill during publishing and preserves existing data.
- `node tests/browser-visitor.mjs` runs the development-only two-context browser
  journey with system Chromium and synthetic accounts. Never use it in production.
  Temporary fixtures and screenshots stay under `/tmp`, not in the repository.
  It checks QR-image decoding, anonymous approval, limits, profile creation,
  identity confirmation, separate room admission and revocation. Real-device
  camera hardware is not covered by this automated test.

## Guest recovery and final verification

- Approved guests can create/download a secret 256-bit recovery key in their
  chat. It is shown once, never placed in a URL, logged or returned in ordinary
  chat data/exports. Only its SHA-256 hash is stored. Creating another key
  invalidates the previous recovery key, not the current guest cookie.
- `/gost-oporavak` accepts the saved key, not a QR, nickname or chat ID.
  Recovery atomically rotates the guest cookie and recovery key; the old
  cookie and old recovery key immediately stop authorizing API access.
  Recovery is rate-limited and still enforces approval, blocking, expiry and
  the existing guest-message counter. It never grants registered-user or room
  access or extends retention.
- Losing both the cookie and saved key is intentionally not recoverable.
  This also applies to conversations lost before a key was created. A fresh
  QR request must receive fresh manual approval; do not introduce nickname-
  or QR-only recovery as a convenience workaround.
- Camera access requires HTTPS and a user action. Rear-camera preference,
  muted inline video, permission/missing/busy-camera messages, stream cleanup
  and QR-image fallback are implemented without changing access permissions.
  An independent decoder is available for image and camera frames.
- `node tests/browser-scanner.mjs` simulates Android/iPhone viewport and user
  agents in Chromium, including real synthetic MediaStreams and QR frames.
  It does not certify Safari/WebKit or physical mobile camera hardware.
- Email verification rejects invalid, expired, wrong-purpose and used links.
  Resending a link does not count as confirming email. Repeated React effects
  reuse the same in-flight verification request.
- Production requires valid `SMTP_URL`, `MAIL_FROM` and a public HTTPS `APP_URL`.
  Without them, mail-dependent operations fail explicitly with HTTP 503;
  registration does not create an unusable account. Production has no dev
  outbox fallback or token-bearing mail logs. The development outbox route
  returns 404 in production.
- On 2026-10-26, all 74 automated tests, TypeScript/build checks, the complete
  two-context visitor/room browser journey and mobile Chromium simulations
  passed. Browser-test accounts and temporary recovery downloads were removed.
  No public release was performed. Actual SMTP delivery and physical mobile
  camera operation remain unverified; configure mail and test real devices
  before requesting owner approval for any public release.

## Before publishing

- Set `APP_URL` to the confirmed published URL and configure real SMTP delivery
  (`SMTP_URL`, `MAIL_FROM`).
- Alternatively use the prepared split SMTP fields (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`) instead of `SMTP_URL`. Never use both forms.
  See [SMTP setup](docs/email-setup.md) for the Brevo Free option and secure
  configuration instructions; no provider account/subscription was activated.
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

## Central presentation settings and final preparation

- Presentation defaults live in `src/client/visual/settings.ts`. They retain the
  existing wordmark, favicon, palette, Inter typography and layout. See
  [visual settings](docs/visual-settings.md) for future logo/icon, palette,
  button/navigation, home and mobile/desktop changes. These settings cannot
  change authentication, guest approval, message limits, retention or token values.
- `npm run email:check` reports readiness without displaying values or sending
  email. Optional `-- --connect` checks only SMTP TLS/authentication; actual
  inbox delivery must be tested separately after owner-supplied credentials.
- `npm run test:browser` runs scanner and full visitor/room checks against a
  disposable `_test` database and loopback server, not existing user data.
  It preserves rate limits and disables external SMTP for test fixtures.
  Do not run concurrently with the unit suite using the same test database.
- Follow [real-device instructions](docs/mobile-testing.md) for Android Chrome
  and iPhone Safari. Chromium mobile simulations are not physical camera or
  Safari/WebKit certification.
- A Git code checkpoint tag named `limen-before-technical-prep-*` was created
  before this preparation. It is a code checkpoint, not a database backup.
  Do not delete user data or publish publicly without explicit owner approval.
