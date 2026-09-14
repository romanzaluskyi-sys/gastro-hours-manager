# Duplikaty godzin i świeżość danych

Notatka po zdarzeniu z 13.09.2026 w Marynacie i Chińczyku. Opisuje, co się
stało, co z tego jest już naprawione w 0.36.2, i co zostaje do decyzji.

## Co się stało

W tym lokalu stoją **dwa telefony służbowe z tym samym profilem**. Godziny
wpisuje się zwykle na drugim.

```
16:39  Nikola   Kasa Marynata      07:00–16:00    ← telefon 1
17:24  Katia    Mały zmywak        10:00–16:00    ← telefon 1
17:25  Natalia  Kuchnia Marynata   07:00–16:00    ← telefon 1
       ⋮ 29 minut
17:54  Katia    Mały zmywak        10:00–16:00    ← telefon 2, DUPLIKAT
17:54  Natalia  Kuchnia Marynata   07:00–16:00    ← telefon 2, DUPLIKAT
17:55  Olha     Kuchnia Chińczyk   08:00–16:00    ← telefon 2
18:05  Svieta   Kasa Chińczyk      08:00–16:05    ← telefon 2
```

Na telefonie 2 wpisów z telefonu 1 **nie było widać** — Svieta zadzwoniła do
Nikoli, że nic nie ma. Osoba przy telefonie 2 usiadła do wpisywania godzin
całej zmiany, poszła listą od góry i zaczęła od Katii i Natalii, nie wiedząc,
że one już są.

Nikola się NIE zdublowała, i to pasuje do wyjaśnienia: strona na telefonie 2
została załadowana między 16:39 a 17:24, więc Nikolę miała w swojej kopii
danych, a Katii i Natalii jeszcze nie.

**Przyczyna:** `shifts` były pobierane RAZ, przy otwarciu strony, i nigdy
więcej — poll co 45 s obejmował tylko `notifications` i `issues`. Tablet
Służbowy z założenia stoi zalogowany tygodniami, więc pracował na kopii danych
sprzed nieokreślonego czasu. Wszystkie zabezpieczenia czytające ten stan były
ślepe: `findOverlappingShift` nie widział kolizji, a „Dziś już
zarejestrowano…" nie pokazywało niczego.

## Co naprawia 0.36.2

**Warstwa 1 — świeżość.** `shifts` dołączyły do odświeżania co 45 s, w oknie
ostatnich 21 dni (tyle wystarcza wszystkim kontrolom; cała tabela to ~3000
wierszy i ciągnięcie jej co 45 s na każdym urządzeniu byłoby rozrzutnością).
Wiersze sprzed okna zostają nietknięte, bo raporty sięgają dalej wstecz.
*To jest warstwa, która powstrzymuje CZŁOWIEKA* — w opisanym zdarzeniu telefon 2
pokazałby Katię i Natalię jako „zakończyło" najpóźniej 45 s po 17:25, czyli 29
minut przed próbą ponownego wpisania.

**Warstwa 2 — kontrola przy zapisie.** `znajdzKolizjeWBazie` w
`utils/shifts.ts` zadaje to samo pytanie co `findOverlappingShift`, ale BAZIE
i tuż przed `POST`. U pracownika i w Mojej Pracy blokuje, w Rejestrze Godzin
ostrzega (kierownik naprawia też niespójne dane).
*To jest warstwa, która powstrzymuje DANE.*

### ⚠️ Częsta pomyłka w rozumieniu tych 45 sekund

To **nie** jest tak, że „wszystko, co zmieści się w 45 sekundach, może się
zdublować". Warstwa 2 pyta bazy w momencie zapisu, więc duplikat wpisany minutę
po pierwszym — albo sekundę po nim — zostanie odrzucony niezależnie od tego,
kiedy ostatnio odświeżył się poll.

Jedyna dziura, jaka zostaje, to **dwa zapisy w tej samej chwili**: obie sesje
zdążą zapytać bazy, zanim którykolwiek wiersz w niej wyląduje. Mowa o
ułamkach sekundy, nie o 45 sekundach.

### To nie jest kwestia wydajności ani płatnego planu

Poll to jedno zapytanie na urządzenie na 45 s, po oknie ~21 dni (kilkadziesiąt
wierszy). Darmowy plan Supabase jest od tego o rzędy wielkości dalej. Płatny
plan warto rozważyć z INNYCH powodów — kopie zapasowe bazy, limit projektów przy
modelu silo, komercyjne użycie na Vercelu — ale nie dla tego mechanizmu.

## Co zostaje do decyzji

### 1. Unikalny indeks `(user_id, start_time)` na `shifts`

Jedyny mechanizm, który przeżywa prawdziwy wyścig dwóch równoczesnych zapisów,
bo nie zależy ani od sieci, ani od tego, co ma na ekranie przeglądarka. Działa
również dla zapisów, które NIE idą przez aplikację — a tam leży większość
dotychczasowej szkody.

Stan danych sprawdzony 13.09.2026 na całej tabeli (z paginacją, 2973 wiersze,
zero wierszy bez `user_id`): **cztery** pary `(user_id, start_time)` występują
dwukrotnie, wszystkie to dokładne kopie (ten sam lokal, stanowisko, godziny):

```
Karina   15.02 09:00–19:30   utw. 28.08 08:21   ← import z Google Forms
Karina   03.03 09:00–20:30   utw. 28.08 08:21   ← import
Natalia  24.03 08:00–16:00   utw. 28.08 08:17   ← import
Dawid    06.09 09:00–19:00   utw. 08.09 08:13
```

Trzy z czterech przyniósł import ze starej systemu Google Forms, czyli źródło,
którego obie warstwy z 0.36.2 w ogóle nie dotyczą.

Żaden prawidłowy przypadek tego indeksu nie narusza: ta sama osoba nie zaczyna
dwóch zmian w tej samej minucie. Przed założeniem trzeba usunąć te cztery pary.

⚠️ CLAUDE.md mówi, że projekt świadomie unika wymuszonej unikalności poza
`day_logs`. To byłby drugi wyjątek — i z tego samego powodu co pierwszy: dwa
zapisy o jednym zdarzeniu to podwojone godziny i nieprawdziwa suma.

### 2. `created_by` w `shifts` i osobna tożsamość każdego urządzenia

`shifts` nie zapisuje, KTO utworzył wiersz — tylko czyje to godziny. Dlatego
ustalenie, czy 17:54 wpisywał kierownik czy ktoś z tabletu, wymagało godziny
grzebania w znacznikach czasu, i tak skończyło się hipotezą zamiast pewności.

Sama kolumna to jednak za mało: **oba telefony logują się w TEN SAM profil**,
więc audyt powiedziałby „to samo konto". Dopiero rozdzielenie tożsamości
urządzeń (`Marynata — telefon 1` / `telefon 2`) czyni ślad czytelnym.

### 3. Czego NIE dodawać

Ekran kiosku **już** pokazuje przy każdym nazwisku, kto jest na zmianie, kto
jeszcze nie odbił i kto skończył. Problemem nie było to, że tego nie widać —
tylko że dane miały kilka dni. Warstwa 1 to załatwiła; kolejny wskaźnik byłby
dokładaniem elementu tam, gdzie zawiodła świeżość, a nie widoczność.

## Skala szkody

Cztery duplikaty w 2973 wierszach całej historii, plus dwa z 13.09 (usunięte
tego samego dnia). To jest komplet — sprawdzone zapytaniem po całej tabeli, nie
po pierwszych tysiącu wierszy (PostgREST oddaje maksymalnie 1000 na żądanie i
robi to bez ostrzeżenia; patrz błąd #1 w CLAUDE.md).
