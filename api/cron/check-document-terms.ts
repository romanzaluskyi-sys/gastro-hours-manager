// @ts-nocheck
// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Sprawdza
// terminy sanepid/umowy aktywnych pracowników i powiadamia kierowników ich
// lokalu oraz samych pracowników w rytmie: miesiąc przed, 2 tygodnie przed,
// codziennie w ostatnim tygodniu, codziennie po przeterminowaniu.
//
// Lista terminów jest świadomie zamknięta na tych dwóch pozycjach — nie jest
// to mechanizm pozwalający dodać dowolny trzeci termin bez zmiany kodu.
import { api } from "../../src/api/supabase";
import {
  createManagerNotification,
  createEmployeeNotification,
} from "../../src/api/notifications";

const DOCUMENT_TERMS = [
  {
    key: "sanepid",
    label: "Termin książeczki sanepid",
    dateCol: "sanepid_expiry",
    lastNotifiedCol: "sanepid_last_notified",
  },
  {
    key: "umowa",
    label: "Termin umowy",
    dateCol: "umowa_expiry",
    lastNotifiedCol: "umowa_last_notified",
  },
];

const toYMD = (d) => d.toISOString().split("T")[0];

const daysUntil = (dateStr, today) => {
  const expiry = new Date(dateStr + "T00:00:00");
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};

const isDueToday = (days) =>
  days === 30 || days === 14 || (days >= 0 && days <= 7) || days < 0;

const buildManagerMessage = (userName, term, expiryStr, days) =>
  days < 0
    ? `${userName}: ${term.label} przeterminowany od ${-days} dni (był ${expiryStr}).`
    : `${userName}: ${term.label} upływa ${expiryStr}.`;

const buildEmployeeMessage = (term, expiryStr, days) =>
  days < 0
    ? `Twój termin "${term.label}" jest przeterminowany od ${-days} dni (był ${expiryStr}). Zgłoś się do kierownika.`
    : `Twój termin "${term.label}" upływa ${expiryStr}. Zgłoś się do kierownika, aby go zaktualizować.`;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);

  let notified = 0;
  try {
    const allUsers = await api.get("users");
    const activeUsers = (Array.isArray(allUsers) ? allUsers : []).filter(
      (u) => u.active && !u.archived
    );

    for (const user of activeUsers) {
      for (const term of DOCUMENT_TERMS) {
        const expiryStr = user[term.dateCol];
        if (!expiryStr) continue;

        const days = daysUntil(expiryStr, today);
        if (!isDueToday(days)) continue;
        if (user[term.lastNotifiedCol] === todayStr) continue;

        await createManagerNotification(
          user.default_lokal,
          buildManagerMessage(user.name, term, expiryStr, days),
          term.key
        );
        await createEmployeeNotification(
          user.name,
          buildEmployeeMessage(term, expiryStr, days),
          term.key
        );
        await api.patch("users", user.id, {
          [term.lastNotifiedCol]: todayStr,
        });
        notified++;
      }
    }

    res.status(200).json({ ok: true, checked: activeUsers.length, notified });
  } catch (err) {
    console.error("check-document-terms failed:", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
