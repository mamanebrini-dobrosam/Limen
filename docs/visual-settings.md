# Vizuelne postavke LIMEN-a

## Gdje se postavke nalaze

Izvorna, tipizirana konfiguracija je `src/client/visual/settings.ts`. Podrazumijevane vrijednosti namjerno odgovaraju postojećem LIMEN izgledu.

- `brand`: naziv, tagline, naslov stranice, URI favicon-a i opcionalna putanja do slike logotipa.
- `palette`: osnovne i sekundarne boje, pozadina, tekst, naglasci i stanja.
- `font`: porodica, trenutni Google Fonts stylesheet i osnovne veličine teksta.
- `buttons` i `navigation`: dimenzije, boje i razmaci kontrola.
- `layout`: prag mobilnog prikaza, širine stranica i razmaci za mobilni/desktop prikaz.
- `home`: pozadina, boja, unutrašnji razmak, zaobljenje i tipografija početnog istaknutog bloka.

`src/client/visual/tokens.ts` pretvara postavke u CSS custom properties. `src/client/visual/applyVisualSettings.ts` ih primjenjuje i ažurira naslov dokumenta, boju preglednika, favicon i font stylesheet pri pokretanju, prije `createRoot`. `src/client/visual/Brand.tsx` je zajednički wordmark za navigaciju; bez slike logotipa prikazuje isti tekst i tagline. Po želji, sliku se može zadati lokalnom putanjom u `brand.logoImage`; ostavite `null` da se koristi trenutni wordmark.

Primjer izmjene budućeg izgleda:

```ts
palette: {
  // ...
  primary: "#50382c",
  background: "#f5ebdd",
},
layout: {
  // ...
  mobileBreakpoint: 480,
  mobilePagePadding: "16px",
  desktopPageWidth: "560px",
},
```

Za promjenu fonta prilagodite `font.family` i `font.googleStylesheet` zajedno. Favicon trenutno ostaje tačan SVG data URI iz `src/client/index.html`; vrijednost se primjenjuje pri pokretanju, dok statički HTML ostaje rezervni prikaz za slučaj prije pokretanja aplikacije. Mobilni prag se obrađuje JavaScript oznakom na korijenskom elementu, tako da se konfiguracija može koristiti u rasporedu bez `var()` izraza u media-query uslovima.

## Granice konfiguracije

Ove postavke mijenjaju samo vizuelni prikaz. Ne postoji trajno čuvanje postavki, administratorski uređivač ni nova ruta. Ne mijenjati niti izlagati kroz vizuelne postavke pravila pristupa, autentifikacije, autorizacije, privatnosti, verifikacije, QR pristupa, oporavka, ograničenja zahtjeva, trajanja tokena ili sigurnosnih tajni. Takva pravila ostaju nepromjenjiva u aplikacionoj/server logici.

## Provjera podrazumijevanog prikaza

Osnovne vrijednosti i determinističko generisanje tokena pokriva `tests/visual-settings.test.ts`. Za vizuelno poređenje prije i poslije promjene koristiti sačuvane snimke i computed-style JSON iz `/tmp/limen-visual-baseline`; tu putanju ne uključivati u produkcijski build.
