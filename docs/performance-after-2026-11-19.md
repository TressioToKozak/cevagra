# Wydajność po poprawkach — 19 listopada 2026

## Wynik

Pełne dziewięcioetapowe próby ukończyło 150/150 graczy w seriach 10, 20, 30, 40 i 50 równoczesnych uczestników. Wszystkie żądania gry zwróciły 200; brak odrzuconych checkpointów, utraconych wyników i punktów odebranych przez kolejkę serwera w tym pomiarze.

| Graczy | Pełne próby | API p95 | API maksimum | Lokalny ping p95 | Błędy graczy | Etapy z utratą punktów |
|---|---|---|---|---|---|---|
| 10 | 10/10 | 102 ms | 185 ms | 13 ms | 0 | 0 |
| 20 | 20/20 | 217 ms | 415 ms | 15 ms | 0 | 0 |
| 30 | 30/30 | 324 ms | 612 ms | 10 ms | 0 | 0 |
| 40 | 40/40 | 497 ms | 854 ms | 14 ms | 0 | 0 |
| 50 | 50/50 | 676 ms | 1319 ms | 10 ms | 0 | 0 |

Przy 50 jednoczesnych finalizacjach p95 wyniosło 139 ms, maksimum 140 ms. Osobny test równoczesnej finalizacji również zapisał 150/150 wyników. Ponowienie wszystkich żądań zwróciło te same identyfikatory, bez duplikatów; integralność SQLite: `ok`.

## Co zmieniono

- Ograniczona pula 1–4 trwałych procesów Node zastępuje uruchamianie nowego procesu dla każdego zadania. Domyślna liczba uwzględnia limit CPU; na VPS z 4 vCPU wynosi cztery.
- Weryfikacja przebiegu odbywa się poza transakcją SQLite. Przed zastosowaniem wyniku serwer ponownie sprawdza właściciela, ważność i niezmienność stanu. Równoległe checkpointy nie mogą nadpisać nowszych danych ani podwójnie ukończyć etapu.
- WAL, FULL synchronization, indeksy, jednorazowe inicjowanie schematu oraz krótka kolejka zapisów eliminują długie blokady i zagłodzenie innych zapisów. Finalizacja zachowuje atomowość i idempotencję.
- Przeglądarka wysyła jeden checkpoint naraz, zbiera następne akcje do świeżej paczki i czeka na potwierdzenie przed zakończeniem etapu. Żadnych akcji nie pomija.
- Zdarzenia są sprawdzane względem chwili odebrania całego żądania przez serwer, przed oczekiwaniem na bazę. Bonus za ukończenie bazuje na ostatniej zaakceptowanej akcji odebranej przez serwer, jeśli odtworzenie potwierdza ukończenie. Wyniki po upływie czasu nadal używają limitu etapu; nie przyjmujemy czasu ani punktów deklarowanych przez klienta.
- Limity wspólnego IP pozwalają obsłużyć 50 uczestników za NAT/proxy: 120 nowych wizyt/minutę, 600/godzinę i 12 000 zapisów/minutę. Nadal obowiązują limity odwiedzającego, checkpointów i 8 prób logowania/10 minut. Nonce, sekwencje, limity czasu, replay, uwierzytelnianie, prywatne backupy i nagłówki bezpieczeństwa pozostają aktywne.

## Porównanie i ograniczenia

[Pomiar przed zmianami](performance-2026-11-19.md) kończył 10/10, 19/20 i 0/30–50 pełnych prób. Sam zapis gotowych wyników działał także wcześniej; problemy dotyczyły limitów i opóźnionych checkpointów.

Warunki: lokalny backend, jednorazowe bazy, 2 vCPU/8 GiB, jeden transportowy IP. Ta sama kolejność scenariuszy, akcje, synchroniczny start sealowania i finalizacji oraz normalne zabezpieczenia. Generator ruchu używa teraz łączenia oczekujących akcji zgodnego z poprawionym klientem (`clientCoalescing: true`); porównanie mierzy cały poprawiony przepływ, a nie wyłącznie backend z niezmienionym sposobem wysyłki. `LOAD_COALESCE=0` pozwala zachować wcześniejszy model transportu w pomiarze kontrolnym.

To nie jest pomiar produkcyjnego VPS ani internetu uczestników. P95 oznacza, że 95% zmierzonych żądań mieściło się w podanym czasie; nie jest gwarancją maksymalnego pingu. VPS 4 vCPU wymaga wdrożenia i restartu backendu, a następnie próby przez rzeczywisty HTTPS/proxy.

Przeglądarkowy pomiar sealowania dzielił limit CPU z backendem i generatorem ruchu. Wyniki FPS zapisano w surowym raporcie; nie potwierdzają płynności na urządzeniach graczy ani poprawy renderowania. Timery lokalnej gry zachowały pomiar czasu rzeczywistego. Nie zmieniano renderowania, sterowania ani reguł minigier.

## Odtworzenie

```sh
CHROMIUM_PATH=/usr/bin/chromium LOAD_REPORT=work/performance/after.json node scripts/load-benchmark.cjs
node scripts/run-tests.cjs concurrency security game-proof verified-flow test-panel statistics admin-data test-access
```

Benchmark nie przyjmuje adresu produkcji: tworzy i usuwa własne lokalne serwery i bazy. Test finalizacji używa kontrolowanych stanów gotowych do zapisu; niezależny test pełnej gry przechodzi wszystkie dziewięć etapów przez API z serwerowymi sesjami, nonce i legalnymi akcjami.

Surowe dane: [przed](performance/2026-11-19.json), [po](performance/2026-11-19-after.json). Pole `commit` w raporcie po zmianach oznacza bazę roboczą; `sourceSnapshot` zawiera SHA-256 plików z pomiaru. `postBenchmarkChanges` opisuje późniejszą poprawkę oczekiwania klienta na koniec etapu, wykrytą przez regresję przeglądarkową; na tym etapie backend i sposób grupowania zdarzeń nie uległy zmianie. Kolejne zmiany opisano poniżej.

## Uzupełnienie: niezawodność zapisu wyniku

Po powyższym pomiarze dodano obsługę utraconych potwierdzeń: identyczny checkpoint
lub koniec etapu może otrzymać poprzednią odpowiedź bez ponownego naliczenia.
Klient ponawia wyłącznie przejściowe błędy; trwała odmowa walidacji nie może zostać
zamieniona w oficjalny wynik. Zniknął cichy awaryjny zapis do lokalnego rankingu
po nieudanym zapisie oficjalnej próby. Ekran pokazuje potwierdzony zapis albo
wyraźny brak potwierdzenia i, przy błędzie przejściowym, przycisk RETRY SAVE.

Statystyki i gra współdzielą teraz jedną wersję modułu sesji. Nieudane sprawdzenie
dostępności backendu nie przełącza automatycznie do gry lokalnej. Statyczny hosting
z odpowiedzią 404/405 nadal oferuje jawnie oznaczony trening.

Testy `result-save` symulują zerwane odpowiedzi po faktycznym zatwierdzeniu
checkpointu, końca etapu i wyniku oraz trwałą odmowę finalizacji. Weryfikują
odzyskanie jednego rekordu, brak duplikatów i poprawne komunikaty. Bez logów
produkcyjnych nie da się przypisać konkretnej dawnej niezapisanej próby do
jednego z tych scenariuszy ani odtworzyć jej wyniku na podstawie samego ekranu.

Powtórzony pomiar po dodaniu potwierdzeń: **50/50** pełnych rozgrywek, API p95 **665 ms**, maksimum **1187 ms**; brak błędów i utraty punktów w porównaniu z odtworzeniem klienta. Osobny zapis 50 wyników naraz: maksimum **144 ms**, 50 rekordów i brak duplikatów. Warunki jak wcześniej, 2 vCPU/8 GiB, ten sam lokalny IP i sondowanie Chromium. [Dane surowe](performance/2026-11-19-save-recovery.json).
