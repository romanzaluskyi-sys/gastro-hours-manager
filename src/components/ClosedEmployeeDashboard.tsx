// @ts-nocheck
import React, { useState, useEffect } from "react";
import { LogOut, Clock, FileText, AlertCircle, Bell } from "lucide-react";
import { api } from "../api/supabase";
import TimeEntryForm from "./TimeEntryForm";
import HoursReport from "./HoursReport";
import IssueForm from "./IssueForm";
import NotificationsPanel from "./NotificationsPanel";

// ==========================================
// PRACOWNIK ZAMKNIĘTY DASHBOARD
// ==========================================

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

export default ClosedEmployeeDashboard;
