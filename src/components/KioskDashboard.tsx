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
  ArrowLeftRight,
  Check,
  X,
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
import { IkonaTypu } from "./manager/wydarzeniaWspolne";
import { wydarzeniaNaDzien, dlaCalegoLokalu, koniecWydarzenia, godzinyTekst } from "../utils/wydarzenia";
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
  wydarzenia = [],
  wydarzeniaUczestnicy = [],
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
  // Wygląd z makiety właściciela (0.58.0, KioskStartMobile / KioskStartTablet).
  // Kolory to te same wartości co w panelu kierownika po przebudowie
  // (#171714 tusz, #DE3A22 akcent, #1F7A4A „w porządku”, #8A5300 „uwaga”).
  // ==========================================
  const DNI_KROTKO = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
  const MIES_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
  const dataKrotko = `${DNI_KROTKO[now.getDay()]} ${now.getDate()} ${MIES_KROTKO[now.getMonth()]}`;

  // Nagłówek ekranów POD listą (PIN, nowa osoba): jeden przycisk powrotu i
  // tytuł. Przycisk 48 px — z tabletu korzystają też starsze osoby.
  const naglowekPodrzedny = (etykietaPowrotu, tytul) => (
    <header className="bg-white border-b-2 border-[#171714] px-3.5 md:px-6 py-2.5 flex items-center gap-3 flex-shrink-0">
      <button
        onClick={goList}
        className="h-12 flex items-center gap-1 border-2 border-[#171714] rounded-lg bg-white pl-2.5 pr-4 font-['Archivo'] font-bold text-[17px] text-[#171714] flex-shrink-0"
      >
        <ChevronLeft size={20} strokeWidth={2.5} /> {etykietaPowrotu}
      </button>
      <span className="font-['Archivo'] font-extrabold text-[22px] text-[#171714] truncate">
        {tytul}
      </span>
    </header>
  );
  const ramaEkranu = (children) => (
    <div className="h-screen bg-[#F1F0EC] flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-md md:max-w-none bg-[#F1F0EC] h-full flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );

  // ==========================================
  // EKRAN: LIST — wybór pracownika
  // ==========================================
  if (screen === "LIST") {
    // Trzy grupy wg stanu na DZIŚ — człowiek szuka siebie tam, gdzie jest:
    // kto już pracuje, kto ma dziś przyjść, reszta. Kolejność wewnątrz grupy
    // zostaje ta z `widoczniUsers` (w grafiku — wg godziny startu).
    const GRUPY = [
      { tytul: "Na zmianie", stany: ["na_zmianie"] },
      { tytul: "Dziś w grafiku", stany: ["oczekiwany"] },
      { tytul: "Pozostali", stany: ["zakonczyl", "wolne"] },
    ];
    const karta = (u) => {
      const {
        otwarta: empOpen,
        porzucona: empPorzucona,
        zamkniete: empClosedToday,
        zaplanowane,
        stan,
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
      // Status stoi z PRAWEJ jako blok (mała etykieta + duża godzina), żeby
      // karta była niska i lista mieściła więcej osób bez przewijania.
      const znacznik = empOpen
        ? { tlo: "bg-[#DE3A22] text-white", etykieta: "zmiana od", wartosc: fmtHHMM(empOpen.start_time) }
        : empClosedToday.length > 0
        ? {
            tlo: "bg-[#DEDCD4] text-[#6E6E66]",
            etykieta: "dziś",
            wartosc: `${sumHours(empClosedToday).toFixed(1).replace(".", ",")} h`,
          }
        : zaplanowane.length > 0
        ? { tlo: "bg-[#1F7A4A] text-white", etykieta: "w grafiku", wartosc: trimTime(zaplanowane[0].start_time) }
        : null;
      const ramka =
        stan === "na_zmianie"
          ? "border-[#DE3A22]"
          : stan === "oczekiwany"
          ? "border-[#1F7A4A]"
          : "border-[#171714]";
      const linia = "flex items-center gap-1.5 text-[14px] font-extrabold mt-1";
      return (
        <button
          key={u.id}
          onClick={() => selectEmployee(u)}
          className={`w-full h-full min-h-[72px] flex items-center gap-3 border-2 rounded-lg pl-3.5 pr-3 py-2.5 text-left ${ramka} ${
            propozycje.length > 0 ? "bg-[#FDF0D8]" : "bg-white"
          }`}
        >
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 font-['Archivo'] font-extrabold text-[24px] leading-7 text-[#171714]">
              <span className="truncate">{u.name}</span>
              {maPin(u) && (
                <span className="text-[#6E6E66] flex-shrink-0" title="Profil chroniony PIN-em">
                  <Lock size={20} strokeWidth={2.3} />
                </span>
              )}
            </span>
            <span className="block text-[15px] text-[#6E6E66] truncate">
              {u.default_stanowisko || ""}
              {/* Wspólny tablet kilku lokali: widać od razu, z którego
                  lokalu ta osoba jest — od tego zależy, na jaki lokal
                  zapisze się jej zmiana i jakie reguły wpisu dostanie. */}
              {allowed.length > 1 && u.default_lokal
                ? `${u.default_stanowisko ? " · " : ""}${u.default_lokal}`
                : ""}
            </span>
            {czekaNaDecyzje(u) && (
              <span className="inline-block mt-1 text-[14px] font-extrabold px-2 py-0.5 rounded-md bg-[#FDF0D8] text-[#8A5300]">
                na próbę · czeka na kierownika
              </span>
            )}
            {/* Zmiana bez odbitego końca czeka u kierownika, ale jedyną
                osobą, która pamięta, o której naprawdę wyszła, jest ta
                stojąca teraz przy tablecie. */}
            {empPorzucona && (
              <span className={`${linia} text-[#8A5300]`}>
                <Hourglass size={16} strokeWidth={2.3} />
                Niezakończona zmiana z {opisDnia(toLocalYMD(empPorzucona.start_time))}
              </span>
            )}
            {/* Prawo do zamknięcia Pulsu jest jednodniowe, więc łatwo o nim
                zapomnieć — a zapomniany dzień zostaje niewpisany. Znak stoi
                na liście, żeby był widoczny zanim ktokolwiek wejdzie na
                swoją stronę. */}
            {mozeZamykacPuls(u) && (
              <span className={`${linia} text-[#171714]`}>
                <BookOpen size={16} strokeWidth={2.3} />
                Dziś Ty zamykasz dzień
              </span>
            )}
            {nieprzeczytane > 0 && (
              <span className={`${linia} text-[#DE3A22]`}>
                <Mail size={16} strokeWidth={2.3} />
                {nieprzeczytane === 1
                  ? "Czeka wiadomość"
                  : `Czekają ${nieprzeczytane} wiadomości`}
              </span>
            )}
            {propozycje.length > 0 ? (
              <span className={`${linia} text-[#8A5300]`}>
                <ArrowLeftRight size={16} strokeWidth={2.3} />
                Giełda: propozycja {opisDnia(propozycje[0].ps.date)} ·{" "}
                {trimTime(propozycje[0].ps.start_time)} – {trimTime(propozycje[0].ps.end_time)}
                {propozycje.length > 1 ? ` (+${propozycje.length - 1})` : ""}
              </span>
            ) : wystawione.length > 0 ? (
              <span className="flex items-center gap-1.5 text-[14px] text-[#6E6E66] mt-1">
                <ArrowLeftRight size={16} strokeWidth={2.3} />
                Giełda: {STATUS_LABEL[wystawione[0].sw.status].toLowerCase()}
              </span>
            ) : null}
          </span>
          {znacznik && (
            <span
              className={`flex-shrink-0 min-w-[84px] flex flex-col items-center text-center px-2.5 py-1.5 rounded-[10px] ${znacznik.tlo}`}
            >
              <span className="text-[12px] font-bold leading-[15px] whitespace-nowrap opacity-90">
                {znacznik.etykieta}
              </span>
              <span className="font-['Archivo'] font-extrabold text-[22px] leading-[26px] tabular-nums whitespace-nowrap">
                {znacznik.wartosc}
              </span>
            </span>
          )}
        </button>
      );
    };

    return ramaEkranu(
      <>
        <header className="bg-white border-b-2 border-[#171714] px-3.5 md:px-6 py-2.5 md:py-3 grid grid-cols-[auto_1fr_auto] items-center gap-2.5 flex-shrink-0">
          {/* Marka zamiast napisu "Tablet Służbowy": urządzenie i tak
              przedstawia się obok nazwą lokalu i zegarem, a to jest jedyny
              ekran, który stoi otwarty na sali cały dzień. Sam termin
              "Tablet Służbowy" zostaje w słowniku aplikacji — tak nazywa się
              typ konta w karcie pracownika i tak mówi o nim Przewodnik. */}
          <span className="flex items-center gap-2">
            <ShiftroMark size={30} />
            <span className="font-['Archivo'] font-extrabold text-[20px] text-[#171714]">
              {PRODUKT}
            </span>
          </span>
          <span className="text-[15px] font-bold text-[#6E6E66] truncate">
            {allowed.join(", ") || "Brak lokalu"}
          </span>
          <span className="text-right">
            <span className="block font-['Archivo'] font-extrabold text-[24px] leading-[26px] tabular-nums text-[#171714]">
              {fmtHHMM(now)}
            </span>
            <span className="flex items-center justify-end gap-1 text-[12px] text-[#6E6E66] whitespace-nowrap">
              <WeatherBadge city={lokaleAllowed[0]?.miasto} /> · {dataKrotko}
            </span>
          </span>
        </header>
        <main className="flex-1 overflow-y-auto px-3.5 md:px-6 pt-4 md:pt-5 pb-6">
          <div className="md:flex md:items-baseline md:gap-[18px] md:flex-wrap">
            <h2 className="font-['Archivo'] font-extrabold text-[32px] text-[#171714] mb-2 md:mb-0">
              Wybierz siebie
            </h2>
            {activeUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 md:mb-0">
                <span className="inline-flex items-center gap-1.5 text-[14px] font-bold px-2.5 py-1 rounded-2xl bg-[#FBEAE6] text-[#DE3A22]">
                  <i className="w-2 h-2 rounded-full bg-[#DE3A22]" />
                  {naZmianie} na zmianie
                </span>
                <span className="inline-flex items-center text-[14px] font-bold px-2.5 py-1 rounded-2xl bg-[#E2F3E9] text-[#1F7A4A]">
                  {oczekiwani} czeka na start
                </span>
                <span className="inline-flex items-center text-[14px] font-bold px-2.5 py-1 rounded-2xl bg-[#DEDCD4] text-[#6E6E66]">
                  {zakonczyli} zakończyło
                </span>
              </div>
            )}
          </div>
          {/* Wydarzenia (0.74.0, makieta KioskStartEvent): pasek „Dziś w
              lokalu” dla tego, co dotyczy CAŁEGO lokalu (grupa, kontrola, w
              okolicy, dla wszystkich stanowisk) — widzi go każdy przed
              wybraniem siebie, więc bez nazwisk uczestników. Znika po końcu
              ostatniego wydarzenia dnia. */}
          {(() => {
            const dzisYMD = toLocalYMD(new Date());
            const teraz = new Date();
            const lista = [
              ...new Map(
                lokaleAllowed
                  .flatMap((l) => wydarzeniaNaDzien(wydarzenia, l.name, dzisYMD))
                  .filter((w) => dlaCalegoLokalu(w) && koniecWydarzenia(w) > teraz)
                  .map((w) => [w.id, w])
              ).values(),
            ];
            if (!lista.length) return null;
            const w = lista[0];
            return (
              <div
                className="mt-3 flex items-center gap-3 rounded-xl bg-[#171714] text-white px-3.5 py-3"
                data-pasek-wydarzenia-dnia
              >
                <IkonaTypu typ={w.typ} size={36} />
                <span className="flex-1 min-w-0">
                  <b className="block text-[17px] leading-6">
                    Dziś w lokalu: {w.tytul}
                    {lista.length > 1 ? ` · +${lista.length - 1}` : ""}
                  </b>
                  <small className="block text-[14px] text-white/75 truncate">
                    {godzinyTekst(w)}
                    {w.liczba_gosci ? ` · ${w.liczba_gosci} gości` : ""}
                    {w.opis ? ` · ${w.opis}` : ""}
                  </small>
                </span>
                <em className="hidden md:inline not-italic text-[12px] font-extrabold text-white/60 whitespace-nowrap">widzą wszyscy</em>
              </div>
            );
          })()}
          {GRUPY.map(({ tytul, stany }) => {
            const osoby = widoczniUsers.filter((u) => stany.includes(stanDnia.get(u.id).stan));
            if (osoby.length === 0) return null;
            return (
              <section key={tytul}>
                <h3 className="flex items-baseline gap-2 text-[14px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66] mt-3.5 mb-2 mx-0.5">
                  {tytul}
                  <span className="text-[13px] bg-[#DEDCD4] rounded-[10px] px-2 py-px">{osoby.length}</span>
                </h3>
                {/* Na tablecie osoby stoją po trzy w rzędzie (prośba
                    właściciela, 2026-09-25): przy kilkunastu osobach
                    pojedyncza kolumna na szerokim ekranie kazała przewijać,
                    żeby znaleźć siebie. */}
                <div className="grid gap-2 md:grid-cols-3">{osoby.map(karta)}</div>
              </section>
            );
          })}
          {activeUsers.length === 0 && (
            <div className="text-center py-10 text-[#6E6E66]">
              <AlertCircle className="mx-auto mb-2 opacity-40" size={40} />
              Brak przypisanych pracowników.
            </div>
          )}
          {/* Ktoś na dzień próbny przychodzi rano, kiedy kierownika w lokalu
              nie ma. Bez tej drogi jego godziny lądują na kartce albo nigdzie. */}
          <button
            onClick={otworzNowego}
            className="w-full md:max-w-[520px] mt-[18px] min-h-[72px] flex items-center justify-center gap-3 border-2 border-dashed border-[#171714] rounded-lg text-left text-[#171714]"
          >
            <UserPlus size={28} strokeWidth={2.2} />
            <span>
              <span className="block font-['Archivo'] font-bold text-[18px]">Nowa osoba na próbę</span>
              <span className="block text-[13px] text-[#6E6E66]">
                tylko zapis godzin · kierownik zatwierdzi
              </span>
            </span>
          </button>
        </main>
      </>
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
    // Stanowisko i lokal jako kafle, nie lista rozwijana: przy trzech–pięciu
    // pozycjach jedno dotknięcie zamiast dwóch, i od razu widać wszystkie.
    const kafel = (wybrany) =>
      `min-h-[56px] rounded-lg border-2 px-2 flex items-center justify-center gap-1.5 text-[16px] font-bold text-center ${
        wybrany
          ? "bg-[#171714] border-[#171714] text-white"
          : "bg-white border-[#171714] text-[#171714]"
      }`;
    const etykieta = "block font-['Archivo'] font-extrabold text-[18px] text-[#171714] mt-[18px] mb-2 mx-0.5";
    return ramaEkranu(
      <>
        {naglowekPodrzedny("Wróć", "Nowa osoba na próbę")}
        {/* Na tablecie formularz w kolumnie, nie na całą szerokość ekranu. */}
        <main className="flex-1 overflow-y-auto px-3.5 pt-4 pb-6 w-full md:max-w-[520px] md:mx-auto">
          <p className="text-[16px] leading-[22px] text-[#6E6E66] mb-3.5">
            Wystarczy, żeby zacząć odbijać godziny. Kierownik dostanie
            powiadomienie i zdecyduje, czy ta osoba zostaje.
          </p>

          <label className="block">
            <span className="block text-[15px] text-[#6E6E66] mx-0.5 mb-1.5">Imię i nazwisko</span>
            <input
              type="text"
              autoFocus
              value={nowyForm.name}
              onChange={(e) => setNowyForm({ ...nowyForm, name: e.target.value })}
              placeholder="np. Anna Kowalska"
              className="w-full h-14 px-3.5 border-2 border-[#171714] rounded-lg bg-white text-[18px] font-semibold text-[#171714]"
            />
          </label>

          {/* Wybór lokalu tylko wtedy, gdy tablet obsługuje więcej niż
              jeden — jedno pole mniej to jedno pole mniej do pomylenia. */}
          {lokaleAllowed.length > 1 && (
            <>
              <span className={etykieta}>Lokal</span>
              <div className="grid grid-cols-2 gap-2">
                {lokaleAllowed.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setNowyForm({ ...nowyForm, lokal: l.name, stanowisko: "" })}
                    className={kafel(nowyForm.lokal === l.name)}
                  >
                    {nowyForm.lokal === l.name && <Check size={18} strokeWidth={2.5} />}
                    {l.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <span className={etykieta}>Stanowisko</span>
          {stanowiskaNowego.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {stanowiskaNowego.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setNowyForm({ ...nowyForm, stanowisko: s.name })}
                  className={kafel(nowyForm.stanowisko === s.name)}
                >
                  {nowyForm.stanowisko === s.name && <Check size={18} strokeWidth={2.5} />}
                  {s.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-[#6E6E66]">
              Ten lokal nie ma jeszcze stanowisk — kierownik musi je dodać.
            </p>
          )}

          {/* Mówimy to, co naprawdę jest włączone (bloki w sesji niżej):
              Zmiana, Raport i Zadania. Makieta chowała też zadania — ale
              osoba na próbę stoi na zmianie i checklista jej się przydaje. */}
          <div className="mt-3.5 mb-3.5 px-3.5 py-3 rounded-lg bg-[#DEDCD4]">
            <b className="text-[15px] text-[#171714]">Co ta osoba będzie mogła robić</b>
            <ul className="mt-1.5 mb-1 grid gap-1">
              <li className="flex items-center gap-1.5 text-[15px] font-bold text-[#1F7A4A]">
                <Check size={16} strokeWidth={2.5} /> zapisywać godziny (Zmiana)
              </li>
              <li className="flex items-center gap-1.5 text-[15px] font-bold text-[#1F7A4A]">
                <Check size={16} strokeWidth={2.5} /> widzieć swój Raport godzin i zadania
              </li>
              <li className="flex items-center gap-1.5 text-[15px] text-[#6E6E66]">
                <X size={16} strokeWidth={2.5} /> nie pojawi się w grafiku
              </li>
              <li className="flex items-center gap-1.5 text-[15px] text-[#6E6E66]">
                <X size={16} strokeWidth={2.5} /> nie zaloguje się z własnego telefonu
              </li>
            </ul>
            <small className="text-[13px] text-[#6E6E66]">…dopóki kierownik jej nie zatwierdzi.</small>
          </div>

          <button
            disabled={!komplet || nowySaving}
            onClick={zapiszNowego}
            className="w-full min-h-[60px] rounded-lg font-['Archivo'] font-extrabold text-[19px] bg-[#DE3A22] text-white disabled:bg-[#DEDCD4] disabled:text-[#6E6E66]"
          >
            {nowySaving ? "Zapisywanie..." : "Dodaj i zacznij zmianę"}
          </button>
        </main>
      </>
    );
  }

  // ==========================================
  // EKRAN: PIN — blokada wybranego pracownika
  // Logika bez zmian; nowy jest tylko wygląd (duże klawisze 84×72 px).
  // ==========================================
  if (screen === "PIN") {
    // Czerwone kropki tylko dopóki cyfry stoją na ekranie. Komunikat zostaje
    // dłużej (do następnej cyfry), a czerwone puste kółka wyglądałyby jak
    // druga, osobna awaria.
    const zlePinKropki = !!pinBlad && pinEntered.length > 0;
    const klawisz =
      "h-[72px] border-2 border-[#171714] rounded-[18px] bg-white font-['Archivo'] font-extrabold text-[30px] text-[#171714] flex items-center justify-center";
    return ramaEkranu(
      <>
        {naglowekPodrzedny("Zmień", "Logowanie")}
        <main className="flex-1 overflow-y-auto px-3.5 pt-6 pb-6 flex flex-col items-center text-center">
          <div className="w-[72px] h-[72px] rounded-full bg-[#DEDCD4] flex items-center justify-center font-['Archivo'] font-extrabold text-[26px] text-[#171714]">
            {(pinTarget?.name || "").slice(0, 2)}
          </div>
          <h2 className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] mt-2">
            {pinTarget?.name}
          </h2>
          <p className="text-[17px] text-[#6E6E66] mt-0.5">
            Ten profil jest zablokowany — wpisz swój PIN (6 cyfr)
          </p>
          {/* Sześć pól na stałe: długość jest jedna dla wszystkich, więc
              kropki mogą pokazywać, ile jeszcze zostało. */}
          <div className="flex gap-4 mt-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-5 h-5 rounded-full border-[2.5px] ${
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
            className={`min-h-[22px] mt-3 text-[15px] font-bold px-4 ${
              pinBlad ? "text-[#DE3A22]" : "text-[#6E6E66]"
            }`}
          >
            {pinBlad || (pinSprawdza ? "Sprawdzam…" : "")}
          </div>
          <div className="grid grid-cols-[repeat(3,84px)] gap-3 justify-center mt-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <button key={k} onClick={() => handlePinDigit(k)} className={klawisz}>
                {k}
              </button>
            ))}
            <div />
            <button onClick={() => handlePinDigit("0")} className={klawisz}>
              0
            </button>
            <button onClick={() => handlePinDigit("back")} className={klawisz} aria-label="Usuń cyfrę">
              <Delete size={28} />
            </button>
          </div>
          <p className="mt-[18px] text-[14px] text-[#6E6E66]">
            Nie pamiętasz PIN-u? Poproś kierownika o reset.
          </p>
        </main>
      </>
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
        wydarzenia={wydarzenia}
        wydarzeniaUczestnicy={wydarzeniaUczestnicy}
        onBack={goList}
        onLogout={() => setCurrentView("login")}
      />
    );
  }

  return null;
};

export default KioskDashboard;
