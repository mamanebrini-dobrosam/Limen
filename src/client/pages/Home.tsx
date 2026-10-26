import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
      <section className="door" aria-labelledby="door-title">
        <h1 id="door-title">Dobro došao/la, {user?.displayName}.</h1>
        {status?.hostingSessionId ? (
          <>
            <p>Tvoja soba je otvorena. Gosti te čekaju za stolom.</p>
            <Link className="btn" to={`/sto/${status.hostingSessionId}`}>Idi za svoj sto</Link>
          </>
        ) : status?.guestSessionId ? (
          <>
            <p>Sjediš za tuđim stolom. Dok si gost, tvoja soba ostaje zatvorena.</p>
            <Link className="btn" to={`/sto/${status.guestSessionId}`}>Vrati se za sto</Link>
          </>
        ) : (
          <>
            <p>Soba je zatvorena. Niko ne može ući dok je ti ne otvoriš i ne pozoveš goste.</p>
            <button className="btn" onClick={() => (room?.hasPreviousConversation ? setChoose(true) : open("new"))}>Otvori sobu</button>
          </>
        )}
      </section>
      {error && <p className="notice error" role="alert">{error}</p>}

      <h2>Pozivi</h2>
      {invites.length === 0 ? <p className="empty">Trenutno nemaš poziva. Kad te neko pozove za svoj sto, poziv će biti ovdje.</p> : (
        <ul className="list">
          {invites.map((i) => (
            <li key={i.id}>
              <div>
                <div>{i.hostName}</div>
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

      <h2>Obavijesti</h2>
      {notes.length === 0 ? <p className="empty">Nema novih obavijesti.</p> : (
        <ul className="list">
          {notes.map((n) => (
            <li key={n.id}>
              <div>
                <div style={{ fontWeight: n.readAt ? 400 : 600 }}>{describe(n)}</div>
                <div className="meta">{new Date(n.createdAt).toLocaleString("bs-BA")}</div>
              </div>
              {n.type === "contact_request" && <Link className="btn small ghost" to="/kontakti">Pogledaj</Link>}
              {n.type === "entry_request" && status?.hostingSessionId && <Link className="btn small ghost" to={`/sto/${status.hostingSessionId}`}>Za sto</Link>}
            </li>
          ))}
        </ul>
      )}

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
