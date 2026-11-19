# Wydajność przed poprawkami — 19 listopada 2026

Ten raport zachowuje pomiar wersji sprzed optymalizacji. Wyniki po zmianach:
[raport po poprawkach](performance-after-2026-11-19.md).

## Wniosek

Obecna wersja nie zapewnia niezawodnej, równej rozgrywki dla 30–50 równoczesnych graczy we wspólnej sieci. Sam zapis gotowych wyników jest poprawny: wszystkie 150 wyników z równoczesnych serii 10/20/30/40/50 zostały zapisane, ponowienia nie utworzyły duplikatów, a kontrola SQLite zwróciła `ok`. Główny problem występuje wcześniej: limity API i opóźnione checkpointy przerywają weryfikację całej próby. Już dla 10 i 20 graczy wystąpiły niewielkie różnice punktów zależnych od czasu.

## Zakres i warunki

- Wersja aplikacji: `65fc035304b8ff7c744e8369fefc0474530260d9`.
- Lokalny backend `server.py`, pusta jednorazowa baza i folder backupów. Produkcyjny ranking i statystyki nie były obciążane ani modyfikowane.
- Limit środowiska: **2 vCPU i 8 GiB RAM**, procesor AMD EPYC 9V74 80-Core Processor, Python 3.12.14, v24.19.0, Chromium 151.0.7922.173 built on Debian GNU/Linux 13 (trixie).
- Wszystkie połączenia miały ten sam transportowy adres IP — scenariusz wspólnego Wi-Fi/NAT lub reverse proxy. Oddzielne serwerowe cookies identyfikowały graczy.
- Każdy poziom miał świeże okno limitów: w jednorazowej bazie przed serią zerowano liczniki, a podczas serii działały normalnie. Sesje do testów gry i zapisu zakładano wcześniej przez API, z oczekiwaniem na odnowienie limitu rejestracji. Test wejścia badał odrębnie jednoczesną rejestrację.
- Jedna seria na poziom. To test stresowy, nie certyfikacja hostingu ani model każdego możliwego zachowania graczy.
- Pełna gra: wszystkie 9 etapów, prawidłowe akcje, rzeczywisty upływ czasu, numeracja i odnawianie nonce, wysyłanie akcji co 50 ms i próbek sealowania co 200 ms, heartbeat co 10 s. Gracze czekali na wspólny start sealowania i finału. Pozostałe akcje skryptowe były szybkie. To celowo skupia ruch bardziej niż przeciętna grupa ludzi.
- **RTT API w tym raporcie to czas lokalnego HTTP**, a nie ping internetu użytkownika do serwera produkcyjnego.

## 1. Jednoczesne wejście nowych graczy

| Osoby | Przyjęte sesje | Odrzucone 429 | p95 odpowiedzi |
|---:|---:|---:|---:|
| 10 | 10 | 0 | 85 ms |
| 20 | 20 | 0 | 1020 ms |
| 30 | 30 | 0 | 1068 ms |
| 40 | 30 | 10 | 1059 ms |
| 50 | 30 | 20 | 1252 ms |

Limit 30 nowych sesji na minutę na adres IP odrzuca część grupy 40/50 osób jeszcze przed rozgrywką. Reload z istniejącym cookie nie jest nową sesją. Przy reverse proxy ten sam adres transportowy może reprezentować także graczy z różnych sieci.

## 2. Pełna rozgrywka i oficjalny wynik

| Gracze | Ukończone i zapisane próby | p95 API gry | Maks. API gry | Odpowiedzi błędne | p95 lekkiego pingu API |
|---:|---:|---:|---:|---:|---:|
| 10 | 10/10 | 84 ms | 1487 ms | 0 | 9 ms |
| 20 | 19/20 | 175 ms | 2520 ms | 1 | 11 ms |
| 30 | 0/30 | 665 ms | 3055 ms | 31 | 9 ms |
| 40 | 0/40 | 695 ms | 4369 ms | 44 | 19 ms |
| 50 | 0/50 | 1027 ms | 5932 ms | 55 | 10 ms |

Łącznie: **13405 żądań API gry**. Przy 10 graczach wszystkie próby dotarły do oficjalnego rankingu. Przy 20 jedna zakończyła się błędem `400 Stale gameplay checkpoint` (żądanie trwało około 2520 ms). Dla 30/40/50 próby zostały zatrzymane przez błędy świeżości checkpointów i/lub `429 Too many requests`; nie powstał z nich oficjalny końcowy rekord. Nie jest to utrata już zatwierdzonego wiersza bazy — weryfikacja nie doszła do końca.

Ograniczenie 3000 zapisów/minutę na wspólny IP jest zbyt niskie dla tego skoordynowanego ruchu. Samych batchy sealowania może być 250/s dla 50 graczy. Lekki endpoint capabilities pozostaje szybki, mimo że istotne żądania akcji są opóźniane i odrzucane; dobry wynik prostego pingu nie oznacza więc poprawnej gry.

## 3. Czas i premia punktowa

W Final Dispatch porównano serwerowy wynik z powtórzeniem tych samych akcji przy czasie upływającym po stronie symulowanego klienta:

- 10 graczy: 3 z 10 finałów miały wynik mniejszy o 1–2 punkty; maksymalna różnica **2 pkt**.
- 20 graczy: 6 z 19 ukończonych finałów miało niższy wynik; maksymalna różnica **2 pkt**.
- 30–50 graczy: brak ukończonych pełnych prób pozwalających ocenić ten warunek.

Porównanie obejmuje również czas sieci i oczekiwanie na poprzednie potwierdzenia, a nie tylko pracę SQLite. Skrypt działa tak jak kolejka klienta: żądanie końca etapu czeka na potwierdzenie wcześniejszych akcji. Dodatkowo backend oblicza czas po uzyskaniu blokady transakcji. Dlatego obecna kontrola czasu nie zapewnia identycznej premii przy różnym opóźnieniu obsługi.

## 4. Jednoczesny końcowy zapis i ponowienia

Ten scenariusz izoluje końcowy endpoint: przygotowane w bazie stany oznaczają już zakończoną walidację etapów. Właściwy zapis, uwierzytelnienie i ponowienie odbywają się przez prawdziwe HTTP. **Ten test sam w sobie nie potwierdza wydajności weryfikatora całej gry.**

| Równoczesne zapisy | Unikalne zapisane wyniki | p95 pierwszego zapisu | Maks. pierwszego zapisu | Udane ponowienia |
|---:|---:|---:|---:|---:|
| 10 | 10/10 | 1036 ms | 1036 ms | 10/10 |
| 20 | 20/20 | 103 ms | 123 ms | 20/20 |
| 30 | 30/30 | 1254 ms | 1255 ms | 30/30 |
| 40 | 40/40 | 1015 ms | 1021 ms | 40/40 |
| 50 | 50/50 | 1461 ms | 1464 ms | 50/50 |

W każdej serii wszystkie odpowiedzi były 200, wynik miał 9 składowych i poprawną sumę, ponowienie zwracało ten sam ID, liczba wierszy nie rosła od duplikatów, a `PRAGMA integrity_check` zwracało `ok`. Największe opóźnienie pierwszej serii 50 zapisów wyniosło 1464 ms. To jedna próba pomiarowa — kolejność p95 między poziomami nie jest krzywą gwarantowanego skalowania.

## 5. Płynność i zegar w przeglądarce

10-sekundowy pomiar Pallet Sealing (obrót i nakładanie seal) w jednym Chromium headless podczas obciążenia:

| Klienci API | FPS | p95 odstępu klatek | Klatki >50 ms | Odchyłka zegara klienta |
|---:|---:|---:|---:|---:|
| 0 | 30.1 | 57.6 ms | 35 | 0 ms |
| 10 | 27.5 | 64 ms | 50 | 0 ms |
| 20 | 25.3 | 82 ms | 72 | 1 ms |
| 30 | 22.1 | 82.2 ms | 84 | 0 ms |
| 40 | 21.2 | 93.6 ms | 89 | 0 ms |
| 50 | 21.9 | 103.2 ms | 78 | 2 ms |

Przeglądarka i backend dzieliły te same 2 vCPU z generatorem ruchu. Już pomiar bez graczy API wynosił około 30 FPS. Tych liczb **nie można przenieść wprost na FPS komputerów lub telefonów graczy**; nie uruchamiano 50 niezależnych urządzeń. Odchyłka lokalnego zegara w pomiarze wyniosła 0–2 ms, więc timer oparty na deadline nie gubił kolejnych sekund. Spadek klatek w tym środowisku nie wyjaśnia jednak odrzucania wyników — te błędy potwierdzono osobno na API.

Lokalny lekki ping bez obciążenia: p50 2 ms, p95 4 ms, maks. 5 ms (50 próbek). Rzeczywisty hosting, TLS/proxy, internet uczestników i ich GPU wymagają osobnego pomiaru na docelowej instalacji.

## Zalecana kolejność poprawek

1. Dostosować limity do wydarzenia z 50 osobami za wspólnym NAT/proxy, zachowując osobne ograniczenia logowania i ochronę per sesja.
2. Oddzielić kosztowną weryfikację Node od trzymania blokady zapisu SQLite; rozważyć stałą pulę weryfikatorów. Obecnie nowy proces Node jest uruchamiany wewnątrz transakcji `BEGIN IMMEDIATE`.
3. Rejestrować serwerowy czas odebrania akcji zakończenia i wyłączyć oczekiwanie na kolejkę weryfikacji/zapisu z naliczania premii, zachowując weryfikację przebiegu i czasów akcji.
4. Ograniczyć ponowną inicjalizację schematu na każdym połączeniu i ocenić WAL. Sprawdzić serwer HTTP: aktualny backlog to 5, domyślna odpowiedź to HTTP/1.0. Nie zmieniać samej flagi na HTTP/1.1 bez poprawnych długości wszystkich odpowiedzi.
5. Powtórzyć identyczne serie po poprawkach, następnie wykonać kontrolowany test docelowego hostingu i urządzeń uczestników.

Pomiar zachowuje aktualne zabezpieczenia. Kod aplikacji nie został zmieniony w ramach tego badania.

## Odtworzenie

`CHROMIUM_PATH=/usr/bin/chromium node scripts/load-benchmark.cjs`

Skrypt zawsze tworzy lokalny serwer i jednorazową bazę; nie przyjmuje adresu produkcji. Pełny przebieg wymaga kilku minut, w tym oczekiwania na legalne założenie sesji. Opcjonalne zmienne: `LOAD_LEVELS=10,20,30,40,50`, `LOAD_PHASE=admission|finish|gameplay|all`, `LOAD_REPORT=work/performance/results.json`, `LOAD_BROWSER=0`.

Surowe wyniki: [2026-11-19.json](performance/2026-11-19.json).
