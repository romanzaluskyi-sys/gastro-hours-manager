// @ts-nocheck
// Zmiany z grafiku, których nikt nie odbił.
//
// Najczęstsza przyczyna to nie oszustwo, tylko zapomniany tablet — ktoś
// przyszedł, przepracował swoje i wyszedł bez odbicia. Zostawione tak, dzień
// pokazuje minus kilka godzin, raport plan/fakt kłamie, a człowiek nie dostaje
// za tę zmianę pieniędzy. Dlatego to nie jest alarm, tylko pozycja do decyzji:
// zapisz jak w grafiku, popraw godziny, albo odrzuć, jeśli zmiana się nie odbyła.
//
// Świadomie NIE zgadujemy. Nie dopisujemy godzin automatycznie — kierownik ma
// potwierdzić, bo to jego podpis pod czyjąś wypłatą.
import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";
import { trimTime, shiftHours, findBlockingAbsence } from "./grafik";
import { createEmployeeNotification } from "../api/notifications";

// Ile dni wstecz szukamy. Dalej nie ma sensu: po dwóch tygodniach nikt nie
// pamięta, czy tamtego wtorku przyszedł, a zgadywanie jest gorsze niż brak.
export const OKNO_DNI = 14;

const buildLocalDate = (dateStr, timeStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
};

const odbilTegoDnia = (shifts, user, dateStr) =>
  (shifts || []).some(
    (s) =>
      s.start_time &&
      !s.is_urlop &&
      toLocalYMD(s.start_time) === dateStr &&
      (s.user_id ? String(s.user_id) === String(user.id) : s.user_name === user.name)
  );

// Zmiana wpisana w grafiku, opublikowana, w przeszłości i bez ani jednego
// odbicia tego dnia — w ŻADNYM lokalu. Odbicie w innym lokalu to inna sprawa
// (człowiek gdzieś był, tylko nie tam, gdzie planowano) i nie należy do tej
// kolejki.
export const zmianyBezOdbicia = ({
  planShifts,
  shifts,
  users,
  absences,
  dzis = toLocalYMD(new Date()),
  lokalOk,
}) => {
  const od = (() => {
    const d = new Date(dzis + "T00:00:00");
    d.setDate(d.getDate() - OKNO_DNI);
    return toLocalYMD(d);
  })();

  return (planShifts || [])
    .filter(
      (s) =>
        s.published_at &&
        !s.deleted_at &&
        !s.rozliczenie &&
        s.date >= od &&
        s.date < dzis &&
        (!lokalOk || lokalOk(s.lokal))
    )
    .map((s) => {
      const user = (users || []).find((u) => String(u.id) === String(s.user_id));
      return { plan: s, user };
    })
    .filter(({ plan, user }) => {
      if (!user || user.archived) return false;
      if (findBlockingAbsence(absences, user, plan.date)) return false;
      return !odbilTegoDnia(shifts, user, plan.date);
    })
    .sort((a, b) => a.plan.date.localeCompare(b.plan.date));
};

// Decyzja kierownika. 'zapisano' tworzy prawdziwą zmianę w `shifts`
// (z godzinami z grafiku albo poprawionymi), 'odrzucono' tylko zamyka pozycję.
// W obu wypadkach oznaczamy grafik, żeby pozycja nie wróciła jutro — kolejka,
// która pokazuje w kółko to samo, przestaje być czytana.
export const rozliczBrakOdbicia = async ({
  plan,
  user,
  decyzja,
  start,
  end,
  kto,
  shifts,
  setShifts,
  planShifts,
  setPlanShifts,
}) => {
  let nowaZmiana = null;

  if (decyzja === "zapisano") {
    const od = trimTime(start || plan.start_time);
    const doG = trimTime(end || plan.end_time);
    const startD = buildLocalDate(plan.date, od);
    let endD = buildLocalDate(plan.date, doG);
    // Zmiana przez północ kończy się nazajutrz — ta sama zasada co w grafiku.
    if (endD <= startD) endD.setDate(endD.getDate() + 1);
    nowaZmiana = await api.post("shifts", {
      user_id: user.id,
      user_name: user.name,
      lokal: plan.lokal,
      stanowisko: plan.stanowisko,
      start_time: startD.toISOString(),
      end_time: endD.toISOString(),
      godzin: Math.round(((endD - startD) / 3600000) * 100) / 100,
    });
    setShifts([
      ...(shifts || []),
      { ...nowaZmiana, start_time: new Date(nowaZmiana.start_time), end_time: new Date(nowaZmiana.end_time) },
    ]);
    // Pracownik ma wiedzieć, że godziny mu doliczono i jakie — to jego wypłata.
    await createEmployeeNotification(
      user.name,
      `Zmiana z ${plan.date.split("-").reverse().join(".")} (${plan.lokal}, ${od}–${doG}) ` +
        `została dopisana przez ${kto}, bo nie została odbita na tablecie.`,
      "odbicie"
    ).catch(() => {});
  }

  const zapisany = await api.patch("grafik_shifts", plan.id, {
    rozliczenie: decyzja,
    rozliczenie_przez: kto,
    rozliczenie_at: new Date().toISOString(),
  });
  setPlanShifts((planShifts || []).map((z) => (String(z.id) === String(plan.id) ? zapisany : z)));
  return nowaZmiana;
};

export { shiftHours };
