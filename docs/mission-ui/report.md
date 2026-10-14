# Raport: Mission Briefings, Run Complete i blokada przypadkowej selekcji

## Zmiany

- `game.js`: jeden wspólny szablon briefingów dla dziewięciu konfiguracji.
  Oryginalne tło i ikona, logo CEVA, MISSION BRIEFING, numer misji, dziewięć
  wskaźników completed/current/upcoming, biało-złoty tytuł, cel i wskazówka,
  segmenty akcji/czasu, prawdziwy przycisk Ready i informacja o zatrzymanym zegarze.
  Przemysłowe linie to niewielki SVG; gradienty, obwódki i bevel przycisku to CSS.
  Nie użyto spłaszczonej referencji ani nowych obrazów tła.
- `game.js` i `styles.css`: spójny dashboard wyników. Gracz, score i rank są
  w jednym Grid, statystyki mają równy wiersz, a dziewięć kart ma wspólne wymiary,
  odstępy, ikony i paski odpowiadające rzeczywistym punktom / maksimum.
  Dane rankingu i zapis wyników pozostały niezmienione. Liczba ukończonych zadań
  pochodzi z faktycznego `results.length`. Final Dispatch pokazuje /200.
- `styles.css`: wspólne granatowe, błękitne i złote akcenty, przemysłowe przyciski,
  ramki i typografia. Przepisano istniejące sekcje zamiast dodawać kolejne nadpisania.
- `styles.css` i `game.js`: CSS blokuje selekcję na nieedytowalnych powierzchniach;
  input, textarea, contenteditable i ich tekst zachowują native selection.
  Obrazy mają `draggable=false` i `-webkit-user-drag:none`. Fallback JS dotyczy
  wyłącznie `dragstart` na obrazach interfejsu, z wyjątkiem contenteditable.
  Nie ma globalnego preventDefault dla mouse/pointer, ani zmian obsługi custom drag.
- `asset-manifest.js` i `assets/optimization-report.json`: usunięte nieużywane
  panele i przyciski wyników z preloadingu; oryginały pozostają w repozytorium.
  Runtime wykorzystuje 158 zasobów.
- `index.html`, `minigames.js`, `storage.js` i istniejące browser tests:
  wersja importów/cache v18; mechanika gier i model localStorage zachowane.
- `scripts/mission-tests.cjs`, `README.md` i ten katalog: nowy test oraz dowody.

## Przyczyny poprzednich problemów

Dekoracyjne SVG paneli wyników zawierały własne napisy PLAYER, RANK i FINAL SCORE,
a HTML renderował kolejne etykiety. Układ próbował dopasować dynamiczne wartości
pod z góry ustalone proporcje rysunku. Absolutna pozycja PLAYER, duża nierówna
proporcja kolumn, rozciągane SVG i osobne media queries powodowały duplikację,
odłączenie nazwy od panelu oraz kompresję statystyk. Nowy układ opiera wszystkie
wartości na przepływie Grid/Flex, bez współrzędnych dopasowanych do jednego obrazu.

Logo także ma duże przezroczyste marginesy: WebP 1024×495, właściwe logo w obszarze
(151,137)–(873,358). Kontener kadruje te marginesy w CSS, aby widoczna marka miała
właściwe proporcje, bez przerabiania assetu.

Zaznaczanie było blokowane tylko na wybranych przeciąganych obiektach; otaczające
SKU, etykiety, tekst instrukcji i wyniki zachowywały domyślną selekcję przeglądarki.
Nowa spójna reguła obejmuje całe powierzchnie interfejsu i przywraca edycję pól.

## Testy

- Node: **122 672** sprawdzenia oraz test rozkładu Final Dispatch na 5000 seedach.
  Punktacja i rozkład 80/20 pozostały niezmienione.
- Wszystkie siedem zestawów Chromium/Playwright: `browser`, `visual`,
  `interaction`, `edge`, `background`, `polish`, `mission`.
- 27 briefingów: wszystkie dziewięć na 1920×1080, 1366×768 i 1280×720;
  ikona przy tytule, dziewięć wskaźników, brak clippingu, Ready i pause note widoczne.
- Dziewięć scen wyników: 70 / 665 / 1000 punktów w każdej z trzech rozdzielczości.
  Krótkie i długie imiona, rank #1 i #101, brak wypadania nazwy poza kartę,
  równe karty i przyciski, poprawne procenty pasków. Powrót czyści imię;
  ranking nadal otwiera zapisane wyniki.
- Rzeczywiste double-click i szybkie wielokrotne kliknięcia w SKU, etykiety,
  kartony, palety, HUD, instrukcje i kontrolki rankingu. `getSelection()` pozostaje
  pusty na powierzchniach gry we wszystkich dziewięciu minigrach.
- Conveyor, Truck i Packing: custom ghost obecny podczas gestu, brak po puszczeniu,
  brak zaznaczania otaczającego tekstu i zero zdarzeń natywnego image drag.
- Imię: zaznaczanie myszą, Ctrl/Cmd+A i edycja. Textarea, contenteditable i pole
  organizatora również zachowują selekcję/edycję. Ready ma widoczny keyboard focus;
  szybkie kliknięcie uruchamia countdown przy nadal zatrzymanym timerze.
- Regresja: pełny turniej z 1000 punktów oraz timeoutami, losowa kolejność,
  Final ostatni, unikalne ID/seedy, powtarzające się imiona, localStorage i CSV,
  RESET z potwierdzeniem, failed load/retry, późny decode oraz warm cache.
- Składnia JS, `git diff --check`: poprawne. Brak console errors i błędnych obrazów.

## Zrzuty

- [Mission Briefings 1920×1080](briefings-1920.jpg)
- [Mission Briefings 1366×768](briefings-1366.jpg)
- [Mission Briefings 1280×720](briefings-1280.jpg)
- [Quality Control — pełny briefing](quality-briefing.jpg)
- [Wyniki 70 / 1366×768](results-70-1366.jpg)
- [Wyniki 665 / 1366×768](results-665-1366.jpg)
- [Wyniki 1000 / 1366×768](results-1000-1366.jpg)

W tym katalogu są także wszystkie trzy scenariusze wyników przy 1920 i 1280.
Pełne PNG: `/tmp/ceva-mission-{game}-{width}.png`,
`/tmp/ceva-report-{score}-{width}.png`. Zrzuty przeglądarkowe przejrzano wizualnie.

## Ograniczenia

Testy wykonano w lokalnym Chromium pod ścieżką `/cevagra/`, zgodną z GitHub Pages.
Publicznej publikacji nie zweryfikowano bezpośrednio (wcześniejsza blokada proxy).
Nie wykonano testu na fizycznym ekranie dotykowym ani w Safari/Firefox.
CSS zawiera wariant dla krótszych okien i telefonów; główne zweryfikowane viewporty
pozostają trzema wskazanymi rozdzielczościami desktopowymi.
