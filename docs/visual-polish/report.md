# Raport: poprawki wizualne i błędy rozgrywki

Interfejs pozostaje w języku angielskim. Zachowane są wszystkie dziewięć minigier,
losowanie seedem, nielimitowane czasowo instrukcje, lokalny ranking i maksimum 1000 punktów.

## Przyczyny i rozwiązania

- Briefingi miały własną ciemną ramkę, padding i równomierną zasłonę na obrazie.
  Zastąpiono je kompozycją na pełnym viewport, bez obramowania, z gradientem od
  strony tekstu i widocznym indywidualnym tłem. Usunięto powtarzające się informacje.
- Truck Loading: usunięcie `placed-pop` przywracało bazową animację `itemReveal`
  na slocie, z początkową opacity 0 i opóźnieniem. Sloty nie używają już tej
  animacji wejścia. Pozostało podświetlenie obramowania; istniejące węzły palet
  przenoszą się między miejscami. `setSlot` usuwa też stan ukrytego źródła.
- Kursory: zwykłe deklaracje i bardziej szczegółowe selektory nadpisywały
  centralne stany. Reguły normal/hover/pressed/disabled/drag są scentralizowane,
  zwykłe wartości zastąpiono zmiennymi, a dzieci dziedziczą kursor kontrolki.
  Hotspoty 8/5 i 18/5 oraz focus klawiatury pozostają zachowane.
- Conveyor: etykiety kartonów pod kątem miały zbyt szeroką powierzchnię tekstu
  i minimalny rozmiar fontu niezgodny z jej szerokością. Poprawiono osobne
  geometrie i typografię, zachowując obrót, identyfikator i opis prezentu.
- Barcode: podpis wewnątrz szerokiego SVG był skalowany wraz z kodem kreskowym.
  SKU ma teraz własny pogrubiony podpis HTML, dopasowany do szerokości etykiety;
  kod Code 128 i podpis powstają z tej samej wartości. Wzorce kodu nie zmieniły się.
- QC: usunięto losowanie i renderowanie dekoracyjnych naklejek oraz ikon problemów.
  Cztery wadliwe kartony nadal mają realne ślady uszkodzenia, błędny carrier,
  błędny SKU albo pustą rubrykę. Cztery poprawne pozostają bez uszkodzeń.
- RELEASE/HOLD miały różne geometrie i transparentny asset HOLD. Oba korzystają
  teraz z jednej geometrii, fontu i efektów; RELEASE jest teal, HOLD złoty.
  Oryginalna grafika HOLD pozostaje w repozytorium, bez rozciągania i bez pobierania.
- Finał: próg seedowanego RNG daje 80% HOLD i 20% RELEASE. Punktacja zachowuje
  150 za klasyfikację i 50 za decyzję, maksymalnie 200.
- Menu: usunięto opis 165 sekund i przycisk organizatora. `?organizer=1` otwiera
  istniejący panel bezpośrednio. Reset wymaga nadal dokładnego `RESET`, z możliwością
  eksportu kopii CSV; nic nie czyści wyników automatycznie.
- Dotychczasowy preloading w tle i cache pozostały. Instrukcje pojawiają się
  natychmiast po START, Ready czeka na decode, a timer dopiero na gotową scenę.

## Zmienione pliki

Kod: `game.js`, `minigames.js`, `tasks.js`, `styles.css`, `index.html`, `storage.js`
(ostatni plik: wyłącznie wersja importu cache).
Zasoby: `asset-manifest.js`, `assets/optimization-report.json`,
`scripts/optimize-assets.py`. Manifest ma 165 używanych zasobów, bez naklejek QC,
ikon problemów QC i niewykorzystywanego przycisku HOLD.
Testy: `tests.mjs`, `competition-tests.mjs`, `final-tests.mjs`,
`scripts/{browser,visual,interaction,edge,background,polish}-tests.cjs`.
Dokumentacja: `README.md` i niniejszy katalog z dowodami wizualnymi.

## Weryfikacja

- `node tests.mjs`: 122 679 istniejących i rozszerzonych sprawdzeń oraz dodatkowy
  test rozkładu na 5000 seedach: **4021 HOLD / 979 RELEASE**, czyli **80,42% / 19,58%**.
- Chromium / Playwright: wszystkie sześć zestawów browser, visual, interaction,
  edge, background, polish. Testy korzystają z lokalnej ścieżki `/cevagra/`.
- 27 briefingów: wszystkie dziewięć przy 1920×1080, 1366×768 i 1280×720.
  Pomiar pełnego viewport, brak ramki, widoczny Ready i brak przewijania.
- 27 scen rozgrywki, wczesne i późne rundy Barcode/Picking, Memory obie fazy.
- Truck: przeciąganie, kliknięcie i zamiana zajętych slotów; opacity, visibility,
  rozmiar i rodzic palety sprawdzane przy 0/16/50/100/200/350/500 ms. Brak ghostów.
- Conveyor: 6 przewoźników × 3 perspektywy; tekst mieści się w etykiecie,
  ghost zachowuje rozmiar tekstu. Sorting sprawdzony przed i po resize.
- QC: 5 różnych seedów, 8 kartonów, brak dekoracji, obecne rzeczywiste uszkodzenie.
- Finał: równa geometria RELEASE/HOLD w trzech rozdzielczościach.
- Kursory: każda minigra, hover, pressed, disabled oraz przeciąganie.
- Dwa pełne turnieje: perfekcyjny 1000 i wszystkie timeouty, unikalne ID/seed,
  powtarzające się nazwiska, ranking. Testy błędów ładowania, retry, późnego decode,
  eksportu CSV, braku localStorage, typed RESET i zachowania danych przy anulowaniu.
- Składnia JS i `git diff --check`: poprawne.

## Dowody wizualne

- [Briefingi 1920×1080](briefings-1920.jpg)
- [Briefingi 1366×768](briefings-1366.jpg)
- [Briefingi 1280×720](briefings-1280.jpg)
- [Etykieta BRINGCARGO](conveyor-label.jpg)
- [Barcode: późna runda](barcode-late.jpg)
- [Quality Control](quality-control.jpg)
- [Truck Loading](truck-loading.jpg)
- [Klatki po umieszczeniu palety](truck-frames.jpg)
- [Final Dispatch](final-dispatch.jpg)

Pełne PNG oraz klatki po umieszczeniu palet zapisuje test w `/tmp/ceva-*.png`.

## Ograniczenia

Weryfikację wykonano w lokalnym Chromium, z układem ścieżek GitHub Pages.
Opublikowanej strony GitHub Pages nie zweryfikowano bezpośrednio; dostęp z tego
środowiska był blokowany przez proxy. Nie wykonano testu na fizycznym ekranie dotykowym.
Interakcje pointer i geometria ghostów były testowane w przeglądarce.
