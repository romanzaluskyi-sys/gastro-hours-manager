// @ts-nocheck
// Giełda zmian — pracownik wystawia swoją zmianę, ktoś wolny ją przejmuje,
// kierownik zatwierdza. Jedyne miejsce, które pisze do shift_swaps i które
// przepisuje zmianę na nowego pracownika; nie duplikuj tego w komponentach
// (ten sam wzorzec co utils/corrections.ts i utils/absences.ts).
//
// Pełny opis przepływu: docs/GRAFIK.md, Runda 2.
import { api } from "../api/supabase";
import {
  createEmployeeNotification,
  createManagerNotification,
} from "../api/notifications";
import {
  trimTime,
  shiftHours,
  findOverlappingPlanShift,
  findBlockingAbsence,
} from "./grafik";

// Ustalenie właściciela: zmiany nie da się wystawić później niż 12 godzin
// przed jej rozpoczęciem — bez tego ktoś wystawiałby zmianę o 8:50 na 9:00.
export const SWAP_MIN_HOURS = 12;

export const STATUS_LABEL = {
  na_gieldzie: "Na giełdzie",
  przyjeta: "Czeka na kierownika",
  zatwierdzona: "Zamieniona",
  odrzucona: "Odrzucona",
  wycofana: "Wycofana",
};

export const shiftStartAt = (planShift) => {
  const [h, m] = trimTime(planShift.start_time).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const d = new Date(planShift.date + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
};

export const hoursUntilStart = (planShift, now = new Date()) => {
  const start = shiftStartAt(planShift);
  return start ? (start.getTime() - now.getTime()) / 3600000 : null;
};

export const canOfferSwap = (planShift, now = new Date()) => {
  const h = hoursUntilStart(planShift, now);
  return h != null && h >= SWAP_MIN_HOURS;
};

// Aktywna oferta dla danej zmiany — rozstrzygnięte i wycofane nas nie
// interesują, bo zmiana może trafić na giełdę ponownie.
export const activeSwapFor = (swaps, planShiftId) =>
  (swaps || []).find(
    (s) =>
      String(s.grafik_shift_id) === String(planShiftId) &&
      ["na_gieldzie", "przyjeta"].includes(s.status)
  ) || null;

// Ile godzin w danym miesiącu zyska (dodatnio) albo straci (ujemnie) dany
// pracownik, jeśli oczekujące zamiany zostaną zatwierdzone. Kierownik musi
// to widzieć PRZED decyzją — przy pracowniku na etacie kilka przejętych
// zmian potrafi wywrócić miesiąc.
export const pendingSwapDelta = (swaps, planShifts, user, monthPrefix) => {
  if (!user) return 0;
  return (swaps || [])
    .filter((sw) => sw.status === "przyjeta")
    .reduce((delta, sw) => {
      const ps = (planShifts || []).find(
        (p) => String(p.id) === String(sw.grafik_shift_id)
      );
      if (!ps) return delta;
      if (monthPrefix && !ps.date.startsWith(monthPrefix)) return delta;
      const h = shiftHours(ps);
      if (String(sw.taker_user_id) === String(user.id)) return delta + h;
      if (String(sw.author_user_id) === String(user.id)) return delta - h;
      return delta;
    }, 0);
};

// Suma zaplanowanych godzin pracownika w miesiącu — punkt odniesienia dla
// różnicy powyżej (ta sama arytmetyka co w siatce tygodnia).
export const monthPlanHours = (planShifts, user, monthPrefix) =>
  (planShifts || [])
    .filter(
      (s) =>
        s.date.startsWith(monthPrefix) &&
        (s.user_id && user?.id
          ? String(s.user_id) === String(user.id)
          : s.user_name === user?.name)
    )
    .reduce((sum, s) => sum + shiftHours(s), 0);

// Aktywna oferta dotycząca zmiany danego pracownika — do podświetlenia
// jego własnego grafiku (jest autorem) oraz oznaczenia u przejmującego.
export const swapsForUser = (swaps, user) =>
  (swaps || []).filter(
    (sw) =>
      ["na_gieldzie", "przyjeta"].includes(sw.status) &&
      (String(sw.author_user_id) === String(user?.id) ||
        String(sw.taker_user_id) === String(user?.id))
  );

export const offerSwap = async ({ planShift, author, note }) => {
  if (!canOfferSwap(planShift)) {
    throw new Error(
      `Zmianę można wystawić najpóźniej ${SWAP_MIN_HOURS} godzin przed jej rozpoczęciem.`
    );
  }
  const swap = await api.post("shift_swaps", {
    grafik_shift_id: planShift.id,
    lokal: planShift.lokal,
    date: planShift.date,
    author_user_id: author.id,
    author_user_name: author.name,
    status: "na_gieldzie",
    note: note || null,
  });
  await createManagerNotification(
    planShift.lokal,
    `${author.name} wystawił(a) na giełdę zmianę ${planShift.date} ${trimTime(
      planShift.start_time
    )}–${trimTime(planShift.end_time)} (${planShift.stanowisko}).`,
    "swap_offer"
  );
  return swap;
};

export const withdrawSwap = async (swap) => {
  const updated = await api.patch("shift_swaps", swap.id, { status: "wycofana" });
  if (swap.taker_user_name) {
    await createEmployeeNotification(
      swap.taker_user_name,
      `${swap.author_user_name} wycofał(a) z giełdy zmianę z ${swap.date} — nie przejmujesz jej.`,
      "swap"
    );
  }
  return updated;
};

// Przejęcie zmiany przez innego pracownika. Sprawdzamy to samo, co przy
// ręcznym wpisywaniu przez kierownika: zatwierdzone wolne i kolizję godzin.
// Niezgodne stanowisko NIE blokuje — decyduje kierownik przy zatwierdzeniu.
export const acceptSwap = async ({ swap, planShift, taker, planShifts, absences }) => {
  if (findBlockingAbsence(absences, taker, planShift.date)) {
    throw new Error("Masz na ten dzień zatwierdzone wolne.");
  }
  const kolizja = findOverlappingPlanShift(planShifts, {
    user_id: taker.id,
    user_name: taker.name,
    date: planShift.date,
    start_time: planShift.start_time,
    end_time: planShift.end_time,
    excludeId: planShift.id,
  });
  if (kolizja) {
    throw new Error("Masz już w tych godzinach inną zmianę.");
  }
  const updated = await api.patch("shift_swaps", swap.id, {
    status: "przyjeta",
    taker_user_id: taker.id,
    taker_user_name: taker.name,
  });
  await createManagerNotification(
    planShift.lokal,
    `${taker.name} chce przejąć zmianę ${planShift.date} ${trimTime(
      planShift.start_time
    )}–${trimTime(planShift.end_time)} od: ${swap.author_user_name}. Czeka na Twoją decyzję.`,
    "swap_accepted"
  );
  await createEmployeeNotification(
    swap.author_user_name,
    `${taker.name} zgłosił(a) się po Twoją zmianę z ${planShift.date}. Czeka na zgodę kierownika.`,
    "swap"
  );
  return updated;
};

// Decyzja kierownika. Zatwierdzenie PRZEPISUJE zmianę na nowego pracownika
// (to jedyne miejsce, które to robi); odmowa zostawia ją u autora — inaczej
// w dniu zmiany nikt by nie przyszedł.
export const resolveSwap = async ({ swap, planShift, decision, editorName }) => {
  if (decision === "approve") {
    const zapisana = await api.patch("grafik_shifts", planShift.id, {
      user_id: swap.taker_user_id,
      user_name: swap.taker_user_name,
      updated_at: new Date().toISOString(),
    });
    const updated = await api.patch("shift_swaps", swap.id, {
      status: "zatwierdzona",
      decided_by: editorName || null,
      decided_at: new Date().toISOString(),
    });
    const zakres = `${planShift.date} ${trimTime(planShift.start_time)}–${trimTime(
      planShift.end_time
    )}`;
    await createEmployeeNotification(
      swap.author_user_name,
      `${editorName || "Kierownik"} zatwierdził(a) zamianę — zmianę ${zakres} przejmuje ${
        swap.taker_user_name
      }.`,
      "swap"
    );
    await createEmployeeNotification(
      swap.taker_user_name,
      `${editorName || "Kierownik"} zatwierdził(a) zamianę — pracujesz ${zakres} w lokalu ${
        planShift.lokal
      }.`,
      "swap"
    );
    return { swap: updated, planShift: zapisana };
  }

  const updated = await api.patch("shift_swaps", swap.id, {
    status: "odrzucona",
    decided_by: editorName || null,
    decided_at: new Date().toISOString(),
  });
  await createEmployeeNotification(
    swap.author_user_name,
    `${editorName || "Kierownik"} nie zgodził(a) się na zamianę zmiany z ${swap.date} — zmiana zostaje u Ciebie.`,
    "swap"
  );
  if (swap.taker_user_name) {
    await createEmployeeNotification(
      swap.taker_user_name,
      `${editorName || "Kierownik"} nie zgodził(a) się na przejęcie zmiany z ${swap.date}.`,
      "swap"
    );
  }
  return { swap: updated, planShift: null };
};
