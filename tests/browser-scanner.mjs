// Browser simulation only, not proof of real Android/iPhone camera operation.
import assert from "node:assert/strict";
import { chromium, devices } from "playwright-core";
import QRCode from "qrcode";

const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
try {
  for (const device of ["Pixel 7", "iPhone 13"]) {
    const { viewport, userAgent, isMobile, hasTouch } = devices[device];
    const context = await browser.newContext({ viewport, userAgent, isMobile, hasTouch });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__cameraMode = "denied";
      window.__cameraStreams = [];
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async (constraints) => {
        window.__cameraConstraints = constraints;
        if (window.__cameraMode === "denied") throw new DOMException("Fixture permission denied", "NotAllowedError");
        if (window.__cameraMode === "missing") throw new DOMException("Fixture no camera", "NotFoundError");
        if (window.__cameraMode === "busy") throw new DOMException("Fixture busy camera", "NotReadableError");
        const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 300;
        canvas.getContext("2d").fillRect(0, 0, 400, 300);
        if (window.__cameraMode === "qr") {
          const image = new Image(); image.src = window.__cameraPng;
          await image.decode();
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext("2d").drawImage(image, 0, 0);
        }
        const stream = canvas.captureStream(5); window.__cameraStreams.push(stream);
        if (window.__cameraMode === "pending") return new Promise((resolve) => { window.__resolveCamera = () => resolve(stream); });
        return stream;
      } });
    });
    await page.goto(`${base}/skeniraj`);
    const camera = page.getByRole("button", { name: "Uključi kameru", exact: true });
    for (const [mode, message] of [["denied", "nije dozvoljen"], ["missing", "nije pronađena"], ["busy", "zauzeta"]]) {
      await page.evaluate((value) => { window.__cameraMode = value; }, mode);
      await camera.click();
      await page.getByRole("alert").filter({ hasText: message }).waitFor();
    }
    assert.ok(await page.locator("video").evaluate((v) => v.playsInline && v.muted && v.autoplay), "Inline muted playback for mobile browsers");
    await page.evaluate(() => { window.__cameraMode = "stream"; });
    await camera.click();
    await page.waitForFunction(() => document.querySelector("video")?.srcObject?.getTracks().some((t) => t.readyState === "live"));
    const requested = await page.evaluate(() => window.__cameraConstraints);
    assert.equal(requested.video.facingMode.ideal, "environment");
    await page.getByRole("button", { name: "Zaustavi kameru", exact: true }).click();
    await page.waitForFunction(() => window.__cameraStreams.every((s) => s.getTracks().every((t) => t.readyState === "ended")));
    await page.evaluate(() => { window.__cameraMode = "pending"; });
    await camera.click();
    await page.waitForFunction(() => !!window.__resolveCamera);
    await page.getByRole("button", { name: "Zaustavi kameru", exact: true }).click();
    await page.evaluate(() => window.__resolveCamera());
    await page.waitForFunction(() => window.__cameraStreams.every((s) => s.getTracks().every((t) => t.readyState === "ended")));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile layout has no horizontal overflow");
    await page.locator('input[type="file"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.getByRole("alert").filter({ hasText: "Na slici nismo pronašli" }).waitFor();
    await page.getByLabel("Zalijepi link ili upiši kod").fill("https://evil.example/c/invalid-qr-value");
    await page.getByRole("button", { name: "Nastavi", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Unesi ispravan LIMEN" }).waitFor();
    await page.screenshot({ path: `/tmp/limen-scanner-${device.replaceAll(" ", "-")}-simulated.png`, fullPage: true });
    const id = "scanner-fixture-123";
    const png = await QRCode.toBuffer(`${base}/c/${id}`, { width: 440 });
    await page.evaluate((data) => { window.__cameraPng = data; window.__cameraMode = "qr"; }, `data:image/png;base64,${png.toString("base64")}`);
    await camera.click();
    await page.waitForURL((u) => u.pathname === `/c/${id}`);
    await page.waitForFunction(() => window.__cameraStreams.every((s) => s.getTracks().every((t) => t.readyState === "ended")));
    await page.goto(`${base}/skeniraj`);
    await page.locator('input[type="file"]').setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
    await page.waitForURL((u) => u.pathname === `/c/${id}`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${device} simulation in Chromium: permissions, missing/busy camera, rear camera constraint, stopped/late streams released, QR image fallback and unsafe URL rejection`);
    await context.close();
  }
} finally { await browser.close(); }
