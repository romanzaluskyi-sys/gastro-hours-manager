// @ts-nocheck
import React, { useState } from "react";
import { LogIn, RefreshCw, WifiOff } from "lucide-react";

// ==========================================
// EKRAN LOGOWANIA
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
    const user = users.find(
      (u) =>
        u.email === email &&
        u.pin === pin &&
        u.active &&
        !u.archived &&
        u.role !== "open"
    );
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
      <div className="min-h-screen flex items-center justify-center font-bold text-xl bg-gray-50">
        <RefreshCw className="animate-spin mr-2 text-blue-600" /> Łączenie z
        bazą...
      </div>
    );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border-t-4 border-blue-600">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Godziny Gastro Emka v0.1.2
        </h1>
        {dbError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm">
            <p className="font-bold text-red-700 flex items-center gap-2">
              <WifiOff size={18} /> Błąd sieci:
            </p>
            <p className="text-sm font-mono mt-1 text-red-600">{dbError}</p>
          </div>
        )}
        <form
          onSubmit={handleLogin}
          className={`space-y-4 ${
            dbError ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email konta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full p-3 border border-gray-300 rounded-md bg-gray-50"
              placeholder="lokal@gmail.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 block w-full p-3 border border-gray-300 rounded-md text-center tracking-widest text-lg bg-gray-50"
              placeholder="••••••"
              required
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm text-center font-bold">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-md font-bold hover:bg-blue-700 transition shadow flex justify-center items-center gap-2"
          >
            <LogIn size={20} /> Zaloguj się
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
