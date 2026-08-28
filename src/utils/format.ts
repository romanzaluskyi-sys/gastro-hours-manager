// @ts-nocheck
// --- POMOCNICZE FUNKCJE ---
export const getShort = (text) =>
  text
    ? text
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .substring(0, 3)
    : "";
export const getDayOfWeek = (date) =>
  ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"][date.getDay()];
export const getMonthName = (monthIdx) =>
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
export const getAvailableYears = () => {
  const startYear = 2026;
  const currentYear = new Date().getFullYear();
  const endYear = Math.max(startYear, currentYear) + 1;
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
};

export const formatNotificationText = (n, showEmployeeName) => {
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
