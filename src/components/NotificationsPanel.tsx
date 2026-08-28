// @ts-nocheck
import React from "react";
import { Bell } from "lucide-react";
import { formatNotificationText } from "../utils/format";

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

export default NotificationsPanel;
