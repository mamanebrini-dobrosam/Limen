# LIMEN — ponovljiva provjera čistog klona

## npm i prenosivost

Projekt se pokreće npm skriptama. Iz oba verzionisana `package-lock.json`
fajla uklonjene su interne Replit adrese; koriste `https://registry.npmjs.org`.
Verzije i integrity hash vrijednosti paketa nisu mijenjane. Suvišni korijenski
`pnpm-lock.yaml` uklonjen je kako ne bi postojala dva izvora zaključanih verzija.

Provjera 26.10.2026: Node **22.23.4**, npm **10.9.9**, Linux.
U praznu privremenu mapu kopirani su samo `package.json` i `package-lock.json`.
Bez postojećeg `node_modules` i uz prazan cache:

```sh
npm ci --registry=https://registry.npmjs.org --cache /putanja/do/praznog-cachea --no-audit --no-fund
```

Rezultat: **361 instaliran paket, izlazni kod 0**. Ovo je provjera izolovane
instalacije na ovom Linux okruženju, ne tvrdnja da je pokrenut drugi fizički
računar ili testiran svaki operativni sistem. Upozorenja o zastarjelim
tranzitivnim paketima nisu bila greške instalacije; paketi nisu nadograđivani.

## Sigurno pokretanje testova na drugom računaru

Potrebni su Git, Node 22, npm i PostgreSQL 16. Testovi prave migracije i brišu
testne podatke: **nikada ne usmjeravati `TEST_DATABASE_URL` na stvarnu
razvojnu ili produkcijsku bazu**.

Sljedeći primjer stvara potpuno novu lokalnu, privremenu testnu bazu,
dostupnu samo lokalnom računaru, bez stvarnih korisnika i SMTP podataka:

```sh
git clone https://github.com/mamanebrini-dobrosam/Limen.git
cd Limen
npm ci

PGTEST_DIR=$(mktemp -d /tmp/limen-test-pg.XXXXXX)
initdb -D "$PGTEST_DIR" -U postgres -A trust --no-locale
pg_ctl -D "$PGTEST_DIR" -l "$PGTEST_DIR/server.log" \
  -o '-h 127.0.0.1 -k /tmp -p 55432' start
createdb -h /tmp -p 55432 -U postgres limen_test
export TEST_DATABASE_URL='postgres://postgres@localhost:55432/limen_test?host=/tmp'

npm test
npm run typecheck
npm run build

pg_ctl -D "$PGTEST_DIR" stop
```

Ako je port 55432 zauzet, izabrati drugi slobodan lokalni port i uskladiti
sva mjesta na kojima se koristi port. Ovaj primjer ne traži stvarne SMTP ključeve,
ne potvrđuje stvarne naloge i ne dira produkciju. Testni SMTP podaci su
namjerno isključeni u `vitest.config.ts`.

Za pregledničke testove dodatno je potreban kompatibilan Chromium; koristi se
`npm run test:browser`. Emulacija Android/iPhone dimenzija u Chromiumu nije
zamjena za fizičke uređaje niti za Safari na iPhoneu.

## Originalna slika potrebna testu

`tests/room-palettes.test.ts` poredi piksele 12 izrezanih varijanti s
originalnom, neoznačenom slikom:

`attached_assets/0_Limen_Logo-Farbpalette_im_Raster_(1)_1793015058984.png`

Slika je sada verzionisana uprkos lokalnom globalnom pravilu ignorisanja
`attached_assets`. Nije obrađivana, kompresovana, preimenovana ili zamijenjena.
Nije promijenjen logo koji aplikacija prikazuje.
