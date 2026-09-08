// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Szuka
// WCZORAJSZYCH zmian z grafiku, których nikt nie odbił, i mówi o nich obu
// stronom: pracownikowi (bo to jego godziny i jego wypłata) oraz kierownikowi
// lokalu (bo to on je zatwierdzi w zakładce Zatwierdzanie zmian).
//
// Patrzymy WYŁĄCZNIE na wczoraj, celowo. Dzięki temu każda zmiana jest
// sprawdzana dokładnie raz i nie trzeba niczego oznaczać, żeby nie wysłać tego
// samego drugi raz. Starsze pozycje i tak czekają w kolejce u kierownika.
//
// Zwykły CommonJS .js — powód identyczny jak w check-document-terms.js: Vercel
// buduje api/ osobnym, legacy tsc, który przewraca się na starym `typescript`
// z package.json. Bez importów z src/.

const SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co";
const SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const pobierz = async (sciezka) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, { headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `Błąd pobierania ${sciezka}`);
  return json;
};

// res.ok sprawdzamy zawsze — cichy 400 wyglądałby jak "wszyscy odbili"
// (patrz błąd #8 w CLAUDE.md).
const powiadom = async (wiersz) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify(wiersz),
  });
  if (!res.ok) throw new Error(`Błąd zapisu powiadomienia: ${res.status}`);
};

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const wczoraj = ymd(new Date(Date.now() - 86400000));
  const dataPL = wczoraj.split("-").reverse().join(".");
  const failures = [];
  let znalezione = 0;

  try {
    const plan = await pobierz(
      `grafik_shifts?select=*&date=eq.${wczoraj}&deleted_at=is.null&published_at=not.is.null&rozliczenie=is.null`
    );
    if (!plan.length) return res.status(200).json({ dzien: wczoraj, znalezione: 0 });

    const [odbicia, users, urlopy] = await Promise.all([
      pobierz(`shifts?select=user_id,user_name,start_time,is_urlop`),
      pobierz(`users?select=id,name,default_lokal,active,archived`),
      pobierz(`absences?select=user_id,user_name,start_date,end_date,status`),
    ]);

    const odbilWczoraj = new Set(
      odbicia
        .filter((s) => !s.is_urlop && s.start_time && ymd(new Date(s.start_time)) === wczoraj)
        .map((s) => String(s.user_id || s.user_name))
    );
    const naWolnym = new Set(
      urlopy
        .filter((a) => a.status === "approved" && a.start_date <= wczoraj && wczoraj <= a.end_date)
        .map((a) => String(a.user_id || a.user_name))
    );

    for (const zm of plan) {
      const user = users.find((u) => String(u.id) === String(zm.user_id));
      if (!user || !user.active || user.archived) continue;
      const klucz = String(user.id);
      if (odbilWczoraj.has(klucz) || odbilWczoraj.has(user.name)) continue;
      if (naWolnym.has(klucz) || naWolnym.has(user.name)) continue;

      znalezione += 1;
      // Każda pozycja osobno: błąd jednej nie może uciszyć pozostałych.
      try {
        await powiadom({
          audience: "employee",
          user_name: user.name,
          type: "odbicie",
          message:
            `Wczoraj (${dataPL}) miałeś(-aś) zmianę w grafiku w lokalu ${zm.lokal}, ` +
            `ale nie ma jej wśród odbitych godzin. Kierownik potwierdzi ją w systemie — ` +
            "jeśli godziny były inne, powiedz mu o tym.",
        });
        await powiadom({
          audience: "manager",
          lokal: zm.lokal,
          type: "odbicie",
          message:
            `${user.name}: zmiana z grafiku ${dataPL} (${zm.lokal}) bez odbicia. ` +
            "Do potwierdzenia w zakładce Zatwierdzanie zmian.",
        });
      } catch (e) {
        failures.push({ zmiana: zm.id, error: e.message });
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ dzien: wczoraj, znalezione, failures });
};
