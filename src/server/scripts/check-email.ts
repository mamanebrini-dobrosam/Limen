import nodemailer from "nodemailer";
import { config } from "../config.js";
import { productionMailErrors } from "../lib/mail-settings.js";
import { smtpSettings } from "../lib/smtp-settings.js";

// Readiness only; no database, recipient address or message/verification token.
const errors = productionMailErrors({ ...config, isProd: true });
if (errors.length) {
  console.error(`Email nije spreman. Nedostaju ili nisu ispravne postavke: ${errors.join(", ")}.`);
  console.error("SMTP_URL je alternativan potpunoj konfiguraciji SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD. Ne koristi oba načina.");
  process.exitCode = 1;
} else if (!process.argv.includes("--connect")) {
  console.log("Email konfiguracija je potpuna. SMTP veza i dostava još nisu provjerene. Nijedan email nije poslan.");
} else {
  const transport = nodemailer.createTransport(smtpSettings(config).options!);
  try {
    await transport.verify();
    console.log("SMTP veza i autentifikacija su provjerene. Nijedan email nije poslan; dostavu i sandučić treba provjeriti odvojeno.");
  } catch {
    console.error("SMTP veza nije potvrđena. Provjeri postavke u sigurnom spremištu i status pošiljaoca kod pružaoca usluge.");
    process.exitCode = 1;
  } finally { transport.close(); }
}
