// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Lock,
  AlertCircle,
  Delete,
  ChevronLeft,
  Mail,
  BookOpen,
  UserPlus,
  Hourglass,
} from "lucide-react";
import { getTodaysShiftsForUser } from "../utils/shifts";
import { offersForUser, ofertyWystawione, STATUS_LABEL } from "../utils/swaps";
import { mozeZamykacPuls } from "./manager/PulsZmiany";
import { trimTime, toLocalYMD } from "../utils/grafik";
import {
  fmtHHMM,
  sumHours,
  opisDnia,
  EmployeeSessionScreens,
} from "./employeeSessionShared";
import { zmianaTrwa } from "../utils/porzucone";
import { dodajProbnego, czekaNaDecyzje } from "../utils/probni";
import WeatherBadge from "./WeatherBadge";
import ShiftroMark from "./ShiftroMark";
import { PRODUKT } from "../config";
import { api } from "../api/supabase";

// Czy profil jest zablokowany PIN-em.
//
// ⚠️ Od migracji 0027 odpowiada na to kolumna wyliczana `ma_kiosk_pin`, a nie
// obecność samego PIN-u — bo celem tej zmiany jest to, żeby PIN w ogóle nie
// docierał do przeglądarki. Odwołanie do `kiosk_pin` zostaje jako zachowanie
// sprzed tej migracji: baza, w której jej jeszcze nie ma, nie odda kolumny
// `ma_kiosk_pin` i bez tego kroku WSZYSTKIE profile wyglądałyby na odblokowane
// — czyli aktualizacja aplikacji po cichu zdjęłaby blokady.
export const maPin = (u) =>
  u && u.ma_kiosk_pin !== undefined ? !!u.ma_kiosk_pin : !!(u && u.kiosk_pin);

// ==========================================
// KIOSK SŁUŻBOWY — nowy design ("Tablet Służbowy")
// Zastępuje OpenDeviceDashboard w widoku "open_dashboard" (App.tsx).
// Wzornictwo wg zatwierdzonego prototypu HTML z sesji projektowej — patrz
// CLAUDE.md, "Tablet Służbowy — KioskDashboard". OpenDeviceDashboard.tsx
// pozostaje nietknięty w repo jako łatwy rollback.
//
// Ekrany "wewnątrz sesji" (Pulpit/Zmiana/Raport/Zadania/Więcej/Wiadomości/
// Zgłoś) są współdzielone z PersonalDashboard.tsx (osobiste konto) przez
// employeeSessionShared.tsx — ten plik odpowiada TYLKO za "kto teraz
// korzysta z tego wspólnego urządzenia": listę pracowników i opcjonalną
// blokadę PIN-em.
// ==========================================

const KioskDashboard = ({
  currentUser,
  setCurrentView,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  users,
  setUsers,
  issues,
  setIssues,
  notifications,
  setNotifications,
  tasks,
  taskBlocks,
  taskCompletions,
  dayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  setTaskCompletions,
  absences,
  planShifts,
  shiftSwaps,
  setShiftSwaps,
  setAbsences,
  showMsg,
}) => {
  const [screen, setScreen] = useState("LIST");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinEntered, setPinEntered] = useState("");
  // Komunikat pod kropkami. Pusty = wszystko w porządku. Trzyma TEKST, a nie
  // samo "źle": odmowa bazy i zerwane wi-fi wyglądają dla człowieka tak samo
  // (profil się nie otwiera), a znaczą co innego i co innego się z nimi robi.
  const [pinBlad, setPinBlad] = useState("");
  const [pinSprawdza, setPinSprawdza] = useState(false);
  const [now, setNow] = useState(new Date());
  // Szybkie dodanie osoby na dzień próbny. Trzy pola i nic więcej: resztę
  // karty wypełnia kierownik, jeśli w ogóle zdecyduje się ją przyjąć.
  const [nowyForm, setNowyForm] = useState(null);
  const [nowySaving, setNowySaving] = useState(false);

  const allowed = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];
  const dzisYMD = toLocalYMD(new Date());

  // Kto ma się dziś pokazać na tym tablecie: przypisani do lokalu na stałe
  // PLUS wypożyczeni — czyli ci, których grafik stawia dziś właśnie tutaj.
  //
  // ⚠️ DODAJEMY, nie przenosimy. Osoba wypożyczona zostaje też na liście
  // swojego macierzystego lokalu, bo plany się zmieniają: gdyby grafik mówił
  // "dziś w Ceglanej", a ona przyszła jednak do Bułki, przeniesienie sprawiłoby,
  // że nie znajdzie siebie na tablecie i nie odbije zmiany wcale. Jeśli grafik
  // stawia kogoś tego dnia w dwóch lokalach, pokaże się na obu tabletach — o to
  // właśnie chodzi, żeby nie było chodzenia między lokalami ani telefonów
  // "zapisz mi tam zmianę".
  //
  // Zmiana zapisze się na lokal TEGO tabletu, nie na lokal z grafiku: fakt ma
  // mówić, gdzie człowiek naprawdę pracował.
  const dzisWGrafiku = new Set(
    (planShifts || [])
      .filter(
        (s) =>
          s.published_at &&
          !s.deleted_at &&
          s.date === dzisYMD &&
          allowed.includes(s.lokal)
      )
      .map((s) => String(s.user_id))
  );
  const activeUsers = users.filter(
    (u) =>
      u.active &&
      !u.archived &&
      u.role === "open" &&
      (allowed.includes(u.default_lokal) || dzisWGrafiku.has(String(u.id)))
  );
  // Powiadomienia WYBRANEGO pracownika, nie całego urządzenia. Wcześniej
  // kiosk pokazywał worek wiadomości wszystkich osób z lokalu, więc jedna
  // osoba otwierająca zakładkę oznaczała jako przeczytane także cudze —
  // i nikt inny już ich nie zobaczył. Kto ma nieprzeczytaną wiadomość,
  // widać teraz na liście wyboru (koperta przy nazwisku).
  const myNotifications = selectedEmployee
    ? notifications.filter(
        (n) =>
          (n.audience || "employee") === "employee" &&
          n.user_name === selectedEmployee.name
      )
    : [];
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  const lokaleAllowed = lokale.filter((l) => allowed.includes(l.name));
  const stanowiskaAllowed = stanowiska.filter((s) =>
    allowed.includes(s.lokal_name)
  );

  // Stan każdej osoby na DZIŚ, liczony raz i używany zarówno przez licznik
  // nad listą, jak i przez sortowanie i kafelki. "Jeszcze nie odbiło" liczymy
  // WG GRAFIKU — kto ma dziś wolne, nie jest nikomu potrzebny na liście
  // braków (wcześniej licznik brał wszystkich przypisanych do lokalu i
  // pokazywał nieprawdę).
  const stanDnia = new Map(
    activeUsers.map((u) => {
      // ⚠️ Tylko zmiana, która WCIĄŻ trwa. Ta, której ktoś nie zakończył i
      // która przekroczyła próg lokalu, nie może dalej świecić "od 08:00" —
      // liczniki nad listą kłamałyby, a osoba nie mogłaby odbić nowej zmiany.
      const otwarta = shifts.find(
        (s) =>
          s.user_id === u.id &&
          zmianaTrwa({ shift: s, planShifts, lokale, users, now })
      );
      // Zmiana, której ta osoba nie zakończyła i która czeka na decyzję
      // kierownika. Nie liczy się już jako trwająca, ale musi być widoczna:
      // człowiek stojący przy tablecie jest jedynym, który pamięta, o której
      // wtedy wyszedł.
      //
      // ⚠️ Tylko z ostatniego tygodnia, choć w kolejce kierownika takie pozycje
      // wiszą bez ograniczenia. Po tygodniu ta osoba i tak nie pamięta tamtej
      // godziny, więc podpis przestaje być prośbą o informację i zostaje z
      // niego sam wyrzut sumienia, którego nie da się odkliknąć.
      const porzucona = shifts.find(
        (s) =>
          s.user_id === u.id &&
          !s.end_time &&
          !s.is_urlop &&
          !s.rozliczenie &&
          now - s.start_time < 7 * 86400000 &&
          !zmianaTrwa({ shift: s, planShifts, lokale, users, now })
      );
      const zamkniete = getTodaysShiftsForUser(shifts, u.id).filter((s) => s.end_time);
      const zaplanowane = (planShifts || [])
        .filter(
          (s) =>
            s.published_at &&
            !s.deleted_at &&
            s.date === dzisYMD &&
            String(s.user_id) === String(u.id)
        )
        .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));
      const stan = otwarta
        ? "na_zmianie"
        : zamkniete.length > 0
        ? "zakonczyl"
        : zaplanowane.length > 0
        ? "oczekiwany"
        : "wolne";
      return [u.id, { otwarta, porzucona, zamkniete, zaplanowane, stan }];
    })
  );
  const ile = (stan) => activeUsers.filter((u) => stanDnia.get(u.id).stan === stan).length;
  const naZmianie = ile("na_zmianie");
  const oczekiwani = ile("oczekiwany");
  const zakonczyli = ile("zakonczyl");

  // Kolejność: kto jest teraz na zmianie, potem kto jest dziś oczekiwany,
  // potem kto już skończył, na końcu wolne. Na wspólnym tablecie to skraca
  // szukanie siebie do jednego spojrzenia.
  const KOLEJNOSC = { na_zmianie: 0, oczekiwany: 1, zakonczyl: 2, wolne: 3 };
  const widoczniUsers = [...activeUsers].sort((a, b) => {
    const sa = KOLEJNOSC[stanDnia.get(a.id).stan];
    const sb = KOLEJNOSC[stanDnia.get(b.id).stan];
    if (sa !== sb) return sa - sb;
    if (sa === 1) {
      const ga = trimTime(stanDnia.get(a.id).zaplanowane[0]?.start_time) || "99:99";
      const gb = trimTime(stanDnia.get(b.id).zaplanowane[0]?.start_time) || "99:99";
      if (ga !== gb) return ga.localeCompare(gb);
    }
    return a.name.localeCompare(b.name, "pl");
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const goList = () => {
    setSelectedEmployee(null);
    setPinTarget(null);
    setPinEntered("");
    setPinBlad("");
    setPinSprawdza(false);
    setNowyForm(null);
    setScreen("LIST");
  };

  const otworzNowego = () => {
    setNowyForm({
      name: "",
      lokal: lokaleAllowed[0]?.name || allowed[0] || "",
      stanowisko: "",
    });
    setScreen("NOWY");
  };

  // Dzień próbny bywa płatny, a kierownika rano w lokalu nie ma. Konto
  // powstaje bez e-maila i bez PIN-u — nie da się nim nigdzie zalogować,
  // istnieje tylko na tym tablecie i czeka na decyzję (utils/probni.ts).
  const zapiszNowego = async () => {
    const imie = (nowyForm?.name || "").trim();
    const duplikat = activeUsers.find(
      (u) => u.name.trim().toLowerCase() === imie.toLowerCase()
    );
    if (
      duplikat &&
      !window.confirm(
        `${duplikat.name} jest już na liście tego tabletu. Dodać mimo to drugą osobę o tym samym imieniu?`
      )
    )
      return;
    setNowySaving(true);
    try {
      const utworzony = await dodajProbnego({
        name: imie,
        lokal: nowyForm.lokal,
        stanowisko: nowyForm.stanowisko,
        przez: currentUser.name,
      });
      setUsers?.((prev) => [...(prev || []), utworzony]);
      setNowyForm(null);
      // Od razu do jego sesji: po to ta osoba stoi przy tablecie — żeby
      // odbić zmianę, a nie żeby zobaczyć, że konto powstało.
      setSelectedEmployee(utworzony);
      setScreen("SESSION");
      showMsg(`${utworzony.name} dodany(-a) na próbę. Kierownik to potwierdzi.`);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
    setNowySaving(false);
  };

  const selectEmployee = (u) => {
    if (maPin(u)) {
      setPinTarget(u);
      setPinEntered("");
      setPinBlad("");
      setScreen("PIN");
    } else {
      setSelectedEmployee(u);
      setScreen("SESSION");
    }
  };

  // PIN blokady ma DOKŁADNIE sześć cyfr i zatwierdza się sam — dokładnie tak,
  // jak wcześniej cztery. Bez przycisku, bez potwierdzania: przy urządzeniu,
  // które obsługuje się jedną ręką w biegu, każde dodatkowe dotknięcie jest
  // kosztem płaconym kilkanaście razy dziennie (ustalenie właściciela).
  //
  // ⚠️ Sześć, a nie cztery, bo PIN jest jednocześnie hasłem do logowania z
  // prywatnego telefonu, a Supabase Auth nie przyjmie krótszego niż 6 znaków
  // (patrz "Logowanie i dostęp do danych" w CLAUDE.md).
  //
  // ⚠️ Stąd wynika twardy warunek na dane: KAŻDY ustawiony `kiosk_pin` musi
  // mieć sześć cyfr. Krótszego nie da się tu wpisać, więc profil z PIN-em
  // czterocyfrowym byłby nie do otwarcia. Pole w karcie pracownika ma
  // `maxLength="6"`, a zapytanie sprawdzające, czy w bazie nie został jakiś
  // krótszy, jest w docs/sql/tools/ostatnie-bledy.sql.
  const DLUGOSC_PIN = 6;

  // ⚠️ PIN sprawdza BAZA, nie przeglądarka (migracja 0027, RPC
  // `sprawdz_kiosk_pin`). Wcześniej tablet porównywał wpisane cyfry z kolumną
  // `kiosk_pin`, którą pobierał razem z całą tabelą `users` — czyli PIN-y
  // wszystkich osób z lokalu leżały w pamięci urządzenia stojącego na sali.
  // Blokada, której sekret ma przy sobie ten, przed kim broni, nie jest
  // blokadą.
  //
  // ⚠️ Nieudane sprawdzenie i zła odpowiedź to DWIE różne rzeczy. "Niepoprawny
  // PIN" przy zerwanym wi-fi każe człowiekowi wpisywać w kółko coś, co jest
  // poprawne — i po trzeciej próbie iść po kierownika. Dlatego błąd wywołania
  // ma własny komunikat i mówi, gdzie szukać przyczyny.
  const zatwierdzPin = async (wpisany) => {
    const target = pinTarget;
    if (!target) return;
    setPinSprawdza(true);
    try {
      const ok = await api.rpc("sprawdz_kiosk_pin", {
        p_user_id: target.id,
        p_pin: wpisany,
      });
      if (ok === true) {
        setSelectedEmployee(target);
        setPinTarget(null);
        setPinEntered("");
        setPinBlad("");
        setScreen("SESSION");
        return;
      }
      nieudanyPin("Niepoprawny PIN, spróbuj ponownie");
    } catch {
      nieudanyPin("Nie udało się sprawdzić PIN-u — sprawdź połączenie");
    } finally {
      setPinSprawdza(false);
    }
  };

  // Kropki gasną po chwili, komunikat zostaje do następnej cyfry. Przy
  // czterech słowach o połączeniu 900 ms to za mało, żeby zdążyć przeczytać.
  const nieudanyPin = (tekst) => {
    setPinBlad(tekst);
    setTimeout(() => setPinEntered(""), 900);
  };

  const handlePinDigit = (k) => {
    // W trakcie pytania do bazy klawiatura milczy — inaczej dosypane cyfry
    // wpadłyby do następnej próby i człowiek zobaczyłby odmowę PIN-u, którego
    // nie wpisał.
    if (pinSprawdza) return;
    if (k === "back") {
      setPinEntered((p) => p.slice(0, -1));
      return;
    }
    setPinBlad("");
    setPinEntered((prev) => {
      if (prev.length >= DLUGOSC_PIN) return prev;
      const next = prev + k;
      if (next.length === DLUGOSC_PIN) setTimeout(() => zatwierdzPin(next), 150);
      return next;
    });
  };

  // ==========================================
  // EKRAN: LIST — wybór pracownika
  // ==========================================
  if (screen === "LIST") {
    return (
      <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between flex-shrink-0">
            {/* Marka zamiast napisu "Tablet Służbowy": urządzenie i tak
                przedstawia się obok nazwą lokalu i zegarem, a to jest jedyny
                ekran, który stoi otwarty na sali cały dzień. Sam termin
                "Tablet Służbowy" zostaje w słowniku aplikacji — tak nazywa się
                typ konta w karcie pracownika i tak mówi o nim Przewodnik. */}
            <span className="flex items-center gap-2">
              <ShiftroMark size={24} />
              <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
                {PRODUKT}
              </span>
            </span>
            <span className="text-sm text-[#8F8E86]">
              {allowed.join(", ") || "Brak lokalu"} · {fmtHHMM(now)}
            </span>
          </header>
          <div className="bg-[#E7E7E2] border-b border-[#B7B6AE] px-5 py-2.5 flex items-center gap-2 text-sm text-[#6E6E66] flex-shrink-0">
            <WeatherBadge city={lokaleAllowed[0]?.miasto} />
          </div>
          <main className="flex-1 overflow-y-auto px-5 pt-6 pb-5 flex flex-col">
            <div className="font-['Archivo'] font-extrabold text-[30px] text-[#171714]">
              Wybierz siebie
            </div>
            <div className="text-sm text-[#6E6E66] mt-0.5 mb-3.5">
              {activeUsers.length > 0
                ? [
                    `${naZmianie} na zmianie`,
                    `${oczekiwani} wg grafiku jeszcze nie odbiło`,
                    `${zakonczyli} zakończyło`,
                  ].join(" · ")
                : "Brak przypisanych pracowników"}
            </div>
            {widoczniUsers.map((u) => {
              const {
                otwarta: empOpen,
                porzucona: empPorzucona,
                zamkniete: empClosedToday,
                zaplanowane,
              } = stanDnia.get(u.id);
              // Na wspólnym tablecie nikt nie wchodzi na cudzą stronę, więc
              // giełda musi być widoczna już na liście. Podświetlamy TYLKO
              // tych, którzy mogą coś wziąć — dla nich to zaproszenie do
              // działania. Autor oferty dostaje sam napis: on już wie, że
              // ją wystawił, kolor niczego by mu nie dodał.
              const propozycje = offersForUser({
                swaps: shiftSwaps,
                planShifts,
                absences,
                user: u,
              });
              // Wiadomości są adresowane imiennie, a na wspólnym tablecie
              // nikt nie zagląda na cudzą stronę — bez sygnału na liście
              // powiadomienie potrafiłoby wisieć nieprzeczytane tygodniami.
              const nieprzeczytane = notifications.filter(
                (n) =>
                  (n.audience || "employee") === "employee" &&
                  n.user_name === u.name &&
                  !n.is_read
              ).length;
              // ⚠️ Przez `ofertyWystawione`, a nie filtrem po samym statusie:
              // wiersz oferty przeżywa usunięcie zmiany z grafiku i bez
              // sprawdzenia, czy zmiana wciąż istnieje, podpis „na giełdzie"
              // wisiał tu w nieskończoność (22.09.2026, Olena).
              const wystawione = ofertyWystawione({
                swaps: shiftSwaps,
                planShifts,
                user: u,
              });
              return (
                <button
                  key={u.id}
                  onClick={() => selectEmployee(u)}
                  className={`border-2 rounded p-4 flex items-center justify-between gap-3 w-full text-left mb-3.5 ${
                    propozycje.length > 0
                      ? "border-[#171714] bg-[#FDF3D4]"
                      : "border-[#B7B6AE] bg-[#F1F1EE]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-['Archivo'] font-extrabold text-[21px] text-[#171714] flex items-center gap-1.5">
                      {u.name}{" "}
                      {maPin(u) && <Lock size={14} strokeWidth={2.3} />}
                    </div>
                    <div className="text-[13px] text-[#6E6E66] mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {u.default_stanowisko || ""}
                      {czekaNaDecyzje(u) && (
                        <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#FFF4D6] text-[#8A6B1E]">
                          na próbę
                        </span>
                      )}
                    </div>
                    {/* Zmiana bez odbitego końca czeka u kierownika, ale
                        jedyną osobą, która pamięta, o której naprawdę wyszła,
                        jest ta stojąca teraz przy tablecie. */}
                    {empPorzucona && (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1 flex items-center gap-1">
                        <Hourglass size={14} strokeWidth={2.3} />
                        Niezakończona zmiana z{" "}
                        {opisDnia(toLocalYMD(empPorzucona.start_time))}
                      </div>
                    )}
                    {/* Prawo do zamknięcia Pulsu jest jednodniowe, więc łatwo
                        o nim zapomnieć — a zapomniany dzień zostaje niewpisany.
                        Znak stoi na liście, żeby był widoczny zanim ktokolwiek
                        wejdzie na swoją stronę. */}
                    {mozeZamykacPuls(u) && (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1 flex items-center gap-1">
                        <BookOpen size={14} strokeWidth={2.3} />
                        Dziś Ty zamykasz dzień
                      </div>
                    )}
                    {nieprzeczytane > 0 && (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1 flex items-center gap-1">
                        <Mail size={14} strokeWidth={2.3} />
                        {nieprzeczytane === 1
                          ? "Czeka wiadomość"
                          : `Czekają ${nieprzeczytane} wiadomości`}
                      </div>
                    )}
                    {propozycje.length > 0 ? (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1">
                        ⇄ Giełda: propozycja {opisDnia(propozycje[0].ps.date)} ·{" "}
                        {trimTime(propozycje[0].ps.start_time)} –{" "}
                        {trimTime(propozycje[0].ps.end_time)}
                        {propozycje.length > 1 ? ` (+${propozycje.length - 1})` : ""}
                      </div>
                    ) : wystawione.length > 0 ? (
                      <div className="text-[13px] text-[#6E6E66] mt-1">
                        ⇄ Giełda: {STATUS_LABEL[wystawione[0].sw.status].toLowerCase()}
                      </div>
                    ) : null}
                  </div>
                  {empOpen ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B]">
                      od {fmtHHMM(empOpen.start_time)}
                    </span>
                  ) : empClosedToday.length > 0 ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#EAEAE5] text-[#4A4A43]">
                      {sumHours(empClosedToday).toFixed(1).replace(".", ",")} godz.
                    </span>
                  ) : zaplanowane.length > 0 ? (
                    /* Trzeci stan obok "od HH:MM" (trwa) i "N godz."
                       (skończone): o której ma dziś być wg grafiku. */
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#E4F3E0] text-[#2F5E2A]">
                      o {trimTime(zaplanowane[0].start_time)}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {activeUsers.length === 0 && (
              <div className="text-center py-10 text-[#8F8E86]">
                <AlertCircle className="mx-auto mb-2 opacity-40" size={40} />
                Brak przypisanych pracowników.
              </div>
            )}
            {/* Ktoś na dzień próbny przychodzi rano, kiedy kierownika w lokalu
                nie ma. Bez tej drogi jego godziny lądują na kartce albo nigdzie. */}
            <button
              onClick={otworzNowego}
              className="mt-auto border-2 border-dashed border-[#B7B6AE] rounded p-3.5 flex items-center justify-center gap-2 w-full text-[15px] font-['Archivo'] font-bold text-[#6E6E66]"
            >
              <UserPlus size={18} strokeWidth={2.3} /> Nowa osoba na próbę
            </button>
          </main>
        </div>
      </div>
    );
  }

  // ==========================================
  // EKRAN: NOWY — osoba na dzień próbny
  // Trzy pola i koniec. Wszystko inne (stawka, umowa, terminy, dostęp z
  // telefonu) to decyzje kierownika, a tutaj stoi ktoś, kto ma za pięć minut
  // wejść na salę.
  // ==========================================
  if (screen === "NOWY" && nowyForm) {
    const stanowiskaNowego = stanowiska.filter(
      (s) => s.lokal_name === nowyForm.lokal && !s.archived
    );
    const komplet =
      nowyForm.name.trim() && nowyForm.lokal && nowyForm.stanowisko;
    return (
      <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center gap-3 flex-shrink-0">
            <button
              onClick={goList}
              className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714]"
            >
              <ChevronLeft size={16} strokeWidth={2.5} /> Wróć
            </button>
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              Nowa osoba na próbę
            </span>
          </header>
          <main className="flex-1 overflow-y-auto px-5 pt-6 pb-5">
            <p className="text-sm text-[#6E6E66] mb-5">
              Wystarczy, żeby zacząć odbijać godziny. Kierownik dostanie
              powiadomienie i zdecyduje, czy ta osoba zostaje.
            </p>

            <label className="text-xs font-bold text-[#6E6E66] uppercase tracking-wider">
              Imię i nazwisko
            </label>
            <input
              type="text"
              autoFocus
              value={nowyForm.name}
              onChange={(e) => setNowyForm({ ...nowyForm, name: e.target.value })}
              placeholder="np. Anna Kowalska"
              className="w-full p-3 border-[2.5px] border-[#171714] rounded text-[17px] mt-1.5 mb-4"
            />

            {/* Wybór lokalu tylko wtedy, gdy tablet obsługuje więcej niż
                jeden — jedno pole mniej to jedno pole mniej do pomylenia. */}
            {lokaleAllowed.length > 1 && (
              <>
                <label className="text-xs font-bold text-[#6E6E66] uppercase tracking-wider">
                  Lokal
                </label>
                <select
                  value={nowyForm.lokal}
                  onChange={(e) =>
                    setNowyForm({ ...nowyForm, lokal: e.target.value, stanowisko: "" })
                  }
                  className="w-full p-3 border-[2.5px] border-[#171714] rounded text-[17px] mt-1.5 mb-4 bg-white"
                >
                  {lokaleAllowed.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label className="text-xs font-bold text-[#6E6E66] uppercase tracking-wider">
              Stanowisko
            </label>
            <select
              value={nowyForm.stanowisko}
              onChange={(e) =>
                setNowyForm({ ...nowyForm, stanowisko: e.target.value })
              }
              className="w-full p-3 border-[2.5px] border-[#171714] rounded text-[17px] mt-1.5 mb-6 bg-white"
            >
              <option value="">— wybierz —</option>
              {stanowiskaNowego.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            <button
              disabled={!komplet || nowySaving}
              onClick={zapiszNowego}
              className="w-full bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[17px] rounded p-4 disabled:opacity-40"
            >
              {nowySaving ? "Zapisywanie..." : "Dodaj i zacznij zmianę"}
            </button>
            <p className="text-[13px] text-[#6E6E66] mt-3">
              Ta osoba nie pojawi się w grafiku i nie zaloguje się z własnego
              telefonu, dopóki kierownik jej nie zatwierdzi.
            </p>
          </main>
        </div>
      </div>
    );
  }

  // ==========================================
  // EKRAN: PIN — blokada wybranego pracownika
  // ==========================================
  if (screen === "PIN") {
    // Czerwone kropki tylko dopóki cyfry stoją na ekranie. Komunikat zostaje
    // dłużej (do następnej cyfry), a czerwone puste kółka wyglądałyby jak
    // druga, osobna awaria.
    const zlePinKropki = !!pinBlad && pinEntered.length > 0;
    return (
      <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center gap-3 flex-shrink-0">
            <button
              onClick={goList}
              className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714]"
            >
              <ChevronLeft size={16} strokeWidth={2.5} /> Zmień
            </button>
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              {pinTarget?.name}
            </span>
          </header>
          <main className="flex-1 overflow-y-auto px-5 pt-10 pb-5 flex flex-col items-center text-center">
            <div className="w-[60px] h-[60px] rounded-full bg-[#E7E7E2] flex items-center justify-center text-[#171714] mb-5">
              <Lock size={26} />
            </div>
            <div className="font-['Archivo'] font-extrabold text-2xl text-[#171714]">
              Ten profil jest zablokowany
            </div>
            <div className="text-sm text-[#6E6E66] mt-2 max-w-[260px]">
              {pinTarget?.name} zabezpieczył(a) profil PIN-em. Wpisz 6 cyfr,
              żeby otworzyć.
            </div>
            {/* Sześć pól na stałe: długość jest jedna dla wszystkich, więc
                kropki mogą pokazywać, ile jeszcze zostało. */}
            <div className="flex gap-4 mt-8">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-[18px] h-[18px] rounded-full border-[2.5px] ${
                    zlePinKropki ? "border-[#DE3A22]" : "border-[#171714]"
                  } ${
                    i < pinEntered.length
                      ? zlePinKropki
                        ? "bg-[#DE3A22]"
                        : "bg-[#171714]"
                      : "bg-transparent"
                  }`}
                />
              ))}
            </div>
            <div
              className={`min-h-[20px] mt-3.5 text-[13px] font-semibold px-4 ${
                pinBlad ? "text-[#DE3A22]" : "text-[#6E6E66]"
              }`}
            >
              {pinBlad || (pinSprawdza ? "Sprawdzam…" : "")}
            </div>
            <div className="grid grid-cols-3 gap-3.5 mt-7 w-full max-w-[280px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button
                  key={k}
                  onClick={() => handlePinDigit(k)}
                  className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] font-['Archivo'] font-bold text-xl text-[#171714] flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
              <div />
              <button
                onClick={() => handlePinDigit("0")}
                className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] font-['Archivo'] font-bold text-xl text-[#171714] flex items-center justify-center"
              >
                0
              </button>
              <button
                onClick={() => handlePinDigit("back")}
                className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] flex items-center justify-center text-[#171714]"
              >
                <Delete size={20} />
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (screen === "SESSION" && selectedEmployee) {
    return (
      <EmployeeSessionScreens
        key={selectedEmployee.id}
        employee={selectedEmployee}
        /* Tablet Służbowy dostaje pełny zestaw bloków — poza osobą na próbę.
           Jej Grafik jest pusty z definicji, Wiadomości też (nikt jeszcze do
           niej nie pisze), a Giełda wymaga zmian w grafiku. Pusta zakładka
           wygląda jak zepsuta, więc zostają te trzy, które mają treść. */
        bloki={
          czekaNaDecyzje(selectedEmployee)
            ? ["WPISY", "RAPORT", "ZADANIA"]
            : undefined
        }
        lokaleOptions={lokaleAllowed}
        stanowiskaOptions={stanowiskaAllowed}
        lokaleWszystkie={lokale}
        stanowiskaWszystkie={stanowiska}
        shifts={shifts}
        setShifts={setShifts}
        showMsg={showMsg}
        myNotifications={myNotifications}
        unreadCount={unreadCount}
        setNotifications={setNotifications}
        showEmployeeNameInMessages={false}
        issues={issues}
        setIssues={setIssues}
        users={users}
        tasks={tasks}
        taskBlocks={taskBlocks}
        taskCompletions={taskCompletions}
        dayLogs={dayLogs}
        dayLogEntries={dayLogEntries}
        setDayLogEntries={setDayLogEntries}
        dayLogTemplates={dayLogTemplates}
        setTaskCompletions={setTaskCompletions}
        absences={absences}
        planShifts={planShifts}
        shiftSwaps={shiftSwaps}
        setShiftSwaps={setShiftSwaps}
        setAbsences={setAbsences}
        onBack={goList}
        onLogout={() => setCurrentView("login")}
        deviceNote="To urządzenie zostaje zalogowane na stałe — nie wylogowuj go bez potrzeby, bo trzeba będzie zalogować się ponownie danymi kiosku."
      />
    );
  }

  return null;
};

export default KioskDashboard;
