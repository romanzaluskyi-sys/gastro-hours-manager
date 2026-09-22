// @ts-nocheck
// Pracownik na próbę — osoba dodana z Tabletu Służbowego, zanim ktokolwiek
// zdążył założyć jej kartę.
//
// Dzień próbny bywa płatny, a przychodzi się na niego zwykle rano, kiedy
// kierownika w lokalu nie ma. Bez tej ścieżki godziny takiej osoby zapisuje
// się na kartce albo wcale, a potem odtwarza z pamięci — czyli dokładnie tak,
// jak wyglądało wszystko przed tą aplikacją.
//
// ⚠️ To ZWYKŁY wiersz w `users`, nie osobna tabela. Godziny odwołują się do
// user_id, a Raport, Aktywni i Rejestr Godzin czytają `users` — osobna tabela
// kazałaby zdublować każde z tych miejsc. Różnicę robi jedna kolumna:
// `probny_status = 'oczekuje'`.
//
// ⚠️ Konto powstaje BEZ e-maila i BEZ PIN-u, świadomie. Nie da się nim
// zalogować nigdzie — istnieje tylko na tym jednym tablecie, w lokalu, pod
// fizyczną kontrolą. To jest całe zabezpieczenie przed tym, żeby ktoś z sali
// nie naprodukował kont.
import { api } from "../api/supabase";
import { createManagerNotification } from "../api/notifications";

export const PROBNY_OCZEKUJE = "oczekuje";
export const PROBNY_ZATWIERDZONY = "zatwierdzony";
export const PROBNY_ODRZUCONY = "odrzucony";

// Czeka na decyzję kierownika: widoczny na tablecie, odbija godziny, ale NIE
// pokazuje się w Grafiku — planowanie zmian komuś, kto może jutro nie
// przyjść, robi dziurę w obsadzie wyglądającą na pokrytą.
export const czekaNaDecyzje = (u) => u?.probny_status === PROBNY_OCZEKUJE;

// Ślad zostaje po decyzji, żeby po pół roku dało się odpowiedzieć na pytanie
// "skąd się ta osoba w ogóle wzięła".
export const bylNaProbie = (u) => !!u?.probny_status;

export const probniDoDecyzji = ({ users, lokalOk }) =>
  (users || [])
    .filter((u) => czekaNaDecyzje(u) && !u.archived)
    .filter((u) => !lokalOk || lokalOk(u.default_lokal))
    .sort((a, b) => String(a.probny_od || "").localeCompare(String(b.probny_od || "")));

// Ile godzin ta osoba zdążyła odbić — to jest ta liczba, od której zależy, czy
// odrzucenie kogokolwiek cokolwiek kosztuje.
export const godzinyProbnego = (shifts, user) =>
  (shifts || [])
    .filter((s) => String(s.user_id) === String(user.id) && s.end_time)
    .reduce((suma, s) => suma + (s.end_time - s.start_time) / 3600000, 0);

export const dodajProbnego = async ({ name, lokal, stanowisko, przez }) => {
  const imie = (name || "").trim();
  if (!imie) throw new Error("Wpisz imię i nazwisko.");
  if (!lokal) throw new Error("Wybierz lokal.");
  if (!stanowisko) throw new Error("Wybierz stanowisko.");

  // ⚠️ Przez funkcję w bazie, nie przez INSERT do `users`. Od migracji 0029
  // tablet nie ma prawa zapisu do kartoteki — urządzenie stojące na sali nie
  // może tworzyć dowolnych kont. Warunki (konto `open`, bez danych logowania,
  // zawsze „oczekuje", zawsze w lokalu tego urządzenia) sprawdza baza, a nie
  // przeglądarka; wcześniej były tylko tutaj, czyli po stronie, którą da się
  // pominąć.
  const utworzony = await api.rpc("dodaj_probnego", {
    p_name: imie,
    p_lokal: lokal,
    p_stanowisko: stanowisko,
    p_przez: przez || null,
  });

  // Kierownik dowiaduje się od razu, a nie wtedy, gdy przypadkiem wejdzie w
  // zakładkę. Dzień próbny trwa jeden dzień — decyzja spóźniona o tydzień
  // jest tyle samo warta co jej brak.
  await createManagerNotification(
    lokal,
    `${imie} (${stanowisko}) został(a) dodany(-a) na próbę na Tablecie Służbowym w lokalu ${lokal}. ` +
      "Do potwierdzenia w zakładce Zatwierdzanie zmian.",
    "probny"
  ).catch(() => {});

  return utworzony;
};

// Zatwierdzenie nie dopisuje żadnych danych umowy — kierownik uzupełnia je w
// karcie pracownika. Tutaj zdejmujemy tylko to jedno ograniczenie: od teraz
// osoba jest zwykłym pracownikiem i pojawia się w Grafiku.
export const zatwierdzProbnego = async (user) =>
  api.patch("users", user.id, { probny_status: PROBNY_ZATWIERDZONY });

// Odrzucenie NIE kasuje godzin. Jeśli ktoś przepracował dzień próbny, należą
// mu się pieniądze niezależnie od tego, czy został przyjęty — dlatego wiersze
// w `shifts` zostają nietknięte, a konto idzie do archiwum. Trwałe usunięcie
// zostaje tam, gdzie było zawsze: w widoku Archiwum, po namyśle.
export const odrzucProbnego = async (user) =>
  api.patch("users", user.id, {
    probny_status: PROBNY_ODRZUCONY,
    active: false,
    archived: true,
  });
