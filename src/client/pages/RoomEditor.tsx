import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type RoomSection } from "../api";
import { Shell } from "../shell";
import { ROOM_PALETTES, paletteBackground, roomPalette } from "../../shared/room-palettes";
import { visualSettings } from "../visual/settings";
import { copyDraft, draftId, persistRoomDraft, type EditorDraft, type EditorItem } from "../lib/room-editor-draft";
import { ProfileSectionEditor, type TextDraft } from "./ProfileSectionEditor";
import "./RoomEditor.css";

export function RoomEditor() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EditorDraft>({ sections: [], theme: "orah" });
  const saved = useRef<EditorDraft>(copyDraft(draft));
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, TextDraft>>({});
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const previews = useRef(new Set<string>());
  const exitTo = openSession ? `/sto/${openSession}` : "/";

  useEffect(() => {
    mounted.current = true;
    Promise.all([
      api.get<{ sections: RoomSection[]; theme: string }>("/room/content"),
      api.get<{ openSessionId: string | null }>("/rooms/mine"),
    ]).then(([content, room]) => {
      if (!mounted.current) return;
      saved.current = copyDraft(content);
      setDraft(copyDraft(content));
      setOpenSession(room.openSessionId);
    }).catch((e) => { if (mounted.current) setError(e.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
    const urls = previews.current;
    return () => {
      mounted.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const textDraft = (id: string, kind: string): TextDraft => inputs[id] ?? { text: "", kind: kind === "vision" ? "quote" : "text" };
  const addItem = (sectionId: string, item: EditorItem) => setDraft((d) => ({
    ...d, sections: d.sections.map((s) => s.id === sectionId ? { ...s, items: [...s.items, item] } : s),
  }));
  const stageText = (id: string, kind: string) => {
    const value = textDraft(id, kind);
    if (!value.text.trim()) return;
    addItem(id, { id: draftId(), kind: value.kind, text: value.text.trim(), mediaId: null, sharedWithGuests: false });
    setInputs((current) => ({ ...current, [id]: { ...value, text: "" } }));
  };
  const stageSection = () => {
    if (!newTitle.trim()) return;
    setDraft((d) => ({ ...d, sections: [...d.sections, { id: draftId(), kind: "custom", title: newTitle.trim(), items: [] }] }));
    setNewTitle("");
  };
  const stageImage = (id: string, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    previews.current.add(previewUrl);
    addItem(id, { id: draftId(), kind: "image", text: null, mediaId: null, sharedWithGuests: false, file, previewUrl });
  };
  const saveAndExit = async () => {
    if (saveLock.current || loading) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    const work = copyDraft(draft);
    // Also include text still in inputs, without requiring a separate "Dodaj".
    for (const section of work.sections) {
      const value = textDraft(section.id, section.kind);
      if (value.text.trim()) section.items.push({
        id: draftId(), kind: value.kind, text: value.text.trim(), mediaId: null, sharedWithGuests: false,
      });
    }
    if (newTitle.trim()) work.sections.push({ id: draftId(), kind: "custom", title: newTitle.trim(), items: [] });
    setDraft(work);
    setInputs({});
    setNewTitle("");
    let confirmed = 0;
    try {
      await persistRoomDraft(saved.current, work, (baseline, remaining) => {
        confirmed++;
        saved.current = baseline;
        if (mounted.current) setDraft(remaining);
      }, () => mounted.current);
      if (mounted.current) navigate(exitTo);
    } catch (e) {
      if (mounted.current) setError(`${confirmed ? "Dio potvrđenih izmjena je sačuvan. Preostale izmjene ostaju ovdje za ponovni pokušaj. " : "Izmjene nisu sačuvane. "}${(e as Error).message}`);
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const palette = roomPalette(draft.theme);
  const legacyBackground: Record<string, string> = {
    orah: "var(--orah)", kadulja: "var(--kadulja)", noc: "var(--noc)", krem: "var(--krem)",
  };
  return (
    <Shell wide>
      <div className="row profile-editor-actions" role="group" aria-label="Uređivanje profila">
        <Link className="btn ghost" to={exitTo}>Izađi</Link>
        <button className="btn" type="button" disabled={loading || saving} onClick={saveAndExit}>
          {saving ? "Čuvanje…" : "Sačuvaj i izađi"}
        </button>
        <Link className="btn ghost" to={exitTo}>Odustani</Link>
      </div>
      <h1>Moja soba</h1>
      <p className="lead">Samo ti uređuješ sobu. Gosti vide isključivo ono što označiš kao vidljivo gostima. Sve ostalo ostaje u tvom privatnom ormaru.</p>
      <p className="meta">Sve izmjene su privremene do „Sačuvaj i izađi“. „Izađi“ i „Odustani“ odbacuju nesačuvane izmjene, uključujući boju, vidljivost, dodavanje i brisanje.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      <fieldset className="profile-editor-fields" disabled={loading || saving}>
        <h2>Izgled sobe</h2>
        <div className="profile-current-color" aria-label="Trenutno odabrana boja">
          <div className="palette-choice-image" style={{ background: palette ? paletteBackground(palette) : legacyBackground[draft.theme] }}>
            <img src={visualSettings.brand.logoImage!} alt="" />
          </div>
          <p>{palette?.label ?? `Postojeći izgled: ${draft.theme}`}{draft.theme !== saved.current.theme && <span> — nesačuvani izbor</span>}</p>
        </div>
        <button className="btn ghost" type="button" aria-expanded={paletteOpen} aria-controls="room-color-picker" onClick={() => setPaletteOpen(!paletteOpen)}>Promijeni boju</button>
        {paletteOpen && <div id="room-color-picker">
          <div className="row">
            <h3>Odaberi boju</h3>
            <button className="btn small ghost" type="button" onClick={() => setPaletteOpen(false)}>Zatvori paletu</button>
          </div>
          <div className="palette-picker" role="group" aria-label="Odaberi izgled sobe">
            {ROOM_PALETTES.map((p) => <button type="button" key={p.id}
              className={`palette-choice${draft.theme === p.id ? " is-selected" : ""}`} aria-pressed={draft.theme === p.id}
              onClick={() => { setDraft((d) => ({ ...d, theme: p.id })); setPaletteOpen(false); }}>
              <span className="palette-choice-image" style={{ background: paletteBackground(p) }}>
                <img src={visualSettings.brand.logoImage!} alt="" />
              </span>
              <span className="palette-choice-meta"><span className="palette-choice-label">{p.label}</span>
                <span className="palette-choice-source">Izvor {p.row}:{p.column}</span></span>
            </button>)}
          </div>
        </div>}
        {draft.sections.map((section) => <ProfileSectionEditor key={section.id} section={section}
          input={textDraft(section.id, section.kind)}
          onInput={(value) => setInputs((current) => ({ ...current, [section.id]: value }))}
          onAdd={() => stageText(section.id, section.kind)} onImage={(file) => stageImage(section.id, file)}
          onDeleteSection={() => {
            if (confirm(`Označiti cjelinu „${section.title}“ i njen sadržaj za brisanje? Brisanje se izvršava tek na „Sačuvaj i izađi“.`))
              setDraft((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== section.id) }));
          }}
          onDeleteItem={(id) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => s.id === section.id ? { ...s, items: s.items.filter((i) => i.id !== id) } : s) }))}
          onVisibility={(id, value) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => s.id === section.id ? { ...s, items: s.items.map((i) => i.id === id ? { ...i, sharedWithGuests: value } : i) } : s) }))}
        />)}
        <h2>Nova cjelina</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); stageSection(); }}>
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="npr. Putovanja" value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)} maxLength={40} aria-label="Naziv nove cjeline" />
          <button className="btn" type="submit">Dodaj cjelinu</button>
        </form>
      </fieldset>
    </Shell>
  );
}
