import { smtpSettings, type SmtpSettings } from "./smtp-settings.js";
type MailSettings = SmtpSettings & { isProd: boolean; mailFrom: string; appUrl: string };

function validSender(value: string) {
  return !/[\r\n]/.test(value) && /[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+/.test(value) && !/@limen\.local\b/.test(value);
}
/** Report setting names only: SMTP URLs can contain credentials. */
export function productionMailErrors(settings: MailSettings): string[] {
  if (!settings.isProd) return [];
  const smtp = smtpSettings(settings);
  const errors = smtp.configured ? [...smtp.errors] : ["SMTP_URL"];
  if (!validSender(settings.mailFrom)) errors.push("MAIL_FROM");
  try {
    const app = new URL(settings.appUrl);
    if (app.protocol !== "https:" || app.username || app.password || app.search || app.hash ||
      app.pathname !== "/" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(app.hostname) ||
      app.hostname.endsWith(".replit.dev")) errors.push("APP_URL");
  } catch { errors.push("APP_URL"); }
  return errors;
}

export function mailConfigurationErrors(settings: MailSettings): string[] {
  if (settings.isProd) return productionMailErrors(settings);
  const smtp = smtpSettings(settings);
  if (smtp.options && !validSender(settings.mailFrom)) return ["MAIL_FROM"];
  return smtp.errors;
}
