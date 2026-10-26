import type { AnchorHTMLAttributes } from "react";
const HOME = "/__mockup/preview/limen-a/Home";
const ROOM = "/__mockup/preview/limen-a/Room";
function safePreviewPath(to: string) {
  if (to === HOME || to === ROOM) return to;
  return /sto|room/i.test(to) ? ROOM : HOME;
}
export function Link({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={safePreviewPath(to)}>{children}</a>;
}
export function useNavigate() { return (to: string) => { window.location.assign(safePreviewPath(to)); }; }
export function useParams() { return { sessionId: "demo-room" }; }
