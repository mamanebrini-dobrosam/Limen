import type { ReactNode } from "react";
import { demoUser } from "./fixtures";
import { Link } from "./routing";
export function useAuth() { return { user: demoUser }; }
export function Shell({ children }: { children: ReactNode }) {
  return <div className="shell">
    <header className="topbar">
      <Link className="wordmark" to="/__mockup/preview/limen-a/Home" aria-label="LIMEN početna">
        <img className="brand-image" src="/__mockup/images/limen/slonovaca.png" alt="limen" />
      </Link>
      <span className="prototype-flag">Vizuelni prototip <i>• nije sačuvano</i></span>
    </header>
    <main className="page">{children}</main>
    <nav className="tabbar" aria-label="Prototip navigacija">
      <Link className="active" to="/__mockup/preview/limen-a/Home">Početna</Link>
      <Link to="/__mockup/preview/limen-a/Room">Privatna soba</Link>
    </nav>
  </div>;
}
