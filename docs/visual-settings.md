# Vizuelne postavke LIMEN-a

## Gdje se postavke nalaze

Izvorna, tipizirana konfiguracija je `src/client/visual/settings.ts`. Podrazumijevane vrijednosti odgovaraju vlasnikovom odabranom prijedlogu **B — Privatni salon**: tople neutralne površine, miran zeleni akcenat, bočna navigacija na računarima i ovalni sto.

- `brand`: naziv, tagline, naslov stranice, URI favicon-a, neizmijenjen originalni logo i njegove širine na mobilnom i računaru.
- `palette`: osnovne i sekundarne boje, pozadina, tekst, naglasci, neutralne površine stola/panela i stanja.
- `font`: porodica, trenutni Google Fonts stylesheet i osnovne veličine teksta.
- `buttons` i `navigation`: dimenzije, boje i razmaci kontrola.
- `layout`: prag mobilnog prikaza, širina bočne navigacije, širine stranica i razmaci za mobilni/desktop prikaz.
- `home`: pozadina, boja, unutrašnji razmak, zaobljenje i tipografija početnog istaknutog bloka.

`src/client/visual/tokens.ts` pretvara postavke u CSS custom properties. `src/client/visual/applyVisualSettings.ts` ih primjenjuje i ažurira naslov dokumenta, boju preglednika, favicon i font stylesheet pri pokretanju, prije `createRoot`. `src/client/visual/Brand.tsx` je zajednički wordmark za navigaciju. Zvanični logo ostaje ista neoznačena originalna slika; `brand.logoImage` i favicon usmjeravaju na nju, a postavke pozadina ne mijenjaju te putanje. `src/client/visual/salon.css` opisuje raspored i responzivno ponašanje odabranog prijedloga; boje i dimenzije preuzima iz centralnih postavki. Zadržana je stvarna navigacija sa svih pet stavki, a ne prototipska navigacija sa dvije stranice.

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

Za promjenu fonta prilagodite `font.family` i `font.googleStylesheet` zajedno. Font ostaje Inter. Favicon i logo sada koriste originalni izrez tople slonovače iz dostavljene palete; putanje su u `brand.favicon` i `brand.logoImage` i primjenjuju se pri pokretanju. Mobilni prag se obrađuje JavaScript oznakom na korijenskom elementu, tako da se konfiguracija može koristiti u rasporedu bez `var()` izraza u media-query uslovima.

## Odabrana paleta vlasnika

Nova paleta je primijenjena na aplikacijske tokene. Pregled svih 12 zvaničnih
pozadina je na `/paleta`, a vlasnik bira pozadinu na `/moja-soba`.
Detalji o izvoru, čuvanju po sobi, kontrastu i zadržavanju prethodnih izbora:
[LIMEN paleta](limen-palette.md). Podrazumijevane vrijednosti iz ranijeg
primjera u ovom vodiču služe samo kao primjer konfiguracije.

## Granice konfiguracije

Ove centralne postavke mijenjaju samo podrazumijevani vizuelni prikaz. Centralni izgled nema zasebno čuvanje u bazi, administratorski uređivač ni novu rutu. Postojeći vlasnički izbor jedne od 12 pozadina i dalje se čuva za svaku sobu posebno; gosti ne mogu mijenjati izbor. Ne mijenjati niti izlagati kroz vizuelne postavke pravila pristupa, autentifikacije, autorizacije, privatnosti, verifikacije, QR pristupa, oporavka, ograničenja zahtjeva, trajanja tokena ili sigurnosnih tajni. Takva pravila ostaju nepromjenjiva u aplikacionoj/server logici.

## Provjera podrazumijevanog prikaza

Osnovne vrijednosti i determinističko generisanje tokena pokriva `tests/visual-settings.test.ts`. Za vizuelno poređenje prije i poslije promjene koristiti sačuvane snimke i computed-style JSON iz `/tmp/limen-visual-baseline`; tu putanju ne uključivati u produkcijski build.
