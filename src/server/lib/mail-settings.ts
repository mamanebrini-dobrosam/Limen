type MailSettings = { isProd: boolean; smtpUrl: string; mailFrom: string; appUrl: string };

/** Report setting names only: SMTP URLs can contain credentials. */
export function productionMailErrors(settings: MailSettings): string[] {
  if (!settings.isProd) return [];
  const errors: string[] = [];
  try {
    const smtp = new URL(settings.smtpUrl);
    if (!["smtp:", "smtps:"].includes(smtp.protocol) || !smtp.hostname) errors.push("SMTP_URL");
  } catch { errors.push("SMTP_URL"); }
  if (!/[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+/.test(settings.mailFrom) || /@limen\.local\b/.test(settings.mailFrom)) errors.push("MAIL_FROM");
  try {
    const app = new URL(settings.appUrl);
    if (app.protocol !== "https:" || app.username || app.password || app.search || app.hash ||
      app.pathname !== "/" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(app.hostname) ||
      app.hostname.endsWith(".replit.dev")) errors.push("APP_URL");
  } catch { errors.push("APP_URL"); }
  return errors;
}
