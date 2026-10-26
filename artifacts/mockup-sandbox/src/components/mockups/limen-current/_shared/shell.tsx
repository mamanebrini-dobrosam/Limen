import type { ReactNode } from "react";
import { demoUser } from "./fixtures";
export function useAuth() { return { user: demoUser }; }
export function Shell({ children }: { children: ReactNode }) {
  return <div className="shell">
    <header className="topbar"><a className="wordmark"><img className="brand-image" src="/__mockup/images/limen/slonovaca.png" alt="limen" /></a></header>
    <main className="page">{children}</main>
    <nav className="tabbar" aria-label="Glavna navigacija">{["Početna", "Chat", "Kontakti", "Moja soba", "Postavke"].map((text, i) => <a key={text} className={i === 0 ? "active" : ""}>{text}</a>)}</nav>
  </div>;
}
