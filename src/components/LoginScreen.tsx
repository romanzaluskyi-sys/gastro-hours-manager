// @ts-nocheck
import React, { useState } from "react";
import { LogIn, RefreshCw, WifiOff } from "lucide-react";
import { APP_VERSION } from "../config";
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
const LoginScreen = ({
  users,
  setCurrentUser,
  setCurrentView,
  isLoading,
  dbError,
}) => {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    // Pracownik kiosku (role "open") może zalogować się na PRYWATNYM
    // telefonie tylko wtedy, gdy ma ustawiony PIN blokady (kiosk_pin) i
    // e-mail — ustalenie właściciela: kto jest chroniony PIN-em, ten ma
    // własny dostęp; kto nie ma PIN-u, nie ma i dostępu. Loguje się tym
    // samym PIN-em co na tablecie, żeby nie pamiętać dwóch.
    // Porównanie bez rozróżniania wielkości liter i bez spacji — na telefonie
    // klawiatura sama podnosi pierwszą literę, a stare wpisy w bazie mogą
    // mieć dowolną pisownię.
    const wpisany = email.trim().toLowerCase();
    // Bez tego pusty e-mail zrównałby się z pustym e-mailem w bazie (konta
    // otwarte miały go pustego do 0.26.1) i wystarczyłby sam PIN.
    if (!wpisany || !pin) {
      setError("Podaj e-mail i PIN.");
      return;
    }
    const user = users.find((u) => {
      if ((u.email || "").trim().toLowerCase() !== wpisany) return false;
      if (!u.active || u.archived) return false;
      if (u.role === "open") return !!u.kiosk_pin && u.kiosk_pin === pin;
      return u.pin === pin;
    });
    if (user) {
      setCurrentUser(user);
      if (
        user.role === "manager" ||
        user.role === "manager_lokalu" ||
        user.role === "admin"
      ) {
        setCurrentView("manager_dashboard");
      } else if (user.role === "kiosk") {
        setCurrentView("open_dashboard");
      } else {
        setCurrentView("closed_dashboard");
      }
    } else {
      setError("Nieprawidłowe dane, brak dostępu lub konto nieaktywne.");
    }
  };

  if (isLoading)
    return (
      <div className="min-h-screen flex items-center justify-center font-['Archivo'] font-bold text-xl bg-[#F1F1EE] text-[#171714]">
        <RefreshCw className="animate-spin mr-2 text-[#DE3A22]" /> Łączenie z
        bazą...
      </div>
    );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#F1F1EE] p-4">
      <div className="bg-white p-8 rounded-xl border-[2.5px] border-[#171714] w-full max-w-md">
        <h1 className="font-['Archivo'] font-extrabold text-2xl text-center mb-1 text-[#171714]">
          Godziny Gastro
        </h1>
        <p className="text-center text-[13px] text-[#8F8E86] mb-6">
          Wersja {APP_VERSION}
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
          <button type="submit" className={`${ctaPrimaryCls} flex items-center justify-center gap-2`}>
            <LogIn size={20} /> Zaloguj się
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
