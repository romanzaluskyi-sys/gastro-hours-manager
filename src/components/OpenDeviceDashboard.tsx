// @ts-nocheck
import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { api } from "../api/supabase";
import TimeEntryForm from "./TimeEntryForm";
import HoursReport from "./HoursReport";
import IssueForm from "./IssueForm";
import NotificationsPanel from "./NotificationsPanel";

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

export default OpenDeviceDashboard;
