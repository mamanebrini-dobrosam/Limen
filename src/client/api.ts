import { retryDeadline } from "./lib/rate-limit";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAt?: number) { super(message); }
}

async function call<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = { "x-limen": "1" };
  if (body !== undefined && !isForm) headers["content-type"] = "application/json";
  const res = await fetch(`/api${url}`, {
    method, headers, credentials: "same-origin",
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(
    res.status, data?.error ?? "error", data?.message ?? "Nešto nije u redu. Pokušaj ponovo.",
    res.status === 429 ? retryDeadline(data?.retryAfter, res.headers.get("retry-after")) : undefined,
  );
  return data as T;
}

export const api = {
  get: <T>(url: string) => call<T>("GET", url),
  post: <T>(url: string, body: unknown = {}) => call<T>("POST", url, body),
  patch: <T>(url: string, body: unknown = {}) => call<T>("PATCH", url, body),
  del: <T>(url: string, body?: unknown) => call<T>("DELETE", url, body),
  upload: <T>(url: string, file: File, fields: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append("image", file);
    return call<T>("POST", url, fd, true);
  },
};

export type User = { id: string; email: string; displayName: string; qrId: string; emailVerified: boolean; isAdmin: boolean };
export type Seat = { seatNo: number; userId: string; displayName: string; present: boolean; muted: boolean };
export type SessionState = {
  id: string; roomId: string; conversationId: string; open: boolean; closeReason: string | null;
  hostAway: boolean; host: { id: string; displayName: string }; seats: Seat[];
};
export type Message = {
  id: string; sessionId: string; kind: "text" | "image"; body: string | null; mediaId: string | null; createdAt: string;
  author: { id: string | null; displayName: string; deleted?: boolean };
};
export type RoomSection = { id: string; kind: string; title: string; items: RoomItem[] };
export type RoomItem = { id: string; kind: "text" | "quote" | "image"; text: string | null; mediaId: string | null; sharedWithGuests?: boolean };
