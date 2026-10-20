// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  LogIn,
  RefreshCw,
  WifiOff,
  BarChart3,
  Tablet,
  Smartphone,
  ArrowRight,
  ChevronDown,
  Mail,
  Lock,
} from "lucide-react";
import { APP_VERSION, PRODUKT, TENANT, DEMO } from "../config";
import { KONTA_DEMO, DEMO_PIN, kontoDemo, zuzyjRoleZAdresu } from "../demo";
import { api } from "../api/supabase";
import {
  zaloguj,
  wczytajKonto,
  widokDlaRoli,
  wyloguj,
  przypomnijPin,
  ustawNowyPin,
  tokenNowegoPinu,
  zapomnijTokenNowegoPinu,
} from "../api/auth";
import { poprawnyPin, slabyPin } from "../utils/piny";
import ShiftroMark from "./ShiftroMark";
import {
  fieldLabelCls,
  selectElCls,
  ctaPrimaryCls,
  helperTextCls,
} from "./employeeSessionShared";

// ==========================================
// EKRAN LOGOWANIA — ten sam język wizualny co reszta apki (patrz
// employeeSessionShared.tsx): akcent #DE3A22, font Archivo, grube ramki.
// Używany przez wszystkie role, więc żyje na poziomie App.tsx, nie w
// żadnym konkretnym dashboardzie.
// ==========================================
const LoginScreen = ({ setCurrentUser, setCurrentView, dbError, komunikat = "" }) => {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loguje, setLoguje] = useState(false);
  // „Nie pamiętam PIN-u” (0.77.0): login → przypomnij (e-mail z linkiem) →
  // nowy (po kliknięciu w link, token przyszedł w adresie — api/auth.ts).
  const [tryb, setTryb] = useState(() => (tokenNowegoPinu() ? "nowy" : "login"));
  const [info, setInfo] = useState("");
  const [nowyPin, setNowyPin] = useState("");
  const [nowyPin2, setNowyPin2] = useState("");

  // ⚠️ Od 0.42.0 hasło sprawdza SUPABASE AUTH, a nie przeglądarka.
  //
  // Do 0.41.2 wyglądało to tak: App pobierał CAŁĄ tabelę `users` — razem z
  // PIN-ami wszystkich — a ten ekran szukał w niej pasującego wiersza. Czyli
  // każdy, kto otworzył stronę logowania, miał już u siebie poświadczenia
  // całej załogi, zanim cokolwiek wpisał. Teraz w drugą stronę: najpierw
  // dowodzimy, kim jesteśmy, potem dostajemy dane.
  //
  // Dla użytkownika nie zmienia się NIC: ten sam e-mail, ten sam PIN.
  // Kierownicy i tablety logują się 6-cyfrowym `pin`, pracownik z prywatnego
  // telefonu 6-cyfrowym `kiosk_pin` — w Auth jest to po prostu jego hasło, bo
  // skrypt zakładający konta wziął je z tej właśnie kolumny.
  const handleLogin = async (e) => {
    e.preventDefault();
    await zalogujDanymi(email, pin);
  };

  const zalogujDanymi = async (adres, haslo) => {
    const wpisany = String(adres || "").trim().toLowerCase();
    if (!wpisany || !haslo) {
      setError("Podaj e-mail i PIN.");
      return;
    }
    setError("");
    setLoguje(true);
    try {
      const sesja = await zaloguj(wpisany, haslo);
      // Auth wie tylko, że ktoś zna hasło. Rola, lokal i stanowisko leżą w
      // `users` — i dopiero to jest "zalogowany użytkownik" w rozumieniu tej
      // aplikacji.
      const user = await wczytajKonto(api, sesja.user_id);
      setCurrentUser(user);
      setCurrentView(widokDlaRoli(user));
    } catch (err) {
      // ⚠️ Konto, które przeszło uwierzytelnienie, ale nie ma kartoteki albo
      // jest nieaktywne, musi zostać WYLOGOWANE. Inaczej zostaje ważna sesja
      // przy ekranie logowania i przy następnym odświeżeniu aplikacja wznowi
      // ją w pół drogi.
      await wyloguj();
      setError(err.message || "Nie udało się zalogować.");
    }
    setLoguje(false);
  };

  const zmienTryb = (nowy) => {
    setTryb(nowy);
    setError("");
    setInfo("");
  };

  const handlePrzypomnij = async (e) => {
    e.preventDefault();
    const wpisany = String(email || "").trim().toLowerCase();
    if (!wpisany) return setError("Podaj e-mail konta.");
    setError("");
    setInfo("");
    setLoguje(true);
    try {
      const odp = await przypomnijPin(wpisany);
      setInfo(odp.info || "Jeśli to konto istnieje, wysłaliśmy link na ten adres.");
    } catch (err) {
      setError(err.message || "Nie udało się wysłać linku.");
    }
    setLoguje(false);
  };

  const handleNowyPin = async (e) => {
    e.preventDefault();
    if (!poprawnyPin(nowyPin)) return setError("PIN ma mieć dokładnie 6 cyfr.");
    if (nowyPin !== nowyPin2) return setError("PIN-y się różnią — wpisz ten sam dwa razy.");
    setError("");
    setLoguje(true);
    let adres = "";
    try {
      adres = (await ustawNowyPin(tokenNowegoPinu(), nowyPin)).email;
    } catch (err) {
      setLoguje(false);
      setError(err.message || "Nie udało się ustawić PIN-u.");
      return;
    }
    // Token jest już zużyty — ponowne wejście na ten ekran nic by nie dało.
    zapomnijTokenNowegoPinu();
    setLoguje(false);
    if (adres) {
      setEmail(adres);
      await zalogujDanymi(adres, nowyPin);
    } else {
      zmienTryb("login");
      setInfo("PIN zmieniony — zaloguj się nowym.");
    }
  };

  // Wersja demonstracyjna: link „w nowej karcie” (`?jako=tablet`) loguje od
  // razu, bez dotykania czegokolwiek.
  useEffect(() => {
    if (!DEMO) return;
    const rola = zuzyjRoleZAdresu();
    const k = rola && kontoDemo(rola);
    if (k) zalogujDanymi(k.email, DEMO_PIN);
  }, []);

  if (DEMO) {
    return (
      <DemoWejscie
        loguje={loguje}
        error={error}
        dbError={dbError}
        komunikat={komunikat}
        onWybierz={(k) => zalogujDanymi(k.email, DEMO_PIN)}
        formularz={{ email, setEmail, pin, setPin, handleLogin }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F1F1EE] p-4">
      <div className="bg-white p-8 rounded-xl border-[2.5px] border-[#171714] w-full max-w-md">
        <div className="flex justify-center mb-2">
          <ShiftroMark size={44} />
        </div>
        <h1 className="font-['Archivo'] font-extrabold text-2xl text-center mb-1 text-[#171714]">
          {PRODUKT}
        </h1>
        {/* Nazwa najemcy pod nazwą produktu — jedyne miejsce, w którym gołym
            okiem widać, do CZYJEJ bazy podłączone jest to wdrożenie. Jeśli
            u nowego klienta stoi tu nazwa starego, nie ustawiono zmiennych
            środowiskowych i aplikacja czyta cudze dane. */}
        <p className="text-center text-[13px] text-[#8F8E86] mb-6">
          {TENANT || (
            /* Pusta nazwa najemcy znaczy, że nie ustawiono REACT_APP_TENANT.
               Aplikacja działa (baza jest skonfigurowana), ale znika jedyny
               widoczny sygnał, CZYJĄ bazę czyta to wdrożenie — więc mówimy
               o tym wprost, zamiast pokazywać samą wersję. */
            <span className="text-[#DE3A22] font-bold">
              &#9888; brak REACT_APP_TENANT
            </span>
          )}{" "}
          · wersja {APP_VERSION}
        </p>
        {komunikat && !dbError && (
          <div className="bg-[#EFEEE8] border-l-4 border-[#8F8E86] p-4 mb-6 rounded" data-komunikat-logowania>
            <p className="text-sm font-bold text-[#3A3A35]">{komunikat}</p>
          </div>
        )}
        {dbError && (
          <div className="bg-[#FAEAE6] border-l-4 border-[#DE3A22] p-4 mb-6 rounded">
            <p className="font-bold text-[#8A3A2B] flex items-center gap-2">
              <WifiOff size={18} /> Błąd sieci:
            </p>
            <p className="text-sm font-mono mt-1 text-[#8A3A2B]">{dbError}</p>
          </div>
        )}
        {info && (
          <div className="bg-[#E7F3EC] border-l-4 border-[#1F7A4A] p-4 mb-6 rounded" data-info-logowania>
            <p className="text-sm font-bold text-[#1F4D33]">{info}</p>
          </div>
        )}
        {tryb === "login" && (
          <form
            onSubmit={handleLogin}
            className={`space-y-4 ${dbError ? "opacity-50 pointer-events-none" : ""}`}
          >
            <div>
              <span className={fieldLabelCls}>Email konta</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={selectElCls}
                placeholder="lokal@gmail.com"
                required
              />
            </div>
            <div>
              <span className={fieldLabelCls}>PIN</span>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={`${selectElCls} text-center tracking-[0.4em]`}
                placeholder="••••••"
                required
              />
            </div>
            {error && (
              <p className="text-[#DE3A22] text-sm text-center font-bold">{error}</p>
            )}
            {/* ⚠️ Przycisk musi być zablokowany na czas żądania. Logowanie
                chodzi teraz do serwera, więc między kliknięciem a odpowiedzią
                jest realna chwila — a na tablecie z opornym ekranem ludzie
                klikają drugi raz. Dwa równoległe logowania tym samym hasłem to
                dwie sesje i wyścig o to, która zapisze się w localStorage. */}
            <button
              type="submit"
              disabled={loguje}
              className={`${ctaPrimaryCls} flex items-center justify-center gap-2 ${
                loguje ? "opacity-60" : ""
              }`}
            >
              {loguje ? (
                <>
                  <RefreshCw size={20} className="animate-spin" /> Logowanie…
                </>
              ) : (
                <>
                  <LogIn size={20} /> Zaloguj się
                </>
              )}
            </button>
          </form>
        )}
        {tryb === "login" && (
          <button
            type="button"
            onClick={() => zmienTryb("przypomnij")}
            className="block mx-auto mt-4 text-[13px] font-bold text-[#3A3A35] underline"
            data-nie-pamietam
          >
            Nie pamiętam PIN-u
          </button>
        )}
        {tryb === "przypomnij" && (
          <form onSubmit={handlePrzypomnij} className="space-y-4" data-przypomnij-pin>
            <p className="text-[14px] text-[#3A3A35] leading-relaxed">
              Wpisz e-mail, którym się logujesz. Wyślemy na niego link — po kliknięciu ustawisz nowy
              PIN. Kto loguje się tylko na tablecie, prosi o nowy PIN kierownika.
            </p>
            <div>
              <span className={fieldLabelCls}>Email konta</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={selectElCls}
                required
              />
            </div>
            {error && <p className="text-[#DE3A22] text-sm text-center font-bold">{error}</p>}
            <button
              type="submit"
              disabled={loguje}
              className={`${ctaPrimaryCls} flex items-center justify-center gap-2 ${loguje ? "opacity-60" : ""}`}
            >
              {loguje ? <RefreshCw size={20} className="animate-spin" /> : <Mail size={20} />} Wyślij link
            </button>
            <button
              type="button"
              onClick={() => zmienTryb("login")}
              className="block mx-auto text-[13px] font-bold text-[#3A3A35] underline"
            >
              Wróć do logowania
            </button>
          </form>
        )}
        {tryb === "nowy" && (
          <form onSubmit={handleNowyPin} className="space-y-4" data-nowy-pin>
            <p className="text-[14px] text-[#3A3A35] leading-relaxed">
              Ustaw nowy PIN — sześć cyfr. Stary przestanie działać. Jeśli tym PIN-em otwierasz też
              swój profil na tablecie, tam zmieni się razem z nim.
            </p>
            <div>
              <span className={fieldLabelCls}>Nowy PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength="6"
                value={nowyPin}
                onChange={(e) => setNowyPin(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${selectElCls} text-center tracking-[0.4em]`}
                placeholder="••••••"
                required
              />
            </div>
            <div>
              <span className={fieldLabelCls}>Powtórz PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength="6"
                value={nowyPin2}
                onChange={(e) => setNowyPin2(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${selectElCls} text-center tracking-[0.4em]`}
                placeholder="••••••"
                required
              />
            </div>
            {slabyPin(nowyPin) && (
              <p className="text-[13px] font-bold text-[#8A5300] text-center">
                Łatwy do zgadnięcia PIN — lepiej wybierz inny.
              </p>
            )}
            {error && <p className="text-[#DE3A22] text-sm text-center font-bold">{error}</p>}
            <button
              type="submit"
              disabled={loguje}
              className={`${ctaPrimaryCls} flex items-center justify-center gap-2 ${loguje ? "opacity-60" : ""}`}
            >
              {loguje ? <RefreshCw size={20} className="animate-spin" /> : <Lock size={20} />} Ustaw PIN i zaloguj się
            </button>
            <button
              type="button"
              onClick={() => {
                // Link wygasł albo już zużyty — droga do nowego.
                zapomnijTokenNowegoPinu();
                zmienTryb("przypomnij");
              }}
              className="block mx-auto text-[13px] font-bold text-[#3A3A35] underline"
            >
              Link nie działa? Poproś o nowy
            </button>
          </form>
        )}
        {tryb === "login" && (
          <p className={`${helperTextCls} text-center mt-5`}>
            Kiosk / Tablet Służbowy loguje się tymi samymi danymi zapisanymi w
            przeglądarce urządzenia.
          </p>
        )}
      </div>
    </div>
  );
};

// ==========================================
// WEJŚCIE DO WERSJI DEMONSTRACYJNEJ (0.72.0)
// ==========================================
// Trzy role jednym dotknięciem zamiast formularza — odwiedzający nie zna i nie
// ma znać żadnych danych logowania. Każda karta przeglądarki ma własną sesję
// (api/auth.ts → sessionStorage w demo), więc „w nowej karcie” daje Panel i
// Tablet obok siebie. Formularz zostaje schowany pod linkiem: konto założone
// w demo z karty pracownika (e-mail + PIN) loguje się zwyczajnie.
const IKONY_DEMO = { kierownik: BarChart3, tablet: Tablet, telefon: Smartphone };

const DemoWejscie = ({ loguje, error, dbError, komunikat, onWybierz, formularz }) => {
  const [innyLogin, setInnyLogin] = useState(false);
  let host = "";
  try {
    host = window.location.host;
  } catch (e) {
    host = "";
  }
  return (
    <div className="min-h-screen bg-[#F1F1EE] px-4 py-8 md:py-14" data-demo-wejscie>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <ShiftroMark size={40} />
          <div>
            <h1 className="font-['Archivo'] font-extrabold text-2xl text-[#171714] leading-none">
              {PRODUKT}
            </h1>
            <p className="text-[13px] text-[#8F8E86] mt-1">
              {TENANT || "Wersja demonstracyjna"} · wersja {APP_VERSION}
            </p>
          </div>
        </div>
        <p className="text-[15px] text-[#3A3A35] mt-5 max-w-2xl leading-relaxed">
          Wymyślona sieć dwóch lokali: <b>Bistro Lipowa</b> i <b>Pizzeria Port</b>. Wejdź w
          dowolną rolę — to, co wpiszesz w jednej, zobaczysz w pozostałych. Dane wracają do
          stanu początkowego co noc, więc śmiało klikaj wszystko.
        </p>

        {komunikat && !dbError && (
          <div className="bg-[#EFEEE8] border-l-4 border-[#8F8E86] p-4 mt-5 rounded" data-komunikat-logowania>
            <p className="text-sm font-bold text-[#3A3A35]">{komunikat}</p>
          </div>
        )}
        {dbError && (
          <div className="bg-[#FAEAE6] border-l-4 border-[#DE3A22] p-4 mt-5 rounded">
            <p className="font-bold text-[#8A3A2B] flex items-center gap-2">
              <WifiOff size={18} /> Błąd sieci:
            </p>
            <p className="text-sm font-mono mt-1 text-[#8A3A2B]">{dbError}</p>
          </div>
        )}

        <div className={`grid gap-3 md:grid-cols-3 mt-6 ${loguje ? "opacity-60 pointer-events-none" : ""}`}>
          {KONTA_DEMO.map((k) => {
            const Ikona = IKONY_DEMO[k.klucz] || LogIn;
            return (
              <div
                key={k.klucz}
                className={`bg-white rounded-xl border-[2.5px] border-[#171714] flex flex-col ${
                  // Na telefonie odwiedzający prawie zawsze chce właśnie tej roli.
                  k.klucz === "telefon" ? "order-first md:order-none" : ""
                }`}
                data-demo-rola={k.klucz}
              >
                <button
                  type="button"
                  onClick={() => onWybierz(k)}
                  className="text-left p-5 flex-1 flex flex-col gap-2 hover:bg-[#FAF9F5] rounded-t-xl"
                >
                  <span className="w-11 h-11 rounded-lg bg-[#171714] text-white flex items-center justify-center">
                    <Ikona size={22} />
                  </span>
                  <span className="font-['Archivo'] font-extrabold text-lg text-[#171714] mt-1">
                    {k.tytul}
                  </span>
                  <span className="text-[13px] font-bold text-[#3A3A35]">{k.kto}</span>
                  <span className="text-[13px] text-[#6B6A63] leading-snug">{k.opis}</span>
                  <span className="mt-auto pt-3 inline-flex items-center gap-1.5 font-bold text-[#DE3A22] text-sm">
                    Wejdź <ArrowRight size={16} />
                  </span>
                </button>
                <a
                  href={`?jako=${k.klucz}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-t-2 border-[#E4E4DE] px-5 py-2.5 text-[13px] font-bold text-[#3A3A35] hover:text-[#171714] hidden md:block"
                >
                  Otwórz w nowej karcie ↗
                </a>
              </div>
            );
          })}
        </div>

        {loguje && (
          <p className="mt-4 text-sm font-bold text-[#3A3A35] flex items-center gap-2">
            <RefreshCw size={16} className="animate-spin" /> Logowanie…
          </p>
        )}
        {error && <p className="mt-4 text-[#DE3A22] text-sm font-bold">{error}</p>}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="bg-white rounded-xl border-2 border-[#E4E4DE] p-4 text-[13px] text-[#3A3A35] leading-relaxed">
            <b className="text-[#171714]">Na telefonie:</b> otwórz <b>{host || "ten adres"}</b> i
            wybierz „Telefon pracownika”. Rozpocznij zmianę na telefonie, a zobaczysz ją w
            panelu kierownika w kolumnie „Teraz na zmianie”.
          </div>
          <div className="bg-white rounded-xl border-2 border-[#E4E4DE] p-4 text-[13px] text-[#3A3A35] leading-relaxed">
            <b className="text-[#171714]">Na tablecie:</b> profil Marka chroni PIN{" "}
            <b className="tracking-widest">{DEMO_PIN}</b>. Pozostałe osoby wchodzą jednym
            dotknięciem — tak to wygląda w lokalu.
          </div>
        </div>

        <button
          type="button"
          onClick={() => setInnyLogin((v) => !v)}
          className="mt-6 text-[13px] font-bold text-[#6B6A63] inline-flex items-center gap-1"
        >
          Masz konto założone w demo? Zaloguj się e-mailem
          <ChevronDown size={14} className={innyLogin ? "rotate-180" : ""} />
        </button>
        {innyLogin && (
          <form onSubmit={formularz.handleLogin} className="mt-3 bg-white rounded-xl border-2 border-[#E4E4DE] p-4 grid gap-3 md:grid-cols-[1fr_180px_auto] items-end max-w-2xl">
            <label>
              <span className={fieldLabelCls}>Email konta</span>
              <input
                type="email"
                value={formularz.email}
                onChange={(e) => formularz.setEmail(e.target.value)}
                className={selectElCls}
                required
              />
            </label>
            <label>
              <span className={fieldLabelCls}>PIN</span>
              <input
                type="password"
                value={formularz.pin}
                onChange={(e) => formularz.setPin(e.target.value)}
                className={`${selectElCls} text-center tracking-[0.4em]`}
                required
              />
            </label>
            <button
              type="submit"
              disabled={loguje}
              className="h-[46px] px-5 rounded-lg bg-[#171714] text-white font-bold flex items-center gap-2"
            >
              <LogIn size={18} /> Zaloguj
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;
