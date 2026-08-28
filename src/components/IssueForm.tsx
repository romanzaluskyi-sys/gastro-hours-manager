// @ts-nocheck
import React, { useState } from "react";
import { api } from "../api/supabase";

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

export default IssueForm;
