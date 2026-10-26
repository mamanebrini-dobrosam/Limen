import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../api";
import { Shell, useAuth } from "../shell";

type Contact = { userId: string; displayName: string; expiresAt: string };
type Req = { id: string; userId: string; displayName: string };

function daysLeft(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000));
}

export function MyQr() {
  const { user } = useAuth();
  const [src, setSrc] = useState("");
  const link = `${window.location.origin}/c/${user?.qrId}`;
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 440, color: { dark: "#26384A", light: "#FFFAF3" } }).then(setSrc);
  }, [link]);
  return (
    <div className="qr-card">
      {src && <img src={src} alt="Tvoj LIMEN QR kod" />}
      <p style={{ margin: "4px 0 6px" }}>Pokaži ovaj kod osobi koju želiš dodati.</p>
      <p className="meta" style={{ fontSize: 13, color: "var(--tekst-blag)", margin: "0 0 8px" }}>Skeniranje otvara izbor: možeš zatražiti kontakt ili poslati poseban zahtjev za privatni razgovor. Razgovor počinje tek nakon odobrenja.</p>
      <code>{user?.qrId}</code>
    </div>
  );
}

export function Contacts() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [code, setCode] = useState("");
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      api.get<{ contacts: Contact[] }>(`/contacts?q=${encodeURIComponent(q)}`),
      api.get<{ requests: Req[] }>("/contacts/requests"),
    ]);
    setContacts(c.contacts); setRequests(r.requests);
  }, [q]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  return (
    <Shell>
      <h1>Kontakti</h1>
      <p className="lead">Kontakt ostaje u pretrazi 90 dana od posljednjeg zajedničkog druženja. Nakon toga treba ponovo skenirati QR kod.</p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn warm" onClick={() => setShowQr(!showQr)}>{showQr ? "Sakrij moj QR kod" : "Prikaži moj QR kod"}</button>
      </div>
      {showQr && <MyQr />}

      <h2>Dodaj kontakt</h2>
      <p className="lead" style={{ marginBottom: 10 }}>Skeniraj tuđi QR kamerom telefona ili upiši kod ispod njega.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const c = code.trim().split("/").pop(); if (c) nav(`/c/${c}`); }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Kod sa QR kartice" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Kod sa QR kartice" />
        <button className="btn">Nastavi</button>
      </form>

      {requests.length > 0 && (
        <>
          <h2>Zahtjevi za kontakt</h2>
          <ul className="list">
            {requests.map((r) => (
              <li key={r.id}>
                <span>{r.displayName}</span>
                <div className="row">
                  <button className="btn small" onClick={() => api.post(`/contacts/requests/${r.id}/accept`).then(load)}>Prihvati</button>
                  <button className="btn small ghost" onClick={() => api.post(`/contacts/requests/${r.id}/reject`).then(load)}>Odbij</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Moji kontakti</h2>
      <input className="input" placeholder="Pretraži kontakte" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pretraži kontakte" style={{ marginBottom: 10 }} />
      {contacts.length === 0 ? <p className="empty">{q ? "Nema kontakta s tim imenom." : "Još nemaš kontakata. Pokaži nekome svoj QR kod."}</p> : (
        <ul className="list">
          {contacts.map((c) => (
            <li key={c.userId}>
              <div>
                <div>{c.displayName}</div>
                <div className="meta">Ističe za {daysLeft(c.expiresAt)} dana</div>
              </div>
              <div className="row">
                <button className="btn small ghost" onClick={() => { if (confirm(`Ukloniti ${c.displayName} iz kontakata?`)) api.del(`/contacts/${c.userId}`).then(load); }}>Ukloni</button>
                <button className="btn small danger" onClick={() => { if (confirm(`Blokirati ${c.displayName}? Neće ti moći slati zahtjeve niti sjediti za istim stolom.`)) api.post("/blocks", { userId: c.userId }).then(load); }}>Blokiraj</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** Otvara se skeniranjem tuđeg QR koda kamerom telefona. */
export function ConnectByQr() {
  const { qrId } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ owner: { id: string; displayName: string }; self: boolean; conversationId: string | null; request: { id: string; status: "pending" | "rejected" | "approved"; direction: "incoming" | "outgoing"; retryAt: string | null } | null; canRequest: boolean; unavailable: boolean } | null>(null);
  const [contact, setContact] = useState<{ displayName: string; self: boolean; alreadyContact: boolean; pending: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatSent, setChatSent] = useState(false);
  const [contactSent, setContactSent] = useState<string | null>(null);
  const [busy, setBusy] = useState<"chat" | "contact" | null>(null);
  useEffect(() => {
    let current = true;
    Promise.all([
      api.get<NonNullable<typeof info>>(`/direct/qr/${qrId}`),
      api.get<NonNullable<typeof contact>>(`/contacts/qr/${qrId}`),
    ]).then(([direct, legacy]) => {
      if (!current) return;
      if (direct.conversationId) { nav(`/chat/${direct.conversationId}`, { replace: true }); return; }
      setInfo(direct); setContact(legacy);
    }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [qrId, nav]);
  const sendChatRequest = async () => {
    if (!qrId || busy || !info?.canRequest) return;
    setBusy("chat"); setError(null);
    try {
      const result = await api.post<{ request: { id: string; status: "pending" | "rejected" | "approved"; direction: "incoming" | "outgoing"; retryAt: string | null }; conversationId: string | null }>("/direct/requests", { qrId });
      if (result.conversationId) nav(`/chat/${result.conversationId}`);
      else { setChatSent(true); setInfo((current) => current ? { ...current, request: result.request, canRequest: false } : current); }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  const sendContactRequest = async () => {
    if (!qrId || busy) return;
    setBusy("contact"); setError(null);
    try {
      const result = await api.post<{ status: string }>("/contacts/request", { qrId });
      setContactSent(result.status === "accepted" ? `Ti i ${contact?.displayName ?? ""} ste sada kontakti.` : "Zahtjev za kontakt je poslan.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <Shell>
      <h1>Poveži se</h1>
      {error && <p className="notice error">{error}</p>}
      {!info && !error && <p className="empty">Provjeravam QR kod…</p>}
      {info?.self && <p className="notice">Ovo je tvoj QR kod.</p>}
      {info?.unavailable && <p className="notice">Ovaj QR kod trenutno nije dostupan.</p>}
      {info && !info.self && !info.unavailable && <>
        <p className="lead">QR kod pripada <strong>{info.owner.displayName}</strong>.</p>
        {info.request?.status === "pending" && <p className="notice">{info.request.direction === "outgoing" ? "Zahtjev za privatni razgovor je poslan i čeka odobrenje." : "Ova osoba ti je već poslala zahtjev za razgovor. Možeš ga pregledati u zahtjevima."}</p>}
        {info.request?.status === "rejected" && <p className="notice">Prethodni zahtjev za razgovor nije odobren.{info.request.retryAt ? ` Novi zahtjev možeš poslati nakon ${new Date(info.request.retryAt).toLocaleDateString("bs-BA")}.` : ""}</p>}
        <section className="notice" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: "0 0 6px" }}>Privatni razgovor</h2>
          <p className="meta">Zahtjev se šalje ručno. Razgovor se otvara tek kada ga druga osoba odobri; samo skeniranje ništa ne šalje.</p>
          {chatSent ? <p className="notice ok">Zahtjev za razgovor je poslan. Čeka se odobrenje.</p> : info.canRequest && <button className="btn block" disabled={busy !== null} onClick={sendChatRequest}>{busy === "chat" ? "Šaljem…" : "Zatraži privatni razgovor"}</button>}
          {info.request?.direction === "incoming" && info.request.status === "pending" && <Link className="btn ghost block" to="/chat/zahtjevi">Pregledaj zahtjev</Link>}
        </section>
        <section className="notice">
          <h2 style={{ margin: "0 0 6px" }}>Kontakt</h2>
          <p className="meta">Kontakt je odvojen od privatnog razgovora i ne daje pristup nečijoj sobi.</p>
          {contact?.alreadyContact ? <p className="meta">{contact.displayName} je već u tvojim kontaktima.</p>
            : contactSent ? <p className="notice ok">{contactSent}</p>
            : contact?.pending ? <p className="meta">Zahtjev za kontakt već čeka odgovor.</p>
            : <button className="btn warm block" disabled={busy !== null} onClick={sendContactRequest}>{busy === "contact" ? "Šaljem…" : "Pošalji zahtjev za kontakt"}</button>}
        </section>
      </>}
      <p style={{ marginTop: 18 }}><Link to="/kontakti">Nazad na kontakte</Link></p>
    </Shell>
  );
}
