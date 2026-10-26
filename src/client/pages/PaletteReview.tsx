import { Link } from "react-router-dom";
import { ROOM_PALETTES, paletteBackground, paletteLogo } from "../../shared/room-palettes";
import { Brand } from "../visual/Brand";

export function PaletteReview() {
  return (
    <main className="palette-review">
      <header className="palette-review-header">
        <Brand />
        <Link to="/moja-soba" className="btn small ghost">Povratak u moju sobu</Link>
      </header>
      <section className="palette-review-intro">
        <p className="palette-eyebrow">LIMEN · PREGLED VIZUELNOG PRAVCA</p>
        <h1>Dvanaest vrata.<br /><span>Jedna ista soba.</span></h1>
        <p>Izvorne, označene opcije iz dostavljene palete — prikazane bez izmjena. Svaka pločica čuva originalni znak i naziv limen malim slovima.</p>
      </section>
      <section aria-labelledby="palette-options-title">
        <div className="palette-section-title">
          <div><p className="palette-eyebrow">ODABIR VLASNIKA</p><h2 id="palette-options-title">Palete sobe</h2></div>
          <span className="palette-count">12 opcija</span>
        </div>
        <div className="palette-review-grid">
          {ROOM_PALETTES.map((palette) => (
            <article className="palette-review-card" key={palette.id}>
              <div className="palette-review-swatch" style={{ background: paletteBackground(palette) }}>
                <img src={paletteLogo(palette)} alt={`Originalni LIMEN znak — ${palette.label}`} />
                <span className="palette-source-chip">Izvor · red {palette.row}, kolona {palette.column}</span>
              </div>
              <div className="palette-review-caption">
                <h3>{palette.label}</h3><span>{palette.id}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="palette-ui-sample" aria-labelledby="application-sample">
        <div className="palette-sample-copy">
          <p className="palette-eyebrow">U APLIKACIJI</p>
          <h2 id="application-sample">Mirna osnova.<br />Zlatni detalj.</h2>
          <p>Duboka smaragdna i petrol zelena nose navigaciju i primarne akcije. Topla slonovača daje prostora sadržaju; zlato ostaje akcenat, ne tekst.</p>
        </div>
        <div className="palette-sample-ui">
          <div className="sample-topline"><img src="/brand/palette/slonovaca.png" alt="limen" /><span>PRIVATNA SOBA</span></div>
          <div className="sample-content">
            <p className="palette-eyebrow">TVOJ PROSTOR</p>
            <h3>Dobro došla u sobu.</h3>
            <p>Ulaz ostaje pod tvojom kontrolom. Pozvani gosti ulaze tek nakon odobrenja.</p>
            <div className="sample-actions"><Link to="/moja-soba">Uredi sobu</Link><Link to="/postavke" className="sample-secondary">Postavke</Link></div>
          </div>
          <div className="sample-nav"><span className="active">Početna</span><span>Kontakti</span><span>Moja soba</span></div>
        </div>
      </section>
      <footer className="palette-review-footer"><span>Pregled za vlasnika · statičan prikaz, bez korisničkih podataka</span><Link to="/moja-soba">Odaberi izgled sobe</Link></footer>
    </main>
  );
}
