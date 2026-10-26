---
name: Profile editor exit
description: Exit and cancel policy for optional profile content versus existing immediate saves.
---

Optional profile content must not trap a user in editing. Back and cancel
must work even without an open conversation, with empty fields, or after a
failed save. They must never delete previously saved content.

**Why:** The owner reported being stuck in the profile-completion screen and
explicitly required exit without filling every optional field, while keeping
authentication and security requirements unchanged.

**How to apply:** Provide a home fallback when there is no open conversation;
do not rely solely on browser history. Preserve the established immediate
saves for palette selection and explicit add/delete/visibility actions.
Clearly distinguish these from unsaved text drafts. Making cancel undo
already-persisted actions would be a separate behavior change requiring the
owner's approval.
