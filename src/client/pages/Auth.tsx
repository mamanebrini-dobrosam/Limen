import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type User } from "../api";
import { useAuth } from "../shell";

function safeReturn(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u0020]/.test(value) ? value : "/";
}
function returnPath(params: URLSearchParams) {
  const fromQuery = params.get("dalje");
  if (fromQuery) {
    const safe = safeReturn(fromQuery);
    if (safe !== "/") sessionStorage.setItem("limen:return", safe);
    return safe;
  }
  return safeReturn(sessionStorage.getItem("limen:return"));
}

function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar"><Link to="/" className="wordmark">LIMEN<small>mjesto gdje priče žive</small></Link></header>
      <main className="page">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </main>
    </div>
  );
}

function useForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setError(null); setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : "Nešto nije u redu. Pokušaj ponovo."); }
    setBusy(false);
  };
  return { error, busy, run };
}

export function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const f = useForm();
  return (
    <AuthFrame title="Prijava" lead="Uđi u svoj LIMEN.">
      <form onSubmit={(e) => { e.preventDefault(); f.run(async () => {
        const r = await api.post<{ user: User }>("/auth/login", { email, password });
        const next = returnPath(params); setUser(r.user); nav(next);
      }); }}>
        <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Lozinka</span><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {f.error && <p className="notice error" role="alert">{f.error}</p>}
        <button className="btn block" disabled={f.busy}>Prijavi se</button>
      </form>
      <p className="row" style={{ justifyContent: "space-between", marginTop: 18 }}>
        <Link to={`/registracija?dalje=${encodeURIComponent(safeReturn(params.get("dalje")))}`}>Napravi nalog</Link>
        <Link to="/zaboravljena-lozinka">Zaboravljena lozinka</Link>
      </p>
      <p className="meta"><Link to="/skeniraj">Skeniraj QR kod</Link> · <Link to="/gost-razgovori">Gostujući razgovori</Link></p>
    </AuthFrame>
  );
}

export function Register() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [v, setV] = useState({ displayName: "", email: "", password: "", birthDate: "", confirmAdult: false });
  const f = useForm();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <AuthFrame title="Novi nalog" lead="LIMEN je privatni dom: ti odlučuješ ko prelazi prag. Trenutno je dostupan osobama od 18 godina i starijim.">
      <form onSubmit={(e) => { e.preventDefault(); f.run(async () => {
        const r = await api.post<{ user: User }>("/auth/register", v);
        returnPath(new URLSearchParams(window.location.search));
        setUser(r.user); nav("/potvrda");
      }); }}>
        <label className="field"><span>Ime koje drugi vide</span><input className="input" required minLength={2} maxLength={40} value={v.displayName} onChange={set("displayName")} /></label>
        <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" required value={v.email} onChange={set("email")} /></label>
        <label className="field"><span>Lozinka</span><input className="input" type="password" autoComplete="new-password" required minLength={10} value={v.password} onChange={set("password")} /><small>Najmanje 10 znakova.</small></label>
        <label className="field"><span>Datum rođenja</span><input className="input" type="date" required value={v.birthDate} onChange={set("birthDate")} /></label>
        <label className="check"><input type="checkbox" checked={v.confirmAdult} onChange={set("confirmAdult")} required /><span>Potvrđujem da imam najmanje 18 godina.</span></label>
        {f.error && <p className="notice error" role="alert">{f.error}</p>}
        <button className="btn block" disabled={f.busy}>Napravi nalog</button>
      </form>
      <p style={{ marginTop: 18 }}>Već imaš nalog? <Link to="/prijava">Prijavi se</Link></p>
    </AuthFrame>
  );
}

export function Verify() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const verification = useRef<{ token: string; promise: Promise<unknown> } | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setMsg(null); setConfirmed(false);
    // Repeated effects must not consume a single-use token twice.
    if (verification.current?.token !== token) verification.current = { token, promise: api.post("/auth/verify-email", { token }) };
    verification.current.promise
      .then(async () => {
        if (!active) return;
        setMsg({ ok: true, text: "Email je potvrđen." }); setConfirmed(true); await refresh();
      }).catch((e) => { if (active) setMsg({ ok: false, text: e.message }); });
    return () => { active = false; };
  }, [token, refresh]);
  useEffect(() => {
    if (user?.emailVerified && !token) nav(safeReturn(sessionStorage.getItem("limen:return")), { replace: true });
  }, [user?.emailVerified, token, nav]);
  if (user?.emailVerified && !token) return null;
  return (
    <AuthFrame title="Potvrdi email" lead={user ? `Poslali smo link na ${user.email}. Otvori ga da potvrdiš adresu.` : undefined}>
      {msg && <p className={`notice ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}
      {confirmed && <Link className="btn block" to={safeReturn(sessionStorage.getItem("limen:return"))} onClick={() => sessionStorage.removeItem("limen:return")}>Nastavi</Link>}
      {user && !user.emailVerified && !confirmed && (
        <div className="stack">
          <button className="btn ghost block" onClick={() => api.post("/auth/resend-verification").then(() => setMsg({ ok: true, text: "Novi link je poslan." })).catch((e) => setMsg({ ok: false, text: e.message }))}>Pošalji link ponovo</button>
          <button className="btn ghost block" onClick={() => refresh()}>Već sam potvrdio/la</button>
        </div>
      )}
      {!user && !token && <Link to="/prijava">Prijavi se</Link>}
    </AuthFrame>
  );
}

export function Forgot() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false);
  const f = useForm();
  return (
    <AuthFrame title="Zaboravljena lozinka" lead="Upiši email i poslaćemo ti link za novu lozinku.">
      {sent ? <p className="notice ok">Ako nalog s ovom adresom postoji, link je poslan. Važi 1 sat.</p> : (
        <form onSubmit={(e) => { e.preventDefault(); f.run(async () => { await api.post("/auth/forgot-password", { email }); setSent(true); }); }}>
          <label className="field"><span>Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {f.error && <p className="notice error">{f.error}</p>}
          <button className="btn block" disabled={f.busy}>Pošalji link</button>
        </form>
      )}
      <p style={{ marginTop: 18 }}><Link to="/prijava">Nazad na prijavu</Link></p>
    </AuthFrame>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState(""); const [done, setDone] = useState(false);
  const f = useForm();
  return (
    <AuthFrame title="Nova lozinka" lead="Nova lozinka odjavljuje te sa svih uređaja.">
      {done ? <p className="notice ok">Lozinka je promijenjena. <Link to="/prijava">Prijavi se</Link></p> : (
        <form onSubmit={(e) => { e.preventDefault(); f.run(async () => { await api.post("/auth/reset-password", { token: params.get("token"), password }); setDone(true); }); }}>
          <label className="field"><span>Nova lozinka</span><input className="input" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {f.error && <p className="notice error">{f.error}</p>}
          <button className="btn block" disabled={f.busy}>Sačuvaj lozinku</button>
        </form>
      )}
    </AuthFrame>
  );
}
