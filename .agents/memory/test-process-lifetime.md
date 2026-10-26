---
name: Test process lifetime
description: Keeping isolated test services alive across shell tool calls.
---

A daemon detached from a foreground shell command can be terminated when that
tool call ends, even when its startup reported success.

**Why:** An isolated PostgreSQL test server started successfully but vanished
before the next test command, producing misleading connection failures.

**How to apply:** Run long-lived test dependencies through a managed background
shell task or an appropriate existing workflow. Check readiness before testing
and stop the temporary service when finished. Do not mistake this lifecycle
behavior for an application/database schema failure.
