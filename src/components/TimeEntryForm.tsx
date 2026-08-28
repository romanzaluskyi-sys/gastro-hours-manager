// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Clock, CheckCircle, RefreshCw } from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets } from "../api/googleSheets";

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

      // Nie czekamy na Google Sheets — to tylko druga kopia danych (Supabase
      // jest źródłem prawdy), a Apps Script bywa wolny (skanuje arkusz).
      // Leci w tle, błędy i tak są tylko logowane w sendToGoogleSheets.
      sendToGoogleSheets(parsed, "EDIT_SHIFT");

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

      // Nie czekamy na Google Sheets — patrz komentarz w handleCloseShift.
      sendToGoogleSheets(parsed, "ADD_SHIFT");

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

export default TimeEntryForm;
