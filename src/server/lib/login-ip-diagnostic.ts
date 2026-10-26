import { isIP } from "node:net";

type Snapshot = {
  ip?: string;
  socket: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
};

/** TEMPORARY: remove after the owner's real Wi-Fi/mobile login comparison.
 * Logs only after successful authentication, never request bodies or identifiers.
 * Opt-in, development-only, two records at most, and a 15-minute process window.
 */
export function createLoginIpDiagnostic(options: {
  environment: string;
  enabled: boolean;
  now?: () => number;
  write?: (entry: string) => void;
}) {
  const now = options.now ?? Date.now;
  const write = options.write ?? ((entry: string) => console.info(entry));
  const expires = now() + 15 * 60_000;
  let remaining = 2;
  const address = (value: string | undefined) =>
    value && isIP(value) ? value : value ? "[invalid]" : null;
  return (req: Snapshot) => {
    if (!options.enabled || options.environment !== "development" || remaining === 0 || now() >= expires) return;
    remaining--;
    const raw = req.headers["x-forwarded-for"];
    const forwarded = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
      .slice(0, 4096).split(",").filter((part) => part.trim()).slice(0, 16)
      .map((part) => address(part.trim()));
    try {
      write(JSON.stringify({
        event: "limen.login-ip-diagnostic",
        sample: 2 - remaining,
        ip: address(req.ip),
        socketAddress: address(req.socket.remoteAddress),
        forwardedFor: forwarded,
      }));
    } catch {
      // An optional logging failure must never change a login outcome.
    }
  };
}
