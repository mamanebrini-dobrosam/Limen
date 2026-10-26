export function limenQrCode(value: string, origin: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    const match = url.pathname.match(/^\/c\/([A-Za-z0-9_-]{10,64})\/?$/);
    return match?.[1] ?? (/^[A-Za-z0-9_-]{10,64}$/.test(raw) ? raw : null);
  } catch { return null; }
}

export function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(String(name))) {
    return "Pristup kameri nije dozvoljen. Dozvoli kameru u postavkama preglednika ili odaberi sliku QR koda.";
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(String(name))) return "Kamera nije pronađena. Odaberi sliku QR koda ili unesi link.";
  if (["NotReadableError", "TrackStartError"].includes(String(name))) return "Kamera je zauzeta ili nedostupna. Zatvori drugu aplikaciju koja je koristi i pokušaj ponovo.";
  return "Kamera se nije mogla pokrenuti. Odaberi sliku QR koda ili unesi link ručno.";
}
