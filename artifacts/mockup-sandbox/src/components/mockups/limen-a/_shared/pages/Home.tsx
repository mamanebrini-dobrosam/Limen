import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "../routing";
import { api } from "../api";
import { getSocket } from "../socket";
import { Shell, useAuth } from "../shell";

type Status = { hostingSessionId: string | null; guestSessionId: string | null };
type Invitation = { id: string; sessionId: string; hostName: string; status: "pending" | "missed"; requested: boolean };
type Notification = { id: string; type: string; payload: Record<string, string>; createdAt: string; readAt: string | null };

function describe(n: Notification): string {
  const p = n.payload;
  switch (n.type) {
    case "contact_request": return `${p.displayName} želi te dodati u kontakte.`;
    case "contact_accepted": return `${p.displayName} je prihvatio/la kontakt.`;
    case "direct_request": return `${p.displayName} želi započeti privatni razgovor.`;
    case "direct_approved": return `${p.displayName} je odobrio/la privatni razgovor.`;
    case "direct_rejected": return "Zahtjev za privatni razgovor nije odobren.";
    case "direct_message": return `${p.displayName} ti je poslao/la poruku.`;
    case "visitor_request": return `${p.displayName} želi započeti gostujući razgovor.`;
    case "visitor_approved": return `${p.displayName} je odobrio/la gostujući razgovor.`;
    case "visitor_rejected": return "Gostujući zahtjev za razgovor nije odobren.";
    case "visitor_message": return `${p.displayName} ti je poslao/la poruku.`;
    case "invitation": return `${p.hostName} te poziva za svoj sto.`;
    case "entry_request": return `${p.displayName} traži ulazak u tvoju sobu.`;
    case "entry_rejected": return "Domaćin nije odobrio ulazak.";
    case "seated": return p.placedAbsent ? "Domaćin te postavio za svoj sto." : "Domaćin je odobrio ulazak.";
    case "guest_block": return p.message;
    case "report_in_room": return p.message;
    default: return "Nova obavijest.";
  }
}

export function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [room, setRoom] = useState<{ hasPreviousConversation: boolean } | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [choose, setChoose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [st, rm, inv, nt] = await Promise.all([
      api.get<Status>("/me/status"),
      api.get<{ hasPreviousConversation: boolean }>("/rooms/mine"),
      api.get<{ invitations: Invitation[] }>("/invitations"),
      api.get<{ notifications: Notification[] }>("/me/notifications"),
    ]);
    setStatus(st); setRoom(rm); setInvites(inv.invitations); setNotes(nt.notifications.slice(0, 20));
  }, []);

  useEffect(() => {
    load().catch(() => {});
    const s = getSocket();
    const reload = () => load().catch(() => {});
    s.on("notification", reload); s.on("session:closed", reload); s.on("invitation:revoked", reload);
    return () => { s.off("notification", reload); s.off("session:closed", reload); s.off("invitation:revoked", reload); };
  }, [load]);

  useEffect(() => {
    if (notes.some((n) => !n.readAt)) {
      const t = setTimeout(() => api.post("/me/notifications/read-all").then(() => window.dispatchEvent(new Event("limen:read"))).catch(() => {}), 1500);
      return () => clearTimeout(t);
    }
  }, [notes]);

  const open = async (mode: "new" | "continue") => {
    setError(null);
    try { const r = await api.post<{ sessionId: string }>("/rooms/mine/open", { mode }); nav(`/sto/${r.sessionId}`); }
    catch (e) { setError((e as Error).message); setChoose(false); }
  };

  const requestEntry = async (inv: Invitation) => {
    setError(null);
    try {
      const r = await api.post<{ status: string }>(`/invitations/${inv.id}/request-entry`);
      if (r.status === "seated") nav(`/sto/${inv.sessionId}`); else load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Shell>
      <div className="home-heading">
        <p className="eyebrow">Tvoj privatni prostor</p>
        <h1>Dobro došla, {user?.displayName}.</h1>
        <p>Mjesto za mali krug i razgovore koji imaju vremena.</p>
      </div>

      <div className="home-grid">
        <section className="door" aria-labelledby="door-title">
          <div className="door-topline"><span className="status-dot" /><span>{status?.hostingSessionId ? "Soba je otvorena" : status?.guestSessionId ? "U posjeti" : "Soba je zatvorena"}</span></div>
          <h2 id="door-title">Tvoj sto, tvoj ritam.</h2>
          {status?.hostingSessionId ? (
            <>
              <p>Tvoja soba je otvorena. Gosti te čekaju za stolom.</p>
              <Link className="btn" to="/__mockup/preview/limen-a/Room">Idi za svoj sto</Link>
            </>
          ) : status?.guestSessionId ? (
            <>
              <p>Sjediš za tuđim stolom. Dok si gost, tvoja soba ostaje zatvorena.</p>
              <Link className="btn" to="/__mockup/preview/limen-a/Room">Vrati se za sto</Link>
            </>
          ) : (
            <>
              <p>Soba je zatvorena. Niko ne može ući dok je ti ne otvoriš i ne pozoveš goste.</p>
              <button className="btn" onClick={() => (room?.hasPreviousConversation ? setChoose(true) : open("new"))}>Otvori sobu</button>
            </>
          )}
          <div className="door-footnote"><span>01</span><span>Samo pozvani mogu sjesti za sto.</span></div>
        </section>
        {error && <p className="notice error" role="alert">{error}</p>}

        <section className="home-panel invitation-panel" aria-labelledby="invites-title">
          <div className="panel-heading"><div><p className="eyebrow">Kad te neko pozove</p><h2 id="invites-title">Pozivi</h2></div><span className="panel-count">{invites.length.toString().padStart(2, "0")}</span></div>
          {invites.length === 0 ? <p className="empty">Trenutno nemaš poziva. Kad te neko pozove za svoj sto, poziv će biti ovdje.</p> : (
            <ul className="list">
              {invites.map((i) => (
                <li key={i.id}>
                  <div>
                    <div className="list-primary">{i.hostName}</div>
                    <div className="meta">{i.status === "missed" ? "Propušten poziv – soba je još otvorena" : "Poziv za sto"}</div>
                  </div>
                  {i.requested ? <span className="meta">Čeka se odobrenje domaćina</span> : (
                    <div className="row">
                      <button className="btn small" onClick={() => requestEntry(i)}>Zatraži ulazak</button>
                      <button className="btn small ghost" onClick={() => api.post(`/invitations/${i.id}/decline`).then(load)}>Odbij</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="home-panel notifications-panel" aria-labelledby="notes-title">
          <div className="panel-heading"><div><p className="eyebrow">Važne sitnice</p><h2 id="notes-title">Obavijesti</h2></div><span className="panel-count">{notes.length.toString().padStart(2, "0")}</span></div>
          {notes.length === 0 ? <p className="empty">Nema novih obavijesti.</p> : (
            <ul className="list">
              {notes.map((n) => (
                <li key={n.id}>
                  <div>
                    <div className="list-primary" style={{ fontWeight: n.readAt ? 400 : 600 }}>{describe(n)}</div>
                    <div className="meta">{new Date(n.createdAt).toLocaleString("bs-BA")}</div>
                  </div>
                  {n.type === "contact_request" && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Home">Pogledaj</Link>}
                  {n.type === "direct_request" && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Home">Pogledaj</Link>}
                  {n.type === "visitor_request" && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Home">Pogledaj</Link>}
                  {["visitor_approved", "visitor_rejected", "visitor_message"].includes(n.type) && n.payload.visitorChatId && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Room">Otvori razgovor</Link>}
                  {(n.type === "direct_approved" || n.type === "direct_message") && n.payload.conversationId && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Room">Otvori razgovor</Link>}
                  {n.type === "direct_rejected" && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Home">Pogledaj zahtjeve</Link>}
                  {n.type === "entry_request" && status?.hostingSessionId && <Link className="btn small ghost" to="/__mockup/preview/limen-a/Room">Za sto</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {choose && (
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="choose-title">
          <div className="dialog-box">
            <p id="choose-title">Kako želiš otvoriti sobu?</p>
            <div className="stack">
              <button className="btn block" onClick={() => open("continue")}>Nastavi razgovor</button>
              <button className="btn ghost block" onClick={() => open("new")}>Započni novi razgovor</button>
              <button className="btn ghost block" onClick={() => setChoose(false)}>Odustani</button>
            </div>
            <p className="meta" style={{ fontSize: 13, marginTop: 14, color: "var(--tekst-blag)" }}>
              U nastavljenom razgovoru gosti vide samo poruke iz vremena kad su sjedili za stolom.
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}
