import { useState, type CSSProperties } from "react";
import { ROOM_PALETTES, paletteBackground } from "./shared/room-palettes";
import { Home as ExtractedHome } from "./_shared/pages/Home";
import { createVisualCssVariables } from "./_shared/visual/tokens";
import { visualSettings } from "./_shared/visual/settings";
import "./_group.css";
import "./proposal.css";
export function Home() {
  const [showPalettes, setShowPalettes] = useState(false);
  const [selected, setSelected] = useState("slonovaca");
  return <div className="limen-extracted proposal-shell" style={createVisualCssVariables(visualSettings) as CSSProperties}>
    <div className="prototype-bar"><span>VIZUELNI PROTOTIP <i>— nije sačuvano u postavkama</i></span><button onClick={() => setShowPalettes((v) => !v)} aria-expanded={showPalettes}>Izgled sobe <b>{showPalettes ? "−" : "+"}</b></button></div>
    {showPalettes && <div className="prototype-picker" aria-label="Izbor ambijenta sobe">
      {ROOM_PALETTES.map((p) => <button key={p.id} className={selected === p.id ? "palette-swatch active" : "palette-swatch"} onClick={() => setSelected(p.id)} aria-pressed={selected === p.id}>
        <span className="palette-color" style={{ background: paletteBackground(p) }}><img src="/__mockup/images/limen/slonovaca.png" alt="" /></span><span>{p.label}</span>
      </button>)}
    </div>}
    <ExtractedHome />
  </div>;
}
