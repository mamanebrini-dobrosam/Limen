import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";

export type SmtpSettings = {
  smtpUrl: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
};

/** Never include supplied values in diagnostics: URLs may contain credentials. */
export function smtpSettings(settings: SmtpSettings): {
  configured: boolean; errors: string[]; options: SMTPTransport.Options | null;
} {
  const split = !!(settings.smtpHost || settings.smtpUser || settings.smtpPassword || settings.smtpPort !== undefined);
  if (!settings.smtpUrl && !split) return { configured: false, errors: [], options: null };
  if (settings.smtpUrl && split) return { configured: true, errors: ["SMTP_URL / SMTP_HOST"], options: null };
  const errors: string[] = [];
  let host = settings.smtpHost ?? "";
  let port = settings.smtpPort ?? 587;
  let user = settings.smtpUser ?? "";
  let pass = settings.smtpPassword ?? "";
  let secure = port === 465;
  if (settings.smtpUrl) {
    try {
      const url = new URL(settings.smtpUrl);
      if (!["smtp:", "smtps:"].includes(url.protocol) || url.pathname !== "" && url.pathname !== "/" || url.hash) throw new Error();
      host = url.hostname;
      port = url.port ? Number(url.port) : url.protocol === "smtps:" ? 465 : 587;
      secure = url.protocol === "smtps:";
      user = decodeURIComponent(url.username);
      pass = decodeURIComponent(url.password);
      if (!host || !user || !pass) throw new Error();
    } catch { return { configured: true, errors: ["SMTP_URL"], options: null }; }
  } else {
    if (!host || /[\s/:@?#]/.test(host)) errors.push("SMTP_HOST");
    if (!user || /[\r\n]/.test(user)) errors.push("SMTP_USER");
    if (!pass || /[\r\n]/.test(pass)) errors.push("SMTP_PASSWORD");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(settings.smtpUrl ? "SMTP_URL" : "SMTP_PORT");
  if (errors.length) return { configured: true, errors, options: null };
  return {
    configured: true, errors: [],
    options: {
      host, port, secure,
      auth: { user, pass },
      // STARTTLS is mandatory on 587/2525; port 465 uses TLS from the start.
      // Legacy URL query parameters cannot turn off certificate verification.
      requireTLS: true, ignoreTLS: false,
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    },
  };
}
