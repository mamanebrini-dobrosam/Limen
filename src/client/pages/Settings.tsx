import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Shell, useAuth } from "../shell";

export function Settings() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [blocks, setBlocks] = useState<{ userId: string; displayName: string }[]>([]);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get<{ blocks: typeof blocks }>("/blocks").then((r) => setBlocks(r.blocks)).catch(() => {});
  useEffect(() => { load(); }, []);

  const logout = async (all: boolean) => {
    await api.post(all ? "/auth/logout-all" : "/auth/logout");
    setUser(null); nav("/prijava");
  };

  return (
    <Shell>
      <h1>Postavke</h1>
      <p className="lead">{user?.displayName}<br />{user?.email}</p>
      {user?.isAdmin && <p><Link to="/admin">Pregled prijava (administracija)</Link></p>}

      <h2>Prijava</h2>
      <div className="stack">
        <button className="btn ghost block" onClick={() => logout(false)}>Odjavi se</button>
        <button className="btn ghost block" onClick={() => logout(true)}>Odjavi se sa svih uređaja</button>
      </div>

      <h2>Blokirani</h2>
      {blocks.length === 0 ? <p className="empty">Nikoga nisi blokirao/la.</p> : (
        <ul className="list">
          {blocks.map((b) => (
            <li key={b.userId}><span>{b.displayName}</span><button className="btn small ghost" onClick={() => api.del(`/blocks/${b.userId}`).then(load)}>Ukloni blokadu</button></li>
          ))}
        </ul>
      )}

      <h2>Moji podaci</h2>
      <p className="lead" style={{ fontSize: 14 }}>Preuzmi kopiju svojih podataka u JSON formatu.</p>
      <a className="btn ghost block" href="/api/me/export" download>Preuzmi moje podatke</a>

      <h2>Brisanje naloga</h2>
      <p className="lead" style={{ fontSize: 14 }}>Briše se tvoj nalog, soba, galerija i kontakti. Poruke koje si napisao/la u tuđim sobama ostaju u arhivi domaćina, potpisane kao „Obrisani korisnik“, bez veze s tvojim nalogom.</p>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (!confirm("Trajno obrisati nalog? Ovo se ne može poništiti.")) return;
        api.del("/me", { password: pw }).then(() => { setUser(null); nav("/prijava"); }).catch((er) => setError(er.message)); }}>
        <label className="field"><span>Lozinka za potvrdu</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {error && <p className="notice error">{error}</p>}
        <button className="btn danger block">Trajno obriši nalog</button>
      </form>
    </Shell>
  );
}
