import { isNew, type EditorSection } from "../lib/room-editor-draft";

export type TextDraft = { text: string; kind: "text" | "quote" };
type Props = {
  section: EditorSection;
  input: TextDraft;
  onInput: (value: TextDraft) => void;
  onAdd: () => void;
  onImage: (file: File) => void;
  onDeleteSection: () => void;
  onDeleteItem: (id: string) => void;
  onVisibility: (id: string, value: boolean) => void;
};
export function ProfileSectionEditor({ section, input, onInput, onAdd, onImage, onDeleteSection, onDeleteItem, onVisibility }: Props) {
  return <section>
    <h2 className="row" style={{ justifyContent: "space-between" }}>
      <span>{section.title}{isNew(section.id) && <small className="meta"> — nesačuvano</small>}</span>
      {section.kind === "custom" && <button className="btn small danger" type="button" onClick={onDeleteSection}>Obriši cjelinu</button>}
    </h2>
    {section.kind === "gallery" && <p className="lead" style={{ fontSize: 14 }}>Galerija je privatna. Gosti vide samo fotografije koje označiš i sačuvaš.</p>}
    {section.items.length === 0 && <p className="empty">Još nema sadržaja.</p>}
    {section.items.map((item) => <div className="item-row" key={item.id}>
      {item.kind === "image" && <img src={item.previewUrl ?? `/api/media/${item.mediaId}`} alt="" />}
      <div className="grow">{item.kind === "quote" ? `„${item.text}“` : item.text ?? "Fotografija"}
        {isNew(item.id) && <small className="meta"> — nesačuvano</small>}
      </div>
      <label className="toggle"><input type="checkbox" checked={!!item.sharedWithGuests}
        onChange={(e) => onVisibility(item.id, e.target.checked)} />Vidljivo gostima</label>
      <button className="btn small ghost" type="button" onClick={() => onDeleteItem(item.id)} aria-label="Obriši">Obriši</button>
    </div>)}
    <div className="row" style={{ marginTop: 10 }}>
      <form className="row" style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); onAdd(); }}>
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder={input.kind === "quote" ? "Citat" : "Tekst"}
          value={input.text} onChange={(e) => onInput({ ...input, text: e.target.value })} maxLength={2000} aria-label={`Novi sadržaj za ${section.title}`} />
        <select className="input" style={{ width: "auto" }} value={input.kind}
          onChange={(e) => onInput({ ...input, kind: e.target.value as TextDraft["kind"] })} aria-label="Vrsta">
          <option value="text">Tekst</option><option value="quote">Citat</option>
        </select>
        <button className="btn small" type="submit">Dodaj</button>
      </form>
      <label className="btn small ghost" style={{ cursor: "pointer" }}>Dodaj fotografiju
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={`Fotografija za ${section.title}`}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onImage(file); e.target.value = ""; }} />
      </label>
    </div>
  </section>;
}
