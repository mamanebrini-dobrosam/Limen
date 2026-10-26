import { useEffect, useState } from "react";
import { ApiError } from "../api";
import { secondsRemaining, waitLabel } from "../lib/rate-limit";

/** Presentation only: this timer never retries, fetches, or changes server limits. */
export function ErrorNotice({ error }: { error: Error | string | null }) {
  const deadline = error instanceof ApiError && error.status === 429 ? error.retryAt : undefined;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (deadline === undefined || deadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  if (!error) return null;
  if (deadline === undefined) return <p className="notice error" role="alert">{error instanceof Error ? error.message : error}</p>;
  const remaining = secondsRemaining(deadline, now);
  return <p className="notice error" role="alert">
    {remaining > 0 ? <>Previše pokušaja. Pokušaj ponovo za <span role="timer" aria-live="off">{waitLabel(remaining)}</span></>
      : "Čekanje je isteklo. Možeš ponovo pokušati."}
  </p>;
}
