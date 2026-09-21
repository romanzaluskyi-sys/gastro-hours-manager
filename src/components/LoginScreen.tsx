// @ts-nocheck
import React, { useState } from "react";
import { LogIn, RefreshCw, WifiOff } from "lucide-react";
import { APP_VERSION, PRODUKT, TENANT } from "../config";
import { api } from "../api/supabase";
import { zaloguj, wczytajKonto, widokDlaRoli, wyloguj } from "../api/auth";
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
const LoginScreen = ({ setCurrentUser, setCurrentView, dbError }) => {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loguje, setLoguje] = useState(false);

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
    const wpisany = email.trim().toLowerCase();
    if (!wpisany || !pin) {
      setError("Podaj e-mail i PIN.");
      return;
    }
    setError("");
    setLoguje(true);
    try {
      const sesja = await zaloguj(wpisany, pin);
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
        {dbError && (
          <div className="bg-[#FAEAE6] border-l-4 border-[#DE3A22] p-4 mb-6 rounded">
            <p className="font-bold text-[#8A3A2B] flex items-center gap-2">
              <WifiOff size={18} /> Błąd sieci:
            </p>
            <p className="text-sm font-mono mt-1 text-[#8A3A2B]">{dbError}</p>
          </div>
        )}
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
        <p className={`${helperTextCls} text-center mt-5`}>
          Kiosk / Tablet Służbowy loguje się tymi samymi danymi zapisanymi w
          przeglądarce urządzenia.
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
