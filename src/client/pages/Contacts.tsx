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
      <p className="meta" style={{ fontSize: 13, color: "var(--tekst-blag)", margin: "0 0 8px" }}>QR šalje samo zahtjev za kontakt. Nikome ne otvara tvoju sobu.</p>
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
  const [info, setInfo] = useState<{ displayName: string; self: boolean; alreadyContact: boolean; pending: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    api.get<typeof info>(`/contacts/qr/${qrId}`).then(setInfo).catch((e) => setError(e.message));
  }, [qrId]);
  return (
    <Shell>
      <h1>Novi kontakt</h1>
      {error && <p className="notice error">{error}</p>}
      {info && (info.self ? <p className="notice">Ovo je tvoj QR kod.</p> : info.alreadyContact ? (
        <p className="notice ok">{info.displayName} je već u tvojim kontaktima.</p>
      ) : sent ? (
        <p className="notice ok">{sent}</p>
      ) : (
        <div className="stack">
          <p>Želiš li poslati zahtjev za kontakt osobi <b>{info.displayName}</b>?</p>
          <p className="lead">Kontakt ti ne daje pristup njenoj sobi. U sobu se ulazi samo na poziv domaćina.</p>
          <button className="btn block" onClick={() => api.post<{ status: string }>("/contacts/request", { qrId })
            .then((r) => setSent(r.status === "accepted" ? `Ti i ${info.displayName} ste sada kontakti.` : "Zahtjev je poslan. Čeka se odgovor."))
            .catch((e) => setError(e.message))}>Pošalji zahtjev</button>
        </div>
      ))}
      <p style={{ marginTop: 18 }}><Link to="/kontakti">Nazad na kontakte</Link></p>
    </Shell>
  );
}
