import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { Shell, useAuth } from "../shell";
import { ConnectByQr } from "./Contacts";
import { RecoveryTools } from "./GuestRecovery";
import { Brand } from "../visual/Brand";

type GuestMessage = { id: number; chatId: string; sender: "owner" | "guest"; body: string; createdAt: string };
type GuestChat = {
  id: string; ownerId: string; ownerName: string; ownerQrId: string; displayName: string;
  status: "pending" | "approved" | "rejected"; createdAt: string; approvedAt: string | null;
  lastMessageAt: string | null; guestLimit: number | null; guestStreak: number; remaining: number | null;
  linkedUserId: string | null; roomOffer: null | { sessionId: string; isContact: boolean };
  lastMessage: GuestMessage | null; unreadCount: number;
};
type ConversationResult = { chat: GuestChat; messages: GuestMessage[]; hasMore: boolean };

const friendlyError = (e: unknown) => e instanceof Error ? e.message : "Nešto nije u redu. Pokušaj ponovo.";
const when = (value: string) => new Date(value).toLocaleString("bs-BA", { dateStyle: "medium", timeStyle: "short" });
export function GuestQr() {
  const { qrId = "" } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [owner, setOwner] = useState<{ id: string; displayName: string } | null>(null);
  const [chat, setChat] = useState<GuestChat | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.emailVerified) return;
    let active = true;
    api.get<{ owner: { id: string; displayName: string }; chat: GuestChat | null }>(`/visitor/qr/${encodeURIComponent(qrId)}`)
      .then((r) => { if (active) { setOwner(r.owner); setChat(r.chat); } })
      .catch((e) => { if (active) setError(friendlyError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qrId, user?.emailVerified]);
  if (user?.emailVerified) return <ConnectByQr />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await api.post<{ chat: GuestChat }>("/visitor/requests", { qrId, displayName: displayName.trim() });
      setChat(r.chat); nav(`/gost/${encodeURIComponent(r.chat.id)}`, { replace: true });
    } catch (e2) { setError(friendlyError(e2)); } finally { setBusy(false); }
  };
  return <div className="shell"><header className="topbar"><Brand /><Link to="/prijava">Prijava</Link></header>
    <main className="page"><p className="visitor-kicker">LIČNI POZIV</p><h1>{loading ? "Provjeravam QR kod…" : owner ? `Razgovor s ${owner.displayName}` : "QR kod nije dostupan"}</h1>
      {error && <p className="notice error" role="alert">{error}</p>}
      {chat && <p className={`notice ${chat.status === "rejected" ? "" : "ok"}`}>{chat.status === "pending" ? "Zahtjev je poslan. Čeka se odluka vlasnika." : chat.status === "approved" ? "Zahtjev je odobren. Razgovor je spreman." : "Ovaj zahtjev nije odobren."}</p>}
      {chat && chat.status !== "rejected" && <Link className="btn block" to={`/gost/${chat.id}`}>Otvori gostujući razgovor</Link>}
      {!loading && owner && !chat && <form onSubmit={submit}>
        <p className="lead">Ostavi ime ili nadimak. Ništa se ne šalje dok izričito ne potvrdiš zahtjev.</p>
        <label className="field"><span>Ime ili nadimak</span><input className="input" maxLength={40} minLength={2} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <button className="btn block" disabled={busy || displayName.trim().length < 2}>{busy ? "Šaljem zahtjev…" : "Pošalji zahtjev"}</button>
      </form>}
      <p className="meta" style={{ marginTop: 18 }}>QR kod ne daje pristup privatnoj sobi ni sadržajima vlasnika.</p>
      <p><Link to="/skeniraj">Skeniraj drugi kod</Link> · <Link to="/gost-razgovori">Moji gostujući razgovori</Link></p>
    </main>
  </div>;
}

export function GuestConversations() {
  const [chats, setChats] = useState<GuestChat[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api.get<{ chats: GuestChat[] }>("/visitor/mine").then((r) => { setChats(r.chats); setError(""); }).catch((e) => setError(friendlyError(e))), []);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  return <div className="shell"><header className="topbar"><Brand /><Link to="/prijava">Prijava</Link></header>
    <main className="page"><p className="visitor-kicker">GOSTUJUĆI PRISTUP</p><h1>Moji razgovori</h1><p className="lead">Otvori ih u istom pregledniku ili ih oporavi pomoću unaprijed sačuvanog tajnog ključa.</p>
      <p><Link to="/gost-oporavak">Oporavi razgovor tajnim ključem</Link></p>
      {error && <p className="notice error">{error} <button className="btn small ghost" onClick={load}>Pokušaj ponovo</button></p>}
      {!chats ? <p className="empty">Učitavanje razgovora…</p> : chats.length === 0 ? <div className="notice"><strong>Još nema razgovora.</strong><p className="meta">Skeniraj QR kod i pošalji zahtjev vlasniku.</p><Link className="btn" to="/skeniraj">Skeniraj QR kod</Link></div> :
        <ul className="list">{chats.map((c) => <li key={c.id}><div><strong>{c.ownerName}</strong>{c.unreadCount > 0 && <span className="badge" aria-label={`${c.unreadCount} nepročitanih poruka`}>{c.unreadCount}</span>}<div className="meta">{c.lastMessage?.body ?? (c.status === "pending" ? "Čeka se odobrenje" : c.status === "rejected" ? "Zahtjev nije odobren" : "Razgovor je otvoren")}</div></div><Link className="btn small ghost" to={`/gost/${c.id}`}>Otvori</Link></li>)}</ul>}
      <p><Link to="/prijava">Prijava / registracija</Link></p>
    </main>
  </div>;
}

function VisitorThread({ id, ownerMode = false }: { id: string; ownerMode?: boolean }) {
  const { user } = useAuth();
  const version = useRef(0);
  const loadSequence = useRef(0);
  const draftRef = useRef("");
  const lastRead = useRef(0);
  const fullyLoaded = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [limitText, setLimitText] = useState("");
  const limitDraftDirty = useRef(false);
  const base = ownerMode ? `/visitor/owner/${encodeURIComponent(id)}` : `/visitor/conversations/${encodeURIComponent(id)}`;
  const clearAccess = () => { setUnavailable(true); setResult(null); setMessages([]); };
  const load = useCallback(async (scroll = false) => {
    const v = version.current;
    const seq = ++loadSequence.current;
    try {
      const r = await api.get<ConversationResult>(ownerMode ? `${base}` : base);
      if (version.current !== v || loadSequence.current !== seq) return;
      if (!r.hasMore) fullyLoaded.current = true;
      setResult({ ...r, hasMore: !fullyLoaded.current && r.hasMore }); setMessages((old) => {
        const map = new Map(old.map((m) => [m.id, m])); r.messages.forEach((m) => map.set(m.id, m));
        return [...map.values()].sort((a, b) => a.id - b.id);
      });
      if (!limitDraftDirty.current) setLimitText(r.chat.guestLimit === null ? "" : String(r.chat.guestLimit));
      setError(""); setUnavailable(false); setLoading(false);
      const unread = r.messages.filter((m) => ownerMode ? m.sender === "guest" : m.sender === "owner");
      const candidate = unread.length ? Math.max(...unread.map((m) => m.id)) : 0;
      if (candidate > lastRead.current && document.visibilityState === "visible") {
        lastRead.current = candidate;
        void api.post(`${base}/read`, { messageId: candidate }).catch((e) => {
          lastRead.current = 0;
          if (e instanceof ApiError && (e.status === 403 || e.status === 404)) { setError(friendlyError(e)); clearAccess(); }
        });
      }
      if (scroll) requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    } catch (e) {
      if (version.current !== v || loadSequence.current !== seq) return;
      setError(friendlyError(e)); setLoading(false);
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) clearAccess();
    }
  }, [base, ownerMode]);
  useEffect(() => {
    version.current++; loadSequence.current++; fullyLoaded.current = false; setBusy(false); setOlderBusy(false); limitDraftDirty.current = false; setSuccess(""); setLoading(true); setUnavailable(false); setResult(null); setMessages([]); setDraft(""); draftRef.current = ""; setError(""); lastRead.current = 0;
    void load(true);
  }, [id, load]);
  useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible" && !unavailable) void load(); };
    const timer = window.setInterval(poll, 3000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); version.current++; };
  }, [load, unavailable]);

  const send = async (e: FormEvent) => {
    e.preventDefault(); const body = draft.trim(); if (!body || busy || unavailable) return;
    const v = version.current; setBusy(true); setError("");
    try {
      const r = await api.post<{ message: GuestMessage }>(`${base}/messages`, { body });
      if (version.current !== v) return;
      setMessages((old) => old.some((m) => m.id === r.message.id) ? old : [...old, r.message].sort((a, b) => a.id - b.id));
      if (draftRef.current.trim() === body) { draftRef.current = ""; setDraft(""); }
      void load();
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    } catch (e2) { if (version.current === v) { setError(friendlyError(e2)); if (e2 instanceof ApiError && (e2.status === 403 || e2.status === 404)) clearAccess(); } }
    finally { if (version.current === v) setBusy(false); }
  };
  const loadOlder = async () => {
    const oldest = messages[0]; if (!oldest || olderBusy || !result?.hasMore) return;
    const v = version.current; setOlderBusy(true);
    try {
      const r = await api.get<ConversationResult>(`${base}?before=${oldest.id}`);
      if (version.current !== v) return;
      if (!r.hasMore) fullyLoaded.current = true;
      setMessages((old) => { const ids = new Set(old.map((m) => m.id)); return [...r.messages.filter((m) => !ids.has(m.id)), ...old]; });
      setResult((old) => old ? { ...old, hasMore: r.hasMore } : old); setError("");
    } catch (e) { if (version.current === v) { setError(friendlyError(e)); if (e instanceof ApiError && (e.status === 403 || e.status === 404)) clearAccess(); } }
    finally { if (version.current === v) setOlderBusy(false); }
  };
  const act = async (action: "approve" | "reject" | "room-offer") => {
    setBusy(true); setError("");
    try { await api.post(`${base}/${action}`); await load(); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const saveLimit = async (e: FormEvent) => {
    e.preventDefault();
    const n = limitText.trim() === "" ? null : Number(limitText);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1000)) { setError("Unesi broj od 1 do 1000 ili ostavi prazno za neograničeno."); return; }
    try { await api.patch(`${base}/limit`, { limit: n }); limitDraftDirty.current = false; await load(); }
    catch (e2) { setError(friendlyError(e2)); }
  };
  const sendRoomInvitation = async () => {
    if (!chat?.linkedUserId || !chat.roomOffer?.isContact || !chat.roomOffer.sessionId) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.post(`/sessions/${encodeURIComponent(chat.roomOffer.sessionId)}/invitations`, { userId: chat.linkedUserId });
      setSuccess("Pozivnica je poslana. Gost će je vidjeti na početnoj stranici; ulazak i dalje čeka tvoje odobrenje.");
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const claim = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const password = new FormData(e.currentTarget).get("password");
    try { await api.post(`${base}/claim`, { password }); await load(); }
    catch (e) { setError(friendlyError(e)); }
  };
  const chat = result?.chat;
  const allowed = chat?.status === "approved";
  const remaining = chat?.remaining;
  const locked = !ownerMode && remaining === 0;

  return <div className={ownerMode ? "" : "shell"}>
    {!ownerMode && <header className="topbar"><Brand /><Link to="/prijava">Prijava</Link></header>}
    <div className={ownerMode ? "visitor-chat-page" : "page visitor-chat-page"}>
      <p><Link to={ownerMode ? "/chat" : "/gost-razgovori"}>← {ownerMode ? "Razgovori" : "Moji razgovori"}</Link></p>
      <p className="visitor-kicker">{ownerMode ? "ZAHTJEV GOSTA" : "PRIVATNI RAZGOVOR"}</p>
      <h1>{ownerMode ? chat?.displayName ?? "Gostujući razgovor" : chat?.ownerName ?? "Gostujući razgovor"}</h1>
      <p className="lead">Razgovor se briše nakon 30 dana bez nove poruke. Ovaj chat ne daje pristup sobi.</p>
      {error && <p className="notice error" role="alert">{error} {!unavailable && <button className="btn small ghost" onClick={() => load()}>Pokušaj ponovo</button>}</p>}
      {loading ? <div className="empty">Učitavanje razgovora…</div> : unavailable ? <div className="notice">Ovaj razgovor više nije dostupan.</div> : chat && <>
        {chat.status === "pending" && <div className="notice">Zahtjev čeka ručnu odluku vlasnika.</div>}
        {chat.status === "rejected" && <div className="notice">Ovaj zahtjev nije odobren.</div>}
        {ownerMode && chat.status === "pending" && <div className="row visitor-actions"><button className="btn" disabled={busy} onClick={() => act("approve")}>Odobri razgovor</button><button className="btn danger" disabled={busy} onClick={() => act("reject")}>Odbij zahtjev</button></div>}
        {ownerMode && chat.status === "approved" && <section className="visitor-controls">
          <form className="row" onSubmit={saveLimit}><label className="field visitor-limit"><span>Uzastopne poruke gosta</span><input className="input" type="number" min="1" max="1000" value={limitText} onChange={(e) => { limitDraftDirty.current = true; setLimitText(e.target.value); }} placeholder="Neograničeno" /></label><button className="btn small warm">Sačuvaj</button></form>
          <p className="meta">Prazno znači neograničeno. Vlasnik može slati poruke bez ograničenja.</p>
          <button className="btn ghost" disabled={busy} onClick={() => act("room-offer")}>Ponudi ulazak u otvorenu sobu</button>
          {chat.linkedUserId && chat.roomOffer?.isContact && chat.roomOffer.sessionId && <><p className="meta">Gost je registrovan i kontakt je odobren. Pozivnica ne odobrava ulazak — gost će je vidjeti na početnoj stranici, zatražiti ulazak, a ti ga posebno odobravaš u sobi.</p><button className="btn ghost" disabled={busy} onClick={sendRoomInvitation}>Pošalji pozivnicu za sto</button></>}
          {chat.roomOffer && !chat.roomOffer.isContact && <p className="meta">Da bi poziv bio upućen, gost treba zatražiti kontakt preko tvog QR koda, a ti ga odobri na stranici <Link to="/kontakti">Kontakti</Link>.</p>}
          {chat.roomOffer && !chat.linkedUserId && <p className="meta">Ponuda je poslata. Gost mora imati profil, potvrditi email i potvrditi lozinku u ovom razgovoru. Ponuda ne predstavlja ulazak.</p>}
          {!chat.roomOffer && <p className="meta">Za ponudu je potrebna trenutno otvorena soba. Samo pozivnica, kontakt i vlasničko odobrenje u sobi omogućavaju ulazak.</p>}
        </section>}
        {success && <p className="notice ok" role="status">{success}</p>}
        {!ownerMode && chat.roomOffer && <section className="notice visitor-offer"><strong>Poziv u sobu — potrebno je još nekoliko koraka</strong><p>Ovo nije ulaznica. Napravi ili otvori profil, potvrdi email, zatraži kontakt od vlasnika i sačekaj njegovu pozivnicu i odobrenje za ulazak.</p>
          {!user ? <div className="row"><Link className="btn" to={`/registracija?dalje=${encodeURIComponent(`/gost/${id}`)}`}>Napravi profil</Link><Link className="btn ghost" to={`/prijava?dalje=${encodeURIComponent(`/gost/${id}`)}`}>Prijavi se</Link></div> :
            user.emailVerified ? <form onSubmit={claim}><label className="field"><span>Potvrdi identitet lozinkom</span><input className="input" type="password" name="password" autoComplete="current-password" required /></label><button className="btn">Potvrdi i poveži profil</button></form>
              : <Link className="btn" to="/potvrda">Potvrdi email</Link>}
          {chat.ownerQrId && <p><Link to={`/c/${chat.ownerQrId}`}>Zatraži kontakt od vlasnika</Link></p>}
          <p><Link to="/">Otvori početnu stranicu i pregledaj pozive za sobu</Link></p>
        </section>}
        <section className="direct-thread visitor-thread" aria-label="Poruke">
          {result.hasMore && <button className="btn small ghost" disabled={olderBusy} onClick={loadOlder}>{olderBusy ? "Učitavanje…" : "Učitaj starije poruke"}</button>}
          {!allowed ? <p className="empty">Razgovor se otvara tek nakon odobrenja vlasnika.</p> : messages.length === 0 ? <p className="empty">Ovdje možete započeti razgovor.</p> : messages.map((m) => <article key={m.id} className={`direct-message${(ownerMode ? m.sender === "owner" : m.sender === "guest") ? " mine" : ""}`}><div className="meta">{m.sender === "owner" ? chat.ownerName : chat.displayName} · {when(m.createdAt)}</div><p>{m.body}</p></article>)}
          <div ref={bottom} />
        </section>
        {allowed && <form className="direct-compose" onSubmit={send}>
          {!ownerMode && locked && <p className="notice">Dosegao/la si ograničenje od {chat.guestLimit ?? 2} uzastopne poruke. Sačekaj odgovor vlasnika.</p>}
          {!ownerMode && remaining !== null && remaining !== undefined && remaining > 0 && <p className="meta">Preostalo poruka prije odgovora vlasnika: {remaining}</p>}
          <textarea className="textarea" maxLength={4000} rows={2} value={draft} onChange={(e) => { draftRef.current = e.target.value; setDraft(e.target.value); }} placeholder="Napiši poruku…" disabled={!allowed || busy || locked || unavailable} aria-label="Poruka" />
          <div className="row" style={{ justifyContent: "space-between" }}><span className="meta">{draft.length}/4000</span><button className="btn" disabled={!draft.trim() || busy || locked}>{busy ? "Šaljem…" : "Pošalji"}</button></div>
        </form>}
        {!ownerMode && allowed && !unavailable && <RecoveryTools key={id} id={id} />}
      </>}
    </div>
    {!ownerMode && <nav className="tabbar" aria-label="Navigacija"><Link to="/skeniraj">Skeniraj</Link><Link to="/gost-razgovori">Razgovori</Link><Link to="/prijava">Prijava</Link></nav>}
  </div>;
}

export function GuestConversation() { const { id = "" } = useParams(); return <VisitorThread id={id} />; }
export function OwnerGuestConversation() { const { id = "" } = useParams(); return <Shell><VisitorThread id={id} ownerMode /></Shell>; }
