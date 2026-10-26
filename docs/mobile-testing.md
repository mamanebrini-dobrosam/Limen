# LIMEN: provjera na stvarnom Androidu i iPhoneu

## Šta automatizacija potvrđuje, a šta ne

`npm run test:browser` koristi odvojenu testnu bazu i lokalni testni server.
Provjerava mobilne prikaze/user-agent, dozvole i greške kamere, sintetički
MediaStream s QR kadrom, zaustavljanje videa, rezervno skeniranje slike te
sigurnosni tok gostujućeg razgovora i sobe. Sve postojeće granice poruka,
odobrenja i rokovi ostaju uključeni. Ne koristi pravi SMTP niti korisničku bazu.
Ne pokreći ovaj test istovremeno s `npm test`: koriste istu privremenu testnu bazu.

To **nije fizički Android/iPhone test**, niti izvršavanje Safari/WebKit enginea.
Potrebne su sljedeće provjere na stvarnim uređajima.

## Priprema

- Koristi testnu HTTPS verziju aplikacije, ne neodobrenu javnu objavu.
- Pripremi Android s ažurnim Chromeom i iPhone s ažurnim Safarijem.
  Zapiši model, OS i verziju preglednika, datum i rezultat.
- Koristi dva vlastita testna identiteta: domaćina i gosta. Ne briši i ne
  mijenjaj postojeće korisničke naloge, njihove poruke ili postavke pristupa.
- QR domaćina prikaži na drugom ekranu/papiru. Za skeniranje slike sačuvaj
  njegov snimak ekrana. Ne dijeli recovery ključ, lozinku ili email link.

## Android / Chrome

1. Otvori HTTPS adresu direktno u Chromeu i idi na **Skeniraj**.
2. Klikni **Uključi kameru**, odobri dozvolu i provjeri da se po mogućnosti
   koristi zadnja kamera. Provjeri fokus, slabije osvjetljenje i manji nagib QR-a.
3. Skeniraj QR domaćina: mora se otvoriti samo njegov QR/zahtjev, ne soba.
4. Vrati se, pokreni kameru i klikni **Zaustavi kameru**. Indikator kamere
   mora prestati; provjeri i odlazak na drugu stranicu ili u pozadinu.
5. U postavkama Chromea za tu stranicu odbij kameru, pa ponovi zahtjev.
   Mora se prikazati razumljiva poruka i ostati dostupan unos linka/QR slike.
6. Vrati dozvolu kroz podatke/dozvole web-stranice i ponovi skeniranje.
7. Učitaj QR sliku pa neispravnu sliku. Ispravan QR radi, neispravna slika
   pokazuje grešku bez zamrzavanja stranice.

## iPhone / Safari

1. Otvori HTTPS adresu direktno u Safariju, ne samo u ugrađenom pregledniku
   druge aplikacije. Ako je stranica u okviru bez dozvole, otvori novu karticu.
2. Klikni **Uključi kameru** i odobri pristup. Video treba ostati unutar
   stranice, bez prisilnog punog ekrana i bez zvuka.
3. Provjeri čitanje QR-a zadnjom kamerom, fokus, različite udaljenosti i nagib.
4. Odbij dozvolu, provjeri poruku i rezervnu QR sliku, pa ponovo omogući kameru
   kroz Safari postavke te stranice (nazivi menija ovise o iOS verziji).
5. Provjeri zaustavljanje i povratak iz pozadine. Indikator kamere ne smije
   ostati aktivan nakon zaustavljanja ili napuštanja skenera.
6. Isprobaj snimak ekrana QR-a iz Photos/Files. Ako se određeni format slike
   ne može otvoriti, probaj PNG/JPG ili screenshot; unos linka ostaje alternativa.

## Isti sigurnosni scenarij na oba uređaja

1. Gost bez profila šalje nadimak; bez vlasnikovog ručnog odobrenja nema poruka.
2. Poslije odobrenja šalje dvije poruke. Treća mora biti blokirana do
   vlasnikovog odgovora ili njegove dopuštene promjene limita.
3. Ponovno otvaranje istog preglednika čuva gostujući chat.
4. U testnom chatu napravi i sigurno sačuvaj recovery ključ. Obriši **samo
   testne kolačiće**, potvrdi gubitak pristupa, pa oporavi tajnim ključem.
   Stari ključ i stari gostujući pristup ne smiju raditi. QR sam nije dovoljan.
5. Za sobu se i dalje traže profil, potvrđen email, potvrda identiteta i
   postojeća zasebna odobrenja kontakta, pozivnice i ulaska.
6. Poslije izlaska/uklanjanja pristup sobi i nepodijeljenom sadržaju mora biti
   odbijen. Mali chat ostaje nezavisan.
7. Provjeri tastaturu, pomjeranje do dugmeta za slanje, portrait/landscape,
   čitljivost i navigaciju. Ne mijenjaj pravila radi lakšeg prolaska testa.

Rok od 30 dana provjerava se automatizovanim testovima u testnoj bazi.
Ne mijenjaj datume, sat uređaja, rokove ili podatke pravih razgovora radi ručne provjere.

## Evidencija

| Uređaj / OS / preglednik | Kamera | Dozvole i zaustavljanje | QR slika | Chat i oporavak | Soba i prestanak pristupa |
| --- | --- | --- | --- | --- | --- |
| Android / Chrome — popuniti | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno |
| iPhone / Safari — popuniti | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno | Nije fizički potvrđeno |

U izvještaj unosi rezultat i opis problema, ne lozinke, tajne ključeve,
verifikacijske linkove ili sadržaj privatnih razgovora.
