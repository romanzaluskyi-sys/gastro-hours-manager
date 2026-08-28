import React, { useState, useEffect } from "react";
import {
  Clock,
  User,
  LogIn,
  LogOut,
  CheckCircle,
  AlertCircle,
  FileText,
  Users,
  Settings,
  Plus,
  X,
  Menu,
  Search,
  Edit2,
  Save,
  Filter,
  MapPin,
  Briefcase,
  RefreshCw,
  Trash2,
  Archive,
  Bell,
  Info,
  WifiOff,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ==========================================
// 🔴 КЛЮЧІ API 🔴
// ==========================================
const SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co";
const SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";
const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxGwCErowHgmyBwb5VBvdzIa7QRUCCXucYclLAJVS_2tYgIz88zrxUFs62oU9AIGAV5SA/exec";

const isConfigured =
  SUPABASE_URL.includes("supabase.co") && SUPABASE_KEY.includes("sb_");

// --- POMOCNICZE FUNKCJE ---
const getShort = (text) =>
  text
    ? text
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .substring(0, 3)
    : "";
const getDayOfWeek = (date) =>
  ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"][date.getDay()];
const getMonthName = (monthIdx) =>
  [
    "Styczeń",
    "Luty",
    "Marzec",
    "Kwiecień",
    "Maj",
    "Czerwiec",
    "Lipiec",
    "Sierpień",
    "Wrzesień",
    "Październik",
    "Listopad",
    "Grudzień",
  ][monthIdx];
const getAvailableYears = () => {
  const startYear = 2026;
  const currentYear = new Date().getFullYear();
  const endYear = Math.max(startYear, currentYear) + 1;
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
};

const formatNotificationText = (n, showEmployeeName) => {
  const dateStr = n.shift_date
    ? new Date(n.shift_date + "T00:00:00").toLocaleDateString("pl-PL")
    : "";
  const who = showEmployeeName
    ? `zmianę pracownika ${n.user_name}`
    : "Twoją zmianę";
  if (n.action === "delete") {
    return `${n.actor_name} usunął ${who} z dnia ${dateStr}${
      n.old_start
        ? ` (była ${n.old_start}${n.old_end ? "–" + n.old_end : ""})`
        : ""
    }`;
  }
  return `${n.actor_name} edytował ${who} z dnia ${dateStr}: było ${
    n.old_start || "?"
  }${n.old_end ? "–" + n.old_end : ""}, jest ${n.new_start || "?"}${
    n.new_end ? "–" + n.new_end : ""
  }`;
};

// --- API SUPABASE (REST) ---
const api = {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  get: async (table) => {
    const pageSize = 1000;
    let allRows = [];
    let from = 0;
    while (true) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`,
        {
          headers: {
            ...api.headers,
            Range: `${from}-${from + pageSize - 1}`,
          },
        }
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          json.message || json.error_description || `Błąd pobierania z ${table}`
        );
      if (!Array.isArray(json)) return json;
      allRows = allRows.concat(json);
      if (json.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  },
  post: async (table, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd zapisu");
    return json[0];
  },
  patch: async (table, id, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd aktualizacji");
    return json[0];
  },
  delete: async (table, id) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: api.headers,
    });
    if (!res.ok) throw new Error("Błąd usuwania");
    return true;
  },
  patchByFilter: async (table, filterQuery, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
      method: "PATCH",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Błąd aktualizacji");
    return true;
  },
};

// --- API GOOGLE SHEETS (DODANO UUID I AKCJE) ---
const toLocalYMD = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const sendToGoogleSheets = async (shift, actionType = "ADD_SHIFT") => {
  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) return;
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: actionType,
        shift_id: shift.id, // Ważne dla edycji i usuwania!
        pracownik: shift.user_name,
        lokal: shift.lokal,
        dataPracy: toLocalYMD(shift.start_time),
        start: new Date(shift.start_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        koniec: shift.end_time
          ? new Date(shift.end_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      }),
    });
  } catch (err) {
    console.error("Błąd wysyłania do Google Sheets:", err);
  }
};

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

// ==========================================
// WSPÓLNE KOMPONENTY
// ==========================================
const TimeEntryForm = ({
  userObj,
  activeUsers,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  showMsg,
}) => {
  const isKiosk = !userObj || userObj.role === "kiosk";
  const isSelfTracking = userObj && userObj.role !== "kiosk";

  const [selectedUserId, setSelectedUserId] = useState(
    isSelfTracking ? userObj.id : ""
  );
  const [lokal, setLokal] = useState(
    userObj?.default_lokal || lokale[0]?.name || ""
  );
  const [stanowisko, setStanowisko] = useState(
    userObj?.default_stanowisko || ""
  );
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [hasEndTime, setHasEndTime] = useState(true);
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  const openShift = selectedUserId
    ? shifts.find((s) => s.user_id === selectedUserId && !s.end_time)
    : null;
  const dostepneStanowiska = stanowiska.filter((s) => s.lokal_name === lokal);

  useEffect(() => {
    if (!isSelfTracking && selectedUserId) {
      const u = activeUsers.find((u) => u.id === selectedUserId);
      if (u) {
        if (u.default_lokal) setLokal(u.default_lokal);
        if (u.default_stanowisko) setStanowisko(u.default_stanowisko);
      }
    }
  }, [selectedUserId, activeUsers, isSelfTracking]);

  useEffect(() => {
    if (!dostepneStanowiska.find((s) => s.name === stanowisko)) {
      setStanowisko(
        dostepneStanowiska.length > 0 ? dostepneStanowiska[0].name : ""
      );
    }
  }, [lokal, stanowiska, dostepneStanowiska, stanowisko]);

  const handleCloseShift = async (e) => {
    e.preventDefault();
    if (!endTime) return showMsg("Wpisz godzinę zakończenia!", "error");
    setSaving(true);

    const [endH, endM] = endTime.split(":").map(Number);
    let endD = new Date(openShift.start_time);
    endD.setHours(endH, endM, 0, 0);
    if (endD < openShift.start_time) endD.setDate(endD.getDate() + 1);
    const hrs = parseFloat(
      ((endD - openShift.start_time) / (1000 * 60 * 60)).toFixed(2)
    );

    try {
      const updatedShift = await api.patch("shifts", openShift.id, {
        end_time: endD.toISOString(),
        godzin: hrs,
      });
      const parsed = {
        ...updatedShift,
        start_time: new Date(updatedShift.start_time),
        end_time: new Date(updatedShift.end_time),
      };
      setShifts(shifts.map((s) => (s.id === openShift.id ? parsed : s)));

      await sendToGoogleSheets(parsed, "EDIT_SHIFT"); // Uaktualnienie istniejacego wiersza

      showMsg("Zmiana zakończona pomyślnie!");
      setEndTime("");
      if (!isSelfTracking) setSelectedUserId("");
    } catch (err) {
      showMsg("Błąd połączenia z bazą!", "error");
    }
    setSaving(false);
  };

  const handleCreateShift = async (e) => {
    e.preventDefault();
    if (
      !selectedUserId ||
      !startTime ||
      !date ||
      (hasEndTime && !endTime) ||
      !stanowisko
    )
      return showMsg("Wypełnij wymagane pola!", "error");
    setSaving(true);

    const user = isSelfTracking
      ? userObj
      : activeUsers.find((u) => u.id === selectedUserId);
    const [year, month, day] = date.split("-").map(Number);
    const [startH, startM] = startTime.split(":").map(Number);
    const startD = new Date(year, month - 1, day, startH, startM);
    let endD = null,
      hrs = null;

    if (hasEndTime) {
      const [endH, endM] = endTime.split(":").map(Number);
      endD = new Date(year, month - 1, day, endH, endM);
      if (endD < startD) endD.setDate(endD.getDate() + 1);
      hrs = parseFloat(((endD - startD) / (1000 * 60 * 60)).toFixed(2));
    }

    const newShiftData = {
      user_id: user.id,
      user_name: user.name,
      lokal,
      stanowisko,
      start_time: startD.toISOString(),
      end_time: endD ? endD.toISOString() : null,
      godzin: hrs,
    };

    try {
      const createdShift = await api.post("shifts", newShiftData);
      const parsed = {
        ...createdShift,
        start_time: new Date(createdShift.start_time),
        end_time: createdShift.end_time
          ? new Date(createdShift.end_time)
          : null,
      };
      setShifts([...shifts, parsed]);

      await sendToGoogleSheets(parsed, "ADD_SHIFT"); // Zawsze wysylamy nowy wiersz

      showMsg(hasEndTime ? "Zmiana zapisana!" : "Rozpoczęto zmianę!");
      setStartTime("");
      setEndTime("");
      if (!isSelfTracking) setSelectedUserId("");
    } catch (err) {
      showMsg("Błąd zapisu do bazy!", "error");
    }
    setSaving(false);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border relative">
      {saving && (
        <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
          <RefreshCw className="animate-spin text-blue-600" size={32} />
        </div>
      )}
      <h2 className="text-xl font-bold border-b pb-2 mb-4">
        {openShift ? "Zakończ trwającą zmianę" : "Wpisz godziny pracy"}
      </h2>

      {!isSelfTracking && (
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            Wybierz pracownika
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full p-3 border-2 border-blue-200 rounded-lg bg-blue-50 font-bold"
            required
          >
            <option value="">-- Pracownicy na tym urządzeniu --</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.default_lokal || "Brak"})
              </option>
            ))}
          </select>
        </div>
      )}
      {openShift ? (
        <form onSubmit={handleCloseShift} className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
            <p className="font-bold text-blue-800">
              Trwająca zmiana: {openShift.user_name}
            </p>
            <p className="text-sm text-blue-700">
              Lokal: <b>{openShift.lokal}</b> ({openShift.stanowisko})
            </p>
            <p className="text-sm text-blue-700">
              Start:{" "}
              <b>
                {openShift.start_time.toLocaleDateString()}{" "}
                {openShift.start_time.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </p>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Godzina zakończenia
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full p-4 border-2 border-blue-300 rounded-lg bg-white text-xl font-mono"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-red-500 text-white font-bold rounded-xl shadow hover:bg-red-600 flex justify-center gap-2"
          >
            <CheckCircle size={20} /> Zakończ Zmianę
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateShift} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Lokal
              </label>
              <select
                value={lokal}
                onChange={(e) => setLokal(e.target.value)}
                className="w-full p-3 border rounded-lg bg-gray-50"
              >
                {lokale.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Stanowisko
              </label>
              <select
                value={stanowisko}
                onChange={(e) => setStanowisko(e.target.value)}
                className="w-full p-3 border rounded-lg bg-gray-50"
                required
              >
                {dostepneStanowiska.length === 0 && (
                  <option value="">Brak stanowisk!</option>
                )}
                {dostepneStanowiska.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Data
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 border rounded-lg bg-gray-50"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Rozpoczęcie
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-mono"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-gray-700">
                  Zakończenie
                </label>
                <label className="flex items-center text-xs text-blue-600 gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasEndTime}
                    onChange={(e) => setHasEndTime(e.target.checked)}
                    className="rounded"
                  />{" "}
                  Znam
                </label>
              </div>
              {hasEndTime ? (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full p-3 border rounded-lg bg-gray-50 text-lg font-mono"
                  required
                />
              ) : (
                <div className="w-full p-3 border rounded-lg bg-gray-200 text-gray-500 text-center italic text-sm flex items-center justify-center h-[52px]">
                  Tylko start
                </div>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 bg-green-500 text-white font-bold rounded-xl shadow hover:bg-green-600 flex justify-center gap-2"
          >
            <Clock size={20} /> Zapisz zmianę
          </button>
        </form>
      )}
    </div>
  );
};

const HoursReport = ({
  shiftsData,
  usersData,
  defaultUserId = null,
  isManager = false,
}) => {
  const [selectedUser, setSelectedUser] = useState(
    defaultUserId || (usersData.length > 0 ? usersData[0].id : "")
  );
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const filteredShifts = shiftsData
    .filter((s) => {
      const matchUser = selectedUser ? s.user_id === selectedUser : true;
      const matchMonth = s.start_time.getMonth() === selectedMonth;
      const matchYear = s.start_time.getFullYear() === selectedYear;
      return matchUser && matchMonth && matchYear;
    })
    .sort((a, b) => a.start_time - b.start_time);

  let totalHours = 0;

  return (
    <div className="bg-white rounded-xl shadow-md p-4">
      <h2 className="text-xl font-bold mb-4 border-b pb-2">
        Raport miesięczny
      </h2>
      <div className="flex flex-wrap gap-4 mb-4">
        {(!defaultUserId || isManager) && (
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="p-2 border rounded-lg bg-gray-50 flex-grow"
          >
            <option value="">-- Wszyscy --</option>
            {usersData.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="p-2 border rounded-lg bg-gray-50"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i} value={i}>
              {getMonthName(i)}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="p-2 border rounded-lg bg-gray-50"
        >
          {getAvailableYears().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-2 border-b">Dzień</th>
              <th className="p-2 border-b hidden sm:table-cell">Dzień tyg.</th>
              <th className="p-2 border-b">Lokal/Stan.</th>
              <th className="p-2 border-b">Od - Do</th>
              <th className="p-2 border-b text-right">Godz.</th>
            </tr>
          </thead>
          <tbody>
            {filteredShifts.length === 0 && (
              <tr>
                <td colSpan="5" className="p-4 text-center text-gray-500">
                  Brak zmian.
                </td>
              </tr>
            )}
            {filteredShifts.map((s) => {
              let hrs = 0;
              if (s.end_time) {
                hrs = (s.end_time - s.start_time) / (1000 * 60 * 60);
                totalHours += hrs;
              }
              return (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-bold">{s.start_time.getDate()}</td>
                  <td className="p-2 text-gray-500 hidden sm:table-cell font-mono">
                    {getDayOfWeek(s.start_time)}
                  </td>
                  <td className="p-2">
                    <span
                      className="font-semibold text-blue-800"
                      title={s.lokal}
                    >
                      {getShort(s.lokal)}
                    </span>{" "}
                    /
                    <span className="text-gray-600" title={s.stanowisko}>
                      {getShort(s.stanowisko)}
                    </span>
                  </td>
                  <td className="p-2">
                    {s.start_time.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -
                    {s.end_time ? (
                      s.end_time.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="text-red-500 font-bold ml-1">Trwa</span>
                    )}
                  </td>
                  <td className="p-2 text-right font-mono font-bold">
                    {s.end_time ? hrs.toFixed(1) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 font-bold">
            <tr>
              <td colSpan="4" className="p-2 text-right">
                Podsumowanie:
              </td>
              <td className="p-2 text-right text-blue-600 text-lg">
                {totalHours.toFixed(1)} h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const IssueForm = ({ userObj, activeUsers, issues, setIssues, showMsg }) => {
  const isKiosk = !userObj || userObj.role === "kiosk";
  const [issueText, setIssueText] = useState("");
  const [selectedUser, setSelectedUser] = useState(!isKiosk ? userObj.id : "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issueText || !selectedUser) return;
    setSaving(true);
    const userName = !isKiosk
      ? userObj.name
      : activeUsers.find((u) => u.id === selectedUser)?.name;
    try {
      const issue = await api.post("issues", {
        user_id: selectedUser,
        user_name: userName,
        issue_text: issueText,
        status: "nowe",
      });
      setIssues([...issues, issue]);
      setIssueText("");
      if (isKiosk) setSelectedUser("");
      showMsg("Zgłoszenie wysłane pomyślnie!");
    } catch (err) {
      showMsg("Błąd połączenia.", "error");
    }
    setSaving(false);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow border">
      <h2 className="text-xl font-bold mb-4">Masz problem z godzinami?</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isKiosk && (
          <div>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-3 border rounded-lg bg-gray-50"
              required
            >
              <option value="">-- Kto zgłasza? --</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea
          value={issueText}
          onChange={(e) => setIssueText(e.target.value)}
          className="w-full p-3 border rounded-lg bg-gray-50 h-32"
          placeholder="Opisz dokładnie, co kierownik ma poprawić..."
          required
        ></textarea>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-yellow-500 text-white font-bold rounded-lg shadow hover:bg-yellow-600"
        >
          Wyślij do poprawy
        </button>
      </form>
    </div>
  );
};

// ==========================================
// PRACOWNIK ZAMKNIĘTY DASHBOARD
// ==========================================
// ==========================================
// PANEL POWIADOMIEŃ (WSPÓLNY DLA CLOSED I OPEN)
// ==========================================
const NotificationsPanel = ({ items, showEmployeeName }) => {
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  return (
    <div className="space-y-3">
      {sorted.length === 0 && (
        <div className="text-center p-10 text-gray-400">
          <Bell className="mx-auto mb-2 opacity-40" size={40} />
          Brak powiadomień
        </div>
      )}
      {sorted.map((n) => (
        <div
          key={n.id}
          className={`p-3 rounded-lg border text-sm ${
            n.is_read ? "bg-white" : "bg-blue-50 border-blue-200"
          }`}
        >
          <p className="font-semibold text-gray-800">
            {formatNotificationText(n, showEmployeeName)}
          </p>
          {n.created_at && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(n.created_at).toLocaleString("pl-PL")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

const ClosedEmployeeDashboard = ({
  currentUser,
  setCurrentView,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  issues,
  setIssues,
  notifications,
  setNotifications,
  showMsg,
}) => {
  const [tab, setTab] = useState("form");

  const myNotifications = notifications.filter(
    (n) => n.user_name === currentUser.name
  );
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (tab !== "wiad") return;
    const unreadIds = myNotifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    api
      .patchByFilter("notifications", `id=in.(${unreadIds.join(",")})`, {
        is_read: true,
      })
      .then(() => {
        setNotifications((prev) =>
          prev.map((n) =>
            unreadIds.includes(n.id) ? { ...n, is_read: true } : n
          )
        );
      })
      .catch(() => {});
  }, [tab]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center z-10">
        <div>
          <p className="text-sm opacity-80">Zalogowano jako:</p>
          <p className="font-bold">{currentUser.name}</p>
        </div>
        <button
          onClick={() => setCurrentView("login")}
          className="p-2 hover:bg-blue-700 rounded-full"
        >
          <LogOut size={24} />
        </button>
      </div>
      <div className="flex-grow p-4 space-y-6 overflow-y-auto">
        {tab === "form" && (
          <TimeEntryForm
            userObj={currentUser}
            activeUsers={[]}
            lokale={lokale}
            stanowiska={stanowiska}
            shifts={shifts}
            setShifts={setShifts}
            showMsg={showMsg}
          />
        )}
        {tab === "hours" && (
          <HoursReport
            shiftsData={shifts}
            usersData={[currentUser]}
            defaultUserId={currentUser.id}
          />
        )}
        {tab === "issue" && (
          <IssueForm
            userObj={currentUser}
            activeUsers={[]}
            issues={issues}
            setIssues={setIssues}
            showMsg={showMsg}
          />
        )}
        {tab === "wiad" && (
          <NotificationsPanel
            items={myNotifications}
            showEmployeeName={false}
          />
        )}
      </div>
      <div className="bg-white border-t flex justify-around p-3 pb-safe z-10">
        <button
          onClick={() => setTab("form")}
          className={`flex flex-col items-center ${
            tab === "form" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <Clock size={24} />
          <span className="text-xs mt-1">Zmiana</span>
        </button>
        <button
          onClick={() => setTab("hours")}
          className={`flex flex-col items-center ${
            tab === "hours" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <FileText size={24} />
          <span className="text-xs mt-1">Raport</span>
        </button>
        <button
          onClick={() => setTab("issue")}
          className={`flex flex-col items-center ${
            tab === "issue" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <AlertCircle size={24} />
          <span className="text-xs mt-1">Zgłoś</span>
        </button>
        <button
          onClick={() => setTab("wiad")}
          className={`relative flex flex-col items-center ${
            tab === "wiad" ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <Bell size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
          <span className="text-xs mt-1">Wiadomości</span>
        </button>
      </div>
    </div>
  );
};

// ==========================================
// KIOSK SŁUŻBOWY DASHBOARD
// ==========================================
const OpenDeviceDashboard = ({
  currentUser,
  setCurrentView,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  users,
  issues,
  setIssues,
  notifications,
  setNotifications,
  showMsg,
}) => {
  const [tab, setTab] = useState("form");
  const allowed = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];
  const activeUsers = users.filter(
    (u) =>
      u.active &&
      !u.archived &&
      u.role === "open" &&
      allowed.includes(u.default_lokal)
  );

  const activeNames = new Set(activeUsers.map((u) => u.name));
  const myNotifications = notifications.filter((n) =>
    activeNames.has(n.user_name)
  );
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (tab !== "wiad") return;
    const unreadIds = myNotifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    api
      .patchByFilter("notifications", `id=in.(${unreadIds.join(",")})`, {
        is_read: true,
      })
      .then(() => {
        setNotifications((prev) =>
          prev.map((n) =>
            unreadIds.includes(n.id) ? { ...n, is_read: true } : n
          )
        );
      })
      .catch(() => {});
  }, [tab]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center">
      <div className="w-full max-w-lg bg-white min-h-screen shadow-lg flex flex-col">
        <div className="bg-gray-800 text-white p-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h1 className="font-bold text-lg">Tablet Służbowy</h1>
            <p className="text-xs opacity-70">
              Lokal: {allowed.join(", ") || "Brak przypisanych lokali"}
            </p>
          </div>
          <button
            onClick={() => setCurrentView("login")}
            className="text-sm bg-gray-700 px-3 py-1 rounded border hover:bg-gray-600"
          >
            Wyloguj
          </button>
        </div>
        <div className="flex border-b text-sm font-bold flex-shrink-0">
          <button
            onClick={() => setTab("form")}
            className={`flex-1 p-3 ${
              tab === "form"
                ? "border-b-4 border-blue-500 text-blue-600"
                : "text-gray-500 bg-gray-50"
            }`}
          >
            Wpisz
          </button>
          <button
            onClick={() => setTab("hours")}
            className={`flex-1 p-3 ${
              tab === "hours"
                ? "border-b-4 border-blue-500 text-blue-600"
                : "text-gray-500 bg-gray-50"
            }`}
          >
            Raport
          </button>
          <button
            onClick={() => setTab("issue")}
            className={`flex-1 p-3 ${
              tab === "issue"
                ? "border-b-4 border-blue-500 text-blue-600"
                : "text-gray-500 bg-gray-50"
            }`}
          >
            Zgłoś
          </button>
          <button
            onClick={() => setTab("wiad")}
            className={`relative flex-1 p-3 ${
              tab === "wiad"
                ? "border-b-4 border-blue-500 text-blue-600"
                : "text-gray-500 bg-gray-50"
            }`}
          >
            Wiadomości
            {unreadCount > 0 && (
              <span className="absolute top-1 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
        <div className="p-4 flex-grow overflow-y-auto">
          {activeUsers.length === 0 && tab !== "wiad" ? (
            <div className="text-center p-8 text-gray-500">
              <AlertCircle className="mx-auto mb-2 opacity-50" size={48} />
              Brak przypisanych pracowników.
            </div>
          ) : (
            <>
              {tab === "form" && (
                <TimeEntryForm
                  userObj={currentUser}
                  activeUsers={activeUsers}
                  lokale={lokale.filter((l) => allowed.includes(l.name))}
                  stanowiska={stanowiska.filter((s) =>
                    allowed.includes(s.lokal_name)
                  )}
                  shifts={shifts}
                  setShifts={setShifts}
                  showMsg={showMsg}
                />
              )}
              {tab === "hours" && (
                <HoursReport shiftsData={shifts} usersData={activeUsers} />
              )}
              {tab === "issue" && (
                <IssueForm
                  userObj={currentUser}
                  activeUsers={activeUsers}
                  issues={issues}
                  setIssues={setIssues}
                  showMsg={showMsg}
                />
              )}
              {tab === "wiad" && (
                <NotificationsPanel
                  items={myNotifications}
                  showEmployeeName={true}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// KIEROWNIK DASHBOARD
// ==========================================
const ManagerDashboard = ({
  currentUser,
  setCurrentView,
  users,
  setUsers,
  lokale,
  setLokale,
  stanowiska,
  setStanowiska,
  shifts,
  setShifts,
  issues,
  setIssues,
  notifications,
  setNotifications,
  showMsg,
}) => {
  const [tab, setTab] = useState("godziny");
  const [przewodnikTab, setPrzewodnikTab] = useState("pracownicy");

  // --- POWIADOMIENIA DLA PRACOWNIKA O ZMIANIE/USUNIĘCIU ZMIANY ---
  const fmtTime = (d) =>
    d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  const notifyEmployee = async (
    shiftLike,
    action,
    oldStart,
    oldEnd,
    newStart,
    newEnd
  ) => {
    try {
      const dateSrc = oldStart || newStart;
      const created = await api.post("notifications", {
        user_name: shiftLike.user_name,
        lokal: shiftLike.lokal,
        actor_name: currentUser.name,
        action,
        shift_date: dateSrc
          ? dateSrc.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        old_start: fmtTime(oldStart),
        old_end: fmtTime(oldEnd),
        new_start: fmtTime(newStart),
        new_end: fmtTime(newEnd),
        is_read: false,
      });
      setNotifications((prev) => [...prev, created]);
    } catch (err) {
      console.error("Błąd tworzenia powiadomienia:", err);
    }
  };

  const isLocalManager = currentUser.role === "manager_lokalu";
  const managerLokaleList = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];

  const hasAccessToLokal = (lokalName) =>
    !isLocalManager || managerLokaleList.includes(lokalName);

  const [fMonth, setFMonth] = useState(new Date().getMonth());
  const [fYear, setFYear] = useState(new Date().getFullYear());
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fLokal, setFLokal] = useState("");
  const [fStanowisko, setFStanowisko] = useState("");
  const [fName, setFName] = useState("");

  const [editingUser, setEditingUser] = useState(null);
  const [editingDict, setEditingDict] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    date: "",
    start: "",
    end: "",
    lokal: "",
    stanowisko: "",
  });

  const handleNewUserClick = () =>
    setEditingUser({
      id: null,
      name: "",
      email: "",
      pin: "",
      role: "closed",
      active: true,
      default_lokal: "",
      default_stanowisko: "",
      allowed_lokale: [],
    });

  const activeLokale = lokale.filter((l) => !l.archived);
  const activeStanowiska = stanowiska.filter((s) => !s.archived);

  const visibleUsers = users.filter(
    (u) => !u.archived && hasAccessToLokal(u.default_lokal)
  );
  const archivedUsers = users.filter(
    (u) => u.archived && hasAccessToLokal(u.default_lokal)
  );
  const availableLokaleForManager = activeLokale.filter((l) =>
    hasAccessToLokal(l.name)
  );

  const archivedLokale = lokale.filter((l) => l.archived);
  const archivedStanowiska = stanowiska.filter((s) => s.archived);

  // --- PULPIT (Dashboard godzin) ---
  const ALLOWED_PULPIT_ROLES = ["closed", "open", "manager_lokalu"];

  const [pMode, setPMode] = useState("miesiac"); // "tydzien" | "miesiac"
  const [pMonday, setPMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [pMonth, setPMonth] = useState(new Date().getMonth());
  const [pYear, setPYear] = useState(new Date().getFullYear());
  const [pLokal, setPLokal] = useState("");

  const pShiftWeek = (delta) => {
    const d = new Date(pMonday);
    d.setDate(d.getDate() + delta * 7);
    setPMonday(d);
  };
  const pShiftMonth = (delta) => {
    let m = pMonth + delta;
    let y = pYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setPMonth(m);
    setPYear(y);
  };

  let pPeriodStart, pPeriodEnd, pDays;
  if (pMode === "tydzien") {
    pPeriodStart = new Date(pMonday);
    pPeriodEnd = new Date(pMonday);
    pPeriodEnd.setDate(pPeriodEnd.getDate() + 7);
    pDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(pMonday);
      d.setDate(d.getDate() + i);
      return d;
    });
  } else {
    pPeriodStart = new Date(pYear, pMonth, 1);
    pPeriodEnd = new Date(pYear, pMonth + 1, 1);
    const daysInMonth = new Date(pYear, pMonth + 1, 0).getDate();
    pDays = Array.from({ length: daysInMonth }).map(
      (_, i) => new Date(pYear, pMonth, i + 1)
    );
  }

  const pPeriodLenMs = pPeriodEnd.getTime() - pPeriodStart.getTime();
  const pPrevStart = new Date(pPeriodStart.getTime() - pPeriodLenMs);
  const pPrevEnd = new Date(pPeriodStart);

  const computeHours = (s) =>
    s.end_time ? (s.end_time - s.start_time) / (1000 * 60 * 60) : 0;

  const pMatchesFilters = (s) =>
    hasAccessToLokal(s.lokal) && (!pLokal || s.lokal === pLokal);

  const pShiftsInRange = (start, end) =>
    shifts.filter(
      (s) => pMatchesFilters(s) && s.start_time >= start && s.start_time < end
    );

  const pulpitShifts = pShiftsInRange(pPeriodStart, pPeriodEnd);
  const pPrevShifts = pShiftsInRange(pPrevStart, pPrevEnd);

  const pNamesWithShifts = new Set(pulpitShifts.map((s) => s.user_name));
  const pulpitEmployees = users
    .filter((u) => !u.archived && ALLOWED_PULPIT_ROLES.includes(u.role))
    .filter((u) => hasAccessToLokal(u.default_lokal))
    .filter(
      (u) =>
        !pLokal || u.default_lokal === pLokal || pNamesWithShifts.has(u.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const pRows = pulpitEmployees.map((u) => {
    const dayValues = pDays.map((d) => {
      const dayShifts = pulpitShifts.filter(
        (s) =>
          s.user_name === u.name &&
          s.start_time.toDateString() === d.toDateString()
      );
      const hours = dayShifts.reduce((sum, s) => sum + computeHours(s), 0);
      return { hours, shifts: dayShifts };
    });
    const totalHours = dayValues.reduce((sum, v) => sum + v.hours, 0);
    const workDays = dayValues.filter((v) => v.shifts.length > 0).length;
    return { user: u, dayValues, totalHours, workDays };
  });

  const pCurrentTotal = pRows.reduce((sum, r) => sum + r.totalHours, 0);
  const pPrevTotal = pPrevShifts.reduce((sum, s) => sum + computeHours(s), 0);
  const pDynamika =
    pPrevTotal > 0 ? ((pCurrentTotal - pPrevTotal) / pPrevTotal) * 100 : null;
  const pActiveCount = pRows.filter((r) => r.totalHours > 0).length;
  const pAvgPerEmployee = pActiveCount > 0 ? pCurrentTotal / pActiveCount : 0;
  const pMaxPerEmployee = pRows.reduce(
    (max, r) => Math.max(max, r.totalHours),
    0
  );
  const pWorkingDays = pDays.filter((d) =>
    pulpitShifts.some((s) => s.start_time.toDateString() === d.toDateString())
  ).length;
  const pAvgPerDay = pWorkingDays > 0 ? pCurrentTotal / pWorkingDays : 0;

  const fmtH = (n) => (n || 0).toFixed(1).replace(".", ",");

  const openPulpitCell = (dayValue) => {
    if (!dayValue || dayValue.shifts.length === 0) return;
    openEditShift(dayValue.shifts[0]);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = { ...editingUser };
      if (dataToSave.role === "open") {
        dataToSave.email = "";
        dataToSave.pin = "";
      }
      if (
        (dataToSave.role === "kiosk" || dataToSave.role === "manager_lokalu") &&
        Array.isArray(dataToSave.allowed_lokale)
      ) {
        dataToSave.allowed_lokale = dataToSave.allowed_lokale.join(",");
      }

      if (editingUser.id) {
        const u = await api.patch("users", editingUser.id, dataToSave);
        setUsers(users.map((user) => (user.id === u.id ? u : user)));
      } else {
        delete dataToSave.id;
        const u = await api.post("users", dataToSave);
        setUsers([...users, u]);
      }
      setEditingUser(null);
      showMsg("Zapisano pracownika!");
    } catch (err) {
      showMsg("Błąd zapisu pracownika!", "error");
    }
  };

  const handleArchiveEntity = async (table, id, isArchiving) => {
    if (
      !window.confirm(
        isArchiving ? "Zarchiwizować ten element?" : "Przywrócić z archiwum?"
      )
    )
      return;
    try {
      const res = await api.patch(table, id, { archived: isArchiving });
      if (table === "users")
        setUsers(users.map((u) => (u.id === id ? res : u)));
      if (table === "lokale")
        setLokale(lokale.map((l) => (l.id === id ? res : l)));
      if (table === "stanowiska")
        setStanowiska(stanowiska.map((s) => (s.id === id ? res : s)));
      showMsg(
        isArchiving ? "Przeniesiono do archiwum" : "Przywrócono z archiwum"
      );
    } catch (err) {
      showMsg("Błąd archiwizacji", "error");
    }
  };

  const handlePermanentDelete = async (table, id) => {
    if (
      !window.confirm(
        "TRWAŁE USUNIĘCIE. Tej operacji nie można cofnąć! Jesteś pewien?"
      )
    )
      return;
    try {
      await api.delete(table, id);
      if (table === "users") setUsers(users.filter((u) => u.id !== id));
      if (table === "lokale") setLokale(lokale.filter((l) => l.id !== id));
      if (table === "stanowiska")
        setStanowiska(stanowiska.filter((s) => s.id !== id));
      showMsg("Trwale usunięto element");
    } catch (err) {
      showMsg("Nie udało się usunąć", "error");
    }
  };

  const handleSaveDict = async (e, type) => {
    e.preventDefault();
    try {
      if (type === "lokale") {
        const payload = { name: editingDict.name };
        if (editingDict.id) {
          const l = await api.patch("lokale", editingDict.id, payload);
          setLokale(lokale.map((lok) => (lok.id === l.id ? l : lok)));
        } else {
          const l = await api.post("lokale", payload);
          setLokale([...lokale, l]);
        }
      } else {
        const payload = {
          name: editingDict.name,
          lokal_name: editingDict.lokal_name,
        };
        if (editingDict.id) {
          const s = await api.patch("stanowiska", editingDict.id, payload);
          setStanowiska(stanowiska.map((st) => (st.id === s.id ? s : st)));
        } else {
          const s = await api.post("stanowiska", payload);
          setStanowiska([...stanowiska, s]);
        }
      }
      setEditingDict(null);
      showMsg("Zapisano w bazie!");
    } catch (err) {
      showMsg("Błąd zapisu słownika!", "error");
    }
  };

  const resolveIssue = async (id) => {
    try {
      const i = await api.patch("issues", id, { status: "rozwiazane" });
      setIssues(issues.map((iss) => (iss.id === i.id ? i : iss)));
      showMsg("Zgłoszenie rozwiązane!");
    } catch (err) {
      showMsg("Błąd!", "error");
    }
  };

  const openEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      date: shift.start_time.toISOString().split("T")[0],
      start: shift.start_time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      end: shift.end_time
        ? shift.end_time.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      lokal: shift.lokal,
      stanowisko: shift.stanowisko,
    });
  };

  // --- OTO MAGIA GOOGLE SHEETS DLA EDYCJI ---
  const handleSaveShiftEdit = async (e) => {
    e.preventDefault();
    try {
      const [year, month, day] = shiftForm.date.split("-").map(Number);
      const [startH, startM] = shiftForm.start.split(":").map(Number);
      const startD = new Date(year, month - 1, day, startH, startM);
      let endD = null,
        hrs = null;
      if (shiftForm.end) {
        const [endH, endM] = shiftForm.end.split(":").map(Number);
        endD = new Date(year, month - 1, day, endH, endM);
        if (endD < startD) endD.setDate(endD.getDate() + 1);
        hrs = parseFloat(((endD - startD) / (1000 * 60 * 60)).toFixed(2));
      }

      const updated = await api.patch("shifts", editingShift.id, {
        start_time: startD.toISOString(),
        end_time: endD ? endD.toISOString() : null,
        lokal: shiftForm.lokal,
        stanowisko: shiftForm.stanowisko,
        godzin: hrs,
      });
      const parsed = {
        ...updated,
        start_time: new Date(updated.start_time),
        end_time: updated.end_time ? new Date(updated.end_time) : null,
      };
      setShifts(shifts.map((s) => (s.id === parsed.id ? parsed : s)));

      // Powiadomienie dla pracownika o edycji zmiany
      const oldStart = editingShift.start_time;
      const oldEnd = editingShift.end_time;
      const changed =
        oldStart.getTime() !== startD.getTime() ||
        (oldEnd ? oldEnd.getTime() : null) !== (endD ? endD.getTime() : null);
      if (changed) {
        notifyEmployee(parsed, "edit", oldStart, oldEnd, startD, endD);
      }

      // Automatyczna poprawka w Google Sheets
      await sendToGoogleSheets(parsed, "EDIT_SHIFT");

      setEditingShift(null);
      showMsg("Zmiana zaktualizowana w Bazie i Google Sheets!");
    } catch (err) {
      showMsg("Błąd aktualizacji!", "error");
    }
  };

  // --- OTO MAGIA GOOGLE SHEETS DLA USUWANIA ---
  const handleDeleteShift = async () => {
    if (
      !window.confirm(
        "Usunąć tę zmianę całkowicie? Zostanie również usunięta z Google Sheets."
      )
    )
      return;
    try {
      await api.delete("shifts", editingShift.id);
      setShifts(shifts.filter((s) => s.id !== editingShift.id));

      // Powiadomienie dla pracownika o usunięciu zmiany
      notifyEmployee(
        editingShift,
        "delete",
        editingShift.start_time,
        editingShift.end_time,
        null,
        null
      );

      // Automatyczne usunięcie z Google Sheets
      await sendToGoogleSheets(editingShift, "DELETE_SHIFT");

      setEditingShift(null);
      showMsg("Zapis usunięty z Bazy i Google Sheets.");
    } catch (err) {
      showMsg("Błąd usuwania.", "error");
    }
  };

  const filteredShifts = shifts
    .filter((s) => {
      if (!hasAccessToLokal(s.lokal)) return false;
      let matchDate = true;
      if (fDateFrom || fDateTo) {
        const sDate = new Date(s.start_time);
        sDate.setHours(0, 0, 0, 0);
        if (fDateFrom) {
          const from = new Date(fDateFrom);
          from.setHours(0, 0, 0, 0);
          if (sDate < from) matchDate = false;
        }
        if (fDateTo) {
          const to = new Date(fDateTo);
          to.setHours(0, 0, 0, 0);
          if (sDate > to) matchDate = false;
        }
      } else {
        matchDate =
          s.start_time.getMonth() === fMonth &&
          s.start_time.getFullYear() === fYear;
      }
      return (
        matchDate &&
        (fLokal ? s.lokal === fLokal : true) &&
        (fStanowisko ? s.stanowisko === fStanowisko : true) &&
        (fName ? s.user_name.toLowerCase().includes(fName.toLowerCase()) : true)
      );
    })
    .sort((a, b) => b.start_time - a.start_time);

  let totalFilteredHours = 0;
  filteredShifts.forEach((s) => {
    if (s.end_time)
      totalFilteredHours += (s.end_time - s.start_time) / (1000 * 60 * 60);
  });

  const isEmailPinRequired = editingUser && editingUser.role !== "open";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 bg-gray-950 font-bold text-xl flex flex-col">
          Gastro Manager{" "}
          <span className="text-xs font-normal text-gray-400">
            {isLocalManager ? `Kierownik lokalu` : "Szef (Admin)"}
          </span>
        </div>
        <nav className="flex-grow flex md:flex-col overflow-x-auto">
          <button
            onClick={() => setTab("godziny")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "godziny" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <Filter size={18} /> Rejestr Godzin
          </button>
          <button
            onClick={() => setTab("pulpit")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "pulpit" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <Users size={18} /> Pulpit godzin
          </button>
          <button
            onClick={() => setTab("grafik")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "grafik" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <Calendar size={18} /> Grafik
          </button>
          <button
            onClick={() => setTab("aktywni")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "aktywni" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <Clock size={18} /> Aktywne Zmiany
          </button>
          <button
            onClick={() => setTab("moja_praca")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "moja_praca" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <User size={18} /> Moja Praca
          </button>
          <button
            onClick={() => setTab("zgloszenia")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "zgloszenia" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <AlertCircle size={18} /> Zgłoszenia{" "}
            {issues.filter((i) => i.status === "nowe").length > 0 && (
              <span className="bg-red-500 text-xs px-2 py-1 rounded-full ml-1">
                {issues.filter((i) => i.status === "nowe").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("pracownicy")}
            className={`p-4 text-left border-b border-gray-800 flex items-center gap-2 whitespace-nowrap ${
              tab === "pracownicy" ? "bg-blue-600" : "hover:bg-gray-800"
            }`}
          >
            <Settings size={18} /> Przewodnik
          </button>
        </nav>
        <button
          onClick={() => setCurrentView("login")}
          className="p-4 hover:bg-gray-800 border-t border-gray-800 flex items-center gap-2 text-gray-400"
        >
          <LogOut size={18} /> Wyloguj
        </button>
      </div>

      <div className="flex-grow p-4 md:p-8 overflow-y-auto w-full relative">
        {editingShift && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-xl font-bold">
                  Edycja: {editingShift.user_name}
                </h3>
                <button
                  onClick={() => setEditingShift(null)}
                  className="text-gray-500"
                >
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveShiftEdit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Lokal
                    </label>
                    <select
                      value={shiftForm.lokal}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, lokal: e.target.value })
                      }
                      className="w-full p-2 border rounded bg-gray-50"
                    >
                      {availableLokaleForManager.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Stanowisko
                    </label>
                    <select
                      value={shiftForm.stanowisko}
                      onChange={(e) =>
                        setShiftForm({
                          ...shiftForm,
                          stanowisko: e.target.value,
                        })
                      }
                      className="w-full p-2 border rounded bg-gray-50"
                    >
                      {activeStanowiska
                        .filter((s) => s.lokal_name === shiftForm.lokal)
                        .map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600">
                    Data (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, date: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-gray-50"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Start
                    </label>
                    <input
                      type="time"
                      value={shiftForm.start}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, start: e.target.value })
                      }
                      className="w-full p-2 border rounded font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Koniec
                    </label>
                    <input
                      type="time"
                      value={shiftForm.end}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, end: e.target.value })
                      }
                      className="w-full p-2 border rounded font-mono"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-6 pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleDeleteShift}
                    className="flex-none p-2 bg-red-100 text-red-700 font-bold rounded flex hover:bg-red-200"
                    title="Usuń zmianę z bazy"
                  >
                    <Trash2 size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingShift(null)}
                    className="flex-1 p-2 bg-gray-200 font-bold rounded"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    className="flex-1 p-2 bg-blue-600 text-white font-bold rounded flex justify-center gap-2"
                  >
                    <Save size={18} />
                    Zapisz
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === "pulpit" && (
          <div className="max-w-full mx-auto">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold mr-auto">Pulpit godzin</h2>

              <div className="flex bg-white border rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setPMode("tydzien")}
                  className={`px-3 py-1.5 rounded text-sm font-bold ${
                    pMode === "tydzien"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  Tydzień
                </button>
                <button
                  onClick={() => setPMode("miesiac")}
                  className={`px-3 py-1.5 rounded text-sm font-bold ${
                    pMode === "miesiac"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  Miesiąc
                </button>
              </div>

              {pMode === "tydzien" ? (
                <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
                  <button
                    onClick={() => pShiftWeek(-1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-bold text-sm px-2 whitespace-nowrap">
                    {pMonday.toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    -{" "}
                    {new Date(
                      pPeriodEnd.getTime() - 86400000
                    ).toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <button
                    onClick={() => pShiftWeek(1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
                  <button
                    onClick={() => pShiftMonth(-1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-bold text-sm px-2 whitespace-nowrap capitalize">
                    {getMonthName(pMonth)} {pYear}
                  </span>
                  <button
                    onClick={() => pShiftMonth(1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}

              <select
                value={pLokal}
                onChange={(e) => setPLokal(e.target.value)}
                className="p-2 border rounded-lg bg-white text-sm"
              >
                <option value="">Wszystkie lokale</option>
                {availableLokaleForManager.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">⬅️ Poprz. okres</p>
                <p className="text-lg font-bold">{fmtH(pPrevTotal)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📊 Dynamika</p>
                <p
                  className={`text-lg font-bold ${
                    pDynamika === null
                      ? "text-gray-400"
                      : pDynamika >= 0
                      ? "text-green-600"
                      : "text-red-500"
                  }`}
                >
                  {pDynamika === null
                    ? "-"
                    : `${pDynamika >= 0 ? "+" : ""}${pDynamika.toFixed(1)}%`}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">👥 Średnio na prac.</p>
                <p className="text-lg font-bold">{fmtH(pAvgPerEmployee)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📅 Dni robocze</p>
                <p className="text-lg font-bold">{pWorkingDays}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">🔥 Max godzin/prac.</p>
                <p className="text-lg font-bold">{fmtH(pMaxPerEmployee)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📈 Średnio dziennie</p>
                <p className="text-lg font-bold">{fmtH(pAvgPerDay)} h</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-gray-100 p-2 text-left border-b border-r z-20 min-w-[130px]">
                      Imię
                    </th>
                    <th className="sticky left-[130px] bg-gray-100 p-2 text-center border-b border-r z-20 min-w-[70px]">
                      Godzin
                    </th>
                    <th className="sticky left-[200px] bg-gray-100 p-2 text-center border-b border-r z-20 min-w-[70px]">
                      Dni
                    </th>
                    {pDays.map((d, i) => {
                      const isToday =
                        d.toDateString() === new Date().toDateString();
                      return (
                        <th
                          key={i}
                          className={`p-1 text-center border-b min-w-[52px] ${
                            isToday ? "bg-blue-50" : "bg-gray-100"
                          }`}
                        >
                          <div className="text-[10px] text-gray-400 uppercase">
                            {getDayOfWeek(d)}
                          </div>
                          <div className="font-bold text-xs">{d.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3 + pDays.length}
                        className="p-6 text-center text-gray-400"
                      >
                        Brak pracowników do wyświetlenia
                      </td>
                    </tr>
                  )}
                  {pRows.map((row) => (
                    <tr key={row.user.id} className="border-b hover:bg-gray-50">
                      <td className="sticky left-0 bg-white p-2 font-semibold border-r whitespace-nowrap z-10">
                        {row.user.name}
                      </td>
                      <td className="sticky left-[130px] bg-blue-50 p-2 text-center font-bold text-blue-700 border-r z-10">
                        {fmtH(row.totalHours)}
                      </td>
                      <td className="sticky left-[200px] bg-white p-2 text-center text-gray-500 border-r z-10">
                        {row.workDays}
                      </td>
                      {row.dayValues.map((dv, i) => (
                        <td
                          key={i}
                          onClick={() => openPulpitCell(dv)}
                          className={`p-1 text-center text-xs border-r ${
                            dv.shifts.length > 0
                              ? "cursor-pointer hover:bg-blue-100 font-semibold text-gray-800"
                              : "text-gray-300"
                          }`}
                          title={
                            dv.shifts.length > 0
                              ? "Kliknij aby edytować zmianę"
                              : ""
                          }
                        >
                          {dv.shifts.length > 0
                            ? dv.hours > 0
                              ? fmtH(dv.hours)
                              : "trwa"
                            : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "grafik" && (
          <div className="max-w-3xl mx-auto text-center py-20">
            <Calendar size={64} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-2xl font-bold text-gray-400 mb-2">
              Grafik tygodniowy
            </h2>
            <p className="text-gray-400">
              🚧 Ta funkcja jest w budowie. Wkrótce dostępna.
            </p>
          </div>
        )}

        {tab === "godziny" && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Rejestr i Edycja Godzin</h2>
            <div className="bg-white p-4 rounded-xl shadow mb-6 border">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="col-span-1 lg:col-span-2 bg-gray-50 p-3 rounded-lg border">
                  <p className="text-xs font-bold text-gray-500 mb-2">
                    Okres (Miesiąc lub Zakres)
                  </p>
                  <div className="flex gap-2 mb-2">
                    <select
                      value={fMonth}
                      onChange={(e) => {
                        setFMonth(Number(e.target.value));
                        setFDateFrom("");
                        setFDateTo("");
                      }}
                      className="flex-1 p-2 border rounded text-sm"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i} value={i}>
                          {getMonthName(i)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={fYear}
                      onChange={(e) => setFYear(Number(e.target.value))}
                      className="w-24 p-2 border rounded text-sm"
                    >
                      {getAvailableYears().map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fDateFrom}
                      onChange={(e) => setFDateFrom(e.target.value)}
                      className="flex-1 p-2 border rounded text-sm"
                    />
                    <input
                      type="date"
                      value={fDateTo}
                      onChange={(e) => setFDateTo(e.target.value)}
                      className="flex-1 p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border flex flex-col justify-between">
                  <select
                    value={fLokal}
                    onChange={(e) => {
                      setFLokal(e.target.value);
                      setFStanowisko("");
                    }}
                    className="w-full p-2 border rounded text-sm mb-2"
                  >
                    <option value="">Wszystkie (Z dozwolonych)</option>
                    {availableLokaleForManager.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fStanowisko}
                    onChange={(e) => setFStanowisko(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  >
                    <option value="">Wszystkie stanowiska</option>
                    {activeStanowiska
                      .filter((s) => (fLokal ? s.lokal_name === fLokal : true))
                      .map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border">
                  <input
                    type="text"
                    placeholder="Wpisz imię..."
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  />
                  <div className="mt-4 p-2 bg-blue-50 rounded border text-center">
                    <p className="text-xs font-bold text-blue-600">
                      Suma z filtra
                    </p>
                    <p className="text-xl font-bold text-blue-800">
                      {totalFilteredHours.toFixed(1)} h
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow overflow-x-auto border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Pracownik</th>
                    <th className="p-3">Lokal/Stan.</th>
                    <th className="p-3">Godziny</th>
                    <th className="p-3 text-right">Suma</th>
                    <th className="p-3 text-center">Akcja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredShifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap">
                        {shift.start_time.toLocaleDateString()}
                      </td>
                      <td className="p-3 font-semibold">{shift.user_name}</td>
                      <td className="p-3">
                        <span className="text-blue-800">
                          {getShort(shift.lokal)}
                        </span>{" "}
                        /{" "}
                        <span className="text-gray-600">
                          {getShort(shift.stanowisko)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">
                        {shift.start_time.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {shift.end_time ? (
                          shift.end_time.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        ) : (
                          <span className="text-red-500 font-sans">Trwa</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-600">
                        {shift.end_time
                          ? (
                              (shift.end_time - shift.start_time) /
                              (1000 * 60 * 60)
                            ).toFixed(1) + "h"
                          : "-"}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => openEditShift(shift)}
                          className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 mx-auto block"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "aktywni" && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Trwające zmiany</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {shifts
                .filter((s) => !s.end_time && hasAccessToLokal(s.lokal))
                .map((active) => (
                  <div
                    key={active.id}
                    className="bg-white p-4 rounded-xl shadow border-l-4 border-green-500 flex items-center gap-4 relative"
                  >
                    <div className="bg-green-100 p-3 rounded-full text-green-600">
                      <Clock size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{active.user_name}</p>
                      <p className="text-sm text-gray-600">
                        Od: {active.start_time.toLocaleTimeString()} |{" "}
                        {active.lokal}
                      </p>
                    </div>
                    <button
                      onClick={() => openEditShift(active)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-blue-600 p-1"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "moja_praca" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold mb-4">Moje Godziny Pracy</h2>
            <TimeEntryForm
              userObj={currentUser}
              activeUsers={[]}
              lokale={availableLokaleForManager}
              stanowiska={activeStanowiska}
              shifts={shifts}
              setShifts={setShifts}
              showMsg={showMsg}
            />
            <HoursReport
              shiftsData={shifts}
              usersData={[currentUser]}
              defaultUserId={currentUser.id}
              isManager={false}
            />
          </div>
        )}

        {tab === "zgloszenia" && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Zgłoszenia do poprawy</h2>
            <div className="space-y-4">
              {issues
                .filter((iss) =>
                  hasAccessToLokal(
                    users.find((u) => u.id === iss.user_id)?.default_lokal || ""
                  )
                )
                .map((iss) => (
                  <div
                    key={iss.id}
                    className={`p-4 rounded-xl shadow border-l-4 ${
                      iss.status === "nowe"
                        ? "border-red-500 bg-white"
                        : "border-green-500 bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold">
                        {iss.user_name}{" "}
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(iss.created_at).toLocaleString()}
                        </span>
                      </p>
                      <span
                        className={`text-xs px-2 py-1 rounded font-bold ${
                          iss.status === "nowe"
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {iss.status === "nowe" ? "Nowe" : "Rozwiązane"}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-4">{iss.issue_text}</p>
                    {iss.status === "nowe" && (
                      <button
                        onClick={() => resolveIssue(iss.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-bold"
                      >
                        Oznacz jako rozwiązane
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "pracownicy" && (
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Przewodnik</h2>
            <div className="flex border-b mb-6 overflow-x-auto">
              <button
                onClick={() => setPrzewodnikTab("pracownicy")}
                className={`px-4 py-3 font-bold whitespace-nowrap ${
                  przewodnikTab === "pracownicy"
                    ? "border-b-4 border-blue-500 text-blue-600"
                    : "text-gray-500"
                }`}
              >
                <Users size={18} className="inline mr-2" />
                Pracownicy
              </button>
              {!isLocalManager && (
                <button
                  onClick={() => setPrzewodnikTab("lokale")}
                  className={`px-4 py-3 font-bold whitespace-nowrap ${
                    przewodnikTab === "lokale"
                      ? "border-b-4 border-blue-500 text-blue-600"
                      : "text-gray-500"
                  }`}
                >
                  <MapPin size={18} className="inline mr-2" />
                  Lokale
                </button>
              )}
              {!isLocalManager && (
                <button
                  onClick={() => setPrzewodnikTab("stanowiska")}
                  className={`px-4 py-3 font-bold whitespace-nowrap ${
                    przewodnikTab === "stanowiska"
                      ? "border-b-4 border-blue-500 text-blue-600"
                      : "text-gray-500"
                  }`}
                >
                  <Briefcase size={18} className="inline mr-2" />
                  Stanowiska
                </button>
              )}
              <button
                onClick={() => setPrzewodnikTab("archiwum")}
                className={`px-4 py-3 font-bold whitespace-nowrap ml-auto ${
                  przewodnikTab === "archiwum"
                    ? "border-b-4 border-gray-500 text-gray-800"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Archive size={18} className="inline mr-2" />
                Archiwum
              </button>
            </div>

            {przewodnikTab === "pracownicy" && (
              <div>
                <button
                  onClick={handleNewUserClick}
                  className="mb-4 bg-green-500 text-white px-4 py-2 rounded font-bold hover:bg-green-600 flex items-center gap-2"
                >
                  <Plus size={18} /> Dodaj{" "}
                  {isLocalManager
                    ? "pracownika do swoich lokali"
                    : "użytkownika"}
                </button>
                {editingUser && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <form
                      onSubmit={handleSaveUser}
                      className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl"
                    >
                      <h3 className="text-xl font-bold mb-4 border-b pb-2">
                        {editingUser.id ? "Edytuj" : "Nowy"}: {editingUser.name}
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600">
                            Imię i nazwisko / Nazwa
                          </label>
                          <input
                            type="text"
                            value={editingUser.name}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                name: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600">
                            Typ konta
                          </label>
                          <select
                            value={editingUser.role}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                role: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded font-bold bg-blue-50"
                          >
                            <option value="closed">
                              Pracownik (Aplikacja na telefon)
                            </option>
                            <option value="open">
                              Pracownik (Otwarte Konto - Kiosk)
                            </option>
                            {!isLocalManager && (
                              <option value="kiosk">
                                Konto Służbowe (Tablet lokalu)
                              </option>
                            )}
                            {!isLocalManager && (
                              <option value="manager_lokalu">
                                Kierownik Lokalu
                              </option>
                            )}
                            {!isLocalManager && (
                              <option value="admin">Szef (Admin)</option>
                            )}
                          </select>
                        </div>

                        {isEmailPinRequired && (
                          <div className="grid grid-cols-2 gap-3 bg-blue-50 p-2 rounded border border-blue-100">
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Email / Login
                              </label>
                              <input
                                type="email"
                                value={editingUser.email}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    email: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded"
                                required={isEmailPinRequired}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                PIN (6 cyfr)
                              </label>
                              <input
                                type="text"
                                value={editingUser.pin}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    pin: e.target.value,
                                  })
                                }
                                maxLength="6"
                                className="w-full p-2 border rounded"
                                required={isEmailPinRequired}
                              />
                            </div>
                          </div>
                        )}
                        {!isEmailPinRequired && (
                          <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded border border-yellow-200">
                            Pracownik otwartego konta nie loguje się
                            samodzielnie. Logowanie odbywa się przez{" "}
                            <b>Konto Służbowe (Kiosk)</b>.
                          </div>
                        )}

                        {(editingUser.role === "kiosk" ||
                          editingUser.role === "manager_lokalu") && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                            <label className="block text-xs font-bold text-purple-800 mb-2">
                              Zezwól na zarządzanie lokalami (Zaznacz opcje):
                            </label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {activeLokale.map((l) => {
                                const allowedArr = Array.isArray(
                                  editingUser.allowed_lokale
                                )
                                  ? editingUser.allowed_lokale
                                  : editingUser.allowed_lokale
                                  ? editingUser.allowed_lokale
                                      .split(",")
                                      .map((s) => s.trim())
                                  : [];
                                return (
                                  <label
                                    key={l.id}
                                    className="flex items-center gap-2 cursor-pointer text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={allowedArr.includes(l.name)}
                                      onChange={(e) => {
                                        const now = e.target.checked
                                          ? [...allowedArr, l.name]
                                          : allowedArr.filter(
                                              (x) => x !== l.name
                                            );
                                        setEditingUser({
                                          ...editingUser,
                                          allowed_lokale: now,
                                        });
                                      }}
                                    />{" "}
                                    {l.name}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {editingUser.role !== "kiosk" && (
                          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-2 rounded border">
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Domyślny Lokal
                              </label>
                              <select
                                value={editingUser.default_lokal || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    default_lokal: e.target.value,
                                    default_stanowisko: "",
                                  })
                                }
                                className="w-full p-2 border rounded"
                              >
                                <option value="">- Brak -</option>
                                {availableLokaleForManager.map((l) => (
                                  <option key={l.id} value={l.name}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Stanowisko
                              </label>
                              <select
                                value={editingUser.default_stanowisko || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    default_stanowisko: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded"
                              >
                                <option value="">- Brak -</option>
                                {activeStanowiska
                                  .filter(
                                    (s) =>
                                      s.lokal_name === editingUser.default_lokal
                                  )
                                  .map((s) => (
                                    <option key={s.id} value={s.name}>
                                      {s.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}
                        <label className="flex items-center gap-2 pt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingUser.active}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                active: e.target.checked,
                              })
                            }
                            className="w-5 h-5 rounded"
                          />
                          <span className="font-bold text-gray-700">
                            Konto aktywne
                          </span>
                        </label>
                      </div>
                      <div className="flex gap-2 mt-6">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="flex-1 p-2 bg-gray-200 font-bold rounded"
                        >
                          Anuluj
                        </button>
                        <button
                          type="submit"
                          className="flex-1 p-2 bg-blue-600 text-white font-bold rounded"
                        >
                          Zapisz
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                <div className="grid gap-3">
                  {visibleUsers.map((u) => (
                    <div
                      key={u.id}
                      className={`bg-white p-4 rounded-lg shadow border flex items-center justify-between ${
                        !u.active && "opacity-60 bg-gray-50"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-lg">
                          {u.name}{" "}
                          {!u.active && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded ml-2">
                              Odłączony
                            </span>
                          )}
                        </p>
                        <div className="text-sm text-gray-500 mt-1 flex gap-4">
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            Typ:{" "}
                            <b>
                              {u.role === "open"
                                ? "Otwarte Konto (Kiosk)"
                                : u.role === "closed"
                                ? "Aplikacja"
                                : u.role === "manager_lokalu"
                                ? "Kierownik Lokalu"
                                : u.role === "kiosk"
                                ? "Kiosk Służbowy"
                                : "Szef (Admin)"}
                            </b>
                          </span>
                          {u.default_lokal && (
                            <span>
                              Domyślnie:{" "}
                              <b className="text-blue-600">{u.default_lokal}</b>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingUser({ ...u })}
                          className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() =>
                            handleArchiveEntity("users", u.id, true)
                          }
                          className="p-2 text-gray-500 hover:text-red-500 bg-gray-100 rounded"
                          title="Do archiwum"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {przewodnikTab === "archiwum" && (
              <div className="space-y-6">
                <div className="bg-red-50 p-4 border border-red-200 rounded text-sm text-red-800">
                  <Info size={16} className="inline mr-2" /> Archiwum:
                  Zarchiwizowane elementy nie są widoczne w listach, ale ich
                  historia zostaje. Trwałe usunięcie skasuje je z bazy.
                </div>
                {archivedUsers.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Pracownicy</h3>
                    <div className="grid gap-2">
                      {archivedUsers.map((u) => (
                        <div
                          key={u.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {u.name}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("users", u.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            {!isLocalManager && (
                              <button
                                onClick={() =>
                                  handlePermanentDelete("users", u.id)
                                }
                                className="px-2 py-1 bg-red-100 text-red-700 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isLocalManager && archivedLokale.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2 mt-4">Lokale</h3>
                    <div className="grid gap-2">
                      {archivedLokale.map((l) => (
                        <div
                          key={l.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {l.name}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("lokale", l.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            <button
                              onClick={() =>
                                handlePermanentDelete("lokale", l.id)
                              }
                              className="px-2 py-1 bg-red-100 text-red-700 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isLocalManager && archivedStanowiska.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2 mt-4">Stanowiska</h3>
                    <div className="grid gap-2">
                      {archivedStanowiska.map((s) => (
                        <div
                          key={s.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {s.name} ({s.lokal_name})
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("stanowiska", s.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            <button
                              onClick={() =>
                                handlePermanentDelete("stanowiska", s.id)
                              }
                              className="px-2 py-1 bg-red-100 text-red-700 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(przewodnikTab === "lokale" || przewodnikTab === "stanowiska") &&
              !isLocalManager && (
                <div>
                  <button
                    onClick={() =>
                      setEditingDict({
                        id: null,
                        name: "",
                        lokal_name:
                          activeLokale.length > 0 ? activeLokale[0].name : "",
                      })
                    }
                    className="mb-4 bg-green-500 text-white px-4 py-2 rounded font-bold hover:bg-green-600 flex items-center gap-2"
                  >
                    <Plus size={18} /> Dodaj{" "}
                    {przewodnikTab === "lokale"
                      ? "nowy lokal"
                      : "nowe stanowisko"}
                  </button>
                  {editingDict && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                      <form
                        onSubmit={(e) => handleSaveDict(e, przewodnikTab)}
                        className="bg-white p-6 rounded-xl w-full max-w-sm shadow-2xl"
                      >
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">
                          {editingDict.id ? "Edytuj" : "Dodaj"}{" "}
                          {przewodnikTab === "lokale" ? "Lokal" : "Stanowisko"}
                        </h3>
                        <div className="mb-4 space-y-3">
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                              Nazwa
                            </label>
                            <input
                              type="text"
                              value={editingDict.name}
                              onChange={(e) =>
                                setEditingDict({
                                  ...editingDict,
                                  name: e.target.value,
                                })
                              }
                              className="w-full p-2 border rounded"
                              required
                              autoFocus
                            />
                          </div>
                          {przewodnikTab === "stanowiska" && (
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">
                                Lokal
                              </label>
                              <select
                                value={editingDict.lokal_name}
                                onChange={(e) =>
                                  setEditingDict({
                                    ...editingDict,
                                    lokal_name: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded bg-blue-50"
                                required
                              >
                                {activeLokale.map((l) => (
                                  <option key={l.id} value={l.name}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingDict(null)}
                            className="flex-1 p-2 bg-gray-200 font-bold rounded"
                          >
                            Anuluj
                          </button>
                          <button
                            type="submit"
                            className="flex-1 p-2 bg-blue-600 text-white font-bold rounded"
                          >
                            Zapisz
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    {(przewodnikTab === "lokale"
                      ? activeLokale
                      : activeStanowiska
                    ).map((item) => (
                      <div
                        key={item.id}
                        className="bg-white p-4 rounded-lg shadow border flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-lg">{item.name}</p>
                          {przewodnikTab === "stanowiska" && (
                            <p className="text-sm text-gray-500">
                              Lokal: <b>{item.lokal_name}</b>
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingDict({ ...item })}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() =>
                              handleArchiveEntity(przewodnikTab, item.id, true)
                            }
                            className="p-2 text-gray-500 hover:text-red-500 bg-gray-100 rounded"
                            title="Do archiwum"
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [users, setUsers] = useState([]);
  const [lokale, setLokale] = useState([]);
  const [stanowiska, setStanowiska] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [issues, setIssues] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showMsg = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false }), 3000);
  };

  useEffect(() => {
    if (!isConfigured) return;
    const fetchData = async () => {
      setIsLoading(true);
      setDbError("");
      try {
        const [u, l, s, sh, i] = await Promise.all([
          api.get("users"),
          api.get("lokale"),
          api.get("stanowiska"),
          api.get("shifts"),
          api.get("issues"),
        ]);

        const parsedShifts = (Array.isArray(sh) ? sh : []).map((shift) => ({
          ...shift,
          start_time: new Date(shift.start_time),
          end_time: shift.end_time ? new Date(shift.end_time) : null,
        }));
        setUsers(Array.isArray(u) ? u : []);
        setLokale(Array.isArray(l) ? l : []);
        setStanowiska(Array.isArray(s) ? s : []);
        setShifts(parsedShifts);
        setIssues(Array.isArray(i) ? i : []);
      } catch (err) {
        setDbError(err.message || "Błąd bazy.");
      }
      setIsLoading(false);
    };
    fetchData();

    // Powiadomienia ładujemy osobno - brak tabeli w bazie nie blokuje reszty apki
    const loadNotifications = () => {
      api
        .get("notifications")
        .then((n) => setNotifications(Array.isArray(n) ? n : []))
        .catch((err) => {
          console.error("Błąd pobierania powiadomień:", err.message || err);
          setNotifications([]);
        });
    };
    loadNotifications();

    // Odświeżamy powiadomienia co 45s, żeby już otwarta sesja też je widziała
    // bez konieczności przeładowania strony.
    const notifInterval = setInterval(loadNotifications, 45000);
    return () => clearInterval(notifInterval);
  }, []);

  return (
    <div className="font-sans text-gray-900">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 p-4 rounded-lg shadow-2xl z-[100] flex items-center gap-3 font-bold animate-bounce ${
            toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-green-500 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={20} />
          ) : (
            <CheckCircle size={20} />
          )}{" "}
          {toast.message}
        </div>
      )}
      {currentView === "login" && (
        <LoginScreen
          users={users}
          setCurrentUser={setCurrentUser}
          setCurrentView={setCurrentView}
          isLoading={isLoading}
          dbError={dbError}
        />
      )}
      {currentView === "closed_dashboard" && (
        <ClosedEmployeeDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          lokale={lokale}
          stanowiska={stanowiska}
          shifts={shifts}
          setShifts={setShifts}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          showMsg={showMsg}
        />
      )}
      {currentView === "open_dashboard" && (
        <OpenDeviceDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          lokale={lokale}
          stanowiska={stanowiska}
          shifts={shifts}
          setShifts={setShifts}
          users={users}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          showMsg={showMsg}
        />
      )}
      {currentView === "manager_dashboard" && (
        <ManagerDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          users={users}
          setUsers={setUsers}
          lokale={lokale}
          setLokale={setLokale}
          stanowiska={stanowiska}
          setStanowiska={setStanowiska}
          shifts={shifts}
          setShifts={setShifts}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
