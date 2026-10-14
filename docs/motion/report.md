# Animacje i czytelność rozgrywki

Zmiana dodaje krótkie, lokalne reakcje interfejsu i subtelną atmosferę magazynu. Animacje nie opóźniają aktywacji etapu, następnego zadania ani zapisu wyniku. Nie dodano dźwięku, nowych assetów rozgrywki ani zależności.

## Naprawione przyczyny

- Ogólne animacje wejścia i opóźnienia kolejnych kart ukrywały aktywne obiekty, gdy licznik już pracował. Usunięto je z plansz. Wszystkie obiekty krytyczne są widoczne od początku; ukryta plansza przygotowawcza zostaje odsłonięta przed uruchomieniem zegara.
- Palety miały własne `visibility: visible`, które mogło przebić ukrycie przygotowywanej planszy. Przygotowanie teraz jawnie ukrywa również wszystkie elementy potomne; po aktywacji ograniczenie znika.
- Hover i błędy mogły poruszać interaktywnymi elementami. Zastąpiły je lokalne obramowania, światło i kolory; pozycje hitboxów pozostają stałe.
- Skaner WMS miał istniejącą animację, ale brak połączenia z wyborem wiersza oraz późniejszą regułę `content: none`, która usuwała linię. Obie przyczyny są poprawione.
- Efekt wyjścia paczki wymaga niezależnego klonu. Klon zachowuje wygląd faktycznie przeciąganej paczki, nie przechwytuje interakcji, a jego usunięcie następuje po zakończeniu animacji zamiast po osobnym timeoutcie. Resize usuwa lot o nieaktualnych współrzędnych.
- Efekty mają wspólne śledzenie timerów, animacji i węzłów. Reset i zmiana gry czyszczą je; anulowane liczniki nie trzymają starego ekranu wyników.

## Efekty

| Miejsce | Zachowanie |
| --- | --- |
| Menu | Małe, ciepłe światło w cyklu 6 s; jednorazowy refleks START. Bez animowania pola nazwy. |
| Mission Briefing | Aktywacja treści HUD w 400–500 ms. Gotowość przycisku zależy od assetów, nie od animacji. |
| Speed Picking | Krótkie potwierdzenie wyboru i odświeżenie celu; następne zadanie natychmiast. |
| Conveyor Rush | Paczka wizualnie wpada do właściwego zsypu w 220 ms. Następna logiczna paczka powstaje natychmiast. Zły zsyp sygnalizuje błąd lokalnie. Pierwsza paczka jest w pełni widoczna na starcie. |
| Barcode Hunt | Krótki skan wybranej etykiety; następny cel bez oczekiwania. |
| Packing Tetris | Delikatne osiadanie samego obrazu kartonu i poświata palety. Zajęty obszar oraz pozycja kartonu nie zmieniają się. |
| WMS Detective | Ten sam neutralny skan przy zaznaczeniu i odznaczeniu każdego wiersza; małe światło statusu. Bez podpowiadania poprawności. |
| Truck Loading | Natychmiastowe ustawienie końcowe i poświata slotów, także przy zamianie. Bez znikania i przesuwania palet animacją. |
| Gift Memory | Pięć prezentów stabilnych przez pełne 4 s. Krótkie wejście nagłówka drugiej fazy, neutralne zaznaczanie odpowiedzi. |
| Quality Control | Neutralny puls inspekcji i informacja MARKED / UNMARKED. Bez naklejek i ujawniania odpowiedzi. |
| Final Dispatch | Stempel wybranej akcji: teal RELEASE albo gold HOLD. Potwierdza decyzję, nie jej poprawność; zapis wyniku pozostaje natychmiastowy. |
| Mission Complete | Neutralne potwierdzenie i licznik zdobytych punktów w istniejącym przejściu 1,5 s. |
| Results | Licznik 900 ms, dziewięć pasków 750 ms, krótka aktywacja rangi. Złoty efekt wyłącznie przy rzeczywistym nowym rekordzie lokalnym. |
| Leaderboard | Wejście opacity 250 ms, jednorazowy refleks medalu, wyróżnienie bieżącego gracza i hover bez przemieszczania wierszy. |

## Zasady i dostępność

Pozostają wszystkie dziewięć minigier, losowa kolejność pierwszych ośmiu, Final jako dziewiąty, maksymalnie 1000 punktów, dotychczasowe czasy, punktacja i lokalny ranking. Final zachowuje rozkład 80/20 i punktację 150/50, maksymalnie 200. WMS, Memory i QC nie ujawniają poprawności podczas wyboru. Nie ma oczekiwania na efekty przed następnym zadaniem.

`prefers-reduced-motion` usuwa dekoracyjne ruchy i lot paczki; nadal działa pełna czterosekundowa faza pamięci i jej wskaźnik czasu. Ukrycie dokumentu pauzuje dekoracyjne animacje CSS. Podstawowe mechaniki i ich zegary nie zostały zastąpione animacjami. Pole nazwy, organizer, natywny caret, wizualny kursor świąteczny i edycja tekstu pozostają sprawne.

## Weryfikacja i nagranie

[Rzeczywiste nagranie Chromium](showcase.mp4) obejmuje 16 scen. [Rozdziały](chapters.json) wskazują momenty ich rozpoczęcia. Materiał pochodzi ze screencastu CDP: zachowuje odstępy czasowe rzeczywiście przechwyconych klatek. Plik MP4 ma 30 klatek/s, z powtórzeniami klatek w momentach bez nowego obrazu; nie jest pomiarem FPS renderowania.

Sceny używają kontrolowanych danych testowych i bezpośrednich przejść między grami, żeby pokazać wszystkie efekty w jednym krótkim materiale. Przypadki RELEASE/HOLD celowo obejmują również niepoprawną decyzję, żeby potwierdzić neutralność stempla. Oddzielne pełne rozgrywki weryfikują produkcyjny przebieg, wynik 1000 i timeouty.

- Testy Node: 122 672 asercje oraz statystyka 5000 seedów Final (4021 HOLD).
- Chromium: 27 kombinacji startu (9 gier × 3 rozdzielczości), pełna widoczność obiektów przy aktywacji, geometria przeciągania, lot paczki i natychmiastowy następny obiekt, WMS, neutralne klasyfikacje, natychmiastowe zatwierdzanie i zapis, brak migania palet w próbkach 0/16/50/100/200/350/500 ms, pełne 4 s Memory, cleanup i reduced motion.
- Przeszły także istniejące zestawy browser, visual, interaction, edge, background, input-leaderboard, polish i mission: pełne rundy, ładowanie i retry, układ w trzech rozdzielczościach, edycja nazwy/organizer, brak natywnego zaznaczania i ghostów obrazów, ranking, CSV i kursor.
- Przejrzano klatki rzeczywistego przeciągania Conveyor i skanowania WMS. Testy wymagają czystej konsoli.

Pomiar wydajności zapisano w [performance.json](performance.json). W odrębnych próbach dwusekundowych Chromium uzyskano 108 klatek RAF bez long tasks, a także 90 klatek z dwoma long tasks do 104 ms. Końcowy przebieg dał 62 klatki, jeden long task 67 ms i maksymalny odstęp RAF 333 ms; równolegle działała dodatkowa instancja Chromium sprawdzająca przygotowanie planszy. Środowisko chmurowe wykazuje zmienność harmonogramu; nie potwierdzono stałych 60 FPS. Efekty korzystają przede wszystkim z opacity/transform, bez odczytów geometrii w każdej klatce animacji; współrzędne lotu są odczytywane raz przy zdarzeniu.

Testowano Chromium na lokalnej ścieżce `/cevagra/`, zgodnej z deploymentem Pages. Nie zweryfikowano fizycznych urządzeń dotykowych, innych przeglądarek ani publicznego GitHub Pages (dostęp blokowany przez proxy środowiska).

## Zmienione pliki

`effects.js`: wspólny cykl życia i efekty. `minigames.js`: zdarzenia dziewięciu gier. `game.js`: aktywacja, przejścia, wyniki i pauza dekoracji. `styles.css`: stabilna geometria i efekty prezentacyjne. `index.html`, `storage.js` i istniejące skrypty QA: wersja cache 20. `tests.mjs`: dostosowanie kontroli struktury do nowego HUD. `scripts/animation-tests.cjs`: rzeczywiste pomiary i nagranie. `docs/motion/`: dowody i raport.
