# Packing Tetris — precyzyjne Drag & Drop

## Przyczyna i zakres

Dotychczas pudełko tworzyło ghost już na `pointerdown`. Ten sam gest obsługiwał także zaznaczenie i późniejsze kliknięcie komórki. Punkt chwytu przeliczano na całkowity numer komórki wewnątrz kartonu, mimo że ghost zachowywał proporcjonalne przesunięcie w pikselach. Przy chwytaniu za krawędź lub narożnik te dwa sposoby obliczania mogły wskazywać inne miejsce. Podświetlenie zależało od zmiany komórki pod kursorem, a geometria celu była zapamiętywana przed resize.

Packing działa teraz wyłącznie przez przeciąganie. Usunięto jego stan `selected`, metodę `selectShape()` i listenery kliknięcia pudełek oraz komórek. Zwykłe kliknięcie i ruch poniżej 7 px nie wybierają, nie umieszczają, nie tworzą ghosta ani podglądu i nie zmieniają wyniku. Zachowano istniejące neutralne efekty wciśnięcia Arcade Premium.

## Chwyt i pozycja

Ghost powstaje dopiero po przekroczeniu progu 7 px. Oryginalny punkt chwytu jest zachowany jako proporcja szerokości i wysokości źródła, przeliczona na dokładny pikselowy offset w rozmiarze kartonu na palecie. Ghost śledzi aktualne `clientX/clientY` synchronicznie, bez oczekiwania na RAF; animacja wewnętrznych warstw nie przesuwa hitboxu.

Podgląd i końcowe upuszczenie wywołują tę samą funkcję `packingDropCoordinate()`. Oblicza ona początek kartonu z pozycji kursora i offsetu chwytu. Przy `pointerup` pozycja jest liczona ponownie z bieżących współrzędnych, również bez poprzedzającego `pointermove` lub dodatkowej klatki. Podgląd aktualizuje się także wtedy, gdy kursor pozostaje nad tą samą paletą.

## Dopasowanie do siatki

Wewnątrz palety wybierany jest najbliższy jednoznaczny początek komórki dla **początku kartonu**, a nie dla kursora. Dodatkowa tolerancja przy granicach dopuszczalnego obszaru wynosi `min(10 px, 20% mniejszego wymiaru komórki)`. W badanych rozdzielczościach jest to około 10 px. To niewielka pomoc przy krawędzi, niezależna od standardowej kwantyzacji pozycji do siatki.

Położenie jednakowo bliskie dwóm początkom (pas niejednoznaczności około 1 px) nie jest automatycznie zatwierdzane. Algorytm nie przeszukuje wolnych miejsc ani nie zastępuje zajętego celu innym. Istniejące `canPlace()` nadal pilnuje granic i kolizji. Poza obrysem palety tolerancja działa wyłącznie dla poprawnego, wolnego położenia; pozostałe upuszczenia poza paletą są ciche i bez kary. Kolizja albo niemieszczący się karton przy upuszczeniu nad paletą nadal wywołują dotychczasowy błąd i reakcję wizualną.

Dopasowanie dotyczy podglądu zajmowanych pól i miejsca umieszczenia. Sam ghost pozostaje związany z dokładnym punktem chwytu, dzięki czemu nie skacze pod kursorem.

## Anulowanie i resize

`pointercancel` oraz `lostpointercapture` usuwają ghost i wszystkie podświetlenia bez wykonania akcji. Resize okna bezpiecznie anuluje gest. Resize samej planszy jest obsługiwany przez istniejący ResizeObserver. Przy upuszczeniu dodatkowo porównywana jest aktualna geometria z geometrią chwytu; zmiana unieważnia upuszczenie nawet wtedy, gdy callback obserwatora jeszcze nie dotarł.

Próg, śledzenie pozycji i anulowanie na resize są opcjami `attachPointerDrag()`, włączonymi tylko w Packing. Domyślne zachowanie Conveyor Rush i Truck Loading pozostaje takie samo. Zachowano poprawkę sprawdzania aktualnego miejsca puszczenia.

## Testy

Szczegółowe wyniki znajdują się w [tests.json](tests.json).

- `node tests.mjs`: 122 697 asercji i 5000 seedów Final; rozkład 4021 HOLD bez zmian.
- `scripts/packing-tests.cjs`: wszystkie 7 istniejących rozmiarów × 3 punkty chwytu × 3 rozdzielczości, czyli 63 poprawne natywne przeciągnięcia. Dodatkowo kliknięcia, jitter poniżej progu, dokładny offset ghosta, zgodność podglądu i umieszczenia, tolerancja 8/12 px, niejednoznaczność, brak ratowania kolizji wolnym sąsiadem, punktacja i błędy, `pointercancel`, `lostpointercapture`, resize okna i samej planszy oraz bardzo szybkie upuszczenie z aktualnych współrzędnych.
- `interaction-tests`: wcześniejsze regresje współrzędnych puszczenia, poprawne/błędne upuszczenia, anulowanie i resize w Packing, Conveyor oraz Truck.
- `browser-tests`: pełne rozgrywki, wynik 1000, timeouty, seedy, zapis i ranking. Poprzedni sterownik testowy używał kliknij–kliknij i początkowo zatrzymał się na nowym Packing. Zastąpiono ten gest zdarzeniami przeciągania; zachowano wszystkie asercje końcowego wyniku.
- `visual-tests`: 27 kombinacji etapów i rozdzielczości oraz geometria po resize.
- `premium-tests`: 27 kombinacji wciśnięć, neutralne reakcje, ograniczenie liczby animacji, klawiatura, cleanup i reduced motion.
- `mission-tests`: briefing/wyniki, szybkie kliknięcia, przeciąganie, selekcja tekstu i pola edycji we wszystkich dziewięciu grach.

Nie powtarzano niezwiązanych zestawów `animation`, `background`, `edge`, `input-leaderboard` ani `polish`. Żaden z wybranych testów nie był zablokowany. Testowano Chromium przy 1920×1080, 1366×768 i 1280×720; nie testowano fizycznego dotyku ani innych przeglądarek. Zrzuty podglądu i umieszczenia: `/tmp/ceva-packing-preview.png` i `/tmp/ceva-packing-placed.png`.

## Pliki i zachowane zasady

Zmiany funkcjonalne: `interactions.js` oraz wyłącznie klasa Packing Tetris i jej resolver w `minigames.js`. `game.js`, `index.html` i import kontrolera otrzymują wersję cache 22; moduł efektów i CSS zachowują dotychczasową wersję 21. Skrypty QA mają zgodny import wejścia; zmieniono stare oczekiwania kliknij–kliknij i dodano test dedykowany Packing. `tests.mjs` zawiera dodatkowe kontrole chwytu i dopasowania. Raport i wyniki są w `docs/packing-drag/`.

Nie zmieniono grafiki, CSS, efektów Arcade Premium, animacji osiadania, rozmiarów i liczby pudełek, generatora, czasu 25 s, punktacji, rankingu ani ekranów gry. Pozostałe osiem minigier zachowuje ten sam kod i zasady. Upuszczenie poza paletą nie nalicza błędów i nie pokazuje dawnego komunikatu „DROP ON THE PALLET”.
