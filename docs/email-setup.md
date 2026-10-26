# LIMEN: priprema besplatnog SMTP slanja

## Odabrana opcija: Brevo Free

Prema službenoj dokumentaciji provjerenoj 26. 10. 2026, Free plan ima
**300 emailova dnevno**, bez vremenskog ograničenja. Kvota se odnosi na sve
poslane emailove, uključujući potvrde i reset lozinke. Nepotrošena kvota se
ne prenosi. Brevo navodi vlastitu oznaku u emailovima besplatnog plana.
Prekoračenje može odgoditi ili onemogućiti dostavu; aplikacija ne kupuje
nadogradnju i nema automatsku promjenu plana.

Nalog, domenska autentifikacija, SMTP veza i stvarna dostava još nisu
potvrđeni. Ova priprema ne kreira nalog, ne aktivira pretplatu, ne kupuje domen
i ne objavljuje LIMEN.

Brevo ima Replit API integraciju, ali ona ne zamjenjuje SMTP login i SMTP ključ.
Postojeći LIMEN koristi SMTP; za ovaj način nije potreban API ključ niti
promjena aplikacije na drugi email API.

## Šta vlasnik treba uraditi

1. Otvori svoj Brevo nalog i izaberi isključivo **Free** plan. Ako se traži
   naplata, kartica ili plaćena nadogradnja, stani: to nije odobreno.
2. Dodaj i autentificiraj domen koji kontrolišeš, prema Brevo DNS uputama.
   Zatim dodaj i potvrdi adresu pošiljaoca. Adresa u `MAIL_FROM` mora odgovarati
   odobrenom pošiljaocu. Ako nemaš domen, prvo treba dogovoriti rješenje;
   aplikacija neće kupiti domen ili koristiti izmišljenu adresu.
3. U Brevo postavkama **SMTP & API → SMTP** pronađi SMTP login i napravi
   zaseban SMTP ključ za LIMEN. To **nije lozinka Brevo naloga i nije API ključ**.
   SMTP login može biti drugačiji od adrese kojom se prijavljuješ u Brevo.
4. U Replit projektu otvori **Secrets** i unesi sljedeće vrijednosti.
   Ne šalji ih u chat, ne stavljaj u izvorni kod, Git, screenshot ili `.env.example`.

| Naziv | Vrijednost koju unosi vlasnik |
| --- | --- |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Tačan **SMTP login** iz Brevo SMTP postavki |
| `SMTP_PASSWORD` | Novi **SMTP ključ** za LIMEN |
| `MAIL_FROM` | `LIMEN <tvoja-potvrdjena-adresa@tvoj-domen>` — zamijeni cijelu primjer-adresu |

Postavi sve vrijednosti zajedno pa ponovo pokreni aplikaciju. `SMTP_USER` i
`SMTP_PASSWORD` obavezno čuvaj kao Secrets; i ostale navedene vrijednosti mogu
biti u Secrets. Ne koristi prefiks `VITE_`: SMTP podaci nikad ne idu u preglednik.

`APP_URL` određuje adresu u email linkovima. U razvoju aplikacija bez ove
postavke koristi adresu trenutne razvojne verzije. Za buduću produkciju treba
unijeti **stvarnu, potvrđenu javnu HTTPS adresu** nakon odobrenog postupka
objavljivanja; nemoj je nagađati niti razvojnu adresu predstavljati kao
produkcijsku. Postavi je u odgovarajuće okruženje kako produkcijski linkovi
ne bi vodili na razvojnu verziju. Ova priprema ne zahtijeva javno objavljivanje.

### Već postoji `SMTP_URL`?

Ranije konfiguracije ostaju podržane. Koristi **ili** `SMTP_URL` **ili**
odvojena SMTP polja, nikad oba. `SMTP_URL` sadrži pristupne podatke i također
mora biti Secret. Odvojena polja izbjegavaju ručno URL-kodiranje posebnih
znakova u ključu.

## Sigurnost povezivanja

- Port 587/2525 zahtijeva STARTTLS; 465 koristi TLS od početka.
- Provjera TLS certifikata ostaje uključena; minimalno TLS 1.2.
- URL parametri ne mogu isključiti TLS ili uključiti debug ispis lozinki.
- Djelimična/neispravna SMTP konfiguracija vraća jasnu grešku, bez tihog
  prebacivanja na razvojni sandučić.
- Produkcija bez ispravnih email postavki odbija slanje. Razvojni sandučić
  nije dostupan u produkciji. Linkovi i sadržaj poruka ne ispisuju se u log.

## Provjera bez izlaganja podataka

1. `npm run email:check` provjerava konfiguraciju za buduću produkciju i
   ispisuje samo nazive nedostajućih/neispravnih postavki, bez njihovih vrijednosti.
   Bez produkcijskog `APP_URL` ova provjera namjerno prijavljuje nespremnost.
2. Kada su sve postavke potpune, `npm run email:check -- --connect` provjerava
   TLS vezu i SMTP autentifikaciju. **Ne šalje email** i ne dokazuje dostavu.
3. Nakon povezivanja napravi zaseban testni nalog s adresom kojoj imaš pristup.
   Provjeri dolazak poruke, spam folder, pošiljaoca i potvrdu u aplikaciji.
   Link otvori direktno iz svog sandučića; ne kopiraj ga u chat ili izvještaj.
4. Provjeri ponovno slanje, nevažeći/istekli link i da se potvrda ne može
   iskoristiti dva puta. Stvarni email potvrdi kao uspješan tek nakon stvarne dostave.

Uobičajene poteškoće su nepotvrđen pošiljalac, pogrešan SMTP login, upotreba
API ključa umjesto SMTP ključa, DNS autentifikacija, dnevna kvota i blokirana veza.
Ne isključuj provjeru TLS certifikata da bi zaobišao grešku.

## Službeni izvori

- [Ograničenja besplatnog plana](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [SMTP postavke i priprema pošiljaoca](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP)
- [SMTP developer dokumentacija](https://developers.brevo.com/docs/smtp-integration)
- [Replit Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
