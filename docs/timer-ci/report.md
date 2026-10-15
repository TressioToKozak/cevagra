# Kontrola deadline i automatyczne regresje

## Potwierdzony problem i poprawka

`CompetitionManager.buildStage()` udostępniał `ctx.isActive()` sprawdzające tylko
`state === "playing"`. `BaseMinigame.listen()` używał tego warunku dla kliknięć.
Stan zmieniał się dopiero przy kolejnym wywołaniu istniejącego interwału 50 ms.
Kontroler `attachPointerDrag()` nie korzystał z tego warunku w ogóle. Dawało to
okno na spóźnioną odpowiedź lub upuszczenie, zanim timeout zakończył etap.

`StageGuard.allows(token)` sprawdza teraz jednocześnie aktualny token, otwarty
etap i ścisłe `performance.now() < deadline`. Dokładna granica jest już poza
limitem. `ctx.isActive()` łączy ten warunek ze stanem `playing`, więc istniejące
listenery wszystkich dziewięciu minigier otrzymują wspólną kontrolę czasu.

Trzy miejsca tworzenia przeciągania przekazują do wspólnego kontrolera tę samą
kontrolę jako `canInteract`. Sprawdzana jest przy rozpoczęciu, ruchu, podglądzie
i puszczeniu. Spóźnione puszczenie przechodzi ścieżką anulowania: usuwa ghost,
podświetlenia i capture, bez wywołania `onDrop`, punktów lub błędu. Dotyczy to
Conveyor Rush, Packing Tetris i Truck Loading. Pozostałe sześć gier korzysta
z bramki w `BaseMinigame.listen()`, łącznie z zatwierdzaniem odpowiedzi.

Nie dodano timera. Dotychczasowy interwał nadal aktualizuje HUD i kończy etap;
nie rozstrzyga już ważności wejścia. `StageGuard.complete()` zachowuje
jednorazowe zakończenie, a token przypisany do konkretnego kontekstu odrzuca
stare zdarzenia po przejściu do następnego etapu. Spóźnione zdarzenia są
ignorowane również w krótkim czasie przed następnym odświeżeniem HUD.

## Zakres bez zmian

Nie zmieniono CSS, assetów, efektów, animacji, preloadera, generatorów, czasu,
punktacji, rankingu, ekranów ani przejść. Faza zapamiętywania trwa nadal 4000 ms.
Packing zachowuje wyłącznie przeciąganie, próg 7 px, punkt chwytu, resolver,
magnetyczną tolerancję i animację osiadania. Pozycjonowanie i hit testing wspólnego
kontrolera pozostają takie same. Jedyna różnica podczas gry to odrzucanie
wejścia poza dozwolonym czasem lub z nieaktualnego etapu.

## Nowe testy

`tests.mjs` dodaje sześć asercji `StageGuard`: etap aktywny, 1 ms przed limitem,
dokładna granica, 1 ms po niej, nieaktualny token i anulowany etap.

`scripts/deadline-tests.cjs` kontroluje `performance.now()` w Chromium i zatrzymuje
interwał etapu. Dla każdej z dziewięciu gier sprawdza akceptację przy deadline−1 ms,
odrzucenie przy deadline i deadline+1 ms, wynik, błędy, stan planszy i zaznaczenia,
serie spóźnionych kliknięć, spóźnione zatwierdzenia, jednorazowy zapis wyniku oraz
stare wejście i token po zmianie etapu. Dla trzech gier z przeciąganiem sprawdza
chwyt przed limitem i `pointerup`, `pointercancel` lub `lostpointercapture` na
granicy, wraz ze sprzątaniem. Sprawdza też wyścig ostatniej poprawnej odpowiedzi
z timeoutem w obu kolejnościach.

Próba kontrolna z przywróconym starym `ctx.isActive()` zakończyła się oczekiwanym
błędem: przy deadline kliknięcie Speed Picking zwiększyło `correct` z 0 do 1.
Ta sama regresja z poprawką przechodzi. Kod produkcyjny nie był zmieniany dla tej
próby; uruchomiono kopię sterownika pod `/tmp`.

## CI i uruchamianie

Workflow `.github/workflows/tests.yml` reaguje na push do `main`, PR do `main`
i `workflow_dispatch`. Używa Node 22, `npm ci --ignore-scripts`, przypiętego
Playwright 1.62.1 i `playwright install --with-deps chromium`. Każdy z 13 zestawów
ma osobny job, `fail-fast: false`, limit 20 minut i artefakt z logami/zrzutami
nawet przy niepowodzeniu. Błąd dowolnego zestawu daje niepowodzenie joba.
Uprawnienia to `contents: read`; workflow niczego nie wdraża.

`scripts/run-tests.cjs` uruchamia wskazany zestaw albo wszystkie. Dla testów
przeglądarkowych startuje serwer Python HTTP i czeka na odpowiedź 200. Obsługuje
`TEST_ORIGIN`, `TEST_PORT` i `CHROMIUM_PATH`; bez ścieżki Chromium Playwright używa
własnej instalacji. Logi i kody wyjścia trafiają do ignorowanego `test-results/`.
Przy błędzie kontynuuje pozostałe zestawy i kończy z kodem niezerowym. Sam runner
jest wyłączony z wykrywania plików testowych. Kontrolna próba z testem kończącym
się kodem 7 potwierdziła niepowodzenie runnera i wykonanie następnego testu.
`tests.mjs` importuje i wykonuje również `competition-tests.mjs` i `final-tests.mjs`.

## Faktyczne wyniki i ograniczenia

Wyniki zestawów i ograniczenia zapisano w [tests.json](tests.json).
Wszystkie 13 rzeczywistych zestawów przeszło lokalnie na Node 24.19.0: Node i 12 Chromium.
Na Node 22.23.3 (zgodnym z wersją workflow) dodatkowo przeszły Node i deadline,
z serwerem uruchomionym przez poprawiony runner na nowym porcie 8015.
Node wykonał 122 703 asercje, w tym kontrolę 5000 seedów Final (4021 HOLD).
Test pełnego przebiegu potwierdził dwie rozgrywki, wynik 1000 i timeouty wszystkich
etapów. Packing potwierdził 63 natywne przeciągnięcia i przypadki brzegowe;
edge potwierdził cztery pełne sekundy Memory. Sprawdzono 1920×1080, 1366×768
i 1280×720. Nie zmieniano istniejących asercji przeglądarkowych; zmiany tam to
import wersji cache 23, wspólny adres serwera i przenośna konfiguracja Chromium.

Pierwszy zbiorczy przebieg miał błąd w nowym runnerze: uwzględniał sam siebie
jako kolejny zestaw. Powtórkę przerwano, dlatego ten przebieg zbiorczy ma kod 1,
mimo że wszystkie rzeczywiste zestawy zakończyły się kodem 0. Filtr naprawiono;
poprawiony runner sprawdzono na Node i deadline oraz na izolowanych fixture'ach
obejmujących domyślne wykrywanie zestawów, start serwera i propagację błędu.

Workflow przeszedł lokalny `actionlint 1.7.7` (binarium zweryfikowane oficjalną
sumą SHA256). `npm ci` wykonano faktycznie. Testy lokalne używały systemowego
Chromium przez `CHROMIUM_PATH`; pobranie przeglądarki Playwright blokuje lokalna
polityka sieci (`cdn.playwright.dev`, 403 Domain forbidden), a prośba o rozszerzony
dostęp została anulowana. GitHub API również zwraca Forbidden, więc uruchomienie
Actions i instalacja Chromium na runnerze GitHub wymagają jeszcze potwierdzenia
na GitHubie. Nie deklarujemy ich sukcesu. Innych przeglądarek i fizycznego dotyku
nie testowano. W wykonanych testach gry nie wykryto regresji.

## Zmienione pliki

- Produkcja: `lifecycle.js`, `game.js`, `interactions.js`, `minigames.js`;
  `index.html` otrzymuje wyłącznie nową wersję URL wejściowego modułu.
- Testy: `tests.mjs`, nowy `scripts/deadline-tests.cjs`, nowy
  `scripts/run-tests.cjs` i konfiguracja importu/Chromium/adresu we wszystkich
  11 wcześniejszych skryptach przeglądarkowych.
- CI i zależności testowe: `.github/workflows/tests.yml`, `package.json`,
  `package-lock.json`, `.gitignore`.
- Dokumentacja: `README.md`, `docs/timer-ci/report.md`, `docs/timer-ci/tests.json`.

## Poprawka testu cache po uruchomieniu GitHub Actions

GitHub zgłosił niepowodzenie asercji `warm reload reuses the browser image cache`.
Stara asercja wymagała `transferSize === 0` dla każdego obrazu. Poprawne HTTP 304
przesyła jednak nagłówki i może dać `transferSize = 300`, mimo że treść obrazu
pochodzi z cache. Zwykły serwer Python nie ustala długiego `max-age`; świeżość
heurystyczna i konieczność rewalidacji zależą m.in. od dat plików po checkout.
Sam pierwotny log z GitHuba nie zawierał statusów HTTP.

Zmieniono wyłącznie test `scripts/background-tests.cjs`: zachowano wymóg ponad
150 zasobów i odrzucanie ponownego pobierania ich treści, ale dopuszczono również
potwierdzone `304 Not Modified`. Rzeczywisty kod HTTP odczytuje CDP
`Network.responseReceivedExtraInfo`; dane są łączone po `requestId` po zakończeniu
ładowania, ponieważ zdarzenie ExtraInfo może poprzedzać zdarzenie z URL-em.
Przypadki `200` z transferem treści nadal powodują błąd. Log rozdziela teraz
trafienia bez transferu i rewalidacje; błąd podaje URL, transfer i statusy.
Kod gry, loader, preloading, serwer CI i pozostałe asercje pozostają bez zmian.

Weryfikacja lokalna obejmuje zwykły serwer runnera, serwer wymuszający rewalidację
(`Cache-Control: no-cache`) i kontrolę negatywną wyłączającą przechowywanie
(`Cache-Control: no-store`). Szczegółowe wyniki: [cache-followup-tests.json](cache-followup-tests.json).
Wyniku ponownego uruchomienia na GitHubie nie potwierdzono z tego środowiska.
