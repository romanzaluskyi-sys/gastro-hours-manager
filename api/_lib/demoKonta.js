// Konta wersji demonstracyjnej (demo.shiftro.pl, 0.72.0) — strona serwera.
//
// ⚠️ Te same adresy i PIN stoją w `src/demo.ts` (przyciski na ekranie
// logowania). Z `api/` nie wolno importować z `src/` (patrz CLAUDE.md, sekcja
// "Cron"), więc to jest świadoma kopia — `harness-demo.html` porównuje obie i
// wywraca się, gdy się rozjadą. Rozjazd wyglądałby tak: przycisk „Panel
// kierownika” mówi „Nieprawidłowe dane”, a reset zakłada konto, którym nikt się
// nie loguje.
//
// PIN jest PUBLICZNY z założenia — stoi na ekranie, żeby każdy odwiedzający mógł
// się zalogować. Chroni go nie tajność, tylko to, że w bazie demo nie ma nic
// prawdziwego, a co noc wszystko wraca do stanu początkowego.

const DOMENA_KONT = "demo.shiftro.pl";
const PIN = "482915";

const KONTA = [
  { klucz: "kierownik", email: `kierownik@${DOMENA_KONT}`, imie: "Katarzyna Nowak" },
  { klucz: "tablet", email: `tablet@${DOMENA_KONT}`, imie: "Tablet · Bistro Lipowa" },
  { klucz: "telefon", email: `pracownik@${DOMENA_KONT}`, imie: "Marek Wiśniewski" },
];

const jestKontemDemo = (email) =>
  KONTA.some((k) => k.email === String(email || "").trim().toLowerCase());

module.exports = { DOMENA_KONT, PIN, KONTA, jestKontemDemo };
