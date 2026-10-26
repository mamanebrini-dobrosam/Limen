# Prijava: postojeća zaštita i prijedlog za odobrenje

## Šta je promijenjeno

Samo prikaz čekanja na prijavi, registraciji, zahtjevu gosta, potvrdi emaila
i oporavku. Broj sekundi dolazi iz postojećeg odgovora servera (`retryAfter`,
uz rezervno čitanje `Retry-After`). Lokalni sat osvježava poruku, ne šalje
zahtjeve i ne odobrava pristup. Po isteku korisnik mora sam ponovo pokušati.
Ako server ne dostavi valjano vrijeme, ostaje postojeća poruka bez izmišljenog
odbrojavanja. Nestanak poruke ili ponovno otvaranje stranice ne ukida zaštitu.
Server, granice pokušaja, rokovi i brojači nisu mijenjani.

## Zašto se uspješne prijave sada broje

`src/server/routes/auth.ts` poziva mrežni, a zatim email brojač prije provjere
lozinke i prije pravljenja prijavljene sesije. Zato svaki zahtjev koji prođe
provjeru oblika unosa troši pokušaj, čak i ako je lozinka tačna. Uspjeh ne
resetuje brojače. To ima zaštitnu korist: mrežni prag zaustavlja veliki broj
zahtjeva prije skupe provjere lozinke i ograničava pogađanje lozinki.
Ovo je posljedica postojećeg redoslijeda; nije dokaz zašto je autor prvobitno
odabrao baš te pragove.

## Zašto različiti korisnici dijele brojač

Prvi ključ je mrežna adresa (`req.ip`), a drugi unesena email adresa. Korisnici
na istoj Wi-Fi mreži često dijele izlaznu adresu; isto se dešava u mobilnim i
poslovnim mrežama. Drugi uređaj, drugi preglednik ili drugi email zato ne
izbjegava prvi prag. Prvi brojač može odbiti zahtjev prije provjere drugog.
Neispravna konfiguracija proxyja može dodatno objediniti različite posjetioce.
Postoji `trust proxy = 1`; prije eventualne promjene treba provjeriti stvarni
put kroz proxy i zaštitu od lažnih proslijeđenih adresa, ne slijepo vjerovati
svim zaglavljima posjetilaca.

## Predloženo, ali NIJE primijenjeno

1. Zadržati zasebnu mrežnu zaštitu od velikog naleta zahtjeva prije provjere
   lozinke. Ona i dalje može brojati sve zahtjeve, ali s odvojeno odobrenim
   pragom prilagođenim zajedničkim mrežama.
2. Strožu zaštitu od pogađanja vezati za neuspjele provjere naloga i
   kombinaciju naloga i mrežnog izvora, uz kratko postepeno usporavanje.
   Potrebna je i zaštita od napada na jedan nalog iz više mreža.
3. Uspješnu provjeru ne tretirati kao pogrešnu lozinku. Eventualno resetovati
   samo odgovarajući uži niz grešaka, nikad sve brojače mreže ili drugih naloga.
4. Izbjeći trajno ili lako izazivo zaključavanje tuđeg naloga: napadač ne
   smije samim unošenjem tuđeg emaila dobiti jednostavan način blokiranja
   vlasnika. Sačuvati iste odgovore za postojeće i nepostojeće naloge.
5. Prije promjene odobriti konkretne pragove, rokove i ponašanje nakon uspjeha;
   testirati domaćina i gosta na istoj mreži, mnogo različitih loših lozinki,
   napad iz više mreža, paralelne pokušaje i ispravno određivanje mrežne adrese.

Nijedna od ovih promjena zaštite nema odobrenje za primjenu u ovom zadatku.
