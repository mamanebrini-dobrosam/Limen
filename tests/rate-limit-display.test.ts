import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { api, ApiError } from "../src/client/api";
import { ErrorNotice } from "../src/client/components/ErrorNotice";
import { retryDeadline, secondsRemaining, waitLabel } from "../src/client/lib/rate-limit";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Rate-limit display without changing protection", () => {
  it("reads the server duration, including zero, and ignores malformed values", () => {
    expect(retryDeadline(252, "10", 1000)).toBe(253000);
    expect(retryDeadline(0, null, 1000)).toBe(1000);
    expect(retryDeadline(undefined, "12", 1000)).toBe(13000);
    expect(retryDeadline(-1, null, 1000)).toBeUndefined();
    expect(retryDeadline(Infinity, "invalid", 1000)).toBeUndefined();
    expect(retryDeadline("not-a-number", "", 1000)).toBeUndefined();
    expect(retryDeadline(undefined, "-1", 1000)).toBeUndefined();
  });
  it("supports an HTTP-date header and rounds remaining time up", () => {
    expect(retryDeadline(undefined, "Thu, 01 Jan 1970 00:01:00 GMT", 1000)).toBe(60000);
    expect(secondsRemaining(253000, 1000)).toBe(252);
    expect(secondsRemaining(253000, 252001)).toBe(1);
    expect(secondsRemaining(253000, 900000)).toBe(0);
    expect(waitLabel(252)).toBe("4 min 12 sek.");
    expect(waitLabel(3600)).toBe("60 min 0 sek.");
  });
  it("retains retry metadata for 429 without retrying the request", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "rate_limited", message: "Previše pokušaja.", retryAfter: 252,
    }), { status: 429, headers: { "content-type": "application/json", "retry-after": "252" } }));
    vi.stubGlobal("fetch", fetcher);
    const error = await api.post("/auth/login", {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error("Expected a failed API response.");
    expect(error.retryAt).toBe(253000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(React.createElement(ErrorNotice, { error }))).toContain("4 min 12 sek.");
  });
  it("uses a header fallback without attaching timers to other errors", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate_limited", message: "Sačekaj." }),
        { status: 429, headers: { "content-type": "application/json", "retry-after": "12" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "bad_credentials", message: "Pogrešna lozinka.", retryAfter: 12 }),
        { status: 401, headers: { "content-type": "application/json", "retry-after": "12" } }));
    vi.stubGlobal("fetch", fetcher);
    const headerError = await api.post("/auth/login").catch((e) => e);
    if (!(headerError instanceof ApiError)) throw new Error("Expected a failed API response.");
    expect(headerError.retryAt).toBe(13000);
    const ordinary = await api.post("/auth/login").catch((e) => e);
    if (!(ordinary instanceof ApiError)) throw new Error("Expected a failed API response.");
    expect(ordinary.retryAt).toBeUndefined();
    expect(renderToStaticMarkup(React.createElement(ErrorNotice, { error: ordinary }))).toContain("Pogrešna lozinka.");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps unknown waits honest and makes expiry a manual action", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const unknown = new ApiError(429, "rate_limited", "Previše pokušaja. Pokušaj ponovo kasnije.");
    expect(renderToStaticMarkup(React.createElement(ErrorNotice, { error: unknown }))).not.toContain("role=\"timer\"");
    const expired = new ApiError(429, "rate_limited", "Previše pokušaja.", 999);
    expect(renderToStaticMarkup(React.createElement(ErrorNotice, { error: expired }))).toContain("Čekanje je isteklo. Možeš ponovo pokušati.");
  });
});
