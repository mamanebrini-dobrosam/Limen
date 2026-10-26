---
name: QR validation coverage
description: Why scanner checks must include full application QR payloads, not only short fixtures.
---

Do not judge QR reliability from one short fixture. Verify complete application-generated QR URLs with different payload lengths and patterns, through both image and camera-frame decoding.

**Why:** A short QR fixture passed while a valid application-generated URL repeatedly produced `NotFoundException` in the initial decoder, even after adding a white border and resizing. An independent decoder read the identical image successfully. A functioning camera/permission flow is not evidence that all QR patterns decode.

**How to apply:** Keep independent-decoder coverage when changing scanning libraries, and retain the full guest journey in addition to isolated scanner tests. Browser-emulated media streams do not count as physical Android/iPhone camera verification.
