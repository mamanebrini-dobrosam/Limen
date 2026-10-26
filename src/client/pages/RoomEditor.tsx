import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type RoomSection } from "../api";
import { Shell } from "../shell";

const THEMES = [
  { id: "orah", label: "Večernja soba" },
  { id: "kadulja", label: "Kadulja" },
  { id: "noc", label: "Noć" },
  { id: "krem", label: "Dnevno svjetlo" },
];

export function RoomEditor() {
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [theme, setTheme] = useState("orah");
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      api.get<{ sections: RoomSection[]; theme: string }>("/room/content"),
      api.get<{ openSessionId: string | null }>("/rooms/mine"),
    ]);
    setSections(c.sections); setTheme(c.theme); setOpenSession(r.openSessionId);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const act = (fn: () => Promise<unknown>) => { setError(null); fn().then(load).catch((e) => setError(e.message)); };

  return (
    <Shell>
      <h1>Moja soba</h1>
      <p className="lead">Samo ti uređuješ sobu. Gosti vide isključivo ono što označiš kao vidljivo gostima, i svi vide isto. Sve ostalo ostaje u tvom privatnom ormaru.</p>
      {openSession && <p><Link className="btn warm" to={`/sto/${openSession}`}>Nazad za sto</Link></p>}
      {error && <p className="notice error" role="alert">{error}</p>}

      <h2>Izgled sobe</h2>
      <div className="row">
        {THEMES.map((t) => (
          <button key={t.id} className={`btn small ${theme === t.id ? "" : "ghost"}`} aria-pressed={theme === t.id}
            onClick={() => act(() => api.patch("/rooms/mine", { theme: t.id }))}>{t.label}</button>
        ))}
      </div>

      {sections.map((sec) => <SectionEditor key={sec.id} sec={sec} act={act} />)}

      <h2>Nova cjelina</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (newTitle.trim()) act(async () => { await api.post("/room/sections", { title: newTitle }); setNewTitle(""); }); }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="npr. Putovanja" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={40} aria-label="Naziv nove cjeline" />
        <button className="btn">Dodaj cjelinu</button>
      </form>
    </Shell>
  );
}

function ShareToggle({ id, initial, act }: { id: string; initial: boolean; act: (fn: () => Promise<unknown>) => void }) {
  const [on, setOn] = useState(initial);
  useEffect(() => { setOn(initial); }, [initial]);
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => { const v = e.target.checked; setOn(v); act(() => api.patch(`/room/items/${id}`, { sharedWithGuests: v })); }} />
      Vidljivo gostima
    </label>
  );
}

function SectionEditor({ sec, act }: { sec: RoomSection; act: (fn: () => Promise<unknown>) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"text" | "quote">(sec.kind === "vision" ? "quote" : "text");
  const isGallery = sec.kind === "gallery";
  return (
    <section>
      <h2 className="row" style={{ justifyContent: "space-between" }}>
        <span>{sec.title}</span>
        {sec.kind === "custom" && <button className="btn small danger" onClick={() => { if (confirm(`Obrisati cjelinu „${sec.title}“ i sav njen sadržaj?`)) act(() => api.del(`/room/sections/${sec.id}`)); }}>Obriši cjelinu</button>}
      </h2>
      {isGallery && <p className="lead" style={{ fontSize: 14 }}>Galerija je privatna. Gosti vide samo fotografije koje označiš.</p>}
      {sec.items.length === 0 && <p className="empty">Još nema sadržaja.</p>}
      {sec.items.map((i) => (
        <div className="item-row" key={i.id}>
          {i.kind === "image" && i.mediaId && <img src={`/api/media/${i.mediaId}`} alt="" />}
          <div className="grow">{i.kind === "quote" ? `„${i.text}“` : i.text ?? (i.kind === "image" ? "Fotografija" : "")}</div>
          <ShareToggle id={i.id} initial={!!i.sharedWithGuests} act={act} />
          <button className="btn small ghost" onClick={() => act(() => api.del(`/room/items/${i.id}`))} aria-label="Obriši">Obriši</button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <form className="row" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) act(async () => { await api.post("/room/items", { sectionId: sec.id, kind, text }); setText(""); }); }}>
          <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder={kind === "quote" ? "Citat" : "Tekst"} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Novi sadržaj za ${sec.title}`} />
          <select className="input" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value as "text" | "quote")} aria-label="Vrsta">
            <option value="text">Tekst</option><option value="quote">Citat</option>
          </select>
          <button className="btn small">Dodaj</button>
        </form>
        <label className="btn small ghost" style={{ cursor: "pointer" }}>
          Dodaj fotografiju
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) act(() => api.upload("/room/items/image", f, { sectionId: sec.id })); e.target.value = ""; }} />
        </label>
      </div>
    </section>
  );
}
