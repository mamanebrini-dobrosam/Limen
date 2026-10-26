# LIMEN — mjesto gdje priče žive

Privatni digitalni dom: domaćin otvara sobu, poziva goste i odlučuje ko prelazi prag i šta može vidjeti.
Ovo je **Faza 1 MVP**: registracija (18+), QR kontakti, pozivi, soba sa šest mjesta, chat, galerija, moderacija.

## Šta radi (Faza 1)

| Funkcija | Stanje |
|---|---|
| Registracija samo 18+, potvrda emaila, prijava, reset lozinke, odjava sa svih uređaja | Radi |
| Jedinstven QR kod po profilu; skeniranje šalje zahtjev za kontakt, druga osoba prihvata | Radi |
| Kontakti 90 dana od posljednje zajedničke aktivnosti (poziv ili sjedenje), zatim novo skeniranje | Radi |
| Privatna pretraga kontakata (nema javne pretrage ljudi) | Radi |
| Jedna soba po korisniku; nikad domaćin i gost istovremeno, nikad dva stola | Radi (provjera u bazi) |
| Sto sa 6 mjesta (domaćin + 5); poziv ne zauzima mjesto; paralelna odobrenja ne prelaze kapacitet | Radi (zaključavanje + jedinstveni indeksi) |
| Propušten poziv; poziv važi do zatvaranja sesije; domaćin povlači poziv dok nije prihvaćen | Radi |
| Domaćin postavlja odsutnog gosta za sto → gost dobija nove poruke i offline | Radi |
| Prava čitanja poruka tačno po intervalima za stolom (API, websocket, fotografije) | Radi |
| „Nastavi razgovor“ / „Započni novi razgovor“ pri ponovnom otvaranju | Radi |
| Fotografije samo iz galerije uređaja; provjera stvarnog tipa, max 10 MB, uklanjanje EXIF/GPS | Radi |
| Izričito spremanje fotografije iz chata u vlastitu privatnu galeriju | Radi |
| O meni, Vision Board, Galerija + vlastite cjeline; gosti vide samo odobren sadržaj, isti za sve | Radi |
| Utišavanje (čita, ne piše), uklanjanje gosta, zatvaranje sobe, izlaz domaćina s potvrdom | Radi |
| Domaćin bez veze: „Čekamo povratak domaćina…“ bez odbrojavanja, 30 s, zatim kraj | Radi (rok u bazi) |
| Gost bez veze duže od 30 s gubi mjesto i interval; ponovo traži ulazak istim pozivom | Radi |
| Prijava zloupotrebe, blokiranje (sa svim posljedicama), administratorski pregled + evidencija | Radi |
| Rate limiting (zajednički brojač u PostgreSQL-u), 429 + Retry-After | Radi |
| GDPR: izvoz podataka, brisanje naloga („Obrisani korisnik“, bez veze s nalogom) | Radi |
| Obavijesti samo unutar aplikacije | Radi |

### Šta je pojednostavljeno ili simulirano

- **Email:** podržani su odvojena SMTP polja ili postojeći `SMTP_URL`. Bez SMTP-a razvoj koristi `/api/dev/outbox`, bez ispisa linkova u log. Produkcija bez potpune konfiguracije odbija slanje i nema razvojni sandučić. Upute su u [SMTP pripremi](docs/email-setup.md).
- **Skeniranje QR-a:** ugrađeni skener podržava kameru, QR sliku i unos LIMEN linka/koda. Mobilne simulacije ne zamjenjuju fizičku provjeru Androida/iPhonea; slijedi [upute za uređaje](docs/mobile-testing.md).
- **Provjera godina:** unos datuma rođenja i potvrda. Nema provjere dokumenta.
- **Pohrana fotografija:** Replit App Storage u produkciji; lokalni disk (`storage/`) samo u razvoju i testovima. Prije prve produkcijske objave koja koristi App Storage, prenesi postojeće fotografije komandom `npm run media:migrate-to-object-storage` u okruženju koje ima pristup postojećem `STORAGE_DIR` i Replit App Storage.
- **Više server instanci:** rokovi i limiti su u bazi, ali websocket događaji idu kroz jedan proces. Za više instanci treba Socket.IO Redis adapter.
- **Pravna politika čuvanja podataka:** nije definisana; brisanje naloga uklanja vezu s autorom, ali to nije pravna procjena.

### Nije u Fazi 1 (namjerno)

Poker, šah, Čovječe ne ljuti se, sinhronizovani video/YouTube i prikaz fotografije na stolu, kodovi za dodatke (ŠPAJZ), zid priča, 3D, glas.

## Odluke donesene tokom izrade

- **Odsutni gost postavljen za sto:** čim otvori sobu, prisutan je i može pisati (domaćin ga je već postavio).
- **Blokada:** odmah ukida blokiranom pristup svim ranijim porukama iz sobe onoga ko je blokirao. Ako se blokiraju dva gosta za istim stolom, oba ostaju do kraja sesije, domaćin dobija obavijest, a od sljedeće sesije ne mogu sjediti zajedno. Blokada se ne otkriva onome ko je blokiran.
- **Uklonjen gost** ne može ponovo tražiti ulazak istim pozivom; domaćin ga može ponovo pozvati.
- **Dok domaćina nema**, gosti ne mogu pisati (sve je pauzirano).
- **Prekid veze** server primijeti za najviše ~8 sekundi (heartbeat), zatim teče 30 sekundi.

## Pokretanje na Replitu

1. Na replit.com: **Create → Import from GitHub** → izaberi `mamanebrini-dobrosam/limen`.
2. U lijevom meniju otvori **Database (PostgreSQL)** i napravi bazu. Replit sam postavlja `DATABASE_URL`.
3. U **Secrets** dodaj:
   - `APP_URL` = stvarna potvrđena adresa u odgovarajućem okruženju; razvoj bez ove postavke koristi razvojnu adresu. Ne nagađaj buduću javnu adresu.
   - `ADMIN_EMAILS` = tvoj email
   - za stvarnu email dostavu `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` prema [sigurnim uputama](docs/email-setup.md), ili samo prethodni `SMTP_URL` i `MAIL_FROM`. Nikad ne unosi ključeve u chat/kod.
4. Klikni **Run**. Aplikacija se pravi i pokreće na portu 5000; migracije baze se primjenjuju same.
5. Javna objava zahtijeva izričito odobrenje vlasnika i završene provjere stvarnih uređaja, emaila i produkcijske pohrane. Ova priprema ne objavljuje aplikaciju niti aktivira plaćene usluge.

### Tehnička i vizuelna priprema

- [Centralne vizuelne postavke](docs/visual-settings.md) i [odabrana LIMEN paleta](docs/limen-palette.md); razvojni pregled svih pozadina je na `/paleta`.
- `npm run email:check` — provjera postavki bez slanja poruke ili ispisa vrijednosti.
- `npm run test:browser` — odvojena testna baza i sintetički identiteti, bez promjene korisničke baze.
- Prije značajnih izmjena sačuvaj checkpoint koda. Ne briši postojeće korisničke podatke, ne mijenjaj sigurnosna pravila ili ekonomiju tokena u sklopu vizuelne pripreme i ne uključuj plaćene usluge bez odobrenja vlasnika.

## Lokalno pokretanje

Potrebno: Node.js 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env        # pa uredi DATABASE_URL
createdb limen
npm run dev                 # server :5000 + klijent :5173 → otvori http://localhost:5173
```

## Testovi

```bash
createdb limen_test
TEST_DATABASE_URL=postgres://.../limen_test npm test
```

28 automatskih testova pokrivaju testove 1–5, 7–9, 17 i 18 iz master prompta, plus utišavanje, EXIF, reset lozinke, brisanje naloga, rate limiting i pravilo od 30 sekundi (u testovima skraćeno na 600 ms). Testovi 6, 10–16 pripadaju Fazi 2 (igre, video, dodaci).

## Struktura

```
src/server/
  db/schema.ts          model podataka (Drizzle) – migracije u drizzle/
  services/rules.ts     sva pravila pristupa (ko smije čitati, pisati, sjesti)
  services/sessions.ts  otvaranje, sjedenje, uklanjanje, zatvaranje, 30 s
  routes/               REST API
  app.ts                Express + Socket.IO
src/client/             React (mobilni interfejs, ijekavica)
tests/                  Vitest + Supertest + socket.io-client
```
