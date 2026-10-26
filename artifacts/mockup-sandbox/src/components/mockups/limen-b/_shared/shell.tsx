import type { ReactNode } from "react";
import { Link } from "./routing";
import { demoUser } from "./fixtures";
export function useAuth() { return { user: demoUser }; }
export function Shell({ children }: { children: ReactNode }) {
  return <div className="shell">
    <header className="topbar">
      <Link className="wordmark" to="/__mockup/preview/limen-b/Home" aria-label="LIMEN, početna">
        <img className="brand-image" src="/__mockup/images/limen/slonovaca.png" alt="limen" />
      </Link>
      <span className="topbar-note">PRIVATNI KRUG <i aria-hidden="true" /></span>
    </header>
    <main className="page">{children}</main>
    <nav className="tabbar" aria-label="Pregled prototipa">
      <Link className="active" to="/__mockup/preview/limen-b/Home"><span className="nav-mark">01</span><span>Početna</span></Link>
      <Link to="/__mockup/preview/limen-b/Room"><span className="nav-mark">02</span><span>Privatna soba</span></Link>
      <span className="nav-caption">Samo vizuelni prikaz</span>
    </nav>
  </div>;
}
