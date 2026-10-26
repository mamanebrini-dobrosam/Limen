import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ROOM_PALETTES, paletteBackground, type RoomPalette } from "./shared/room-palettes";

const STORAGE_KEY = "limen-b-appearance-preview";
const DEFAULT_PALETTE = "slonovaca";
const appearance = (id: string): RoomPalette =>
  ROOM_PALETTES.find((palette) => palette.id === id) ??
  ROOM_PALETTES.find((palette) => palette.id === DEFAULT_PALETTE)!;

export function PrototypeFrame({ children }: { children: ReactNode }) {
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE);
  const [open, setOpen] = useState(false);
  const palette = appearance(paletteId);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setPaletteId(appearance(stored).id);
    const sync = (event: Event) => {
      const next = event instanceof StorageEvent
        ? event.newValue
        : window.localStorage.getItem(STORAGE_KEY);
      if (next) setPaletteId(appearance(next).id);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("limen-b-appearance", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("limen-b-appearance", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const selectPalette = (next: RoomPalette) => {
    setPaletteId(next.id);
    window.localStorage.setItem(STORAGE_KEY, next.id);
    window.dispatchEvent(new Event("limen-b-appearance"));
    setOpen(false);
  };

  const frameStyle = {
    "--preview-room-background": paletteBackground(palette),
    "--preview-room-ink": palette.foreground,
    "--preview-room-tone": palette.tone,
  } as CSSProperties;

  return (
    <div className="limen-b" data-preview-tone={palette.tone} style={frameStyle}>
      {children}
      <aside className="prototype-tools" aria-label="Alati vizuelnog prototipa">
        <span className="prototype-flag">VIZUELNI PROTOTIP · NIJE SAČUVANO</span>
        <button className="appearance-trigger" onClick={() => setOpen(true)}>
          <span className="appearance-dot" style={{ background: palette.start }} aria-hidden="true" />
          Izgled sobe <span className="appearance-current">{palette.label}</span>
        </button>
      </aside>
      {open && (
        <div className="appearance-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="appearance-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appearance-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="appearance-head">
              <div>
                <p className="eyebrow">SAMO ZA OVAJ PROTOTIP</p>
                <h2 id="appearance-title">Boja sobe</h2>
                <p>Izbor mijenja samo ambijent sobe; nije postavka naloga.</p>
              </div>
              <button className="appearance-close" onClick={() => setOpen(false)} aria-label="Zatvori izbor">Zatvori</button>
            </header>
            <div className="appearance-grid">
              {ROOM_PALETTES.map((choice) => (
                <button
                  className={`appearance-choice${choice.id === palette.id ? " selected" : ""}`}
                  key={choice.id}
                  onClick={() => selectPalette(choice)}
                  aria-pressed={choice.id === palette.id}
                >
                  <span className="appearance-swatch" style={{ background: paletteBackground(choice) }}>
                    <span className="logo-matte">
                      <img src="/__mockup/images/limen/slonovaca.png" alt="" />
                    </span>
                  </span>
                  <span className="appearance-label">{choice.label}</span>
                  <span className="appearance-kind">{choice.tone === "dark" ? "tamna podloga" : "svijetla podloga"}</span>
                </button>
              ))}
            </div>
            <p className="appearance-footnote">Logo je prikazan iz izvornog fajla, bez izmjene boje ili proporcija.</p>
          </section>
        </div>
      )}
    </div>
  );
}
