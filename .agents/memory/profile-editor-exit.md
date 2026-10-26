---
name: Profile editor saving and exit
description: Owner requires explicit confirmation of all profile/room drafts, with no autosave.
---

Optional profile content must not trap a user in editing. Back and cancel
must work even without an open conversation, with empty fields, or after a
failed save. They must never delete previously saved content.

**Why:** The owner reported being stuck in the profile-completion screen and
explicitly required exit without filling every optional field, while keeping
authentication and security requirements unchanged.

The owner subsequently explicitly replaced immediate-save behavior:
**Izađi / Odustani** discards all unsaved changes; **Sačuvaj i izađi**
confirms permitted changes and closes editing. Color, background, visibility,
other room settings, additions, photos and deletions must not persist before
confirmation. Show only the currently selected color initially, with the
twelve choices hidden behind **Promijeni boju**.

**Why:** The owner requested one clear confirmation rule instead of mixing
draft text with immediately persisted settings.

**How to apply:** Keep all editor changes local until explicit save, including
file selection. Leaving must not issue save requests. Preserve owner-only
server authorization and an exit from every nested menu; use a home fallback
without an open conversation rather than relying solely on browser history.
If confirmed saving is interrupted after successful requests, clearly report
partial success and preserve remaining draft operations without duplication;
do not describe the existing multi-request save as atomic.
