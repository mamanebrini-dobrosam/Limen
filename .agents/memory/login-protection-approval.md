---
name: Login protection approval
description: Separate the approved passive wait display from unapproved changes to authentication protection.
---

The owner approved displaying remaining lockout time, with no automatic login
attempts. They explicitly require additional approval before changing limits
or security rules, including how successful logins count and how different
users on one network share attempt counters.

**Why:** The owner wants to avoid unnecessarily blocking host and guest during
normal testing without silently weakening protection.

**How to apply:** Keep countdown work separate from server-side counting or
lockout-policy changes. A proposal to separate unsuccessful-login protection
from broader network flood protection is not permission to implement it.
Obtain explicit approval of the policy and concrete thresholds before changes.
