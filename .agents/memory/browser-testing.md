---
name: Browser testing availability
description: Fallback when the documented testing subagent cannot be launched in this environment.
---

The documented testing-subagent configuration has returned `Unknown config kind: testing` in this environment. Do not treat that failure as evidence that browser testing is impossible.

**Why:** The user explicitly requires real browser verification, and screenshots or API-only checks do not cover guest-cookie persistence, message-limit controls and the separate room-admission UI.

**How to apply:** If the testing callback is still unsupported, use local Playwright with the environment's system Chromium. Keep the application's actual authentication and permission checks enabled, use separate browser contexts with synthetic accounts, and keep temporary browser output outside the repository.
