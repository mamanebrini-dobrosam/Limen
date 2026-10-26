/** Relative server durations avoid depending on the visitor's clock setting. */
export function retryDeadline(seconds: unknown, header: string | null, now = Date.now()): number | undefined {
  const duration = typeof seconds === "number" ? seconds : undefined;
  if (duration !== undefined && Number.isFinite(duration) && duration >= 0) {
    const deadline = now + Math.ceil(duration) * 1000;
    if (Number.isFinite(deadline)) return deadline;
  }
  if (!header?.trim()) return undefined;
  const numeric = Number(header);
  if (Number.isFinite(numeric) && numeric >= 0) {
    const deadline = now + Math.ceil(numeric) * 1000;
    return Number.isFinite(deadline) ? deadline : undefined;
  }
  // Retry-After may also be an HTTP date. Do not interpret negative numbers as dates.
  if (/^[+-]?\d/.test(header.trim())) return undefined;
  const absolute = Date.parse(header);
  return Number.isFinite(absolute) ? Math.max(now, absolute) : undefined;
}

export function secondsRemaining(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function waitLabel(seconds: number) {
  return `${Math.floor(seconds / 60)} min ${seconds % 60} sek.`;
}
