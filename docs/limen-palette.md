# LIMEN: zvanične pozadine i pregled izgleda

## Izvor i izbor

Koristi se vlasnikova originalna, **neoznačena** slika logotipa u mreži
1536 × 1024. Crvena označena kopija služi samo za izbor položaja.
Crvene oznake nisu dizajn i nisu prenesene u aplikaciju.

| Izvor: red, kolona | Naziv pozadine | Izvorna boja: gornja → donja |
|---|---|---|
| 1, 2 | Duboki smaragd | `#062d23` → `#021d15` |
| 1, 3 | Petrol zelena | `#034537` → `#024033` |
| 1, 5 | Topla slonovača | `#e9deca` → `#ddd0b9` |
| 2, 2 | Grafit i menta | `#2d3033` → `#202327` |
| 2, 3 | Šumska zelena | `#294826` → `#1f3d1e` |
| 3, 1 | Ponoćno plava | `#06274c` → `#021d3e` |
| 3, 2 | Koraljni suton | `#fbbbad` → `#f9b1a2` |
| 3, 4 | Bakrena narandža | `#c85c19` → `#b64b12` |
| 3, 5 | Rubin crvena | `#aa2428` → `#8d1216` |
| 4, 1 | Sunčano zlato | `#fdd76d` → `#f2ba3d` |
| 4, 4 | Ametist | `#3a214e` → `#381e4b` |
| 4, 5 | Zeleni obsidijan | `#050403` → `#030302` |

Boje su uzete kao medijan malih uzoraka čistog ruba svake odabrane pločice,
daleko od logotipa. Nije pokušano nagađanje boje ispod crvenih oznaka.
Pozadine su gradijenti tih boja, a ne rastegnute slike logotipa.
Izvorni izrezi 12 pločica služe za provjeru odabranih boja i porijekla palete,
**ne kao zamjenski logotipi**. U pregledu, postavkama sobe i brendiranju uvijek
se prikazuje ista zvanična slika logotipa u originalnim bojama, bez promjene
simbola, proporcija, fonta ili natpisa „limen“. Gradijent iza slike određuje
pozadinu sobe; slika logotipa se ne tonira.

## Kontrast

Tri svijetle pozadine koriste tamnozeleni tekst; ostale koriste svijetli tekst.
Bakrena ima dodatno 18% zatamnjenje radi AA kontrasta normalnog teksta
(najmanje 4.5:1). Izvorne boje i originalni logo izrez ostaju zabilježeni,
neprecrtani. Zlato je akcenat; primarne akcije ostaju čitljive.

## Gdje se mijenja

- Zajednički katalog: `src/shared/room-palettes.ts`.
- Centralni identitet aplikacije: `src/client/visual/settings.ts`.
- CSS tokeni i stil odabrane sobe: `src/client/visual/tokens.ts`.
- Originalni logo izrezi: `src/client/public/brand/palette/`.
- Ponovljivo izdvajanje iz originala: `node scripts/extract-limen-palette.mjs`.

## Vlasnik i gosti

Na **Moja soba → Izgled sobe** vidi se samo trenutno odabrana boja.
**Promijeni boju** otvara 12 opcija; izbor mijenja samo privremeni nacrt.
**Zatvori paletu** vraća u uređivač, bez trajnog čuvanja.
Tek **Sačuvaj i izađi** potvrđuje izmjene. **Izađi**, **Odustani** i napuštanje
uređivača odbacuju sve nesačuvane izmjene. Isto važi za vidljivost, tekstove,
fotografije, nove cjeline i brisanje; nijedna od tih radnji ne šalje zahtjev
za trajno čuvanje prije potvrde.
Ako potvrđeno čuvanje stane na grešci, uređivač ostaje otvoren, prikazuje
grešku i zadržava preostale izmjene. Već uspješno sačuvani koraci se ne
dupliraju pri ponovnom pokušaju. Više zahtjeva nije jedna transakcija:
poruka o grešci izričito navodi ako je dio potvrđenih izmjena već sačuvan.
Soba drugog korisnika nije cilj ovog zahtjeva, čak ni ako se pošalje tuđi ID.

Gosti u tuđoj sobi nemaju kontrolu za uređivanje. Registrovani gost može
uređivati samo svoju vlastitu sobu, ne sobu domaćina.
Promjena je vidljiva pri sljedećem otvaranju/osvježavanju sobe; nije dodavana
nova chat ili websocket funkcija radi trenutnog prenosa izgleda.
Prethodni izbori `orah`, `kadulja`, `noc`, `krem` ostaju podržani i nisu
automatski zamijenjeni. Nisu dodani među 12 novih zvaničnih opcija.

## Pregled za odobrenje

U razvojnom pregledu otvori **`/paleta`**: svih 12 pozadina, originalni
logotipi, položaji u izvornoj mreži i primjer stvarnih aplikacijskih stilova.
To je statičan pregled bez korisničkih podataka, ne zaobilazak prijave.
Otvaranje pregleda ne čuva pozadinu i ne otvara razgovor.

Automatske provjere pokrivaju: originalne izreze, kontrast gradijenata,
svih 12 sačuvanih izbora, odvojenost soba, autorizaciju, mobilni/desktop
prikaz i postojeće QR/chat/oporavak tokove. Fizički telefoni i Safari/WebKit
moraju se dodatno provjeriti prema `docs/mobile-testing.md`.

Nijedna izmjena ne objavljuje aplikaciju niti mijenja tokene, pravila
pristupa, odobravanje gostiju ili brisanje nakon 30 dana.
