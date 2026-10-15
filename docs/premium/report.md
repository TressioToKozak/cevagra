# Arcade Premium — raport zmian

Zmiana rozwija istniejący `ArcadeEffects` i animacje CSS. Nie dodaje mechanik, obrazów, dźwięku, bibliotek ani elementów dekoracyjnych. Wszystkie napisy gry pozostają w języku angielskim.

## Co ulepszono

| Minigra | Reakcja wizualna |
| --- | --- |
| Speed Picking | Wciśnięcie wewnętrznych warstw lokalizacji i sprężysty powrót w 180 ms; wyraźniejszy krótki refleks nowego celu. Następne zadanie nadal pojawia się natychmiast. |
| Barcode Hunt | Ta sama reakcja kart, skan etykiety oparty na `transform` zamiast zmiany `top`, krótkie potwierdzenie i odświeżenie celu. |
| Conveyor Rush | Zachowany rzeczywisty wygląd paczki i jej niezależny klon. Lot 220 ms ma przyspieszenie, pośrednią skalę i końcowe zmniejszenie do 18%. Zsyp zachowuje zielone/czerwone potwierdzenie; następna logiczna paczka powstaje bez oczekiwania na efekt. |
| Packing Tetris | Sam obraz kartonu lekko opada, ściska się i odbija w 220 ms. Obrys zajętych komórek, geometria i kolizje pozostają stałe. |
| WMS Detective | Sprężysta reakcja wizualnych pól i płynny, neutralny skan zaznaczania. Ponowny wybór restartuje krótki efekt bez nakładania animacji. |
| Truck Loading | Obrazy palety i jej etykieta osiadają w 220 ms, bez animacji przezroczystości. Przy zamianie reagują oba sloty. Węzły kart, kolejność i pozycje slotów pozostają te same. |
| Memory Challenge | Przyciski prezentów mają neutralną, sprężystą reakcję wyboru. Dotychczasowy nagłówek fazy przechodzi płynnie; prezentacja pięciu prezentów nadal trwa pełne 4 s. |
| Quality Control | Krótka kompresja wizualnej warstwy kartonu i neutralny puls wyboru. Komunikat zaznaczenia przeniesiono z centrum planszy do istniejącego obszaru krótkich powiadomień przy nagłówku, żeby nie zasłaniał kolejnego kartonu. |
| Final Dispatch | Reakcja przycisków i wyraźniejsze, krótkie „przybicie” istniejącego stempla RELEASE/HOLD. Kolor opisuje wybraną akcję, nie jej poprawność. Zapis jest nadal natychmiastowy. |

Przyciski menu, briefingu, wyników i rankingu korzystają z tej samej reakcji 180 ms. Usunięto przesuwanie rzeczywistych przycisków na hover/active. Animowane są ich istniejące dzieci; kontrolki zawierające wyłącznie tekst dostają krótki refleks bez zmiany geometrii. Nie zmieniono fokusu, obsługi klawiatury ani edycji pól.

Istniejące światło menu ma łagodniejszy cykl 8 s, a niewielka istniejąca etykieta instrukcji dostaje refleks opacity 0,94–1. Nie animujemy całego tła: próba z pełnoekranowym zaciemnieniem wykazała regresję wydajności i została usunięta. Tło oraz pozycje planszy pozostają stałe. Nazwa misji w briefingu odsłania się krótkim przesunięciem tekstu, a istniejący detal ramki dostaje refleks. Mission Complete ma sprężystszy wynik i wejście nazwy; całość nadal mieści się w dotychczasowych 1,5 s. Odliczanie 3–2–1–GO nie zostało wydłużone.

Wynik HUD jest aktualizowany od razu. Refleks pojawia się przy rzeczywistym wzroście, bez wymuszonego odczytu `offsetWidth` i bez restartowania przy malejącym bonusie czasowym. Wyniki końcowe zachowują istniejący licznik i dziewięć pasków.

## Stabilność i wydajność

- Wciśnięcia korzystają z Web Animations API wewnątrz `ArcadeEffects`; nie powstał drugi system ani dodatkowa pętla RAF.
- Kolejne wciśnięcie tego samego elementu restartuje bieżącą grupę animacji zamiast alokować nowe obiekty i ponownie odczytywać style. Zakończone lub anulowane animacje są zwalniane.
- Reset, odliczanie, aktywacja etapu i zakończenie czyszczą krótkie reakcje interfejsu. Zamknięcie dialogu również je czyści.
- Ponowne potwierdzenie tego samego elementu zastępuje jego poprzedni timer. Nie wymusza przeładowania layoutu przez `offsetWidth`.
- `prefers-reduced-motion` pomija kompresję i loty oraz ogranicza dekoracje CSS. Ukrycie dokumentu nadal pauzuje dekoracyjne animacje CSS.
- Obliczenia stylu przy wciśnięciu i pomiar etykiety przy skanie odbywają się przy zdarzeniu, bez odczytu geometrii w każdej klatce.

Nie zmodyfikowano logiki `interactions.js`, `minigames.js`, `tasks.js`, `scoring.js`, `rng.js`, `lifecycle.js`, `storage.js`, manifestu ani loadera assetów. Pozostają wcześniejsze poprawki zwykłego kliknięcia Packing, aktualnych współrzędnych `pointerup`, szybkiego upuszczania i anulowania ruchu. Czasy, hitboxy, losowanie, instrukcje, punktacja do 1000 oraz ranking są niezmienione.

## Testy

Wyniki końcowe i pomiary zapisano obok raportu w `tests.json` oraz `performance.json`. Przeszły `node tests.mjs` (122 672 asercje oraz 5000 seedów Final), wszystkie dziewięć istniejących zestawów Chromium oraz nowy `scripts/premium-tests.cjs`. Żaden zestaw nie został pominięty ani zablokowany.

Przy dopracowywaniu nowego testu próbkę początkowo uruchamiano za wcześnie względem natywnego wciśnięcia. Test teraz rozpoczyna próbki na `pointerdown` i czeka na rzeczywiste klatki RAF zamiast zakładać termin ich dostarczenia przez headless Chromium. Końcowy przebieg 27 kombinacji przeszedł.

W końcowym `animation-tests` automatyzacja początkowo chybiła poruszającą się paczkę między pomiarem położenia a `pointerdown`. Fixture teraz zatrzymuje ruch wyłącznie na czas pobrania współrzędnych chwytu i natychmiast wznawia produkcyjną pętlę po przechwyceniu wskaźnika. Kod gry nie został w tym celu zmieniony. Po wznowieniu połączenia środowiska zachowano wynik pełnej macierzy 27 startów, a nagranie, efekty i reduced motion ponowiono osobno z potwierdzonym kodem wyjścia 0.

Nowy zestaw sprawdza rzeczywiste wciśnięcie myszy w każdej z dziewięciu minigier przy wszystkich trzech rozdzielczościach (27 kombinacji), stałe prostokąty kontrolek podczas animacji, krótki efekt wewnętrznych warstw, niezmienność menu podczas hover/active, szybkie 40-krotne zaznaczenie, natychmiastową aktualizację wyniku, brak podpowiadania poprawności, klawiaturę, osiadanie obu zamienianych palet, brak pozostałych animacji po resecie oraz reduced motion. W testach przeciągania źródło może być celowo ukryte na rzecz istniejącego widocznego ghosta — to zachowane zachowanie kontrolera.

Istniejące zestawy obejmują pełne rozgrywki i timeouty, 27 kombinacji minigry/rozdzielczości (1920×1080, 1366×768, 1280×720), natychmiastową widoczność aktywnych obiektów, szybkie kliknięcia, anulowanie, współrzędne puszczenia, resize, brak migania palet, pełne 4 s Memory, ładowanie i retry, kolejne rozgrywki, ranking, CSV, pola edycji, kursor oraz brak błędów JavaScript.

[Rzeczywiste nagranie Chromium](showcase.mp4) obejmuje 16 scen; [rozdziały](chapters.json) wskazują ich początki. Nagranie korzysta z kontrolowanych scen QA i przechwyconych klatek CDP z zachowaniem ich odstępów czasowych. MP4 zapisano jako 30 FPS z powtórzeniami klatek; nie jest to pomiar wydajności renderowania.

## Zmienione pliki

- `effects.js`: wspólna reakcja wciśnięcia, cykl życia animacji, restart pulsów, lot paczki i ograniczenie timerów potwierdzeń.
- `game.js`: podłączenie efektu do istniejących interfejsów, jego czyszczenie i nagradzający refleks HUD.
- `styles.css`: osiadanie, światło, przejścia i stabilne hover/active.
- `index.html`: wersja cache 21 dla zmienionego wejścia i CSS; `game.js` ładuje efekty i minigry jako v21. W `minigames.js` zmieniono wyłącznie wersję importu `interactions.js`, żeby odświeżenie pobierało też wcześniejszą poprawkę przeciągania.
- Istniejące skrypty QA: zgodna wersja importu `game.js`; nagranie Speed Picking i Barcode korzysta teraz z natywnego kliknięcia.
- `README.md`: polecenie dodatkowego testu i odnośnik do raportu.
- `scripts/premium-tests.cjs` i `docs/premium/`: dodatkowa regresja oraz dowody weryfikacji.

## Pomiary wydajności

Pierwsza próba z animowaną pełnoekranową warstwą wykazała około 22,3 FPS; wyłączenie tej warstwy przy zachowaniu reakcji wciśnięcia dało 58,8 FPS. Usunięto ten koszt i zastąpiono go małym refleksem istniejącej etykiety. Szybkie ponowne wciśnięcia wykorzystują tę samą grupę maksymalnie czterech animacji.

Końcowe porównanie tej samej sceny i serii wciśnięć w Chromium 1280×720: **60,1 FPS przed zmianą / 59,5 FPS po zmianie**, w próbkach około 2,28 s. Osobna próba Conveyor wykazała 114 klatek RAF w około 2 s, bez long tasks. To krótkie pomiary, nie gwarancja stałych 60 FPS. Zachowano także słabszą próbkę z rozbudowanego testu natywnych wciśnięć: 10,5 FPS, dwa long tasks do 805 ms i przerwę RAF 4,18 s. Wskazuje ona na dużą zmienność tego środowiska; nie należy jej ukrywać ani traktować wybranego dobrego pomiaru jako gwarancji. Po testach pozostało 0 grup wciśnięć i 0 śledzonych animacji.

## Ograniczenia

Pomiary wykonano w headless Chromium w środowisku chmurowym, nie na typowym komputerze gracza. Wyniki RAF są zmienne; nie potwierdzono stałych 60 FPS. Zapisano rzeczywiste long tasks i pozostające referencje zamiast deklarować gwarantowaną płynność. Nie testowano fizycznego ekranu dotykowego ani innych silników przeglądarek. Testy aplikacji działają na lokalnym serwerze HTTP; publiczny deployment GitHub Pages nie jest objęty tą weryfikacją.
