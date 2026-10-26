import { describe, expect, it } from "vitest";
import { smtpSettings } from "../src/server/lib/smtp-settings.js";
import { mailConfigurationErrors, productionMailErrors } from "../src/server/lib/mail-settings.js";

describe("Sigurna SMTP priprema", () => {
  const split = { smtpUrl: "", smtpHost: "smtp-relay.brevo.com", smtpPort: 587, smtpUser: "fixture@smtp-brevo.com", smtpPassword: "synthetic-smtp-key" };
  it("Brevo 587 traži STARTTLS i provjeru certifikata bez debug logova", () => {
    const r = smtpSettings(split);
    expect(r.errors).toEqual([]);
    expect(r.options).toMatchObject({
      host: "smtp-relay.brevo.com", port: 587, secure: false,
      requireTLS: true, ignoreTLS: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      auth: { user: split.smtpUser, pass: split.smtpPassword },
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
  });
  it("podržava implicitni TLS 465 i STARTTLS 2525", () => {
    expect(smtpSettings({ ...split, smtpPort: 465 }).options?.secure).toBe(true);
    expect(smtpSettings({ ...split, smtpPort: 2525 }).options).toMatchObject({ secure: false, requireTLS: true });
  });
  it("nepotpuna ili neispravna konfiguracija ne može postati nesiguran transport", () => {
    expect(smtpSettings({ ...split, smtpPassword: "" })).toMatchObject({ options: null, errors: ["SMTP_PASSWORD"] });
    expect(smtpSettings({ ...split, smtpUser: "" }).errors).toEqual(["SMTP_USER"]);
    expect(smtpSettings({ ...split, smtpHost: "https://smtp.example" }).errors).toEqual(["SMTP_HOST"]);
    for (const smtpPort of [0, 65536, 2.5, NaN]) expect(smtpSettings({ ...split, smtpPort }).options).toBeNull();
  });
  it("čuva podršku SMTP_URL-u s URL-kodiranim posebnim znakovima u ključu", () => {
    const r = smtpSettings({ smtpUrl: "smtps://fixture%40example.com:key%3Awith%40chars@smtp.example:465" });
    expect(r.errors).toEqual([]);
    expect(r.options).toMatchObject({ secure: true, auth: { user: "fixture@example.com", pass: "key:with@chars" } });
  });
  it("URL parametri ne smiju isključiti TLS ili provjeru certifikata", () => {
    expect(smtpSettings({ smtpUrl: "smtp://fixture:synthetic@smtp.example:587?ignoreTLS=true&tls.rejectUnauthorized=false&debug=true" }).options)
      .toMatchObject({ requireTLS: true, ignoreTLS: false, tls: { rejectUnauthorized: true }, debug: false });
  });
  it("odbija miješanje dva načina i dijagnostika ne sadrži tajnu", () => {
    const errors = smtpSettings({ ...split, smtpUrl: "smtp://fixture:synthetic-secret@smtp.example:587" }).errors;
    expect(errors).toEqual(["SMTP_URL / SMTP_HOST"]);
    expect(JSON.stringify(errors)).not.toContain("synthetic-secret");
  });
  it("nepotpun SMTP se odbija i u razvoju umjesto tihog spremanja poruke u outbox", () => {
    expect(mailConfigurationErrors({ ...split, smtpPassword: "", isProd: false, mailFrom: "", appUrl: "" })).toEqual(["SMTP_PASSWORD"]);
    expect(mailConfigurationErrors({ smtpUrl: "", isProd: false, mailFrom: "", appUrl: "" })).toEqual([]);
  });
  it("potpun SMTP ne zamjenjuje potvrđenog pošiljaoca i ispravan URL", () => {
    expect(productionMailErrors({ ...split, isProd: true, mailFrom: "LIMEN <fixture@limen.example>", appUrl: "https://limen.example" })).toEqual([]);
    expect(productionMailErrors({ ...split, isProd: true, mailFrom: "LIMEN\r\nBcc:other@example.com <fixture@limen.example>", appUrl: "https://limen.example" })).toContain("MAIL_FROM");
    expect(productionMailErrors({ ...split, isProd: true, mailFrom: "LIMEN <fixture@limen.example>", appUrl: "https://workspace.replit.dev" })).toContain("APP_URL");
  });
  it("ni razvoj sa stvarnim SMTP-om ne šalje sa izmišljenom adresom pošiljaoca", () => {
    expect(mailConfigurationErrors({ ...split, isProd: false, mailFrom: "LIMEN <no-reply@limen.local>", appUrl: "https://test.replit.dev" })).toEqual(["MAIL_FROM"]);
    expect(mailConfigurationErrors({ ...split, isProd: false, mailFrom: "LIMEN <fixture@limen.example>", appUrl: "https://test.replit.dev" })).toEqual([]);
  });
});
