---
name: Real email ownership
description: Owner's requirement for testing real accounts without bypassing email ownership.
---

Real LIMEN accounts must prove ownership through mail received in the actual
mailbox, including when the owner is testing in Preview. Never use a manual
verified flag or a captured test-mail link to unblock a real account.

**Why:** The owner explicitly prohibited marking their address verified
without actual proof of ownership and requested preservation of their
existing account. Earlier development mail storage falsely appeared to the
owner to mean that a real email had been sent.

**How to apply:** Finish real SMTP setup and have the owner request a fresh
confirmation from the existing account. Keep simulated mail confined to
isolated synthetic tests. Do not restore a publicly readable mail outbox in
normal Preview as a convenient way to test, and never print confirmation
links or mail contents into chat or logs.

All automated test entrypoints must explicitly blank SMTP settings before
importing the application; `NODE_ENV=test` alone is not mail isolation.

**Why:** Once real Brevo Secrets were added, unit tests inherited them and
attempted real SMTP delivery to synthetic addresses instead of using test
mail. A test database alone does not isolate external side effects.

**How to apply:** Keep both unit and browser runners disconnected from real
SMTP credentials. Apply the same isolation to any new test runner or one-off
fixture script, without changing the real application's Secrets.
