import { demoState, demoMessages, demoSections, demoNotifications } from "./fixtures";
export type { User, Seat, Message, SessionState, RoomSection, RoomItem } from "./types";
/** No network, cookies, real accounts, storage or live application mutations. */
export const api = {
  async get<T>(path: string): Promise<T> {
    let result: unknown;
    if (path === "/me/status") result = { hostingSessionId: null, guestSessionId: null };
    else if (path === "/rooms/mine") result = { room: { id: "demo-owned-room", theme: "smaragd" }, openSessionId: null, hasPreviousConversation: false };
    else if (path === "/invitations") result = { invitations: [] };
    else if (path === "/me/notifications") result = { notifications: demoNotifications };
    else if (path.endsWith("/messages")) result = { messages: demoMessages };
    else if (path.endsWith("/state")) result = { state: demoState, role: "host", muted: false };
    else if (path.endsWith("/room") || path === "/room/content") result = { theme: "smaragd", sections: demoSections };
    else if (path.endsWith("/invitations")) result = { entryRequests: [], invitations: [] };
    else if (path === "/contacts") result = { contacts: [] };
    else throw new Error(`Unsupported isolated preview read: ${path}`);
    return result as T;
  },
  async post<T = unknown>(_path: string, _body?: unknown): Promise<T> { return { sessionId: "demo-room", ok: true } as T; },
  async patch<T = unknown>(_path: string, _body?: unknown): Promise<T> { return { ok: true } as T; },
  async del<T = unknown>(_path: string, _body?: unknown): Promise<T> { return { ok: true } as T; },
  async upload<T = unknown>(_path: string, _body?: unknown): Promise<T> { throw new Error("Slanje datoteka nije aktivno u vizuelnom prototipu."); },
};
