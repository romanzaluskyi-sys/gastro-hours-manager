// @ts-nocheck
// Giełda zmian — pracownik oddaje swoją zmianę, ktoś ją bierze, kierownik
// zatwierdza. Jedyne miejsce, które pisze do shift_swaps i które przepisuje
// zmianę na nowego pracownika; nie duplikuj tego w komponentach (ten sam
// wzorzec co utils/corrections.ts i utils/absences.ts).
//
// TRZY TRYBY (0.38.0), jeden stan i jedna ścieżka decyzji:
//   'gielda'  — widzą wszyscy uprawnieni, bierze pierwszy chętny
//   'oddanie' — oferta idzie do JEDNEJ wskazanej osoby, nikt inny jej nie widzi
//   'zamiana' — ja biorę twoją zmianę, ty moją; obie przepisują się naraz
//
// ⚠️ Tryb zmienia tylko to, KTO widzi ofertę i CO się przepisuje po
// zatwierdzeniu. Stan (na_gieldzie → przyjeta → zatwierdzona/odrzucona/
// wycofana) i to, że ostatnie słowo ma kierownik, są wspólne — osobna maszyna
// stanów na tryb to trzy miejsca, w których można zapomnieć o kierowniku.
//
// ⚠️ `target_*` (komu zaproponowano) to NIE `taker_*` (kto wziął). Zlanie ich
// dałoby ofertę wyglądającą na przyjętą, zanim ktokolwiek ją zobaczył.
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
  knowsStanowisko,
} from "./grafik";

// Ustalenie właściciela: zmiany nie da się wystawić później niż 12 godzin
// przed jej rozpoczęciem — bez tego ktoś wystawiałby zmianę o 8:50 na 9:00.
export const SWAP_MIN_HOURS = 12;

export const TYPY_WYMIANY = [
  {
    key: "gielda",
    label: "Wystaw na giełdę",
    opis: "Zobaczą wszyscy, którzy mogą wziąć tę zmianę.",
  },
  {
    key: "oddanie",
    label: "Oddaj konkretnej osobie",
    opis: "Ofertę zobaczy tylko ta jedna osoba.",
  },
  {
    key: "zamiana",
    label: "Zamień się zmianami",
    opis: "Bierzesz jej zmianę, ona Twoją.",
  },
];

export const typWymiany = (swap) => (swap && swap.typ) || "gielda";

export const STATUS_LABEL = {
  na_gieldzie: "Na giełdzie",
  przyjeta: "Czeka na kierownika",
  zatwierdzona: "Zamieniona",
  odrzucona: "Odrzucona",
  wycofana: "Wycofana",
};

// Etykieta stanu zależy od trybu: "Na giełdzie" przy ofercie dla wszystkich
// nie znaczy tego samego, co oferta leżąca u jednej konkretnej osoby — a
// autor musi wiedzieć, na kogo czeka.
export const statusLabelFor = (swap) => {
  if (swap.status === "na_gieldzie" && swap.target_user_name) {
    return `Czeka na: ${swap.target_user_name}`;
  }
  return STATUS_LABEL[swap.status] || swap.status;
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
      // Przy zamianie każda strona i coś oddaje, i coś bierze — liczenie
      // samej przejmowanej zmiany pokazywałoby etatowcowi wzrost o 8 h tam,
      // gdzie realnie nic się nie zmienia.
      const wz =
        typWymiany(sw) === "zamiana"
          ? (planShifts || []).find((p) => String(p.id) === String(sw.wzajemna_shift_id))
          : null;
      const wMiesiacu = (x) => x && (!monthPrefix || x.date.startsWith(monthPrefix));
      const h = wMiesiacu(ps) ? shiftHours(ps) : 0;
      const hw = wMiesiacu(wz) ? shiftHours(wz) : 0;
      if (String(sw.taker_user_id) === String(user.id)) return delta + h - hw;
      if (String(sw.author_user_id) === String(user.id)) return delta - h + hw;
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

// Oferty WYSTAWIONE przez tę osobę i wciąż żywe — podpis „na giełdzie" przy
// jej nazwisku na Tablecie Służbowym.
//
// ⚠️ Wiersz w `shift_swaps` PRZEŻYWA usunięcie zmiany z grafiku: tabele wiąże
// luźne `grafik_shift_id`, bez klucza obcego, więc nic go nie sprząta samo.
// Dlatego każda odpowiedź na pytanie „czy ta oferta istnieje" musi sięgnąć po
// samą zmianę. Bez tego zdjęta z grafiku zmiana Oleny świeciła na tablecie
// jako „na giełdzie" w nieskończoność, choć nikt już nie mógł jej wziąć
// (22.09.2026). Usunięcie wycofuje dziś ofertę samo (`wycofajOfertyDlaZmian`),
// ale ta osłona zostaje: jest jedynym miejscem, które działa także dla
// wierszy osieroconych wcześniej i dla ścieżki usuwania, o której ktoś
// zapomni.
//
// ⚠️ `deleted_at` liczy się jak brak zmiany. Wysłana zmiana po usunięciu
// czeka na publikację z ustawioną datą skasowania — dla giełdy jej już nie ma.
export const ofertyWystawione = ({ swaps, planShifts, user }) =>
  (swaps || [])
    .filter(
      (sw) =>
        ["na_gieldzie", "przyjeta"].includes(sw.status) &&
        String(sw.author_user_id) === String(user?.id)
    )
    .map((sw) => ({
      sw,
      ps: (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id)),
    }))
    .filter(({ ps }) => ps && !ps.deleted_at);

// Czy ta osoba realnie może wziąć tę zmianę. JEDEN predykat dla wszystkich
// trzech trybów: lista ofert na giełdzie, lista kandydatów przy oddaniu i
// lista kandydatów przy zamianie muszą pokazywać ten sam zbiór ludzi —
// inaczej ktoś widoczny w jednym miejscu znikałby w drugim bez wyjaśnienia.
export const mozeWziac = (user, planShift, { planShifts, absences, pomijajZmianeId } = {}) => {
  if (!user || !planShift) return false;
  // Na giełdę idzie konkretna PRACA, nie same godziny — propozycja ma sens
  // tylko dla kogoś, kto ma to stanowisko w swojej karcie.
  if (!knowsStanowisko(user, planShift.stanowisko)) return false;
  if (findBlockingAbsence(absences, user, planShift.date)) return false;
  const maJuzCos = (planShifts || []).some(
    (p) =>
      p.date === planShift.date &&
      String(p.id) !== String(pomijajZmianeId) &&
      !p.deleted_at &&
      (p.user_id && user.id
        ? String(p.user_id) === String(user.id)
        : p.user_name === user.name)
  );
  return !maJuzCos;
};

// Kto może dostać tę zmianę — lista do wyboru przy "oddaj" i "zamień się".
// Przy zamianie nie wymagamy wolnego dnia: kandydat oddaje wtedy swoją zmianę,
// więc kolizję rozstrzyga dopiero wybór konkretnej zmiany (zmianyDoZamiany).
export const kandydaciNaZmiane = ({ users, planShifts, absences, planShift, author, typ = "oddanie" }) =>
  (users || [])
    .filter((u) => u.active && !u.archived && u.role !== "kiosk")
    .filter((u) => String(u.id) !== String(author?.id) && u.name !== author?.name)
    .filter((u) =>
      typ === "zamiana"
        ? knowsStanowisko(u, planShift.stanowisko) &&
          !findBlockingAbsence(absences, u, planShift.date)
        : mozeWziac(u, planShift, { planShifts, absences })
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "pl"));

// Zmiany kandydata, które autor mógłby wziąć w zamian. Sprawdzamy je z punktu
// widzenia AUTORA (to on je przejmie), bo to jego kalendarz decyduje, czy
// zamiana ma sens — kandydat zwalnia swój dzień, oddając tę właśnie zmianę.
export const zmianyDoZamiany = ({ planShifts, absences, kandydat, author, mojaZmiana }) =>
  (planShifts || [])
    .filter((p) => p.published_at && !p.deleted_at)
    .filter((p) => String(p.id) !== String(mojaZmiana?.id))
    .filter((p) =>
      p.user_id && kandydat.id
        ? String(p.user_id) === String(kandydat.id)
        : p.user_name === kandydat.name
    )
    .filter((p) => canOfferSwap(p))
    .filter((p) =>
      mozeWziac(author, p, { planShifts, absences, pomijajZmianeId: mojaZmiana?.id })
    )
    .sort((a, b) => a.date.localeCompare(b.date));

// Zmiana idąca w drugą stronę przy zamianie — do pokazania u obu stron i u
// kierownika.
export const wzajemnaZmiana = (swap, planShifts) =>
  swap && swap.wzajemna_shift_id
    ? (planShifts || []).find((p) => String(p.id) === String(swap.wzajemna_shift_id)) || null
    : null;

// Oferty, które dana osoba realnie może wziąć: cudze, wciąż wolne, w
// terminie (12 h), w dzień bez własnej zmiany i bez zatwierdzonego wolnego.
// Jedno miejsce dla obu konsumentów — zakładki Grafik pracownika i listy
// wyboru osoby na Tablecie Służbowym.
export const offersForUser = ({ swaps, planShifts, absences, user }) =>
  (swaps || [])
    .filter(
      (sw) =>
        sw.status === "na_gieldzie" &&
        String(sw.author_user_id) !== String(user?.id) &&
        // Oferta skierowana ('oddanie'/'zamiana') należy do jednej osoby —
        // dla reszty nie istnieje. To jest cała różnica między trybami po
        // stronie odbiorcy.
        (!sw.target_user_id || String(sw.target_user_id) === String(user?.id))
    )
    .map((sw) => ({
      sw,
      ps: (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id)),
    }))
    // ⚠️ `!ps.deleted_at` jest tu ważniejsze niż wygląda: bez tego zmiana
    // usunięta przez kierownika (wysłana, więc czekająca na publikację z
    // `deleted_at`) dalej stała na giełdzie i ktoś mógł ją WZIĄĆ — przejmując
    // pracę, której już nie ma.
    .filter(({ ps }) => ps && !ps.deleted_at && canOfferSwap(ps))
    // Przy zamianie autor oddaje adresatowi swoją zmianę, a bierze jego —
    // więc dzień adresata nie musi być wolny, o ile zwalnia go właśnie ta
    // zmiana, którą oddaje.
    .filter(({ sw, ps }) =>
      mozeWziac(user, ps, {
        planShifts,
        absences,
        pomijajZmianeId: typWymiany(sw) === "zamiana" ? sw.wzajemna_shift_id : null,
      })
    )
    .sort((a, b) => a.ps.date.localeCompare(b.ps.date));

// Zmiany, które ta osoba przejęła i które czekają na decyzję kierownika —
// u niej samej nie ma ich jeszcze w grafiku (właścicielem wciąż jest autor),
// więc bez tego byłyby dla niej niewidoczne.
export const claimedByUser = ({ swaps, planShifts, user }) =>
  (swaps || [])
    .filter(
      (sw) => sw.status === "przyjeta" && String(sw.taker_user_id) === String(user?.id)
    )
    .map((sw) => ({
      sw,
      ps: (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id)),
    }))
    .filter(({ ps }) => ps && !ps.deleted_at);

export const offerSwap = async ({
  planShift,
  author,
  note,
  typ = "gielda",
  target = null,
  wzajemnaShift = null,
}) => {
  if (!canOfferSwap(planShift)) {
    throw new Error(
      `Zmianę można wystawić najpóźniej ${SWAP_MIN_HOURS} godzin przed jej rozpoczęciem.`
    );
  }
  if (typ !== "gielda" && !target) {
    throw new Error("Wybierz osobę, której oddajesz zmianę.");
  }
  if (typ === "zamiana" && !wzajemnaShift) {
    throw new Error("Wybierz zmianę, którą bierzesz w zamian.");
  }
  // Przy zamianie autor przejmie zmianę adresata — sprawdzamy to TERAZ, a nie
  // dopiero u kierownika. Propozycja, której z góry nie da się zrealizować,
  // zajmuje miejsce w kolejce i kończy się odmową bez powodu.
  if (typ === "zamiana" && !canOfferSwap(wzajemnaShift)) {
    throw new Error(
      `Zmiana, którą chcesz wziąć, zaczyna się za mniej niż ${SWAP_MIN_HOURS} godzin.`
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
    typ,
    target_user_id: target ? target.id : null,
    target_user_name: target ? target.name : null,
    wzajemna_shift_id: wzajemnaShift ? String(wzajemnaShift.id) : null,
  });

  const zakres = `${planShift.date} ${trimTime(planShift.start_time)}–${trimTime(
    planShift.end_time
  )} (${planShift.stanowisko})`;

  if (typ === "gielda") {
    await createManagerNotification(
      planShift.lokal,
      `${author.name} wystawił(a) na giełdę zmianę ${zakres}.`,
      "swap_offer"
    );
    return swap;
  }

  // Tryby skierowane budzą przede wszystkim ADRESATA — to on ma teraz coś do
  // zrobienia. Kierownik dowie się przy przyjęciu, tak jak przy giełdzie.
  const opis =
    typ === "zamiana" && wzajemnaShift
      ? `${author.name} proponuje zamianę: bierzesz ${zakres}, oddajesz swoją ${
          wzajemnaShift.date
        } ${trimTime(wzajemnaShift.start_time)}–${trimTime(wzajemnaShift.end_time)}.`
      : `${author.name} chce oddać Ci zmianę ${zakres}.`;
  await createEmployeeNotification(target.name, opis, "swap");
  await createManagerNotification(
    planShift.lokal,
    typ === "zamiana"
      ? `${author.name} zaproponował(a) zamianę zmianami z: ${target.name} (${zakres}).`
      : `${author.name} chce oddać zmianę ${zakres} osobie: ${target.name}.`,
    "swap_offer"
  );
  return swap;
};

// Zmiana zdjęta z grafiku zabiera ze sobą swoją ofertę.
//
// ⚠️ Usuwanie zmiany nie dotykało dotąd `shift_swaps` w ŻADNEJ ze ścieżek
// (pojedyncze usunięcie, czyszczenie zakresu, zdejmowanie zmian odchodzącemu,
// przepisanie na następcę). Wiersz oferty zostawał aktywny i wskazywał na
// nieistniejącą zmianę — autor widział „na giełdzie" bez końca, a odbiorca
// nie dostawał żadnej wiadomości, że propozycja przestała być aktualna.
//
// ⚠️ NIE RZUCA. Zmiana jest już usunięta, więc wyjątek tutaj kazałby
// kierownikowi zobaczyć „Błąd usuwania" po operacji, która się udała. Zamiast
// tego zwracamy listę niepowodzeń — wołający ma o nich powiedzieć, zamiast
// udawać pełny sukces (ta sama zasada co w cronach, błąd #8 w CLAUDE.md).
export const wycofajOfertyDlaZmian = async ({
  swaps,
  shiftIds,
  powod = "zmiana została zdjęta z grafiku",
}) => {
  const cele = new Set((shiftIds || []).map((x) => String(x)));
  const doWycofania = (swaps || []).filter(
    (sw) =>
      ["na_gieldzie", "przyjeta"].includes(sw.status) &&
      cele.has(String(sw.grafik_shift_id))
  );
  const wycofane = [];
  const bledy = [];
  for (const sw of doWycofania) {
    try {
      wycofane.push(await api.patch("shift_swaps", sw.id, { status: "wycofana" }));
      // Autora też, i to jego przede wszystkim: to on wystawił zmianę i to
      // on inaczej dalej czekałby, aż ktoś ją weźmie.
      const komu = [sw.author_user_name, sw.taker_user_name, sw.target_user_name].filter(
        (n, i, arr) => n && arr.indexOf(n) === i
      );
      for (const kto of komu) {
        await createEmployeeNotification(
          kto,
          `Oferta zmiany z ${sw.date} jest nieaktualna — ${powod}.`,
          "swap"
        );
      }
    } catch (e) {
      bledy.push({ swap: sw, powod: e.message || "nieznany błąd" });
    }
  }
  return { wycofane, bledy };
};

export const withdrawSwap = async (swap) => {
  const updated = await api.patch("shift_swaps", swap.id, { status: "wycofana" });
  // Adresat oferty skierowanej mógł jej jeszcze nie przyjąć, a i tak ma ją na
  // ekranie — bez tego zniknęłaby mu bez słowa.
  const doPowiadomienia = [swap.taker_user_name, swap.target_user_name].filter(
    (n, i, arr) => n && arr.indexOf(n) === i
  );
  for (const kto of doPowiadomienia) {
    await createEmployeeNotification(
      kto,
      `${swap.author_user_name} wycofał(a) propozycję zmiany z ${swap.date}.`,
      "swap"
    );
  }
  return updated;
};

// Przejęcie zmiany przez innego pracownika. Sprawdzamy to samo, co przy
// ręcznym wpisywaniu przez kierownika: zatwierdzone wolne i kolizję godzin.
// Niezgodne stanowisko NIE blokuje — decyduje kierownik przy zatwierdzeniu.
export const acceptSwap = async ({
  swap,
  planShift,
  taker,
  planShifts,
  absences,
  wzajemna = null,
}) => {
  // Oferta skierowana jest cudza dla wszystkich poza adresatem. Filtr w
  // offersForUser i tak jej nie pokaże, ale zapis musi bronić się sam —
  // od tego zależy, czy "oddałem Marcie" znaczy cokolwiek.
  if (swap.target_user_id && String(swap.target_user_id) !== String(taker.id)) {
    throw new Error("Ta zmiana jest zaproponowana innej osobie.");
  }
  if (findBlockingAbsence(absences, taker, planShift.date)) {
    throw new Error("Masz na ten dzień zatwierdzone wolne.");
  }
  const typ = typWymiany(swap);
  const kolizja = findOverlappingPlanShift(planShifts, {
    user_id: taker.id,
    user_name: taker.name,
    date: planShift.date,
    start_time: planShift.start_time,
    end_time: planShift.end_time,
    // Przy zamianie kolidować może własna zmiana, którą właśnie oddaję — to
    // nie jest przeszkoda, tylko druga połowa tej samej operacji.
    excludeId: typ === "zamiana" && wzajemna ? wzajemna.id : planShift.id,
  });
  if (kolizja) {
    throw new Error("Masz już w tych godzinach inną zmianę.");
  }
  // Druga strona zamiany: autor przejmie zmianę adresata, więc jego kalendarz
  // też musi ją unieść. Sprawdzamy przed przyjęciem, nie u kierownika.
  if (typ === "zamiana" && wzajemna) {
    const autor = { id: swap.author_user_id, name: swap.author_user_name };
    if (findBlockingAbsence(absences, autor, wzajemna.date)) {
      throw new Error(`${swap.author_user_name} ma na ten dzień zatwierdzone wolne.`);
    }
    const kolizjaAutora = findOverlappingPlanShift(planShifts, {
      user_id: autor.id,
      user_name: autor.name,
      date: wzajemna.date,
      start_time: wzajemna.start_time,
      end_time: wzajemna.end_time,
      excludeId: planShift.id,
    });
    if (kolizjaAutora) {
      throw new Error(`${swap.author_user_name} ma już w tych godzinach inną zmianę.`);
    }
  }

  const updated = await api.patch("shift_swaps", swap.id, {
    status: "przyjeta",
    taker_user_id: taker.id,
    taker_user_name: taker.name,
  });
  const zakres = `${planShift.date} ${trimTime(planShift.start_time)}–${trimTime(
    planShift.end_time
  )}`;
  await createManagerNotification(
    planShift.lokal,
    typ === "zamiana" && wzajemna
      ? `${taker.name} i ${swap.author_user_name} chcą zamienić się zmianami: ${zakres} za ${
          wzajemna.date
        } ${trimTime(wzajemna.start_time)}–${trimTime(wzajemna.end_time)}. Czeka na Twoją decyzję.`
      : `${taker.name} chce przejąć zmianę ${zakres} od: ${swap.author_user_name}. Czeka na Twoją decyzję.`,
    "swap_accepted"
  );
  await createEmployeeNotification(
    swap.author_user_name,
    typ === "zamiana"
      ? `${taker.name} zgodził(a) się na zamianę zmianami. Czeka na zgodę kierownika.`
      : `${taker.name} zgłosił(a) się po Twoją zmianę z ${planShift.date}. Czeka na zgodę kierownika.`,
    "swap"
  );
  return updated;
};

// Decyzja kierownika. Zatwierdzenie PRZEPISUJE zmianę na nowego pracownika
// (to jedyne miejsce, które to robi); odmowa zostawia ją u autora — inaczej
// w dniu zmiany nikt by nie przyszedł.
export const resolveSwap = async ({
  swap,
  planShift,
  decision,
  editorName,
  wzajemna = null,
}) => {
  if (decision === "approve") {
    const zapisana = await api.patch("grafik_shifts", planShift.id, {
      user_id: swap.taker_user_id,
      user_name: swap.taker_user_name,
      updated_at: new Date().toISOString(),
    });
    // Zamiana to DWA przepisania. Kolejność jest obojętna, ale obu musi być —
    // jedno bez drugiego zostawia dzień z dwiema osobami i dzień bez nikogo.
    let zapisanaWzajemna = null;
    if (typWymiany(swap) === "zamiana" && wzajemna) {
      zapisanaWzajemna = await api.patch("grafik_shifts", wzajemna.id, {
        user_id: swap.author_user_id,
        user_name: swap.author_user_name,
        updated_at: new Date().toISOString(),
      });
    }
    const updated = await api.patch("shift_swaps", swap.id, {
      status: "zatwierdzona",
      decided_by: editorName || null,
      decided_at: new Date().toISOString(),
    });
    const zakres = `${planShift.date} ${trimTime(planShift.start_time)}–${trimTime(
      planShift.end_time
    )}`;
    const zakresWzajemny = zapisanaWzajemna
      ? `${wzajemna.date} ${trimTime(wzajemna.start_time)}–${trimTime(wzajemna.end_time)}`
      : null;
    const kto = editorName || "Kierownik";
    await createEmployeeNotification(
      swap.author_user_name,
      zakresWzajemny
        ? `${kto} zatwierdził(a) zamianę — oddajesz ${zakres}, pracujesz ${zakresWzajemny}.`
        : `${kto} zatwierdził(a) zamianę — zmianę ${zakres} przejmuje ${swap.taker_user_name}.`,
      "swap"
    );
    await createEmployeeNotification(
      swap.taker_user_name,
      zakresWzajemny
        ? `${kto} zatwierdził(a) zamianę — pracujesz ${zakres}, oddajesz ${zakresWzajemny}.`
        : `${kto} zatwierdził(a) zamianę — pracujesz ${zakres} w lokalu ${planShift.lokal}.`,
      "swap"
    );
    return { swap: updated, planShift: zapisana, wzajemna: zapisanaWzajemna };
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
  const druga = swap.taker_user_name || swap.target_user_name;
  if (druga) {
    await createEmployeeNotification(
      druga,
      `${editorName || "Kierownik"} nie zgodził(a) się na przejęcie zmiany z ${swap.date}.`,
      "swap"
    );
  }
  return { swap: updated, planShift: null, wzajemna: null };
};
