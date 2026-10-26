import type { AnchorHTMLAttributes } from "react";
export function Link({ to, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const allowed = to === "/__mockup/preview/limen-b/Room"
    ? to
    : "/__mockup/preview/limen-b/Home";
  return <a {...props} href={allowed} onClick={(event) => {
    event.preventDefault();
    if (allowed !== window.location.pathname) window.history.pushState({}, "", allowed);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }}>{children}</a>;
}
export function useNavigate() { return (_to: string) => {}; }
export function useParams() { return { sessionId: "demo-room" }; }
