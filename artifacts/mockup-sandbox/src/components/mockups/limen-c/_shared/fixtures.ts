import type { SessionState, Message, RoomSection, User } from "./types";
export const demoUser: User = { id: "demo-owner", displayName: "Mina", email: "demo@example.invalid", qrId: "demo-only", emailVerified: true, isAdmin: false };
export const demoState: SessionState = {
  id: "demo-room", roomId: "demo-owned-room", conversationId: "demo-conversation", open: true, closeReason: null, hostAway: false,
  host: { id: demoUser.id, displayName: "Mina" },
  seats: [
    { seatNo: 1, userId: "demo-lejla", displayName: "Lejla", present: true, muted: false },
    { seatNo: 3, userId: "demo-adnan", displayName: "Adnan", present: true, muted: false },
    { seatNo: 5, userId: "demo-ena", displayName: "Ena", present: true, muted: false },
  ],
};
export const demoMessages: Message[] = [
  { id: "message-1", sessionId: demoState.id, kind: "text", body: "Drago mi je da smo se okupili.", mediaId: null, createdAt: "2026-10-26T18:30:00Z", author: { id: "demo-owner", displayName: "Mina" } },
  { id: "message-2", sessionId: demoState.id, kind: "text", body: "Baš je lijepo imati malo vremena za razgovor.", mediaId: null, createdAt: "2026-10-26T18:31:00Z", author: { id: "demo-lejla", displayName: "Lejla" } },
];
export const demoSections: RoomSection[] = [
  { id: "about", kind: "about", title: "O meni", items: [{ id: "text-about", kind: "text", text: "Male priče, dobri ljudi i vrijeme za razgovor.", mediaId: null }] },
  { id: "vision", kind: "vision", title: "Vision Board", items: [{ id: "text-vision", kind: "quote", text: "Više prisutnosti. Manje žurbe.", mediaId: null }] },
  { id: "gallery", kind: "gallery", title: "Galerija", items: [] },
];
export const demoNotifications = [
  { id: "note-1", type: "contact_request", payload: { displayName: "Ena" }, createdAt: "2026-10-26T18:00:00Z", readAt: "2026-10-26T18:01:00Z" },
  { id: "note-2", type: "visitor_request", payload: { displayName: "Lejla" }, createdAt: "2026-10-26T17:40:00Z", readAt: "2026-10-26T18:01:00Z" },
];
