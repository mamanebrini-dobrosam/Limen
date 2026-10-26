---
name: Express request type augmentation
description: Why workspace dependencies can require a global Express Request declaration.
---

When Express types are resolved from more than one dependency tree in this
workspace, a module-specific Request augmentation may attach to only one
copy. Use the global Express Request interface for shared request fields.

**Why:** An isolated frontend preview's dependencies introduced another type
resolution path, and the application typecheck stopped recognizing existing
request fields even though runtime behavior had not changed.

**How to apply:** If request fields disappear from TypeScript after dependency
installation, inspect type-resolution identities before changing auth logic.
Keep the fix type-only and preserve the underlying authorization checks.
