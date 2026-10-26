// Development-only browser journey. Never run against a published app.
// Uses real authentication, guest cookies, approvals and existing room checks.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";
import QRCode from "qrcode";
import pg from "pg";
import { browserBase as base } from "./browser-target.mjs";
import { verifyRoomPalettes } from "./browser-palettes.mjs";
import { verifyProfileEditor } from "./browser-profile-editor.mjs";

const fixturePath = process.env.LIMEN_BROWSER_BASE_URL ? "/tmp/limen-visitor-isolated-fixtures.json" : "/tmp/limen-visitor-browser-fixtures.json";
const password = "Browser-Limen-123!";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
const ownerContext = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
const guestContext = await browser.newContext({ baseURL: base, viewport: { width: 402, height: 874 } });
const owner = await ownerContext.newPage();
const guest = await guestContext.newPage();
owner.setDefaultTimeout(15000); guest.setDefaultTimeout(15000);
const errors = [];
for (const p of [owner, guest]) p.on("pageerror", (e) => errors.push(e.message));
let fixtures;
try { fixtures = JSON.parse(await fs.readFile(fixturePath, "utf8")); }
catch { fixtures = { ownerEmail: `owner-browser-${Date.now()}@test.local`, guestEmail: `guest-browser-${Date.now()}@test.local` }; }
const api = async (context, method, path, data) => {
  const r = await context.request.fetch(`${base}/api${path}`, { method, headers: { "x-limen": "1" }, data });
  const value = await r.json();
  assert.ok(r.ok(), `${method} ${path}: ${r.status()} ${value.message || ""}`);
  return value;
};
const until = async (fn, label, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`Timeout: ${label}`);
};
async function verifyEmail(context, email) {
  const outbox = await api(context, "GET", `/dev/outbox?to=${encodeURIComponent(email)}`);
  const token = outbox.emails.find((m) => m.body.includes("/potvrda?token="))?.body.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(token, "Development verification mail exists");
  return token;
}
async function login(page, email) {
  await page.goto(`${base}/prijava`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
}
async function send(page, body) {
  await page.getByRole("textbox", { name: "Poruka", exact: true }).fill(body);
  await page.getByRole("button", { name: "Pošalji", exact: true }).click();
  await page.getByText(body, { exact: true }).waitFor();
  await until(async () => await page.getByRole("textbox", { name: "Poruka", exact: true }).inputValue() === "", "composer clears after send");
}

try {
  if (!fixtures.ownerCreated) {
    await api(ownerContext, "POST", "/auth/register", { email: fixtures.ownerEmail, password, displayName: "Browser Domaćin", birthDate: "1990-01-01", confirmAdult: true });
    await api(ownerContext, "POST", "/auth/verify-email", { token: await verifyEmail(ownerContext, fixtures.ownerEmail) });
    fixtures.ownerCreated = true;
    await fs.writeFile(fixturePath, JSON.stringify(fixtures));
  }
  await login(owner, fixtures.ownerEmail);
  const { user: ownerUser } = await api(ownerContext, "GET", "/me");
  const nickname = `Browser Gost ${Date.now().toString().slice(-6)}`;
  const png = await QRCode.toBuffer(`${base}/c/${ownerUser.qrId}`, { width: 440, margin: 2 });
  await guest.goto(`${base}/skeniraj`);
  await guest.locator('input[type="file"]').setInputFiles({ name: "limen-owner-qr.png", mimeType: "image/png", buffer: png });
  await guest.waitForURL((u) => u.pathname === `/c/${ownerUser.qrId}`);
  await guest.getByLabel("Ime ili nadimak").fill(nickname);
  await guest.getByRole("button", { name: "Pošalji zahtjev", exact: true }).click();
  await guest.waitForURL(/\/gost\/[a-f0-9-]+/);
  const id = new URL(guest.url()).pathname.split("/").pop();
  assert.equal((await guestContext.request.get(`${base}/api/me`)).status(), 401);
  await guest.getByText("Zahtjev čeka ručnu odluku vlasnika.", { exact: true }).waitFor();
  await owner.goto(`${base}/chat/zahtjevi`);
  await owner.getByText(nickname, { exact: true }).waitFor();
  await owner.goto(`${base}/gost-chat/${id}`);
  await owner.getByRole("button", { name: "Odobri razgovor", exact: true }).click();
  await guest.getByRole("textbox", { name: "Poruka", exact: true }).waitFor();
  console.log("PASS QR image scan, anonymous request, manual owner approval");
  await send(guest, "Prva gostujuća");
  await send(guest, "Druga gostujuća");
  await until(async () => await guest.getByRole("textbox", { name: "Poruka", exact: true }).isDisabled(), "two-message limit");
  assert.equal((await guestContext.request.post(`${base}/api/visitor/conversations/${id}/messages`, { headers: { "x-limen": "1" }, data: { body: "Zabranjena treća" } })).status(), 409);
  await send(owner, "Vlasnikov odgovor");
  await until(async () => await guest.getByRole("textbox", { name: "Poruka", exact: true }).isEnabled(), "owner reply resets guest limit");
  await send(guest, "Nova nakon odgovora");
  await owner.getByLabel("Uzastopne poruke gosta").fill("4");
  await owner.getByRole("button", { name: "Sačuvaj", exact: true }).click();
  await until(async () => (await api(guestContext, "GET", `/visitor/conversations/${id}`)).chat.guestLimit === 4, "raised limit");
  await owner.getByLabel("Uzastopne poruke gosta").fill("");
  await owner.getByRole("button", { name: "Sačuvaj", exact: true }).click();
  await until(async () => (await api(guestContext, "GET", `/visitor/conversations/${id}`)).chat.guestLimit === null, "unlimited setting");
  await guest.reload();
  await guest.getByText("Prva gostujuća", { exact: true }).waitFor();
  await guest.screenshot({ path: "/tmp/limen-guest-mobile.png", fullPage: true });
  console.log("PASS two-message limit, rejected bypass, owner reset, raised/unlimited limit, persistent history");
  await guest.getByRole("button", { name: "Napravi ključ za oporavak", exact: true }).click();
  const recoveryCode = await guest.getByLabel("Ključ za oporavak", { exact: true }).inputValue();
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(recoveryCode), "Guest can save a recovery credential");
  const [download] = await Promise.all([
    guest.waitForEvent("download"),
    guest.getByRole("button", { name: "Sačuvaj ključ u datoteku", exact: true }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  assert.ok(Buffer.concat(chunks).toString("utf8").includes(recoveryCode), "Download contains the key");
  await download.delete();
  const oldCookies = await guestContext.cookies();
  await guestContext.clearCookies();
  await guest.reload();
  assert.equal((await guestContext.request.get(`${base}/api/visitor/conversations/${id}`)).status(), 404);
  await guest.goto(`${base}/gost-oporavak`);
  await guest.getByLabel("Sačuvani ključ za oporavak").fill(ownerUser.qrId);
  await guest.getByRole("button", { name: "Oporavi razgovor", exact: true }).click();
  await guest.getByRole("alert").getByText("Ključ za oporavak nije važeći ili je razgovor istekao.", { exact: true }).waitFor();
  await guest.getByLabel("Sačuvani ključ za oporavak").fill(recoveryCode);
  await guest.getByRole("button", { name: "Oporavi razgovor", exact: true }).click();
  await guest.getByRole("status").waitFor();
  const nextRecovery = await guest.getByLabel("Ključ za oporavak", { exact: true }).inputValue();
  assert.ok(nextRecovery !== recoveryCode, "Recovery rotates the key");
  const stale = await browser.newContext({ baseURL: base });
  await stale.addCookies(oldCookies);
  assert.equal((await stale.request.get(`${base}/api/visitor/conversations/${id}`)).status(), 404);
  await stale.close();
  assert.equal((await guestContext.request.post(`${base}/api/visitor/recover`, { headers: { "x-limen": "1" }, data: { recoveryCode } })).status(), 400);
  await guest.getByRole("link", { name: "Nastavi razgovor", exact: true }).click();
  await guest.getByText("Prva gostujuća", { exact: true }).waitFor();
  console.log("PASS key download, cookie deletion, QR-only recovery rejected, secure recovery, old-cookie revocation and single-use key");

  const roomPage = await ownerContext.newPage();
  await roomPage.goto(base);
  const status = await api(ownerContext, "GET", "/me/status");
  if (status.hostingSessionId) await roomPage.goto(`${base}/sto/${status.hostingSessionId}`);
  else {
    await roomPage.getByRole("button", { name: "Otvori sobu", exact: true }).click();
    const newConversation = roomPage.getByRole("button", { name: "Započni novi razgovor", exact: true });
    if (await newConversation.isVisible()) await newConversation.click();
  }
  await roomPage.waitForURL(/\/sto\//);
  const sessionId = new URL(roomPage.url()).pathname.split("/").pop();
  await owner.getByRole("button", { name: "Ponudi ulazak u otvorenu sobu", exact: true }).click();
  await guest.getByRole("link", { name: "Napravi profil", exact: true }).waitFor();
  assert.equal((await guestContext.request.get(`${base}/api/sessions/${sessionId}/room`)).status(), 401);
  await guest.getByRole("link", { name: "Napravi profil", exact: true }).click();
  if (!fixtures.guestCreated) {
    await guest.getByLabel("Ime koje drugi vide").fill("Browser Potvrđeni Gost");
    await guest.getByLabel("Email", { exact: true }).fill(fixtures.guestEmail);
    await guest.getByLabel(/^Lozinka/).fill(password);
    await guest.getByLabel("Datum rođenja").fill("1991-01-01");
    await guest.getByLabel("Potvrđujem da imam najmanje 18 godina.").check();
    await guest.getByRole("button", { name: "Napravi nalog", exact: true }).click();
    await guest.waitForURL(/\/potvrda/);
    fixtures.guestCreated = true;
    await fs.writeFile(fixturePath, JSON.stringify(fixtures));
    const expired = await verifyEmail(guestContext, fixtures.guestEmail);
    const { user: unverified } = await api(guestContext, "GET", "/me");
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query("update email_tokens set expires_at = now() - interval '1 minute' where user_id = $1 and purpose = 'verify'", [unverified.id]);
    } finally { await pool.end(); }
    await guest.goto(`${base}/potvrda?token=${expired}`);
    await guest.getByText("Link za potvrdu nije važeći ili je istekao.", { exact: true }).waitFor();
    await guest.goto(`${base}/potvrda?token=invalid-browser-verification-link`);
    await guest.getByText("Link za potvrdu nije važeći ili je istekao.", { exact: true }).waitFor();
    assert.equal((await api(guestContext, "GET", "/me")).user.emailVerified, false);
    await guest.getByRole("button", { name: "Pošalji link ponovo", exact: true }).click();
    await guest.getByText("Novi link je poslan.", { exact: true }).waitFor();
    assert.equal(await guest.getByRole("link", { name: "Nastavi", exact: true }).count(), 0);
    const token = await verifyEmail(guestContext, fixtures.guestEmail);
    await guest.goto(`${base}/potvrda?token=${token}`);
    await guest.getByRole("link", { name: "Nastavi", exact: true }).click();
    console.log("PASS expired/invalid verification links rejected, resend does not falsely verify, new development email link succeeds");
  } else {
    await guest.goto(`${base}/prijava?dalje=${encodeURIComponent(`/gost/${id}`)}`);
    await guest.getByLabel("Email", { exact: true }).fill(fixtures.guestEmail);
    await guest.getByLabel("Lozinka", { exact: true }).fill(password);
    await guest.getByRole("button", { name: "Prijavi se", exact: true }).click();
  }
  await guest.waitForURL((u) => u.pathname === `/gost/${id}`);
  await guest.getByLabel("Potvrdi identitet lozinkom").fill(password);
  await guest.getByRole("button", { name: "Potvrdi i poveži profil", exact: true }).click();
  await until(async () => !!(await api(guestContext, "GET", `/visitor/conversations/${id}`)).chat.linkedUserId, "verified profile linked");
  assert.equal((await guestContext.request.get(`${base}/api/sessions/${sessionId}/room`)).status(), 403);
  await guest.getByRole("link", { name: "Zatraži kontakt od vlasnika", exact: true }).click();
  await guest.getByRole("button", { name: "Pošalji zahtjev za kontakt", exact: true }).click();
  const contactsPage = await ownerContext.newPage();
  await contactsPage.goto(`${base}/kontakti`);
  const incomingContact = contactsPage.locator("li").filter({ hasText: "Browser Potvrđeni Gost" }).filter({ has: contactsPage.getByRole("button", { name: "Prihvati", exact: true }) });
  await incomingContact.getByRole("button", { name: "Prihvati", exact: true }).click();
  await owner.getByRole("button", { name: "Pošalji pozivnicu za sto", exact: true }).waitFor();
  await owner.getByRole("button", { name: "Pošalji pozivnicu za sto", exact: true }).click();
  await guest.goto(base);
  await guest.getByRole("button", { name: "Zatraži ulazak", exact: true }).click();
  await roomPage.getByRole("button", { name: /Zahtjevi za ulazak/ }).click();
  await roomPage.getByRole("button", { name: "Odobri", exact: true }).click();
  await roomPage.getByRole("button", { name: "Zatvori", exact: true }).click();
  await guest.reload();
  await guest.getByRole("link", { name: "Vrati se za sto", exact: true }).click();
  await guest.waitForURL((u) => u.pathname === `/sto/${sessionId}`);
  await until(async () => (await guestContext.request.get(`${base}/api/sessions/${sessionId}/room`)).ok(), "separate room admission");
  await verifyProfileEditor({ ownerContext, guestContext, api, base });
  await verifyRoomPalettes({ ownerContext, guestContext, roomPage, guestPage: guest, api, base });
  await guest.getByRole("button", { name: "Napusti sto", exact: true }).click();
  await until(async () => (await guestContext.request.get(`${base}/api/sessions/${sessionId}/room`)).status() === 403, "room access revoked on leave");
  await guest.goto(`${base}/gost/${id}`);
  await send(guest, "Mali chat poslije izlaska");
  await owner.getByText("Mali chat poslije izlaska", { exact: true }).waitFor();
  await owner.screenshot({ path: "/tmp/limen-owner-desktop.png", fullPage: true });
  console.log("PASS profile creation, email/password identity confirmation, separate contact/invitation/admission, immediate access revocation, independent small chat");
  assert.deepEqual(errors, [], "No browser page errors");
  await api(guestContext, "DELETE", "/me", { password });
  await api(ownerContext, "DELETE", "/me", { password });
  await fs.unlink(fixturePath);
  console.log("BROWSER JOURNEY PASSED");
} catch (e) {
  await owner.screenshot({ path: "/tmp/limen-owner-failure.png", fullPage: true }).catch(() => {});
  await guest.screenshot({ path: "/tmp/limen-guest-failure.png", fullPage: true }).catch(() => {});
  console.error(`BROWSER JOURNEY FAILED: ${e.message}`);
  throw e;
} finally {
  await browser.close();
}
