# LIMEN — izvještaj o trenutnom stanju aplikacije

**Datum pregleda:** 26.10.2026.

**Namjena:** tehnička primopredaja i nezavisan stručni pregled.

**Obuhvat:** trenutni izvorni kod, Git historija, metapodaci razvojne baze, dostupni razvojni logovi i posljednji rezultati testiranja.

> Predaja dodaje samo ovaj dokument, bez izmjene aplikacijskog koda, konfiguracije ili sigurnosnih pravila. Za izvještaj nisu mijenjani baza, limiti ili korisnički nalozi. Nije pokrenuto slanje emaila, brisanje podataka ili objavljivanje aplikacije. Tajne vrijednosti nisu uključene. Primjeri naziva kolona poput `token_hash` nisu stvarni tokeni.
>
> Izvještaj razlikuje: **potvrđeno kodom/bazom**, **potvrđeno testom**, **ranije prijavljen problem**, **rizik za dodatnu provjeru** i **neprovjereno vanjskim servisom/stvarnim uređajem**. Ovo nije potvrda da aplikacija nema drugih grešaka niti zamjena za sigurnosni pregled.

## Sadržaj

1. [Pregled i historija](#1-pregled-i-historija)
2. [Prijava i limiti](#2-prijava-i-limiti)
3. [Problemi, ograničenja i logovi](#3-problemi-ograničenja-i-logovi)
4. [Baza i migracije](#4-baza-i-migracije)
5. [Testovi](#5-testovi)
6. [Okruženje](#6-okruženje)
7. [GitHub predaja i granice pregleda](#7-github-predaja-i-granice-pregleda)

## 1. PREGLED I HISTORIJA

### 1.1. Verzija i identifikacija koda

| Stavka | Stanje na početku pisanja izvještaja |
|---|---|
| Naziv paketa | `limen` |
| Verzija iz `package.json` | `1.0.0` |
| Opis paketa | `LIMEN — mjesto gdje priče žive (Faza 1 MVP)` |
| Lokalna grana | `main` |
| Zadnji commit aplikacijskog koda | `d7447975f4462345bad58132520ac7da3e0d5b5c` |
| Datum tog commita | `2026-10-26T18:11:24Z` |
| Poruka | `Implement login protection and error handling mechanisms` |
| Početna Faza 1 | `92cdf8a2b5852147a8a879e39ecd5a603ca40d1e` |
| GitHub repozitorij | `https://github.com/mamanebrini-dobrosam/Limen` |
| GitHub `main` prije ove predaje | Početni commit Faze 1, prema `git ls-remote` |
| Izmjene u radnom direktoriju prije izvještaja | Nije ih bilo |

Verzija `1.0.0` nije povećavana sa svakom većom izmjenom i sama ne identificira trenutno ponašanje. Za stručni pregled koristiti commit SHA. Dokumentacijski commit koji dodaje ovaj izvještaj dolazi **nakon** navedenog commita koda; njegov link dostavlja se pri predaji. Dokument ne može sadržati vlastiti konačni Git hash bez stvaranja novog commita.

### 1.2. Šta je trenutno implementirano

- Jedna glavna web aplikacija: React/Vite klijent, Express REST server, Socket.IO, PostgreSQL i Drizzle.
- Registracija emailom i lozinkom, provjera punoljetnosti, potvrda emaila, prijava, reset lozinke, odjava i odjava sa svih uređaja.
- Vlastiti QR identifikator korisnika; kontakti, zahtjevi, blokiranje, pozivi i zasebno odobravanje ulaska u sobu.
- Privatna soba i sadržaji vlasnika; ograničen prikaz gostima samo za označen sadržaj.
- Zajednički sto sa domaćinom i najviše pet gostiju; prava čitanja kroz intervale učestvovanja, utišavanje i udaljavanje.
- Odvojeni privatni razgovori registrovanih korisnika, odvojeni gostujući razgovori bez punog profila, ručno odobravanje i siguran oporavak gosta.
- Fotografije, privatna galerija, provjera stvarnog formata i uklanjanje metapodataka fotografije.
- Prijava zloupotrebe, administratorski pregled s audit zapisom i izvoz/brisanje naloga.
- Centralizovane vizuelne postavke, dvanaest odabranih pozadina sobe, neizmijenjena originalna slika zvaničnog logotipa.
- Uređivanje profila/sobe sa lokalnim nacrtom, eksplicitnim čuvanjem i odbacivanjem nesačuvanog.
- Pasivni prikaz preostalog vremena blokade na obrascima navedenim u odjeljku 2.7.

**Važno za tumačenje toka registracije:** registracija već pravi korisnika, sobu i početne cjeline u bazi, prije potvrde emaila. Potvrđen email je uslov za društvene funkcije. U trenutnom kodu nije pronađen zaseban obavezni korak skeniranja vlastitog QR koda kao uslov za otključavanje uređivanja vlastitog profila. To treba uporediti s prvobitnim proizvodnim zahtjevom; nije automatski dokaz greške u trenutnoj autorizaciji.

### 1.3. Sve veće promjene nakon početne Faze 1

1. **Prilagođavanje Replitu:** port i host, Preview pokretanje izgrađenog klijenta i servera, konfiguracija projekta i post-merge skripta.
2. **Mediji:** priprema privatnog Replit App Storage backenda, lokalni razvojni backend, migracijska skripta za postojeće fotografije i očuvanje server-side provjera pristupa. Stvarni bucket nije pokriven dosadašnjim izolovanim testom.
3. **Kontakti i privatni razgovori:** odvojen zahtjev za privatni razgovor, ručno odobravanje, historija, paginacija, nepročitano, blokiranje, izvoz i brisanje nakon 30 dana neaktivnosti.
4. **Gostujući identitet:** razgovor bez punog profila kroz privatni kolačić, vlasnikovo odobrenje, početni limit dvije uzastopne gostujuće poruke, vlasnikovo upravljanje tim limitom i odvojena provjera identiteta za dalje povezivanje.
5. **Siguran oporavak gosta:** poseban jednokratni ključ, rotacija ključeva i kolačića; QR/ID/nadimak sami ne vraćaju pristup.
6. **QR skener:** obrada dozvola i grešaka kamere, zadnja kamera, prekid oslobađa stream, skeniranje slike kao alternativa i odbijanje nepouzdanih URL-ova.
7. **Email:** priprema SMTP-a, TLS provjere i sigurna dijagnostika, stvarna potvrda vlasništva, jednokratni verifikacijski linkovi; testni outbox je ograničen na izolovano testno okruženje.
8. **Vizuelni sistem:** centralni tokeni i postavke, prijedlog „B — Privatni salon“, dvanaest pozadina, provjere kontrasta i vlasništva. Testovi ne znače da je vlasnik konačno odobrio izgled; ranije je izričito iskazao nezadovoljstvo paletom. U zadnjim funkcionalnim popravkama dizajn nije dalje mijenjan.
9. **Izlazak iz uređivanja:** vidljiv izlaz i odustajanje, povratak na aktivnu sobu ili početnu stranicu bez zahtijevanja popunjenog opcionog profila.
10. **Eksplicitno čuvanje:** sve izmjene profila/sobe, uključujući fotografije, vidljivost, boju i brisanje, ostaju nacrt do „Sačuvaj i izađi“. Paleta je početno skrivena.
11. **Odbrojavanje blokade:** serverovo postojeće vrijeme prikazuje se i lokalno odbrojava, bez automatske prijave. **Brojanje pokušaja i postojeći limiti nisu prepravljeni.**
12. **Testovi i dokumentacija:** dodani integracijski, jedinični i izolovani preglednički testovi, upute za telefone, email i vizuelne postavke.

### 1.4. Kompletna lokalna historija commitova do pregleda

Svi navedeni commitovi su od 26.10.2026. Skraćeni hash služi navigaciji; puni hash posljednjeg koda je iznad.

| Commit | Poruka |
|---|---|
| `92cdf8a` | LIMEN Faza 1: nalozi, QR kontakti, soba, chat, galerija, moderacija |
| `243a34c` | Update Replit configuration settings |
| `d326f92` | Update project configuration and server initialization settings |
| `0a675ee` | Move production photo storage to Replit App Storage |
| `0926872` | Configure replit environment and add post-merge script |
| `3947567` | Update database schema and implement contact management features |
| `97e226e` | Update project dependencies and implement chat authentication features |
| `c7d9c93` | Update authentication flow and refactor visitor page structure |
| `7e5da5c` | Update project configuration and refactor client styles and pages |
| `e1c9d0e` | Checkpoint LIMEN before approved private-salon integration |
| `3b64529` | Update visual identity and palette configurations across the application |
| `af008a4` | Implement and document email verification logic |
| `adb1f43` | Update generated mockup components |
| `f623436` | Implement room editor and add associated profile editor tests |
| `796e47c` | Refactor room editor and update project documentation |
| `d744797` | Implement login protection and error handling mechanisms |

Naziv zadnjeg commita može sugerisati širu promjenu sigurnosti nego što je urađeno: zadnja isporuka dodala je prikaz greške i odbrojavanje na klijentu, ne novu server-side politiku prijave.

### 1.5. Struktura i važni fajlovi

```text
src/
  client/                  glavna React aplikacija
    components/            zajednički prikaz greške i odbrojavanja
    lib/                   QR, računanje čekanja, nacrt uređivača
    pages/                 funkcionalne stranice aplikacije
    public/brand/palette/  originalni izrezi izvornog logotipa/palete
    visual/                centralne vizuelne postavke i stilovi
  server/
    db/                    schema, konekcija i migrator
    lib/                   auth, greške, rate limit, email, mediji
    routes/                REST endpointi
    services/              poslovna pravila sobe i razgovora
    scripts/               SMTP provjera i migracija fotografija
  shared/                  zajednička paleta i tipovi izvedeni iz nje
drizzle/                   4 SQL migracije i Drizzle metapodaci
tests/                     10 Vitest fajlova i Playwright skripte
docs/                      tehničke i testne upute, ovaj izvještaj
scripts/                   post-merge priprema i izdvajanje palete
artifacts/mockup-sandbox/  odvojeni vizuelni prototipovi, nije glavna aplikacija
attached_assets/           korisničke referentne slike i projektni materijali
storage/                   lokalne fotografije u razvoju, nije arhiva za Git
storage-test/              lokalni testni mediji, nije korisnička produkcijska baza
dist/                      generisani frontend build
generated-artifacts/       generisani testni snimci, izvan predaje izvornog koda
.agents/memory/            projektna ograničenja i trajne odluke za agente
```

| Fajl ili grupa | Uloga |
|---|---|
| `package.json` | Verzija, skripte, deklarisane zavisnosti; `private: true` se odnosi na paket, ne dokazuje privatnost GitHub repozitorija. |
| `package-lock.json`, `pnpm-lock.yaml` | Oba lock fajla postoje. Prilikom reprodukcije dogovoriti jedan package manager; u ovom zadatku nisu mijenjani. |
| `.replit` | Moduli, portovi, workflow, deklarisana buduća VM objava i post-merge putanja. |
| `.env.example` | Primjer naziva konfiguracije; nije kompletan popis svih kasnije dodanih SMTP/RL opcija. Ne koristiti kao dokaz stvarnih vrijednosti. |
| `.gitignore`, `.replitignore` | Isključivanje lokalnih/generisanih sadržaja iz Git-a i objave. |
| `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts` | Build, TypeScript, izolacija testnog okruženja i Drizzle konfiguracija. |
| `README.md`, `replit.md` | Početne upute i projektni kontekst; starije tvrdnje provjeravati prema kodu i ovom presjeku. |
| `src/client/main.tsx` | React inicijalizacija i stvarne rute aplikacije. |
| `src/client/shell.tsx` | Auth kontekst, zaštita prikaza, navigacija i zajednički okvir. |
| `src/client/api.ts` | Same-origin API pozivi, `x-limen` zaglavlje, greške i preuzimanje vremena blokade. |
| `src/client/socket.ts` | Socket.IO povezivanje klijenta. |
| `src/client/components/ErrorNotice.tsx` | Lokalni prikaz čekanja; ne šalje mrežne zahtjeve. |
| `src/client/lib/rate-limit.ts` | Parsiranje trajanja/HTTP datuma, preostale sekunde i tekst minuta/sekundi. |
| `src/client/lib/qr.ts` | Provjera dozvoljenih QR sadržaja/putanja i poruke za greške kamere. |
| `src/client/lib/room-editor-draft.ts` | Slanje eksplicitno potvrđenog nacrta postojećim endpointima; pamti napredak poslije djelimične greške. |
| `src/client/pages/Auth.tsx` | Prijava, registracija, potvrda emaila i reset lozinke. |
| `src/client/pages/Home.tsx` | Početni prikaz i otvaranje/nastavak vlastite sobe. |
| `src/client/pages/Contacts.tsx` | Kontakti, povezivanje QR-om i odvojeni zahtjevi/odobrenja. |
| `src/client/pages/Scanner.tsx` | Kamera, QR iz slike, sigurno zaustavljanje kamere. |
| `src/client/pages/Room.tsx` | Sto, prisutnost, učesnici, poruke sobe i vlasničke kontrole. |
| `src/client/pages/DirectChat.tsx` | Privatni razgovori registrovanih korisnika. |
| `src/client/pages/Visitor.tsx` | Gostujući QR zahtjev, lista i prikazi gostujućih razgovora, vlasnički prikaz. |
| `src/client/pages/GuestRecovery.tsx` | Izdavanje/preuzimanje ključa i oporavak gostujućeg pristupa. |
| `src/client/pages/RoomEditor.tsx` | Lokalni nacrt profila/postavki sobe, sačuvaj/izađi/odustani. |
| `src/client/pages/ProfileSectionEditor.tsx` | Polja i kontrole pojedinačne cjeline nacrta. |
| `src/client/pages/RoomEditor.css` | Lokalni stilovi uređivača i njegovog vidljivog izlaza. |
| `src/client/pages/PaletteReview.tsx` | Read-only pregled dvanaest pozadina. |
| `src/client/pages/Settings.tsx` | Korisničke postavke, blokade, izvoz i brisanje naloga. |
| `src/client/pages/Admin.tsx` | Administratorski pregled prijava. |
| `src/client/styles.css` | Osnovni stilovi glavne aplikacije. |
| `src/client/visual/settings.ts`, `tokens.ts` | Centralna konfiguracija identiteta i izvedeni CSS tokeni. |
| `src/client/visual/applyVisualSettings.ts` | Primjena vizuelnih tokena na dokument. |
| `src/client/visual/Brand.tsx` | Originalna slika zvaničnog logotipa, ne redizajn simbola. |
| `src/client/visual/salon.css` | Implementirani vizuelni okvir „Privatni salon“. |
| `src/shared/room-palettes.ts` | Dvanaest odabranih paleta, koordinata izreza i kontrasta. |
| `src/server/index.ts` | Start servera, razvojne migracije, sweep/cleanup poslovi. |
| `src/server/app.ts` | Express, `trust proxy`, Helmet/CSP, API middleware/rute, statički build i Socket.IO autorizacija. |
| `src/server/config.ts` | Centralno čitanje konfiguracije i podrazumijevani limiti. |
| `src/server/db/client.ts` | PostgreSQL pool/Drizzle instanca. |
| `src/server/db/schema.ts` | Model svih 26 aplikacijskih tabela, ključevi, indeksi i ograničenja. |
| `src/server/db/migrate.ts` | Drizzle migrator; ne izvršavati nekritički na produkciji. |
| `src/server/lib/auth.ts` | Nasumične sesije, kolačić, učitavanje korisnika, verified/admin i CSRF zaštita. |
| `src/server/lib/core.ts` | `HttpError`, error handler, hash/token pomoćne funkcije i validacija. |
| `src/server/lib/infra.ts` | Jedini zajednički vremenski rate limiter, SMTP slanje, realtime hub i obavijesti. |
| `src/server/lib/mail-settings.ts`, `smtp-settings.ts` | Provjera spremnosti emaila i konfiguracija sigurnog SMTP/TLS transporta. |
| `src/server/lib/media.ts` | Obrada fotografija, lokalni/object backend, čitanje i uklanjanje medija. |
| `src/server/routes/auth.ts` | Auth, verifikacija, reset, nalog, izvoz/brisanje i izolovani testni outbox. |
| `src/server/routes/contacts.ts` | Kontakti i blokade. |
| `src/server/routes/rooms.ts` | Vlastita soba, otvaranje, pozivanje, zahtjevi i smještanje za sto. |
| `src/server/routes/chat.ts` | Historija/poruke/fotografije zajedničkog stola i ovlašteno posluživanje medija. |
| `src/server/routes/content.ts` | Sadržaji sobe, prijave i administratorske rute. |
| `src/server/routes/direct-chat.ts`, `visitor-chat.ts` | Endpointi dva odvojena tipa privatnog razgovora. |
| `src/server/services/rules.ts` | Provjere prava pristupa i zajedničkih poslovnih pravila. |
| `src/server/services/sessions.ts` | Životni ciklus sobe/stola, intervali, prisutnost i 30-sekundni rokovi. |
| `src/server/services/direct-chat.ts`, `visitor-chat.ts` | Transakcijska pravila razgovora, gostujući limit, oporavak i retention. |
| `src/server/scripts/check-email.ts` | Sigurna provjera SMTP pripreme; nije dokaz dostave u stvarni inbox. |
| `src/server/scripts/migrate-media-to-object-storage.ts` | Eksplicitna migracija medija; nije pokretana za ovaj izvještaj. |
| `scripts/post-merge.sh` | Priprema okruženja nakon spajanja izmjena. |
| `scripts/extract-limen-palette.mjs` | Ponovljivo izdvajanje odabranih izreza iz originalne slike. |
| `drizzle/0000_init.sql` do `0003_lazy_thunderball.sql` | Četiri verzionisane SQL migracije. |
| `drizzle/meta/*` | Snimci sheme i redoslijed migracija. |
| `tests/helpers.ts` | Testni server/klijenti i reset izolovane testne baze. **Može brisati testne tabele; ne koristiti protiv stvarne baze.** |
| `tests/run-browser-tests.mjs`, `browser-server.ts`, `browser-target.mjs` | Zaštićeno pokretanje pregledničkih testova na odvojenoj `_test` bazi i lokalnom testnom serveru. |
| `tests/browser-visitor.mjs` | Glavni autentifikovani/anonimni preglednički tok; uključuje profil i palete. |
| `tests/browser-profile-editor.mjs`, `browser-palettes.mjs` | Provjere nacrta, odustajanja, čuvanja, palete i gostujućih zabrana. |
| `tests/browser-scanner.mjs`, `browser-rate-limit.mjs` | Simulacije skenera i pasivnog odbrojavanja. |
| `docs/email-setup.md`, `mobile-testing.md`, `visual-settings.md`, `limen-palette.md`, `login-protection-review.md` | Detaljne ranije upute/analize; sigurnosni prijedlog u zadnjem dokumentu nije odobrena promjena politike. |

## 2. PRIJAVA I LIMITI

### 2.1. Jedini zajednički vremenski limiter — tačan kod

Izvor: `src/server/lib/infra.ts`. Ovo je aktivni PostgreSQL limiter, ne memorijski limiter i ne `express-rate-limit`.

```ts
export async function rateLimit(bucket: keyof typeof config.limits | string, subject: string) {
  if (!config.rateLimitsEnabled) return;
  const lim = config.limits[bucket];
  if (!lim) throw new Error(`Nepoznat limit: ${bucket}`);
  const [max, windowSec] = lim;
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = nowSec - (nowSec % windowSec);
  const key = `${bucket}:${subject}`;
  const r = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, to_timestamp(${windowStartSec}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(r.rows[0].count);
  if (count > max) {
    const retryAfter = windowStartSec + windowSec - nowSec;
    throw new HttpError(429, "rate_limited", "Previše pokušaja. Pokušaj ponovo kasnije.", { retryAfter });
  }
}

export async function cleanupRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '2 days'`);
}
```

Kako se računa:

- `[max, windowSec]` znači broj dozvoljenih poziva funkcije za isti ključ u fiksnom vremenskom prozoru.
- Prozori su poravnati na Unix vrijeme. Primjer za prijavu: `xx:00–xx:15`, `xx:15–xx:30`, itd. Dnevni prozor je poravnat na UTC, ne na lokalnu ponoć korisnika.
- Prvih `max` prolazi limiter; sljedeći, tj. `max + 1`, vraća 429.
- SQL `INSERT ... ON CONFLICT ... count + 1` je atomski; brojač radi i s više procesa koji koriste istu bazu.
- Broji se svaki dolazak do te tačke u endpointu, ne nužno samo uspješna poslovna radnja.
- **I odbijeni pokušaj povećava brojač, ali ne pomjera završetak prozora.** Nema kliznog niti eksponencijalno produžavanog roka.
- Pri novom prozoru nastaje drugi red `(key, window_start)`. Stari red ostaje do čišćenja, ali se ne koristi kao brojač novog prozora.
- `rate_limits` redovi opstaju nakon restarta. Restart, odjava ili brisanje kolačića ne brišu blokadu.
- Cleanup se raspoređuje na svakih sat vremena u `src/server/index.ts`; briše zapise čiji početak prozora je stariji od dva dana. To nije mehanizam koji otključava korisnika nakon 15 minuta.
- Ako baza nije dostupna, limiter ne prelazi tiho na memoriju i ne daje pristup: greška dalje završava kao serverska greška.

### 2.2. Sve vrijednosti iz konfiguracije — tačan kod

Izvor: `src/server/config.ts`. Brojevi ispod su podrazumijevane vrijednosti u kodu, ne izložene vrijednosti Secrets. Pregled projektnog inventara nije pokazao posebno postavljene `RL_*` opcije.

```ts
// Rate limiting: [broj zahtjeva, prozor u sekundama]
rateLimitsEnabled: env.RATE_LIMITS_ENABLED !== "false",
limits: {
  login: [int("RL_LOGIN", 5), 15 * 60],
  register: [int("RL_REGISTER", 3), 60 * 60],
  contactRequest: [int("RL_CONTACT_REQUEST", 20), 24 * 60 * 60],
  invite: [int("RL_INVITE", 30), 60 * 60],
  message: [int("RL_MESSAGE", 30), 60],
  directRequest: [int("RL_DIRECT_REQUEST", 10), 24 * 60 * 60],
  visitorRequest: [int("RL_VISITOR_REQUEST", 10), 24 * 60 * 60],
  visitorMessage: [int("RL_VISITOR_MESSAGE", 30), 60],
  visitorRecovery: [int("RL_VISITOR_RECOVERY", 5), 15 * 60],
  visitorRecoveryIssue: [int("RL_VISITOR_RECOVERY_ISSUE", 5), 60 * 60],
  upload: [int("RL_UPLOAD", 10), 60],
  report: [int("RL_REPORT", 10), 24 * 60 * 60],
  passwordReset: [int("RL_PASSWORD_RESET", 5), 60 * 60],
} as Record<string, [number, number]>,
```

| Bucket | Dozvoljeno | Prozor | Subjekt/ključ | Dijeljenje brojača |
|---|---:|---:|---|---|
| `login` | 5 | 15 min | `ip:${req.ip}` i zasebno `email:${body.email}` | Svi na istom prepoznatom IP-u; zasebno svi pokušaji istog emaila. |
| `login`, provjera identiteta gosta | 5 | 15 min | `visitor-claim:${userId}:${req.ip}` | Kombinacija prijavljenog naloga i IP-a, nije isti ključ kao obični login. |
| `register` | 3 | 60 min | `req.ip ?? "?"` | Svi s iste prepoznate mrežne adrese. |
| `contactRequest` | 20 | 24 h | korisnički ID | Po nalogu. |
| `invite` | 30 | 60 min | domaćinov korisnički ID | Sve sobe/pozivi tog domaćina koriste njegov ključ. |
| `message` | 30 | 60 sek | korisnički ID | Registrovani korisnik dijeli ovaj bucket između stola, direct chata i vlasničkih odgovora u visitor chatu. |
| `directRequest` | 10 | 24 h | korisnički ID | Po registrovanom nalogu. |
| `visitorRequest` | 10 | 24 h | `ip:${req.ip}` | Više anonimnih gostiju na istoj prepoznatoj mreži dijeli ga. |
| `visitorMessage` | 30 | 60 sek | `ip:${req.ip}` | Gostujuće poruke s istog prepoznatog IP-a, ne po pojedinom razgovoru. |
| `visitorRecovery` | 5 | 15 min | `ip:${req.ip}` | Oporavci s iste mrežne adrese. |
| `visitorRecoveryIssue` | 5 | 60 min | `ip:${req.ip}` | Izdavanja/zamjene ključa s iste mrežne adrese. |
| `upload` | 10 | 60 sek | korisnički ID | Zajednički bucket za fotografiju u sadržaju sobe i fotografiju u chatu stola. |
| `report` | 10 | 24 h | korisnički ID | Po nalogu. |
| `passwordReset` | 5 | 60 min | `ip:${req.ip}` i `email:${body.email}` | Dva odvojena ključa za zahtjev promjene lozinke. |
| `passwordReset`, resend verifikacije | 5 | 60 min | `verify:${userId}` | Poseban ključ po nalogu; ne dijeli isti red kao reset lozinke. |

### 2.3. Sva mjesta pozivanja — tačni pozivi i endpointi

Sljedeće linije su tačni pozivi iz ruta; komentari označavaju endpoint radi navigacije. Primjena ranije middleware autorizacije/validacije ostaje bitna.

```ts
// src/server/routes/auth.ts
// POST /api/auth/register
await rateLimit("register", req.ip ?? "?");
// POST /api/auth/resend-verification
await rateLimit("passwordReset", `verify:${u.id}`);
// POST /api/auth/login, ovim redom
await rateLimit("login", `ip:${req.ip}`);
await rateLimit("login", `email:${body.email}`);
// POST /api/auth/forgot-password, ovim redom
await rateLimit("passwordReset", `ip:${req.ip}`);
await rateLimit("passwordReset", `email:${body.email}`);

// src/server/routes/contacts.ts — POST /api/contacts/request
await rateLimit("contactRequest", meId);

// src/server/routes/rooms.ts — POST /api/sessions/:id/invitations
await rateLimit("invite", host.id);

// src/server/routes/chat.ts
// POST /api/sessions/:id/messages
await rateLimit("message", u.id);
// POST /api/sessions/:id/images
await rateLimit("upload", u.id);

// src/server/routes/content.ts
// POST /api/room/items/image
await rateLimit("upload", u.id);
// POST /api/reports
await rateLimit("report", u.id);

// src/server/routes/direct-chat.ts
// POST /api/direct/requests
await rateLimit("directRequest", me(req).id);
// POST /api/direct/conversations/:id/messages
await rateLimit("message", me(req).id);

// src/server/routes/visitor-chat.ts
// POST /api/visitor/recover
await rateLimit("visitorRecovery", `ip:${req.ip}`);
// POST /api/visitor/requests
await rateLimit("visitorRequest", `ip:${req.ip}`);
// POST /api/visitor/conversations/:id/messages
await rateLimit("visitorMessage", `ip:${req.ip}`);
// POST /api/visitor/conversations/:id/claim
await rateLimit("login", `visitor-claim:${req.user!.id}:${req.ip}`);
// POST /api/visitor/conversations/:id/recovery
await rateLimit("visitorRecoveryIssue", `ip:${req.ip}`);
// POST /api/visitor/owner/:id/messages
await rateLimit("message", req.user!.id);
```

Endpoint putanje su sastavljene od prefiksa routera i putanje rute; tačne definicije provjeriti u navedenim fajlovima. Odvojeno od ovoga postoje **poslovni** limiti: najviše pet gostiju za stolom i početno dvije uzastopne poruke gosta u privatnom razgovoru. To nisu vremenski `rate_limits` brojači. Vlasnik može promijeniti uzastopni limit; odgovor vlasnika resetuje niz. Pravila su u `services/direct-chat.ts` i `services/visitor-chat.ts`, koriste transakciju i ne zamjenjuju vremenski limiter. Vrijednost `NULL` za `guest_limit` znači neograničen uzastopni niz, ne isključivanje svih drugih zaštita.

### 2.4. Redoslijed provjera kod prijave

Izvor: `src/server/routes/auth.ts`, tačan handler:

```ts
authRouter.post("/login", ah(async (req, res) => {
  const body = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body);
  await rateLimit("login", `ip:${req.ip}`);
  await rateLimit("login", `email:${body.email}`);
  const [u] = await db.select().from(s.users).where(eq(s.users.email, body.email)).limit(1);
  const ok = await verify(u?.passwordHash ?? DUMMY_HASH, body.password);
  if (!u || !ok) throw new HttpError(401, "bad_credentials", "Pogrešan email ili lozinka.");
  const sess = await createSession(u.id, req.get("user-agent"));
  setSessionCookie(res, sess.token, sess.expiresAt);
  res.json({ user: publicUser(u) });
}));
```

Širi redoslijed:

1. Express/Helmet/kolačići i JSON parser.
2. `csrfGuard` za `/api`: zahtjev koji mijenja stanje mora imati `x-limen: 1`.
3. `loadUser`: ako postoji sesijski kolačić, provjerava ga u bazi.
4. Zod validacija tijela; email se normalizuje prema definiciji `email` u auth ruti.
5. Povećanje i provjera mrežnog login brojača.
6. Ako mrežni prolazi, povećanje i provjera email login brojača.
7. Traženje korisnika u bazi.
8. Argon2 provjera lozinke; za nepostojećeg korisnika provjerava se `DUMMY_HASH` radi ujednačenijeg ponašanja.
9. Pogrešan/nepostojeći nalog vraća isti `bad_credentials`.
10. Tačna lozinka pravi novu sesiju u `auth_sessions`.
11. Sirovi nasumični sesijski token ide u `limen_sid` kolačić, a SHA-256 hash u bazu.
12. Vraća se javni dio naloga. Potvrda emaila se provjerava na zaštićenim društvenim rutama i u klijentskom toku, ne kao zabrana same prijave.

Zato uspješna prijava povećava oba brojača i ne resetuje ih. Ako mrežni brojač odbije zahtjev, email brojač se za taj zahtjev više ne izvršava. Nema posebnog „broji samo pogrešne lozinke“ brojača.

Sesije su serverske, nisu JWT: `createSession` koristi `randomToken(32)`, u bazu sprema hash, vrijeme isteka i skraćeni user-agent. Podrazumijevani život sesije je 30 dana. Kolačić ima `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` je uključen u produkcijskom režimu, a ne u običnom razvojnom režimu. Postavljeni `SESSION_SECRET` nije upotrijebljen za potpisivanje ove opaque-session implementacije u pregledanom kodu.

### 2.5. Proxy i stvarna IP adresa

Tačno podešavanje u `src/server/app.ts`:

```ts
const app = express();
app.set("trust proxy", 1);
```

- Replit Preview se otvara preko `.replit.dev` ulazne infrastrukture, a ne direktno na proces u kontejneru. Aplikacija jeste iza posredničkog/proxy sloja.
- Express pri ovom podešavanju vjeruje jednom proxy hopu; `req.ip` izvodi iz socket adrese i lanca `X-Forwarded-For`, prema Express pravilima.
- Kod ne vodi odvojeni uređajski identitet za mrežni login limiter i ne razdvaja korisnike na istom IP-u.
- NAT, zajednički Wi-Fi i mobilni operator mogu dati isti javni IP različitim korisnicima.
- **Nije potvrđeno da broj `1` odgovara svakom stvarnom putu do ovog Previewa.** Prekratko povjerenje može vratiti adresu posrednika, preširoko može dozvoliti lažno predstavljanje kroz proslijeđena zaglavlja.
- U ovom pregledu nije mijenjan proxy niti dodavan endpoint koji javno vraća IP. Nije dokazano da je svaki raniji zajednički brojač nastao isključivo zbog zajedničkog Wi-Fi-ja, a ne zbog načina prosljeđivanja IP-a.
- Stručni pregled treba uporediti socket peer i lanac zaglavlja kroz stvarni ulazni put, bez zapisivanja nepotrebnih ličnih podataka. Ne mijenjati na `trust proxy=true` naslijepo.

Konzultovana Replit dokumentacija potvrđuje razvojne URL-ove i odvojenost Previewa od objave, ali pregled nije pronašao službenu garanciju tačnog broja proxy hopova za ovaj projekat:

- https://docs.replit.com/core-concepts/project-editor/app-setup/development-urls
- https://docs.replit.com/features/publishing/overview

### 2.6. Poruke koje korisnik može vidjeti pri prijavi

| Kontekst | HTTP/kod | Tekst |
|---|---|---|
| Pogrešan email, lozinka ili nepostojeći nalog | 401 `bad_credentials` | `Pogrešan email ili lozinka.` |
| Prekoračen limiter, izvorni server odgovor | 429 `rate_limited` | `Previše pokušaja. Pokušaj ponovo kasnije.` |
| Isti odgovor, kada postoji valjano vrijeme | lokalni prikaz | `Previše pokušaja. Pokušaj ponovo za 4 min 12 sek.` — broj je dinamičan. |
| Lokalni istek tog vremena | lokalni prikaz | `Čekanje je isteklo. Možeš ponovo pokušati.` |
| Neispravno tijelo nakon JSON parsiranja | 400 `validation` | `Neispravni podaci.` |
| Nedostaje/ispravno nije postavljeno CSRF zaglavlje | 403 `csrf` | `Neispravan zahtjev.` |
| Preveliko JSON tijelo | 413 `too_large` | `Zahtjev je prevelik.` |
| Neočekivana serverska/DB greška | 500 `server` | `Došlo je do greške na serveru.` |
| Mrežna greška, neprepoznatljiv odgovor ili klijentski fallback | klijent | `Nešto nije u redu. Pokušaj ponovo.` |
| Zaštićena ruta bez važeće prijave, ne samo POST login | 401 `unauthorized` | `Prijavi se da nastaviš.` |
| Društvena ruta sa nepotvrđenim emailom, poslije prijave | 403 `forbidden` | `Potvrdi email adresu da nastaviš.` |

Prazna obavezna polja i neispravan oblik emaila mogu prikazati i **nativnu poruku preglednika**, čiji tekst zavisi od jezika i preglednika; tada login zahtjev često uopće nije poslan. Obična prijava sama ne šalje email i ne mora dobiti SMTP grešku da bi provjerila lozinku.

### 2.7. Odbrojavanje: šta jeste, a šta nije promijenjeno

- Server već vraća `retryAfter` u JSON-u i `Retry-After` zaglavlje iz `errorHandler` u `src/server/lib/core.ts`:

```ts
if (err instanceof HttpError) {
  if (err.extra?.retryAfter) res.setHeader("Retry-After", String(err.extra.retryAfter));
  return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
}
```

- `src/client/api.ts` zadržava vrijeme kao `ApiError.retryAt` samo za status 429.
- `retryDeadline` prvo čita valjani broj sekundi iz tijela, zatim zaglavlje. Podržan je i HTTP datum.
- `ErrorNotice` računa preostalo vrijeme prema roku, ne smanjuje trajni server brojač.
- Timer osvježava samo React stanje. Nema `fetch`, API poziva, automatskog submita niti otključavanja naloga.
- Na nuli se prikazuje mogućnost ručnog pokušaja. Server i dalje odlučuje hoće li ga prihvatiti.
- Pri napuštanju prikaza timer se čisti. Vrijeme se ne sprema kao ovlaštenje u localStorage.
- Ako nema valjanog vremena, ostaje opća poruka; aplikacija ne izmišlja rok.
- Aktivni prikaz je povezan sa auth obrascima, resend/verify greškama, gostujućim QR zahtjevom i alatima/obrascem oporavka.
- **Nije povezan sa svakim postojećim prikazom greške u svim chat, kontakt i soba ekranima.** Neki od njih još pretvaraju `ApiError` u običan tekst. To nije promjena njihovih limita niti obećanje univerzalnog odbrojavanja.

### 2.8. Nalaz blokade i neodobrena alternativa

Pri prethodnoj dijagnostici pronađen je mrežni login brojač sa **16** pokušaja i zaseban email brojač sa **5** pokušaja u istom 15-minutnom prozoru. Identiteti nisu preneseni u izvještaj. Taj prozor završio je 26.10.2026. u **19:00 Europe/Vienna**, odnosno 18:00 UTC, i zatim je imao nula preostalih sekundi. Ovo je historijski nalaz, ne tvrdnja da je korisnik sada blokiran.

Predloženo, ali **nije odobreno niti primijenjeno**:

- Zaseban širi mrežni prag protiv naleta zahtjeva, prije skupe provjere lozinke.
- Strožiji brojači neuspjelih provjera naloga/izvora; uspjeh ne tretirati kao pogrešnu lozinku.
- Zaštita i od distribuiranog napada i od namjernog zaključavanja tuđeg naloga.
- Eventualni reset samo odgovarajućeg užeg niza grešaka, ne svih brojača mreže ili drugih naloga.
- Prvo provjeriti proxy/IP, zatim s vlasnikom odobriti tačne pragove i rokove. Nema odobrenja za gašenje postojeće zaštite.

## 3. PROBLEMI, OGRANIČENJA I LOGOVI

### 3.1. Poznati problemi i stanje dosadašnjih pokušaja

| Nalaz | Status i šta je urađeno | Šta ostaje |
|---|---|---|
| Uspješne prijave troše strogi login limit; domaćin i gost mogu dijeliti mrežni brojač. | Potvrđeno kodom i brojačima; analizirano, dodana jasna poruka i pasivni timer. | Politika brojanja nije mijenjana; potrebna dodatna saglasnost. |
| Stvarna IP adresa kroz Replit proxy nije end-to-end potvrđena. | Postoji `trust proxy=1`; nije ga se proizvoljno širilo. | Provjera stvarnog lanca i otpornosti na lažna zaglavlja. |
| Dnevni `visitorRequest` i minutni `visitorMessage` su po IP-u, ne po gostu. | Potvrđeno u ruti; namjerno nije prepravljeno tokom UI popravke. | Procijeniti posljedice zajedničkih mreža uz očuvanje zaštite. |
| Nije se vidjelo koliko treba čekati. | Popravljeno za navedene obrasce; testirani countdown, nula, novi ručni klik i odlazak sa stranice bez automatskih zahtjeva. | Ostali prikazi greške nisu svi integrisani s timerom. |
| Korisnik je ostajao u uređivanju profila. | Dodani jasni izlazi, povratna ruta/fallback i eksplicitno čuvanje; preglednički testovi prolaze. | Stvarni uređaji nisu fizički provjereni. |
| Miješali su se autosave i nesačuvani nacrti. | Zamijenjeno lokalnim nacrtom za sve izmjene; paleta zatvorena do klika; odustajanje ne šalje save. | Svi stariji otvoreni tabovi moraju učitati novu verziju klijenta da bi dobili novo UI ponašanje. |
| „Sačuvaj i izađi“ nije jedna atomska operacija. | Postojeći API pozivi čuvaju korak po korak; napredak se zadržava za retry bez dupliranja. Greška navodi djelimičan uspjeh kada ga je bilo. | Prekid može ostaviti dio već potvrđenih izmjena sačuvan. Odustajanje ne vraća već dovršene save zahtjeve. Već poslani zahtjev može dovršiti rad i nakon napuštanja prikaza; naredni koraci se zaustavljaju. |
| Verifikacijski email nije stizao tokom ranijeg testiranja. | Uvedeni provjera pripreme, siguran SMTP/TLS i jasne greške, bez ručne verifikacije stvarnih naloga. Korisnik je postavio Brevo Secrets. | Samo postojanje Secrets i prolazak sintetičkih testova nisu dokaz trenutne Brevo prihvaćenosti, reputacije pošiljaoca ili dostave u inbox. U ovom zadatku nije izvršen vanjski SMTP test. |
| Testovi su mogli naslijediti stvarni SMTP. | `vitest.config.ts` i browser runner eksplicitno prazne SMTP postavke i koriste testni outbox. | Očuvati izolaciju pri budućim promjenama testnog pokretanja. |
| Pravi App Storage bucket nije potvrđen ranijim testovima. | Backend i migracijska skripta postoje; lokalni testovi medija prolaze. | Upload/download/brisanje i privatnost na stvarnom bucketu još traže nezavisnu provjeru. Nije pokretana migracija stvarnih medija. |
| Stvarni mobilni skener i Safari nisu potvrđeni. | Postoje Chromium simulacije kamere, dozvola, zauzete/nedostupne kamere, prekida streama, QR slike i sigurnih putanja. | Android Chrome i iPhone Safari s kamerom na stvarnim uređajima; vidjeti `docs/mobile-testing.md`. |
| Ranije vizuelne kombinacije nisu dobile konačno vlasnikovo odobrenje. | Pripremljeni prijedlozi, izabran B i izvedena paleta; kasnije je vlasnik iskazao nezadovoljstvo i zabranio daljnje promjene bez pregleda. | Stručni/korisnički vizuelni pregled; ne tretirati kontrastne testove kao odobrenje dizajna. Logo ne mijenjati. |
| Browser test selektor za brisanje cjeline nije nalazio naslov. | U prethodnom testiranju ispravljena pretpostavka testa: dostupno ime naslova uključivalo je i dugme. Nakon ispravke testovi prolaze. | Ovo nije ostavljen reproduktivan aplikacijski bug. |
| Duple Express TypeScript definicije otežavale su proširenje Request tipa. | Dodana globalna type augmentacija bez promjene runtime autorizacije; typecheck prolazi. | Ne prepravljati auth logiku radi rješavanja budućeg tipnog konflikta. |
| Veći frontend bundle. | Posljednji build uspijeva, ali glavni JS je oko 998.77 kB, gzip oko 295.96 kB; Vite upozorava na chunk preko 500 kB. | Moguća optimizacija učitavanja; nije urađena niti je dokazan kvar zbog toga. |
| Registracija kreira nalog prije završetka slanja emaila. | Kod prvo potvrđuje DB kreiranje, potom šalje email i pravi sesiju. | Ako vanjsko slanje tada padne, nalog može već postojati bez završenog korisničkog toka. Prijava i ponovno slanje služe nastavku; ne brisati/ručno verifikovati nalog kao prečicu. |
| QR kao obavezno otključavanje uređivanja profila nije zaseban korak. | Trenutni verified korisnik uređuje svoju sobu preko postojeće autorizacije. | Uporediti s prvobitnom specifikacijom proizvoda; ne uvoditi novo pravilo bez odobrenja. |

### 3.2. Dodatni rizici pronađeni čitanjem, ne potvrđeni napadom

- Nema centralnog access/429 audit loga koji bi svaku blokadu vezao za endpoint i vrijeme. Očekivani `HttpError` se vraća klijentu bez `console.error`, pa logovi nisu dovoljan trag svake blokade.
- Neočekivane greške prolaze kroz `console.error(err)` bez opće redakcije. To zaslužuje provjeru, naročito parser/DB grešaka koje mogu nositi dodatni kontekst. U dostupnim logovima ispod nije pronađena takva izložena lozinka ili email.
- `int()` provjerava konačan broj, ali ne garantuje cijeli pozitivan broj u svakoj konfiguraciji. Nije potvrđena štetna aktivna vrijednost; konfiguracijske granice vrijedi strožije validirati uz odobrenje.
- Ključ `login:email:...` sadrži email u samoj bazi brojača. To je lični podatak u internom spremištu, ne anonimni hash identiteta.
- Zaštita je po konkretnim rutama, ne univerzalni globalni limiter za sve GET/Socket događaje.
- Nije provedeno formalno opterećenje, novi penetration test, nezavisni dependency audit ili potvrda konfiguracije stvarne produkcije. „Svi testovi prolaze“ ne dokazuje ove osobine.
- Poruke se čuvaju u PostgreSQL-u; nema implementirane end-to-end enkripcije poruka između uređaja. Pristup se štiti server autorizacijom.

### 3.3. Zadnjih do 100 dostupnih linija server loga

Na raspolaganju su bila **tri sačuvana fragmenta workflow loga, ukupno 69 tekstualnih linija** nakon učitavanja. Ne postoji dostupnih 100 linija koje bi se smjele izmišljati ili dopunjavati starim nezabilježenim greškama. Slijede svi raspoloživi fragmenti, hronološki. Identifikatori izvršavanja su zamijenjeni sa `***`; emailovi, credentiali i verifikacijski linkovi ne prenose se.

Izvori: `/tmp/logs/Start_application_20261026_173017_195_e57c17e0.log`, `/tmp/logs/Start_application_20261026_174649_959_a1345e22.log`, `/tmp/logs/Start_application_20261026_181103_935_bb3b4eab.log`. Ovo nisu trajno arhivirani kompletni access logovi.

```text
workflow: Start application
status: RUNNING
run_id: ***
timestamp: 2026-10-26T17:30:17.195Z


> limen@1.0.0 replit
> vite build && tsx src/server/index.ts

vite v8.3.5 building client environment for production...
✓ 328 modules transformed.
computing gzip size...
dist/client/index.html                   0.98 kB │ gzip:   0.56 kB
dist/client/assets/index-B6g9VHxt.css   33.96 kB │ gzip:   7.79 kB
dist/client/assets/index-Dgmzzyb-.js   995.58 kB │ gzip: 294.75 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 930ms
LIMEN server radi na portu 5000 (development)
workflow: Start application
status: RUNNING
run_id: ***
timestamp: 2026-10-26T17:46:49.959Z


> limen@1.0.0 replit
> vite build && tsx src/server/index.ts

vite v8.3.5 building client environment for production...
✓ 330 modules transformed.
computing gzip size...
dist/client/index.html                   0.98 kB │ gzip:   0.56 kB
dist/client/assets/index-DZoBB-XD.css   34.08 kB │ gzip:   7.82 kB
dist/client/assets/index-BXRqcbwj.js   997.64 kB │ gzip: 295.48 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 424ms
LIMEN server radi na portu 5000 (development)
workflow: Start application
status: RUNNING
run_id: ***
timestamp: 2026-10-26T18:11:03.935Z


> limen@1.0.0 replit
> vite build && tsx src/server/index.ts

vite v8.3.5 building client environment for production...
✓ 332 modules transformed.
computing gzip size...
dist/client/index.html                   0.98 kB │ gzip:   0.56 kB
dist/client/assets/index-DZoBB-XD.css   34.08 kB │ gzip:   7.82 kB
dist/client/assets/index-CEt_lrak.js   998.77 kB │ gzip: 295.96 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 711ms
LIMEN server radi na portu 5000 (development)
```

U ovim fragmentima nema runtime stack tracea; postoji navedeno build upozorenje. To **ne znači** da nikad nije bilo grešaka. Očekivani 429 ne mora ostaviti liniju u ovom logu. Preglednička provjera neulogovanog korisnika ranije je bilježila 401 na auth provjeri; to samo po sebi nije pad servera. Nije rađen restart samo radi izvještaja.

## 4. BAZA I MIGRACIJE

### 4.1. Izvor i opseg potvrde

- PostgreSQL server u pregledanom razvojnom okruženju: **16.10**.
- Shema je pročitana read-only preko `information_schema.columns` i `pg_constraint`, uz poređenje naziva sa `src/server/db/schema.ts`.
- Pregledano je **26 tabela u `public`** i Drizzle tabela migracija u shemi `drizzle`.
- Ispod su **sve kolone**, tipovi, mogućnost `NULL` i podrazumijevane vrijednosti. Nema redova korisničkih podataka, hashova lozinki, stvarnih tokena, emailova niti sadržaja poruka.
- `!` znači `NOT NULL`, `?` znači da je `NULL` dozvoljen; `PK` je primarni, `UQ` jedinstveni ključ. `= ...` označava SQL default. `timestamptz` je `timestamp with time zone`.
- Ovo je inventar za pregled, **nije SQL skripta koju treba izvršiti**. FK i važni indeksi navedeni su odvojeno.
- Nije rađen pregled neke objavljene produkcijske baze niti backup/restore test.

### 4.2. Sve tabele i kolone

```text
public.users
  id                  uuid! PK = gen_random_uuid()
  email               text! UQ
  password_hash       text!
  display_name        text!
  birth_date          date!
  adult_confirmed_at  timestamptz!
  email_verified_at   timestamptz?
  qr_id               text! UQ
  is_admin            boolean! = false
  created_at          timestamptz! = now()

public.auth_sessions
  token_hash          text! PK
  user_id             uuid!
  created_at          timestamptz! = now()
  expires_at          timestamptz!
  revoked_at          timestamptz?
  user_agent          text?

public.email_tokens
  id                  uuid! PK = gen_random_uuid()
  user_id             uuid!
  purpose             text!
  token_hash          text! UQ
  expires_at          timestamptz!
  used_at             timestamptz?
  created_at          timestamptz! = now()

public.contacts
  id                  uuid! PK = gen_random_uuid()
  user_a              uuid!
  user_b              uuid!
  requester_id        uuid!
  status              text!
  requested_at        timestamptz! = now()
  accepted_at         timestamptz?
  last_activity_at    timestamptz?

public.blocks
  blocker_id          uuid! PK(part)
  blocked_id          uuid! PK(part)
  created_at          timestamptz! = now()

public.rooms
  id                  uuid! PK = gen_random_uuid()
  owner_id            uuid! UQ
  theme               text! = 'orah'::text
  created_at          timestamptz! = now()

public.conversations
  id                  uuid! PK = gen_random_uuid()
  room_id             uuid!
  created_at          timestamptz! = now()

public.room_sessions
  id                       uuid! PK = gen_random_uuid()
  room_id                  uuid!
  host_id                  uuid!
  conversation_id          uuid!
  opened_at                timestamptz! = now()
  closed_at                timestamptz?
  close_reason             text?
  host_disconnect_deadline timestamptz?

public.invitations
  id                  uuid! PK = gen_random_uuid()
  session_id          uuid!
  invitee_id          uuid!
  status              text! = 'pending'::text
  created_at          timestamptz! = now()
  updated_at          timestamptz! = now()

public.entry_requests
  id                  uuid! PK = gen_random_uuid()
  session_id          uuid!
  user_id             uuid!
  invitation_id       uuid!
  status              text! = 'pending'::text
  created_at          timestamptz! = now()
  decided_at          timestamptz?

public.seat_intervals
  id                  uuid! PK = gen_random_uuid()
  session_id          uuid!
  conversation_id     uuid!
  user_id             uuid!
  seat_no             integer!
  placed_absent       boolean! = false
  started_at          timestamptz! = now()
  ended_at            timestamptz?
  end_reason          text?
  connected_at        timestamptz?
  disconnect_deadline timestamptz?

public.session_participants
  session_id          uuid! PK(part)
  user_id             uuid! PK(part)
  chat_muted          boolean! = false
  muted_at            timestamptz?
  muted_by            uuid?
  unmuted_at          timestamptz?

public.media_assets
  id                  uuid! PK = gen_random_uuid()
  owner_id            uuid?
  purpose             text!
  storage_key         text! UQ
  mime                text!
  bytes               integer!
  width               integer?
  height              integer?
  created_at          timestamptz! = now()

public.messages
  id                  uuid! PK = gen_random_uuid()
  conversation_id     uuid!
  session_id          uuid!
  author_user_id      uuid?
  anonymous_author_id uuid?
  kind                text!
  body                text?
  media_id            uuid?
  created_at          timestamptz! = now()

public.room_sections
  id                  uuid! PK = gen_random_uuid()
  room_id             uuid!
  kind                text!
  title               text!
  position            integer! = 0
  created_at          timestamptz! = now()

public.room_items
  id                  uuid! PK = gen_random_uuid()
  room_id             uuid!
  section_id          uuid!
  kind                text!
  text                text?
  media_id            uuid?
  shared_with_guests  boolean! = false
  position            integer! = 0
  created_at          timestamptz! = now()

public.direct_conversations
  id                  uuid! PK = gen_random_uuid()
  user_a              uuid!
  user_b              uuid!
  user_a_read_id      bigint! = 0
  user_b_read_id      bigint! = 0
  created_at          timestamptz! = now()
  last_message_at     timestamptz?
  owner_id            uuid?
  guest_limit         integer? = 2
  guest_streak        integer! = 0

public.direct_requests
  id                  uuid! PK = gen_random_uuid()
  user_a              uuid!
  user_b              uuid!
  requester_id        uuid!
  owner_id            uuid!
  status              text! = 'pending'::text
  conversation_id     uuid?
  created_at          timestamptz! = now()
  decided_at          timestamptz?

public.direct_messages
  id                  bigint! PK = nextval('direct_messages_id_seq'::regclass)
  conversation_id     uuid!
  sender_id           uuid!
  body                text!
  created_at          timestamptz! = now()

public.visitor_chats
  id                    uuid! PK = gen_random_uuid()
  owner_id              uuid!
  token_hash            text! UQ
  display_name          text!
  status                text! = 'pending'::text
  linked_user_id        uuid?
  room_offer_session_id uuid?
  guest_limit           integer? = 2
  guest_streak          integer! = 0
  owner_read_id         bigint! = 0
  guest_read_id         bigint! = 0
  created_at            timestamptz! = now()
  approved_at           timestamptz?
  decided_at            timestamptz?
  last_message_at       timestamptz?
  recovery_hash         text? UQ

public.visitor_messages
  id                  bigint! PK = nextval('visitor_messages_id_seq'::regclass)
  chat_id             uuid!
  sender              text!
  body                text!
  created_at          timestamptz! = now()

public.reports
  id                  uuid! PK = gen_random_uuid()
  reporter_id         uuid?
  target_user_id      uuid?
  message_id          uuid?
  session_id          uuid?
  reason              text!
  status              text! = 'open'::text
  created_at          timestamptz! = now()
  reviewed_by         uuid?
  reviewed_at         timestamptz?

public.admin_audit_log
  id                  uuid! PK = gen_random_uuid()
  admin_id            uuid?
  action              text!
  target              text?
  details             jsonb! = '{}'::jsonb
  created_at          timestamptz! = now()

public.notifications
  id                  uuid! PK = gen_random_uuid()
  user_id             uuid!
  type                text!
  payload             jsonb! = '{}'::jsonb
  created_at          timestamptz! = now()
  read_at             timestamptz?

public.rate_limits
  key                 text! PK(part)
  window_start        timestamptz! PK(part)
  count               integer! = 0

public.dev_outbox
  id                  uuid! PK = gen_random_uuid()
  to                  text!
  subject             text!
  body                text!
  created_at          timestamptz! = now()

drizzle.__drizzle_migrations
  id                  integer! PK = nextval('drizzle.__drizzle_migrations_id_seq'::regclass)
  hash                text!
  created_at          bigint?
```

### 4.3. Relacije i važna ograničenja

Pravila ispod potvrđena su kroz bazne constraint metapodatke:

- `users`: PK `id`, UQ `email`, UQ `qr_id`.
- `auth_sessions.user_id`, `email_tokens.user_id` → `users.id`, `ON DELETE CASCADE`.
- `contacts.user_a`, `user_b`, `requester_id` → `users.id`, cascade; CHECK `user_a < user_b`.
- `blocks`: složeni PK `(blocker_id, blocked_id)`, oba FK → `users.id`, cascade.
- `rooms.owner_id` → `users.id`, cascade, jedinstven.
- `conversations.room_id` → `rooms.id`, cascade.
- `room_sessions.room_id`, `host_id`, `conversation_id` → `rooms`, `users`, `conversations`, cascade.
- `invitations.session_id`, `invitee_id` → `room_sessions`, `users`, cascade.
- `entry_requests.session_id`, `user_id`, `invitation_id` → `room_sessions`, `users`, `invitations`, cascade.
- `seat_intervals.session_id`, `conversation_id`, `user_id` → odgovarajuće tabele, cascade; CHECK `seat_no BETWEEN 1 AND 5`.
- `session_participants`: složeni PK `(session_id, user_id)`; FK prema sesiji i korisniku cascade; `muted_by` → korisnik, set null.
- `media_assets.owner_id` → korisnik, set null; `storage_key` jedinstven.
- `messages.conversation_id` i `session_id` cascade; `author_user_id` i `media_id` set null. `anonymous_author_id` nema ovdje deklarisan FK.
- `room_sections.room_id` → soba, cascade.
- `room_items.room_id`, `section_id`, `media_id` → soba, cjelina, medij, cascade.
- `direct_conversations.user_a`, `user_b`, `owner_id` → korisnik, cascade; CHECK sortiranja para i da je vlasnik jedan od učesnika; `guest_limit` je null ili 1–1000, `guest_streak >= 0`.
- `direct_requests` učesnici/podnosilac/vlasnik → korisnik, cascade; `conversation_id` → razgovor, cascade; CHECK para i odnosa podnosioca/vlasnika.
- `direct_messages.conversation_id` → direct razgovor, `sender_id` → korisnik, cascade.
- `visitor_chats.owner_id`, `linked_user_id` → korisnik, cascade; `room_offer_session_id` → sesija, set null; jedinstveni `token_hash` i `recovery_hash`; isti CHECK opsega limita/niza.
- `visitor_messages.chat_id` → visitor razgovor, cascade.
- `reports` korisnički, poruka i sesijski FK-ovi koriste set null.
- `admin_audit_log.admin_id` → korisnik, set null.
- `notifications.user_id` → korisnik, cascade.
- `rate_limits` složeni PK `(key, window_start)`.

Važni dodatni jedinstveni indeksi iz modela/migracija:

| Indeks | Zaštita |
|---|---|
| `contacts_pair_uq` | Jedan par kontakata `(user_a, user_b)`. |
| `room_sessions_one_open_uq` | Jedna otvorena sesija po sobi, uslov `closed_at IS NULL`. |
| `invitations_session_invitee_uq` | Jedan poziv za kombinaciju sesije i pozvanog. |
| `entry_requests_one_pending_uq` | Jedan čekajući zahtjev korisnika po sesiji. |
| `seat_one_open_per_user_uq` | Korisnik ima jedan otvoren interval sjedenja. |
| `seat_no_open_per_session_uq` | Mjesto je zauzeto jednom u istoj sesiji dok je interval otvoren. |
| `direct_conversations_pair_uq` | Jedan direct razgovor sortiranog para. |
| `direct_requests_pair_uq` | Jedan direct zahtjev sortiranog para. |

Ostali indeksi za historiju, vlasničke liste i retention nalaze se u `schema.ts` i SQL migracijama. Text statusi nisu svi PostgreSQL enum tipovi; značajan dio provjera je u servisima/Zod-u.

### 4.4. Sve verzionisane i potvrđeno evidentirane migracije

`drizzle/meta/_journal.json` ima četiri unosa; razvojna `drizzle.__drizzle_migrations` ima odgovarajuća četiri reda:

| ID u bazi | Fajl | Sadržaj | `created_at` iz Drizzle evidencije |
|---:|---|---|---:|
| 1 | `drizzle/0000_init.sql` | Početna shema Faze 1: korisnici/auth, kontakti, sobe/sesije, intervali, poruke, sadržaji/mediji, prijave, audit, obavijesti, rate-limit i testni outbox. | 1792997609806 |
| 2 | `drizzle/0001_chemical_stranger.sql` | `direct_conversations`, `direct_messages`, `direct_requests`, FK-ovi, CHECK-ovi i indeksi para/isteka/historije. | 1793008860539 |
| 3 | `drizzle/0002_overjoyed_vermin.sql` | `visitor_chats`, `visitor_messages`; owner/guest-limit/guest-streak na direct razgovoru; FK-ovi, CHECK-ovi i indeksi. | 1793010656345 |
| 4 | `drizzle/0003_lazy_thunderball.sql` | Nullable `visitor_chats.recovery_hash` i jedinstveno ograničenje. | 1793012034149 |

Vrijednost `created_at` ovdje je Drizzle/journal oznaka migracije u milisekundama, **nije pouzdan dokaz stvarnog vremena izvršavanja na bazi**.

Potvrđeni hashovi datoteka u evidenciji:

```text
0000 f234d583dab9f03d87193cc70ce0e1e298cffdf4eb3811a9dec2ead7d1bc65c6
0001 43adc820eeb85853267983f1e01d177f02a27d3a12dac64c4f56e700bf0bce1d
0002 3e512810d94778f040e8181d7231ef981a88745ef14c370587de6c68eaca83f6
0003 2bbaf33b79441f1349cdf2607394aa8dd40a56faef093b2271ce04281655ea90
```

Nisu pronađene dodatne verzionisane migracije nakon `0003`. Palete i nacrti nisu dobili posebnu novu tabelu; tema je postojeća tekstualna kolona, nacrt je klijentski. Skripta migracije datoteka u object storage **nije SQL migracija sheme** i njeno postojanje ne dokazuje da je pokrenuta.

U običnom razvoju `src/server/index.ts` poziva `runMigrations()` prije servera. U `production` režimu taj poziv je preskočen. Za buduću Replit managed produkciju promjene sheme idu kroz podržani Publish postupak; ovaj izvještaj nije pokretao ni migraciju ni Publish. Nije moguće dokazati svaku historijsku ručnu SQL intervenciju samo na osnovu Drizzle evidencije.

## 5. TESTOVI

### 5.1. Posljednje pokretanje i pouzdanost podataka

- Posljednje kompletno izvršavanje: **26.10.2026, početak 18:06:59 UTC / 19:06:59 Europe/Vienna**, u prethodnom ciklusu isporuke.
- Rezultat: **10 testnih fajlova prošlo, 122 testa prošla, 0 padova**; trajanje kompletnog Vitest pokretanja 44.86 sekundi prema izlazu komande.
- Sačuvani lokalni Vitest cache potvrđuje `failed: false` za svih deset fajlova i isti `lastRun` timestamp. Cache čuva rezultat po fajlu, ne puni pojedinačni assertion izvještaj.
- Lista ispod izvučena je iz trenutnih deklaracija testova; `it.each(ROOM_PALETTES)` je proširen na svih 12 slučajeva. Zbir je provjeren: 122.
- Poslije toga prošao je puni `npm run test:browser`, uključujući novi countdown test.
- `npm run typecheck` i `npm run build` su prošli u istom ciklusu. Build ima upozorenje za veliki chunk, ne build grešku.
- Testovi su koristili **odvojenu privremenu `_test` bazu**, ne korisničku bazu; SMTP je izričito isključen u testnom okruženju.
- Testovi nisu ponovo izvršavani samo zbog pisanja dokumentacije, jer kod nije promijenjen.

| Fajl | Broj slučajeva | Zadnji rezultat | Trajanje fajla iz cachea, približno |
|---|---:|---|---:|
| `tests/direct-chat.test.ts` | 20 | PASS | 5.200 s |
| `tests/email-verification.test.ts` | 6 | PASS | 0.684 s |
| `tests/phase1.test.ts` | 29 | PASS | 14.299 s |
| `tests/qr.test.ts` | 2 | PASS | 0.004 s |
| `tests/rate-limit-display.test.ts` | 5 | PASS | 0.048 s |
| `tests/room-editor-draft.test.ts` | 6 | PASS | 0.011 s |
| `tests/room-palettes.test.ts` | 20 | PASS | 2.394 s |
| `tests/smtp-settings.test.ts` | 9 | PASS | 0.009 s |
| `tests/visitor-chat.test.ts` | 18 | PASS | 4.099 s |
| `tests/visual-settings.test.ts` | 7 | PASS | 0.025 s |
| **Ukupno** | **122** | **PASS** | Trajanje fajlova ne uključuje sav startup/import overhead. |

### 5.2. Svih 122 testa po grupama

Svi niže navedeni slučajevi imaju rezultat **PASS** u navedenom kompletnom pokretanju. Nazivi su zadržani iz izvornog koda, uključujući engleske nazive novih jediničnih testova.

<!-- TEST_CASES_START -->

#### `direct-chat.test.ts` — 20

**LIMEN Chat: QR i ručno odobrenje**

1. skeniranje prepoznaje vlasnika bez kreiranja zahtjeva ili razgovora
2. zahtjev čeka vlasnika; ni gost ni treća osoba ne mogu odobriti
3. paralelni i obostrani zahtjevi ne stvaraju duplikate ni automatsko odobrenje
4. odbijanje je neutralno, ne otvara razgovor i ne može se zaobići
5. odobren razgovor se otvara istim i obrnutim QR kodom bez duplikata

**LIMEN Chat: poruke, privatnost i obavijesti**

6. oboje šalju, poruke opstaju nakon odjave i ponovne prijave
7. liste prikazuju zadnju poruku i nepročitano; čitanje ne mijenja aktivnost
8. neovlašteni i nepotvrđeni korisnici ne mogu čitati, slati ili označavati pročitano
9. blokiranje ukida pristup i slanje u oba smjera
10. odbija neispravan QR, vlastiti QR i prazne/preduge poruke
11. zahtjevi su ograničeni na serveru sa Retry-After zaglavljem
12. websocket obavijest stiže samo učesnicima, bez tijela poruke
13. starije poruke imaju stabilnu paginaciju i čitanje ne može označiti drugi razgovor
14. nova poruka tokom čitanja ostaje nepročitana
15. izvoz naloga sadrži privatni razgovor, ali ne tuđe razgovore

**LIMEN Chat: tačno 30 dana neaktivnosti**

16. razgovor opstaje nakon 29 dana; otvaranje ne resetuje rok
17. nakon 30 dana briše razgovor, poruke, odobrenje i povezane obavijesti
18. nova poruka iz bilo kojeg smjera resetuje rok
19. odobren razgovor bez prve poruke također ističe nakon 30 dana
20. brisanje korisničkog naloga briše njegove privatne razgovore i poruke

#### `email-verification.test.ts` — 6

**Verifikacijski linkovi**

21. nevažeći i istekli link ne potvrđuju korisnika; novi link radi samo jednom
22. paralelna upotreba istog linka uspijeva samo jednom
23. link za reset lozinke nije potvrda emaila

**Produkcijski email nema razvojni fallback**

24. obični razvoj skriva testni sandučić i bez SMTP-a ne glumi dostavu niti potvrđuje postojeći nalog
25. traži SMTP, stvarnog pošiljaoca i javni HTTPS URL, bez ispisa vrijednosti
26. produkcija skriva dev sandučić i odbija email umjesto izlaganja linka ili kreiranja naloga

#### `phase1.test.ts` — 29

**Registracija i nalog**

27. odbija osobe mlađe od 18 godina
28. društvene funkcije traže potvrđen email
29. zahtjev bez CSRF zaglavlja se odbija
30. reset lozinke i odjava sa svih uređaja

**Test 1 – QR bez poziva ne otvara sobu**

31. skeniranje šalje samo zahtjev za kontakt; prihvaćen kontakt i dalje nema pristup sobi
32. kontakt nestaje iz pretrage nakon 90 dana bez zajedničke aktivnosti; QR ostaje isti
33. poziv u sobu produžava rok kontakta

**Test 2 – nema ulaska preko direktnog API/socket zahtjeva**

34. pozvani, ali neodobren gost ne može čitati, pisati ni ući preko socketa
35. domaćin ne može postaviti za sto nekoga bez poziva

**Test 3 – kapacitet: najviše pet gostiju, i pri paralelnim odobrenjima**

36. od 8 istovremenih odobrenja tačno 5 uspije; poziv ne rezerviše mjesto

**Test 4 – nikad domaćin i gost istovremeno, nikad dva stola**

37. gost ne može otvoriti svoju sobu; domaćin ne može sjesti za tuđi sto; niko ne sjedi za dva stola

**Test 5 – gost ne može pristupiti privatnoj galeriji**

38. vidi samo sadržaj odobren svim gostima; privatne fotografije nisu dostupne ni direktnim ID-em
39. sačuvana fotografija ostaje dostupna nakon ponovnog pokretanja servera
40. uklanja EXIF/GPS, prihvata samo stvarne fotografije

**Utišavanje**

41. utišani gost čita, ali ne može pisati ni slati fotografije

**Test 7 – prava na poruke prate intervale za stolom**

42. odsutni gost postavljen za sto dobija nove poruke (i offline), samo iz svojih intervala
43. 'Nastavi razgovor': stari član dobija samo ranije intervale, novi član ništa staro

**Test 8 – novi gost bez stare historije; uklonjeni gost ne prima nove poruke**

44. preko API-ja i websocketa

**Test 9 – zatvaranje sobe poništava pozive i propuštene pozive**

45. pozivi, zahtjevi i obavijesti o pozivu nestaju

**Pravilo od 30 sekundi (u testovima skraćeno na 600 ms)**

46. Test 17 – gost bez veze duže od roka gubi mjesto i interval; povratak u roku zadržava mjesto
47. domaćin bez veze: gosti vide 'čeka se domaćin' (bez roka), povratak u roku nastavlja sesiju
48. domaćin bez veze duže od roka: sesija se završava za sve, poruke ostaju u arhivi

**Test 18 – prijava zloupotrebe i blokiranje**

49. domaćin blokira gosta: gost odmah napušta sto i gubi pristup ranijim porukama
50. gost blokira gosta tokom sesije: oba ostaju, domaćin dobija obavijest; sljedeći put ne sjede zajedno
51. administrator vidi prijave i svaki pregled se bilježi; obični korisnik nema pristup
52. ne može se prijaviti poruka koju korisnik ne smije čitati

**Spremanje fotografije iz chata i brisanje naloga**

53. gost izričito sprema fotografiju u svoju privatnu galeriju
54. brisanje naloga: poruke ostaju kao 'Obrisani korisnik' bez veze s nalogom

**Rate limiting**

55. prekoračenje vraća 429 i vrijeme do ponovnog pokušaja

#### `qr.test.ts` — 2

**QR linkovi i greške kamere**

56. prihvata samo LIMEN kod i QR putanju na istom domenu
57. razlikuje odbijenu dozvolu, nepostojeću i zauzetu kameru

#### `rate-limit-display.test.ts` — 5

**Rate-limit display without changing protection**

58. reads the server duration, including zero, and ignores malformed values
59. supports an HTTP-date header and rounds remaining time up
60. retains retry metadata for 429 without retrying the request
61. uses a header fallback without attaching timers to other errors
62. keeps unknown waits honest and makes expiry a manual action

#### `room-editor-draft.test.ts` — 6

**Explicit confirmation of room/profile drafts**

63. does not write when an unchanged draft is confirmed
64. stages theme and visibility without mutating saved data, then uses existing owner endpoints
65. only deletes items/sections after confirmation
66. retains progress after failure so retry does not duplicate a new section
67. uploads a staged photo only on confirmation and preserves its selected visibility
68. stops further writes if the editor is closed during a confirmed save

#### `room-palettes.test.ts` — 20

**Zvanična LIMEN paleta**

69. sadrži tačno 12 zaokruženih položaja, bez neodabranih varijanti
70. smaragd: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
71. petrol: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
72. slonovaca: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
73. grafit: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
74. suma: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
75. ponoc: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
76. koralj: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
77. bakar: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
78. rubin: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
79. sunce: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
80. ametist: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
81. obsidijan: čitljiv tekst duž cijelog gradijenta (AA 4.5:1)
82. identitet aplikacije zadržava čitljiv kontrast teksta, dugmadi i navigacije
83. logo varijante su tačni izrezi iz originala, bez crvenih oznaka ili redizajna

**Čuvanje izgleda samo u vlastitoj sobi**

84. vlasnik može sačuvati i ponovo učitati svaku od 12 pozadina
85. različite sobe čuvaju različite izbore; pokušaj tuđeg roomId ne mijenja tuđu sobu
86. neprijavljeni, nepotvrđeni i zahtjevi bez CSRF zaštite ne mogu mijenjati izgled
87. odbija proizvoljne stilove i čuva kompatibilnost prethodnih izbora
88. odobreni gost vidi sačuvanu pozadinu domaćina, ali je ne može promijeniti

#### `smtp-settings.test.ts` — 9

**Sigurna SMTP priprema**

89. Brevo 587 traži STARTTLS i provjeru certifikata bez debug logova
90. podržava implicitni TLS 465 i STARTTLS 2525
91. nepotpuna ili neispravna konfiguracija ne može postati nesiguran transport
92. čuva podršku SMTP_URL-u s URL-kodiranim posebnim znakovima u ključu
93. URL parametri ne smiju isključiti TLS ili provjeru certifikata
94. odbija miješanje dva načina i dijagnostika ne sadrži tajnu
95. nepotpun SMTP se odbija i u razvoju umjesto tihog spremanja poruke u outbox
96. potpun SMTP ne zamjenjuje potvrđenog pošiljaoca i ispravan URL
97. ni razvoj sa stvarnim SMTP-om ne šalje sa izmišljenom adresom pošiljaoca

#### `visitor-chat.test.ts` — 18

**Tajni ključ za oporavak gostujućeg razgovora**

98. samo odobren gost s kolačićem može izdati ključ; podaci ne otkrivaju hash ni ključ
99. oporavlja izgubljeni kolačić, rotira oba ključa i čuva odobrenje, limit i rok
100. isti ključ ne može se istovremeno iskoristiti dvaput
101. zamjena ključa poništava prethodni bez odjave aktivnog gosta
102. istek i brisanje nakon 30 dana onemogućavaju oporavak; izdavanje ne produžava rok
103. blokiranje povezanog korisnika važi i za oporavak
104. zadržava CSRF zaštitu i ograničava pokušaje oporavka

**Gostujući identitet bez LIMEN profila**

105. QR i zahtjev ne kreiraju korisnički profil niti otvaraju chat bez odobrenja
106. pristup zahtijeva odgovarajući HttpOnly cookie, ne samo ID ili QR
107. ponovljeni zahtjevi istog preglednika nemaju duplikate
108. odbijanje je neutralno i ne može se zaobići slanjem ili potvrdom identiteta
109. cookie omogućava nastavak nakon odjave; slanje bez CSRF zaglavlja je zabranjeno

**Ograničenje uzastopnih poruka**

110. atomski propušta samo dvije gostujuće poruke i resetuje se odgovorom vlasnika
111. samo vlasnik može povećati ili ukloniti limit; sam nema uzastopni limit
112. isto ograničenje vrijedi i za registrovane QR sagovornike

**Zaseban poziv u sobu i potvrda identiteta**

113. traži profil, potvrđen email i lozinku; kontakt i ulazak ostaju odvojeno odobreni
114. vlasnikovo uklanjanje iz sobe odmah ukida pristup, a chat ostaje nezavisan

**Gostujući chat se briše nakon 30 dana bez poruke**

115. čitanje ne produžava rok, nova poruka ga resetuje, nakon30d potrebno novo odobrenje

#### `visual-settings.test.ts` — 7

**LIMEN visual settings**

116. uses the approved Private Salon neutrals with unchanged source-image branding
117. generates deterministic CSS tokens without changing their configured values
118. routes custom visual values to their tokens without mutating defaults
119. renders an accessible home link with the exact default wordmark and tagline
120. uses one unchanged official logo in every palette preview
121. keeps all five real navigation routes rather than the prototype's two-page links
122. uses only the twelve approved source palette crops and preserves their coordinates

<!-- TEST_CASES_END -->

### 5.3. Preglednički testovi — dodatno, nisu uključeni u broj 122

| Skripta | Pokriveno u posljednjem prolaznom pokretanju |
|---|---|
| `browser-scanner.mjs` | Pixel 7/iPhone 13 profili u Chromiumu; dozvole, nema/zauzeta kamera, izbor zadnje kamere, oslobađanje streama, QR slika i odbijanje nesigurnog URL-a. |
| `browser-visitor.mjs` | QR zahtjev, ručno odobrenje, gostujuće poruke i uzastopni limit, vlasnički reset/promjena limita, siguran oporavak/rotacija/jednokratnost, email verifikacija, profil, zaseban ulazak u sobu i opoziv pristupa. |
| `browser-profile-editor.mjs` kroz visitor skriptu | Desktop/Android/iPhone simulacije: nema autosave zahtjeva, odustajanje svih tipova izmjene, potvrđeno čuvanje, reload, paleta skrivena, izlaz iz podmenija, greška čuvanja i sticky izlaz; odbijanje tuđih izmjena na serveru. |
| `browser-palettes.mjs` kroz visitor skriptu | Svih 12 opcija, eksplicitno čuvanje/reload, gradijent/tekst stvarne sobe, nezavisnost soba, read-only gost i bez horizontalnog prelijevanja. |
| `browser-rate-limit.mjs` | Desktop/Android/iPhone simulacije: početno vrijeme, protok i istek, nema automatskog login zahtjeva, samo novi ručni klik pravi novi zahtjev, cleanup timera po odlasku, gostujući zahtjev koristi isto pasivno odbrojavanje. |

Countdown scenariji koriste kontrolisane 429 odgovore i preglednički sat; oni ne namjerno zaključavaju stvarni korisnički nalog. Sigurnosne serverske provjere zasebno su pokrivene integracijskim testovima. Browser rezultat nema zaseban trajni JUnit/JSON izvještaj s vremenom svakog koraka; navedeni PASS potiče iz posljednjeg zabilježenog izlaza komande.

### 5.4. Nepokriveno ili samo djelimično pokriveno

Nije generisan coverage izvještaj, pa se ne navodi izmišljen procenat pokrivenosti. Ne tvrdi se da svaki endpoint i svaka grana imaju test.

- Stvarni Android/iPhone, Safari/WebKit i stvarna kamera/dozvole/prekidi u mobilnom OS-u.
- Stvarno slanje Brevo poruke, prijem u inbox, spam filter, potvrđeni pošiljalac, provider kvote i vremenski problemi vanjskog SMTP-a.
- Stvarni privatni App Storage bucket, kvarovi/migracija i povratak medija na toj infrastrukturi.
- IP/proxy lanac u stvarnom Preview/produkcijskom ulaznom putu, lažna `X-Forwarded-For` zaglavlja i normalan rad mnogo naloga na istom stvarnom javnom IP-u.
- Poseban iscrpan test login politike „uspjeh takođe broji“, paralelnih login zahtjeva, obje IP/email blokade i prelaska svakog fiksnog vremenskog prozora. Postojeći testovi ne pokrivaju svaku kombinaciju.
- Restart pravog glavnog procesa kao dokaz opstanka rate-limit reda; opstajanje slijedi iz PostgreSQL dizajna, nije zaseban browser scenarij.
- Neodobrena buduća politika odvajanja neuspjelih prijava od mrežnog praga — nije implementirana, pa nije ni potvrđena testovima.
- Jedna atomska transakcija za sve izmjene profila zajedno s datotekama; sada se testira zadržavanje napretka poslije djelimične greške, ne „sve ili ništa“.
- Svaki pojedinačni prekinuti save/upload korak, istovremeno uređivanje iz više tabova i stvarni dugotrajni gubitak veze.
- Univerzalni countdown u svim ekranima koji mogu dobiti 429.
- Potpuna automatizovana pristupačnost/screen reader analiza svih stranica; postoje ograničene provjere semantike/navigacije/kontrasta.
- Sve UI grane administratorskog pregleda i svaka kombinacija izvoza/brisanja kroz stvarni preglednik, iako postoje API testovi dijela ovih funkcija.
- Instaliranje/nadogradnja/rollback svih migracija na velikoj postojećoj bazi, backup/restore, disaster recovery i produkcijska objava.
- Više app instanci, restart cijele platforme, masovno opterećenje, resource/latency profil i dugotrajni soak test.
- Formalni nezavisni security audit, fuzzing i kompletan dependency/vulnerability scan nisu rađeni u ovom zadatku.

## 6. OKRUŽENJE

### 6.1. Secrets i varijable — SAMO IMENA

Inventar projektnih Secrets potvrđen je kroz sigurni pregled metapodataka. Njihove vrijednosti nisu čitane za izvještaj.

**Trenutno postavljeni projektni Secrets:**

```text
MAIL_FROM
SESSION_SECRET
SMTP_HOST
SMTP_PASSWORD
SMTP_PORT
SMTP_USER
```

U tom inventaru nisu vraćene posebno postavljene projektne ne-tajne env varijable. To ne znači da proces nema naslijeđene/platformske varijable. Ispod je kompletan popis imena koje pregledani aplikacijski kod, testovi i projektna konfiguracija prepoznaju, bez vrijednosti; nisu sva ova imena obavezna ili trenutno postavljena.

**Glavna aplikacija, runtime i sigurnosni limiti:**

```text
ADMIN_EMAILS
APP_URL
CONTACT_TTL_DAYS
DATABASE_URL
GUEST_GRACE_MS
HOST_GRACE_MS
INVITE_MISSED_AFTER_MS
MAIL_FROM
MAX_IMAGE_BYTES
MAX_MESSAGE_LENGTH
MEDIA_STORAGE_BACKEND
NODE_ENV
PORT
RATE_LIMITS_ENABLED
REPLIT_DEV_DOMAIN
RL_CONTACT_REQUEST
RL_DIRECT_REQUEST
RL_INVITE
RL_LOGIN
RL_MESSAGE
RL_PASSWORD_RESET
RL_REGISTER
RL_REPORT
RL_UPLOAD
RL_VISITOR_MESSAGE
RL_VISITOR_RECOVERY
RL_VISITOR_RECOVERY_ISSUE
RL_VISITOR_REQUEST
SESSION_TTL_DAYS
SMTP_HOST
SMTP_PASSWORD
SMTP_PORT
SMTP_URL
SMTP_USER
STORAGE_DIR
SWEEP_INTERVAL_MS
WS_PING_INTERVAL_MS
WS_PING_TIMEOUT_MS
```

**Dodatna imena korištena u testovima, build/sandbox konfiguraciji:**

```text
BASE_PATH
CHROMIUM_PATH
LIMEN_BROWSER_BASE_URL
REPL_ID
TEST_DATABASE_URL
```

`SESSION_SECRET` je naveden među stvarno postojećim Secrets, ali se ne pojavljuje kao čitana varijabla u pregledanoj glavnoj sesijskoj implementaciji. Ovaj popis nije inventar svih internih Linux/Nix/Replit kontrolnih varijabli niti njihovih tajni. U njega nisu dodavana nagađana imena pristupnih ključeva. Platformske database varijable, ako ih budući hosting izloži dodatno, treba zasebno inventarisati po **imenima**, ne kopiranjem connection stringa.

### 6.2. Verzije alata i paketa

**Izmjerene verzije:** Node.js `22.23.4`; PostgreSQL server `16.10`; `psql` klijent `16.10`. Replit moduli su Node 22 i PostgreSQL 16. Sljedeće su stvarno instalirane verzije pročitane iz package metapodataka, ne samo deklarisani `^` rasponi:

| Paket | Instalirana verzija |
|---|---|
| `@node-rs/argon2` | 2.2.2 |
| `@replit/object-storage` | 1.0.0 |
| `@zxing/browser` | 0.1.5 |
| `@zxing/library` | 0.21.3 |
| `cookie-parser` | 1.4.7 |
| `drizzle-orm` | 0.45.4 |
| `express` | 5.3.0 |
| `file-type` | 22.2.0 |
| `helmet` | 8.3.0 |
| `jsqr` | 1.4.0 |
| `multer` | 2.5.0 |
| `nodemailer` | 10.2.1 |
| `pg` | 8.23.1 |
| `qrcode` | 1.5.4 |
| `react` | 19.3.1 |
| `react-dom` | 19.3.1 |
| `react-router-dom` | 7.18.4 |
| `sharp` | 0.35.5 |
| `socket.io` | 4.8.4 |
| `socket.io-client` | 4.8.4 |
| `zod` | 4.6.7 |
| `@vitejs/plugin-react` | 6.1.2 |
| `concurrently` | 10.0.6 |
| `drizzle-kit` | 0.31.11 |
| `playwright-core` | 1.64.1 |
| `supertest` | 7.3.1 |
| `tsx` | 4.23.15 |
| `typescript` | 7.0.2 |
| `vite` | 8.3.5 |
| `vitest` | 5.0.5 |
| `@types/cookie-parser` | 1.4.10 |
| `@types/express` | 5.0.6 |
| `@types/multer` | 2.3.0 |
| `@types/node` | 26.6.5 |
| `@types/nodemailer` | 8.0.2 |
| `@types/pg` | 8.23.1 |
| `@types/qrcode` | 1.5.6 |
| `@types/react` | 19.3.0 |
| `@types/react-dom` | 19.3.0 |
| `@types/supertest` | 7.2.1 |

Za reprodukciju koristiti zaključane verzije iz repozitorija i potvrditi stvarni package manager. Aplikacijske zavisnosti nisu mijenjane za ovaj izvještaj.

Napomena o pripremi izvještaja: pomoćno pokretanje `python3` za redakciju već sačuvanih logova izazvalo je automatsko dodavanje Python modula u Replit konfiguraciju. Taj usputni dodatak uklonjen je podržanim upravljanjem modulima i konfiguracija vraćena na početno stanje. Konačna predaja mora sadržati samo ovaj dokument, ne promjenu modula ili aplikacije.

### 6.3. Kako je pokrenuto

| Stavka | Potvrđeno stanje |
|---|---|
| Glavni workflow | `Start application` — radi |
| Komanda | `npm run replit` |
| Stvarni script | `vite build && tsx src/server/index.ts` |
| Režim servera prema logu | `development` |
| Bind | `0.0.0.0`, port 5000 |
| Preview port mapping | lokalni 5000 → vanjski 80 |
| Klijent u ovom workflowu | Izgrađeni `dist/client` poslužuje Express; nije zaseban frontend Vite dev proces. |
| Odvojeni dizajnerski workflow | `artifacts/mockup-sandbox: Component Preview Server`, `npm run dev`; zaseban sandbox, ne korisnički backend. |
| Status javne objave | Servis za deployment metapodatke vratio je `success=true`, `isDeployed=false`. |
| Tip aktivne objave | Nema aktivne objave ni produkcijskog URL-a. |
| Deklarisana buduća objava u `.replit` | VM/Reserved VM (`deploymentTarget = "vm"`), build `npm run build`, run `npm start`. Ovo nije dokaz izvršene objave. |

`npm start` eksplicitno postavlja produkcijski Node režim. U njemu je medijski backend prisilno object storage, a okvir se ne smije ugrađivati kao obični razvojni iframe. Stvarni produkcijski rad nije testiran objavom.

Preview je razvojno okruženje, a ne sinonim za trajno objavljenu aplikaciju. Njegova pristupna privatnost ne izvodi se samo iz postojanja razvojnog URL-a. U ovom zadatku privatnost nije mijenjana i nije napravljen novi javni link.

### 6.4. Sigurno ponavljanje provjera od strane stručnjaka

Komande u repozitoriju:

```text
npm run typecheck
npm run build
npm test
npm run test:browser
```

**Ne pokretati testove nad stvarnom korisničkom bazom.** `tests/helpers.ts` truncira testne tabele. Potreban je zaseban PostgreSQL database s imenom koje završava na `_test`, dostupan testnim procesima. `TEST_DATABASE_URL` treba postaviti sigurnim lokalnim načinom; njegovu vrijednost ne slati u izvještaj/chat/Git.

Vitest konfiguracija koristi testni režim, odvojenu bazu, kratke testne rokove i isključene vremenske limite osim u testovima koji ih izričito uključe. Browser runner uključuje server limite u izolovanom serveru i briše SMTP postavke iz testnog procesa. Ne „popravljati“ testove uključivanjem stvarnog SMTP-a ili ručnom potvrdom stvarnog korisnika.

## 7. GITHUB PREDAJA I GRANICE PREGLEDA

- Postojeći remote `origin` pokazuje na `https://github.com/mamanebrini-dobrosam/Limen`.
- Lokalni i ciljani branch je `main`.
- Prije pisanja dokumenta provjeren je GitHub `main`: bio je na početnoj Fazi 1.
- `git push --dry-run origin main` je uspješno pokazao mogući **fast-forward** sa početne Faze 1 na trenutnu lokalnu historiju. Nije potreban niti odobren force push.
- Predaja dodaje jedan dokumentacijski commit sa ovim fajlom i šalje postojeću lokalnu historiju. Time drugi stručnjak dobija sav već commitovan kod, ne samo dokument.
- U ovom zadatku ne dodaju se `.env`, lokalne fotografije, testna baza, generisani snimci, SMTP vrijednosti ili korisnički eksporti. `storage/.gitkeep` nije korisnički medij.
- Kopija podataka iz baze nije dio repozitorija niti ovog izvještaja.
- GitHub push je predaja izvornog koda u postojeći repozitorij, **nije Publish aplikacije na Replitu**. U pregledanom repozitoriju nije pronađen `.github/workflows` deploy postupak. Nije pokretana niti konfigurisana javna objava.
- Konačni commit i uspjeh stvarnog push-a provjeravaju se nakon kreiranja ovog dokumenta; link se daje u završnoj poruci. Status prije toga ne treba tumačiti kao već izvršen push.

### Prioriteti za drugog stručnjaka

1. Provjeriti stvarni IP/proxy put i zatim dizajnirati odvojenu zaštitu neuspjelih prijava i mrežnog naleta, uz dodatno odobrenje vlasnika.
2. Potvrditi stvarnu isporuku verifikacijskog emaila i oporavak postojećeg naloga bez ručne verifikacije.
3. Provjeriti privatni bucket i životni ciklus stvarnih medija.
4. Izvršiti hardverske Android/iPhone testove, posebno Safari kameru i povratak iz uređivanja.
5. Procijeniti atomsko čuvanje nacrta, evidenciju 429 bez ličnih podataka i sigurnu redakciju neočekivanih grešaka.
6. Odvojeno usaglasiti konačni izgled i eventualni QR-uslov za uređivanje profila. Ne mijenjati logo, ekonomiju/vrijednosti, chat ili sigurnosna pravila kao sporednu posljedicu pregleda.

**Nijedna preporuka u ovom dokumentu nije odobrenje za izmjenu aplikacije.**
