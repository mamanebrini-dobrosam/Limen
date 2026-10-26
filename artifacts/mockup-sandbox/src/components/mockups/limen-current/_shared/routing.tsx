import type { AnchorHTMLAttributes } from "react";
export function Link({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={to} onClick={(event) => { event.preventDefault(); }} >{children}</a>;
}
export function useNavigate() { return (_to: string) => {}; }
export function useParams() { return { sessionId: "demo-room" }; }
