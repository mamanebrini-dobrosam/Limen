import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { api, type User } from "./api";
import { getSocket, resetSocket } from "./socket";

type AuthCtx = { user: User | null; loading: boolean; refresh: () => Promise<void>; setUser: (u: User | null) => void };
const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, setUser: () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setUserState((await api.get<{ user: User }>("/me")).user); } catch { setUserState(null); }
    setLoading(false);
  }, []);
  const setUser = (u: User | null) => { if (!u) resetSocket(); setUserState(u); };
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ user, loading, refresh, setUser }}>{children}</Ctx.Provider>;
}

/** Broj nepročitanih obavijesti, osvježava se kroz websocket. */
export function useUnread() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user?.emailVerified) return;
    const load = () => api.get<{ unreadNotifications: number }>("/me/status").then((r) => setN(r.unreadNotifications)).catch(() => {});
    load();
    const s = getSocket();
    s.on("notification", load);
    window.addEventListener("limen:read", load);
    return () => { s.off("notification", load); window.removeEventListener("limen:read", load); };
  }, [user]);
  return n;
}

export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const unread = useUnread();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="wordmark">LIMEN<small>mjesto gdje priče žive</small></Link>
      </header>
      <main className="page" style={wide ? { maxWidth: 760 } : undefined}>{children}</main>
      <nav className="tabbar" aria-label="Glavna navigacija">
        <NavLink to="/" end>Početna{unread > 0 && <span className="badge" aria-label={`${unread} novih obavijesti`}>{unread}</span>}</NavLink>
        <NavLink to="/kontakti">Kontakti</NavLink>
        <NavLink to="/moja-soba">Moja soba</NavLink>
        <NavLink to="/postavke">Postavke</NavLink>
      </nav>
    </div>
  );
}

