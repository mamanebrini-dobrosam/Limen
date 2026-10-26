# LIMEN — privremena provjera stvarnog proxy/IP lanca

## Trenutni status: čeka dvije stvarne prijave

Dijagnostika je pripremljena i automatski testirana, ali **isključena po
zadanim postavkama**. Stvarni Wi-Fi i mobilni uređaji nisu dostupni agentu.
Nije utvrđeno jesu li njihove `req.ip` adrese različite.
Simulirani `X-Forwarded-For` nije dokaz ponašanja stvarnog Replit proxyja.

Limiti, brojači, `trust proxy`, provjera lozinke i izdavanje sesija nisu
promijenjeni. Dijagnostika se poziva tek poslije uspješne prijave i
kreiranja sesije. Ne bilježi neuspjele pokušaje ni registraciju.

## Zaštita i trajanje

- Radi samo kad je `NODE_ENV=development` i razvojna varijabla
  `LIMEN_LOGIN_IP_DIAGNOSTICS=1`. U produkciji i testnom režimu ne radi.
- Najviše **dva zapisa ukupno po pokretanju procesa**.
- Prozor traje **15 minuta od pokretanja procesa**, zatim se sama utišava.
  Restart s uključenom varijablom otvara novi prozor; zato varijablu treba
  ukloniti nakon provjere, a zatim ukloniti i privremeni kod.
- Bilježi isključivo `event`, redni broj uzorka, `req.ip`, adresu socketa i
  najviše 16 validnih adresa iz `X-Forwarded-For` lanca.
- Neprepoznatljive adrese zamjenjuje sa `[invalid]`. Ne zapisuje tijelo
  zahtjeva, email, korisnički ID, lozinku, cookie, token ili cijeli header.
- Ništa se ne vraća pregledniku niti sprema u bazu.
  IP adrese ostaju lični podaci: razvojne logove ne objavljivati.

## Postupak sa stvarnim uređajima

1. Dogovoriti kratki termin provjere. Ne aktivirati unaprijed dok uređaji
   nisu spremni, jer prozor ističe.
2. U razvojno okruženje dodati navedenu neskrivenu dijagnostičku varijablu
   i jednom restartovati postojeći razvojni workflow. Ne mijenjati limite.
3. Uređaj A: preko Wi-Fi mreže otvoriti postojeći razvojni LIMEN link,
   odjaviti se ako je potrebno i **jednom** se uspješno prijaviti.
4. Uređaj B: isključiti Wi-Fi i koristiti mobilne podatke, bez VPN-a koji bi
   dijelio istu izlaznu mrežu; otvoriti isti razvojni link i jednom se
   uspješno prijaviti. Ne slati lozinke ili dijagnostičke zapise u chat.
5. U zaštićenim razvojnim logovima pronaći tačno dva
   `limen.login-ip-diagnostic` zapisa. Provjeriti redoslijed uzoraka i da
   ih nisu potrošile druge uspješne prijave. Ako postoji 429 ili neuspjela
   prijava, poštovati postojeće čekanje; ne povećavati limite radi testa.
6. Uporediti `ip`, `socketAddress` i `forwardedFor`. Zabilježiti zaključak
   „iste/različite“ bez kopiranja stvarnih IP adresa u Git ili izvještaj.
   Iste socket adrese mogu biti očekivane iza proxyja. Isti `req.ip`
   zahtijeva pregled stvarnog lanca; ne dokazuje automatski da je uzrok NAT.
7. Odmah ukloniti razvojnu varijablu, import/poziv i privremeni modul
   `src/server/lib/login-ip-diagnostic.ts` te pripadajući privremeni test.
   Napraviti checkpoint, pokrenuti regresijske testove, restartovati
   razvojni workflow i commit/push uklanjanja.

**Ovaj korak nije završen dok nisu urađene obje stvarne prijave i uklanjanje
dijagnostike. Nema odobrenja za promjenu limita niti za Publish.**
