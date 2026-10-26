---
name: Private media storage
description: Storage choice and access rule for user-uploaded LIMEN photos.
---

Production photos use Replit App Storage, while the application continues to authorize every media read before loading object bytes. Do not expose public object URLs or bypass the authenticated media route.

**Why:** Gallery photos can be private or shared only with currently authorized guests, and publication must not turn storage persistence into public access.

**How to apply:** Keep object storage private; route media reads through the existing permission checks before returning bytes.
