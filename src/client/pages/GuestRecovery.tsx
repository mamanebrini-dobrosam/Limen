import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Brand } from "../visual/Brand";
import { ErrorNotice } from "../components/ErrorNotice";

function RecoverySecret({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  const save = () => {
    const url = URL.createObjectURL(new Blob([
      `LIMEN — tajni ključ za oporavak\n\n${value}\n\nUnesi ovaj ključ na LIMEN stranici „Oporavi razgovor“.\nNe dijeli ga: daje pristup tvom gostujućem razgovoru. Važi do korištenja, zamjene ili isteka razgovora.\n`,
    ], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "LIMEN-oporavak.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="notice">
    <p>Ključ se prikazuje samo sada. Sačuvaj ga na sigurnom i ne dijeli ga s drugima. Ne čuva se u adresi stranice.</p>
    <label className="field"><span>Ključ za oporavak</span><input className="input" type={show ? "text" : "password"} value={value} readOnly autoComplete="off" /></label>
    <div className="row"><button className="btn small ghost" type="button" onClick={() => setShow(!show)}>{show ? "Sakrij ključ" : "Pokaži ključ"}</button><button className="btn small" type="button" onClick={save}>Sačuvaj ključ u datoteku</button></div>
  </div>;
}

export function RecoveryTools({ id }: { id: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | string>("");
  const issue = async () => {
    setBusy(true); setError("");
    try {
      const r = await api.post<{ recoveryCode: string }>(`/visitor/conversations/${id}/recovery`);
      setCode(r.recoveryCode);
    } catch (e) { setError(e instanceof Error ? e : "Ključ se nije mogao napraviti."); }
    finally { setBusy(false); }
  };
  return <section className="visitor-controls" aria-label="Oporavak gostujućeg razgovora">
    <h2>Sačuvaj pristup razgovoru</h2>
    <p className="meta">Ako obrišeš kolačiće ili promijeniš uređaj, trebaš ovaj tajni ključ. QR kod nije dovoljan. Novi ključ poništava prethodni, a ne produžava trajanje razgovora.</p>
    <button className="btn ghost" disabled={busy} onClick={issue}>{busy ? "Pravim ključ…" : code ? "Napravi novi ključ (poništi prethodni)" : "Napravi ključ za oporavak"}</button>
    <ErrorNotice error={error} />
    {code && <RecoverySecret key={code} value={code} />}
  </section>;
}

export function RecoverGuest() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ chat: { id: string }; recoveryCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | string>("");
  const recover = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await api.post<{ chat: { id: string }; recoveryCode: string }>("/visitor/recover", { recoveryCode: code.trim() });
      setCode(""); setResult(r);
    } catch (e) { setError(e instanceof Error ? e : "Oporavak nije uspio."); }
    finally { setBusy(false); }
  };
  return <div className="shell"><header className="topbar"><Brand /><Link to="/prijava">Prijava</Link></header>
    <main className="page"><h1>Oporavi razgovor</h1>
      <p className="lead">Potreban je tajni ključ koji si ranije sačuvao/la u odobrenom razgovoru. QR kod, nadimak ili ID razgovora ne mogu ga zamijeniti.</p>
      <p className="notice">Oporavak prekida pristup ovog gostujućeg identiteta u starim preglednicima. Ne daje pristup privatnoj sobi i ne produžava rok od 30 dana.</p>
      <ErrorNotice error={error} />
      {result ? <><p className="notice ok" role="status">Razgovor je oporavljen. Stari ključ više ne važi; sačuvaj novi ključ.</p><RecoverySecret value={result.recoveryCode} /><Link className="btn block" to={`/gost/${result.chat.id}`}>Nastavi razgovor</Link></> :
        <form onSubmit={recover}><label className="field"><span>Sačuvani ključ za oporavak</span><input className="input" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200} required value={code} onChange={(e) => setCode(e.target.value)} /></label><button className="btn block" disabled={busy || !code.trim()}>{busy ? "Oporavljam…" : "Oporavi razgovor"}</button></form>}
      <p className="meta">Ako nemaš ni kolačić ni ključ, razgovor se ne može sigurno vratiti. Skeniraj QR i pošalji novi zahtjev koji vlasnik mora odobriti.</p>
      <p><Link to="/gost-razgovori">Moji razgovori</Link> · <Link to="/skeniraj">Skeniraj QR kod</Link></p>
    </main>
  </div>;
}
