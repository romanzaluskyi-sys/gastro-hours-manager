// @ts-nocheck
import React, { useState } from "react";
import {
  getShort,
  getDayOfWeek,
  getMonthName,
  getAvailableYears,
} from "../utils/format";

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

export default HoursReport;
